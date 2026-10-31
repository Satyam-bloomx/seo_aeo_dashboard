"""Scoring engine spec tests (approved model: 50% URL pass rate + 50% severity-weighted pass rate)."""
from app.services.scoring import compute_scores, evaluate_rule, RULES


def page(pid, status=200, **audit):
    base = {"Page_Titles": {"Missing": False}, "Security": {"HTTP URLs": False}}
    base.update(audit)
    return {"id": pid, "url": f"https://e.com/{pid}", "status_code": status, "content_type": "text/html",
            "indexability": "Indexable", "indexability_status": "Indexable", "audit_data": base}


def rule(rule_id):
    return next(r for r in RULES if r.id == rule_id)


def test_missing_data_is_not_evaluated_not_passed():
    p = page(1)
    assert evaluate_rule(rule("Meta Description: Missing"), p) is None   # key absent
    p["audit_data"]["Meta_Description"] = {"Missing": None}
    assert evaluate_rule(rule("Meta Description: Missing"), p) is None   # explicit null
    r = compute_scores([p])
    meta = next(x for x in r["rules"] if x["id"] == "Meta Description: Missing")
    assert meta["status"] == "not_evaluated" and meta["evaluated_count"] == 0


def test_clean_site_scores_100_and_broken_site_can_reach_zero():
    assert compute_scores([page(1), page(2)])["site_health"]["score"] == 100
    broken = [page(i, Page_Titles={"Missing": True}, Security={"HTTP URLs": True}) for i in range(3)]
    sh = compute_scores(broken)["site_health"]
    assert sh["url_pass_rate"] == 0  # every URL has a critical error: no artificial floor
    assert sh["score"] == round((sh["url_pass_rate"] + sh["weighted_pass_rate"]) / 2)


def test_url_pass_rate_counts_urls_with_critical_errors():
    pages = [page(1), page(2), page(3), page(4, status=404)]
    sh = compute_scores(pages)["site_health"]
    assert sh["urls_with_critical_errors"] == 1
    assert sh["url_pass_rate"] == 75


def test_on_page_rules_do_not_apply_to_error_pages():
    p = page(1, status=404, Page_Titles={"Missing": True})
    assert evaluate_rule(rule("Page Titles: Missing"), p) is None
    assert evaluate_rule(rule("Response Codes: Client Error (4xx)"), p) is True


def test_blocked_or_failed_pages_are_not_200():
    p = page(1, status=0)
    assert evaluate_rule(rule("Response Codes: Blocked or Failed (No Response)"), p) is True
    assert evaluate_rule(rule("Page Titles: Missing"), p) is None


def test_single_page_mode_excludes_site_checks():
    p = page(1, Page_Titles={"Missing": False, "Duplicate": True})
    site = compute_scores([p], mode="site")
    single = compute_scores([p], mode="page")
    dup_site = next(x for x in site["rules"] if x["id"] == "Page Titles: Duplicate")
    dup_page = next(x for x in single["rules"] if x["id"] == "Page Titles: Duplicate")
    assert dup_site["status"] == "fail"
    assert dup_page["status"] == "not_evaluated" and dup_page["reason"] == "site_only"
    assert single["page_score"] == 100


def test_duplicates_ignore_canonicalised_pages():
    p = page(1, Page_Titles={"Missing": False, "Duplicate": True}, Canonicals={"Canonicalised": True})
    assert evaluate_rule(rule("Page Titles: Duplicate"), p) is None


def test_integration_findings_never_move_site_health():
    clean = compute_scores([page(1)])["site_health"]["score"]
    p = page(1, Search_Console={"Is_Live_GSC": True, "Google_Index_Status": "FAIL", "Index_Coverage_State": "Excluded"})
    r = compute_scores([p])
    gsc = next(x for x in r["rules"] if x["id"] == "Search Console: Excluded from Google Index")
    assert gsc["status"] == "fail" and gsc["integration"] is True
    assert r["site_health"]["score"] == clean


def test_integration_scores_require_minimum_data():
    p = page(1, Search_Console={"Is_Live_GSC": True, "Google_Index_Status": "PASS", "Impressions_Num": 50,
                                "Clicks_Num": 1, "Position_Num": 3.0})
    gsc = compute_scores([p])["integrations"]["search_console"]
    assert gsc["indexed_pct"] is None and "20 inspected" in gsc["indexed_reason"]
    assert gsc["ctr_vs_benchmark"] is None
    assert compute_scores([page(1)])["integrations"]["pagespeed"]["status"] == "no_data"


def test_core_web_vitals_use_field_thresholds_including_inp():
    ps = {"mobile": {"performance_score": 90, "metrics": {"lcp": "1.2 s", "cls": "0"},
                     "field_data": {"available": True, "scope": "url", "lcp_p75_ms": 2000, "inp_p75_ms": 350, "cls_p75": 0.05}}}
    r = compute_scores([page(1, PageSpeed=ps)])
    cwv = r["integrations"]["pagespeed"]["core_web_vitals"]
    assert cwv["inp_good"] is False and cwv["passed"] is False
    assert next(x for x in r["rules"] if x["category"] == "PageSpeed")["status"] == "fail"


def test_summary_endpoint_is_owned_and_cached(client):
    import asyncio
    from conftest import auth
    from app.core.database import AsyncSessionLocal
    from app.core.auth import get_or_create_user_project
    from app.models.domain import Crawl, Page

    async def seed():
        async with AsyncSessionLocal() as db:
            pid = await get_or_create_user_project(db, "score-owner")
            c = Crawl(project_id=pid, seed_url="https://e.com/", status="completed")
            db.add(c)
            await db.flush()
            db.add(Page(crawl_id=c.id, url="https://e.com/", status_code=200, content_type="text/html",
                        audit_data={"Page_Titles": {"Missing": True}}))
            await db.commit()
            return c.id

    cid = asyncio.run(seed())
    assert client.get(f"/api/crawls/{cid}/summary", headers=auth("someone-else")).status_code == 404
    body = client.get(f"/api/crawls/{cid}/summary", headers=auth("score-owner")).json()
    sh = body["site_health"]
    assert sh["url_pass_rate"] == 0 and sh["score"] == round(sh["weighted_pass_rate"] / 2)
    assert body["crawl"]["mode"] == "site"
    again = client.get(f"/api/crawls/{cid}/summary", headers=auth("score-owner")).json()
    assert again["site_health"] == body["site_health"]


def test_pages_keyset_pagination_and_gzip(client):
    import asyncio
    from conftest import auth
    from app.core.database import AsyncSessionLocal
    from app.core.auth import get_or_create_user_project
    from app.models.domain import Crawl, Page

    async def seed():
        async with AsyncSessionLocal() as db:
            pid = await get_or_create_user_project(db, "paging-owner")
            c = Crawl(project_id=pid, seed_url="https://e.com/", status="running")
            db.add(c)
            await db.flush()
            db.add_all([Page(crawl_id=c.id, url=f"https://e.com/{i}", status_code=200,
                             audit_data={"Page_Titles": {"Missing": False, "pad": "x" * 200}}) for i in range(25)])
            await db.commit()
            return c.id

    cid = asyncio.run(seed())
    h = auth("paging-owner")
    first = client.get(f"/api/crawls/{cid}/pages?limit=10", headers=h).json()
    rest = client.get(f"/api/crawls/{cid}/pages?limit=100&after_id={first[-1]['id']}", headers=h).json()
    assert len(first) == 10 and len(rest) == 15
    assert {p["id"] for p in first}.isdisjoint({p["id"] for p in rest})
    res = client.get(f"/api/crawls/{cid}/pages", headers={**h, "Accept-Encoding": "gzip"})
    assert res.headers.get("content-encoding") == "gzip"


def test_scores_real_extractor_output():
    """Regression: real extractor output (empty "External" bucket) must be scored, not treated as external."""
    from app.services.extractor import extract_page
    html = ("<html><head><title>A real page title for testing the scorer</title>"
            "<meta name='description' content='" + "d" * 100 + "'></head>"
            "<body><h1>Heading</h1><p>" + "word " * 300 + "</p></body></html>")
    metrics, _l, _i = extract_page(html, "https://e.com/x", {"Strict-Transport-Security": "max-age=1"})
    page = {"id": 1, "url": "https://e.com/x", "status_code": 200, "content_type": "text/html",
            "indexability": metrics.get("indexability"), "indexability_status": metrics.get("indexability_status"),
            "audit_data": metrics["audit_data"]}
    r = compute_scores([page])
    assert r["urls_evaluated"] == 1
    assert r["site_health"]["score"] is not None and r["site_health"]["checks_evaluated"] > 20


def test_integration_panels_from_synced_data():
    integ = {
        "google_analytics": {"is_live_data": True, "property_name": "GA4 - e.com",
                             "summary": {"total_sessions": 1200, "organic_sessions_30d": 300, "engagement_rate": "55.0%"}},
        "search_console": {"is_live_data": True, "property": "sc-domain:e.com",
                           "summary": {"total_clicks": 40, "total_impressions": 9000, "average_ctr": "0.4%",
                                       "average_position": 18.2, "total_queries_indexed": 120}},
    }
    r = compute_scores([page(1)], integration_data=integ)["integrations"]
    assert r["google_analytics"]["status"] == "ok" and r["google_analytics"]["organic_share_pct"] == 25
    assert r["search_console"]["property_totals"]["clicks"] == 40
    small = compute_scores([page(1)], integration_data={"google_analytics": {"is_live_data": True, "summary": {"total_sessions": 40}}})
    assert small["integrations"]["google_analytics"]["status"] == "insufficient"
