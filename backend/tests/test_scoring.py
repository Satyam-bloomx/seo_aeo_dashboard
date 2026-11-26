"""Scoring spec (2026.12): Site Health = Ahrefs Health Score (share of URLs with zero errors), errors defined by
Screaming Frog's issue classification (an Issue of High or Medium priority)."""
from app.services.scoring import RULES, compute_scores, evaluate_rule, is_error


def page(pid, status=200, **audit):
    base = {"Page_Titles": {"Missing": False}, "Security": {"HTTP URLs": False}}
    base.update(audit)
    return {"id": pid, "url": f"https://e.com/{pid}", "status_code": status, "content_type": "text/html",
            "indexability": "Indexable", "indexability_status": "Indexable", "audit_data": base}


def site(n, audit_for=None):
    """n clean pages; audit_for maps page index -> audit overrides."""
    return [page(i, **(audit_for or {}).get(i, {})) for i in range(n)]


def rule(rule_id):
    return next(r for r in RULES if r.id == rule_id)


def result(scores, rule_id):
    return next(r for r in scores["rules"] if r["id"] == rule_id)


def test_classification_follows_screaming_frog():
    assert (rule("Page Titles: Missing").type, rule("Page Titles: Missing").priority) == ("Issue", "High")
    assert (rule("H1: Missing").type, rule("H1: Missing").priority) == ("Issue", "Medium")
    assert rule("Meta Description: Missing").type == "Opportunity"  # SF: Opportunity, Low
    assert rule("Content: Near Duplicates").type == "Warning"
    assert rule("Directives: Noindex").type == "Warning"  # often intentional
    assert is_error("Issue", "High") and is_error("Issue", "Medium")
    assert not is_error("Issue", "Low") and not is_error("Warning", "High") and not is_error("Opportunity", "Medium")


def test_health_is_the_share_of_urls_with_zero_errors():
    pages = site(20, {0: {"Page_Titles": {"Missing": True}}, 1: {"H1": {"Missing": True}}})
    pages[2]["status_code"] = 404
    sh = compute_scores(pages)["site_health"]
    assert sh["urls_with_errors"] == 3 and sh["score"] == 85 and sh["band"] == "Good"  # 17 of 20 URLs clean


def test_warnings_and_opportunities_never_move_the_score():
    pages = site(20, {i: {"Meta_Description": {"Missing": True}, "H1": {"Multiple": True},
                            "Directives": {"NoIndex": True}, "Images": {"Missing Alt Attribute": True}}
                        for i in range(20)})
    r = compute_scores(pages)
    assert r["site_health"]["score"] == 100
    assert r["issues"]["warnings"]["checks"] >= 2 and r["issues"]["opportunities"]["checks"] >= 1
    assert result(r, "Meta Description: Missing")["failing_count"] == 20  # still listed, with its reach


def test_an_error_on_every_url_scores_zero_no_floor():
    r = compute_scores(site(12, {i: {"Page_Titles": {"Missing": True}} for i in range(12)}))
    assert r["site_health"]["score"] == 0 and r["site_health"]["band"] == "Weak"


def test_explanation_splits_the_lost_points_exactly():
    pages = site(20, {0: {"Page_Titles": {"Missing": True}, "H1": {"Missing": True}},
                        1: {"H1": {"Missing": True}}, 2: {"Security": {"HTTP URLs": True}}})
    r = compute_scores(pages)
    assert r["site_health"]["score"] == 85
    assert sum(i["impact"] for i in r["score_explanation"]) == -15
    labels = [i["label"] for i in r["score_explanation"]]
    assert labels[0] == "H1: Missing"  # 1.5 URLs' worth: the biggest share


def test_single_page_audit_gets_page_health_from_its_errors():
    r = compute_scores([page(1, H1={"Missing": True}, Meta_Description={"Missing": True})], mode="page")
    sh = r["site_health"]
    assert sh["kind"] == "page" and sh["score"] == 75 and sh["provisional"] is False  # one medium error: -25%
    assert [i["impact"] for i in r["score_explanation"]] == [-25]
    assert r["page_check"]["errors"] == 1 and r["page_check"]["opportunities"] == 1
    assert r["page_check"]["error_checks"] == ["H1: Missing"] and r["page_check"]["passed"] is False
    dup = result(r, "Page Titles: Duplicate")
    assert dup["status"] == "not_evaluated" and dup["reason"] == "site_only"


def test_small_crawls_have_no_score_and_under_30_urls_are_provisional():
    assert compute_scores(site(9))["site_health"]["score"] is None
    small = compute_scores(site(12))["site_health"]
    assert small["score"] == 100 and small["provisional"] is True
    assert compute_scores(site(30))["site_health"]["provisional"] is False


def test_site_wide_error_caps_the_score_at_70():
    robots = {"id": "robots_invalid", "label": "robots.txt has invalid lines", "type": "Issue", "priority": "High",
              "detail": "Line 2: 'User-agent: User-agent: *'."}
    r = compute_scores(site(20), site_facts={"site_issues": [robots]})
    sh = r["site_health"]
    assert sh["score"] == 70 and sh["base_score"] == 100 and sh["capped"] is True
    assert r["score_explanation"][0]["label"].startswith("Site-wide error") and r["score_explanation"][0]["impact"] == -30
    warn = {**robots, "type": "Warning"}
    assert compute_scores(site(20), site_facts={"site_issues": [warn]})["site_health"]["score"] == 100


def test_failing_core_web_vitals_on_real_users_is_an_error_on_that_page():
    field = {"available": True, "lcp_p75_ms": 2600, "inp_p75_ms": 589, "cls_p75": 0.01}
    pages = site(20)
    pages[0]["audit_data"]["PageSpeed"] = {"mobile": {"performance_score": 63, "field_data": field}}
    r = compute_scores(pages)
    assert r["site_health"]["score"] == 95
    assert result(r, "PageSpeed: Core Web Vitals Failing (Real Users)")["is_error"] is True
    lab_only = site(20)
    lab_only[0]["audit_data"]["PageSpeed"] = {"mobile": {"performance_score": 30, "field_data": {"available": False}}}
    assert compute_scores(lab_only)["site_health"]["score"] == 100  # lab scores are diagnostics, not an error


def test_missing_data_is_not_evaluated_not_passed():
    p = page(1)
    assert evaluate_rule(rule("Meta Description: Missing"), p) is None
    r = compute_scores([p])
    meta = result(r, "Meta Description: Missing")
    assert meta["status"] == "not_evaluated" and meta["evaluated_count"] == 0


def test_on_page_rules_do_not_apply_to_error_pages():
    p = page(1, status=404, Page_Titles={"Missing": True})
    assert evaluate_rule(rule("Page Titles: Missing"), p) is None
    assert evaluate_rule(rule("Response Codes: Client Error (4xx)"), p) is True


def test_blocked_or_failed_pages_are_not_200():
    p = page(1, status=0)
    assert evaluate_rule(rule("Response Codes: Blocked or Failed (No Response)"), p) is True
    assert evaluate_rule(rule("Page Titles: Missing"), p) is None


def test_duplicates_ignore_canonicalised_pages():
    p = page(1, Page_Titles={"Missing": False, "Duplicate": True}, Canonicals={"Canonicalised": True})
    assert evaluate_rule(rule("Page Titles: Duplicate"), p) is None


def test_search_console_findings_never_move_site_health():
    pages = site(12)
    pages[0]["audit_data"]["Search_Console"] = {"Is_Live_GSC": True, "Google_Index_Status": "FAIL",
                                                "Index_Coverage_State": "Excluded"}
    r = compute_scores(pages)
    gsc = result(r, "Search Console: Excluded from Google Index")
    assert gsc["status"] == "fail" and gsc["integration"] is True
    assert r["site_health"]["score"] == 100


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
            db.add_all([Page(crawl_id=c.id, url=f"https://e.com/{i}", status_code=200, content_type="text/html",
                             audit_data={"Page_Titles": {"Missing": i < 3}}) for i in range(12)])
            await db.commit()
            return c.id

    cid = asyncio.run(seed())
    assert client.get(f"/api/crawls/{cid}/summary", headers=auth("someone-else")).status_code == 404
    body = client.get(f"/api/crawls/{cid}/summary", headers=auth("score-owner")).json()
    assert body["site_health"]["score"] == 75 and body["site_health"]["urls_with_errors"] == 3
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
    page_ = {"id": 1, "url": "https://e.com/x", "status_code": 200, "content_type": "text/html",
             "indexability": metrics.get("indexability"), "indexability_status": metrics.get("indexability_status"),
             "audit_data": metrics["audit_data"]}
    r = compute_scores([page_], mode="page")
    assert r["urls_evaluated"] == 1
    assert r["page_check"]["errors"] == 0 and r["site_health"]["checks_evaluated"] > 20


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


# ---------------------------------------------------------------- Technical SEO (category scores)

def test_technical_seo_is_the_weighted_average_of_deduction_based_category_scores():
    """Regression (lifechangingastro.com): CWV failing (Issue high) and an invalid robots.txt (site-wide Issue
    high) must pull their categories down; opportunities deduct small points so flagged categories never score 100;
    Technical SEO uses weighted categories."""
    from app.services.scoring import CATEGORY_WEIGHTS
    p = page(1, H1={"Missing": False}, Images={"Missing Alt Attribute": True}, Meta_Description={"Missing": True},
             Security={"HTTP URLs": False, "Missing HSTS Header": True})
    p["audit_data"]["PageSpeed"] = {"mobile": {"field_data": {"available": True, "lcp_p75_ms": 2585, "inp_p75_ms": 564, "cls_p75": 0.01}}}
    robots = {"id": "robots_malformed_user_agent", "label": "robots.txt has malformed User-agent lines",
              "type": "Issue", "priority": "High", "source": "robots.txt", "detail": "x"}
    r = compute_scores([p], mode="page", site_facts={"site_issues": [robots]})
    cats = {g: c["score"] for g, c in r["categories"].items()}
    assert cats["Technical"] == 60      # Core Web Vitals failing: Issue high, 40 points
    assert cats["Indexability"] == 60   # robots.txt: site-wide Issue high, 40 points
    assert cats["On-page"] == 92        # missing alt (Issue low, 5) + missing description (Opportunity low, 3)
    assert cats["Security"] == 95       # one low-priority header warning
    assert cats["Links"] is None        # no Links data on this fixture page
    scored = {g: v for g, v in cats.items() if v is not None}
    expected = round(sum(scored[g] * CATEGORY_WEIGHTS[g] for g in scored) / sum(CATEGORY_WEIGHTS[g] for g in scored))
    assert r["technical_seo"]["score"] == expected
    assert r["technical_seo"]["weakest"] in ("Technical", "Indexability")


def test_ttfb_and_noindex_exclusion_and_single_page_outlinks_edge_cases():
    """Edge cases: slow TTFB penalizes Technical without PageSpeed; noindex pages are excluded from On-page/Content
    averages when indexable pages exist; high outlinks are evaluated on single-page audits."""
    slow = page(1, Links={"Pages With High Internal Outlinks": True}, Content={"Readability Difficult": True})
    slow["response_time_ms"] = 3500
    r_single = compute_scores([slow], mode="page")
    assert r_single["categories"]["Technical"]["score"] == 85   # >3s TTFB warning high (-15)
    assert r_single["categories"]["Links"]["score"] == 95       # high outlinks evaluated in page mode (-5)
    assert r_single["categories"]["Content"]["score"] == 97     # readability opportunity low (-3, never 100)

    # Noindex exclusion: 1 clean indexable page + 1 broken noindex page -> On-page stays 100, excluded=1
    clean = page(1, H1={"Missing": False})
    noindexed = page(2, H1={"Missing": True}, Directives={"NoIndex": True})
    r_mix = compute_scores([clean, noindexed], mode="site")
    assert r_mix["categories"]["On-page"]["score"] == 100
    assert r_mix["technical_seo"]["noindex_excluded"] == 1

    # Edge case: if ALL pages are noindex, fall back to evaluating them so categories don't vanish
    r_all_noindex = compute_scores([noindexed], mode="page")
    assert r_all_noindex["categories"]["On-page"]["score"] == 75
    assert r_all_noindex["technical_seo"]["noindex_excluded"] == 0


def test_category_scores_average_over_urls():
    pages = site(10, {0: {"H1": {"Missing": True}}, 1: {"H1": {"Missing": True}}})
    for p in pages:
        p["audit_data"].setdefault("H1", {"Missing": False})
    r = compute_scores(pages)
    assert r["categories"]["On-page"]["score"] == 95  # 2 of 10 URLs lose 25 points: (8 x 100 + 2 x 75) / 10


def test_page_health_compounds_errors_and_counts_site_wide_ones():
    """Two high-priority errors (Core Web Vitals on the page, invalid robots.txt site-wide): 100 -> 60 -> 36."""
    p = page(1)
    p["audit_data"]["PageSpeed"] = {"mobile": {"field_data": {"available": True, "lcp_p75_ms": 2585, "inp_p75_ms": 564, "cls_p75": 0.01}}}
    robots = {"id": "robots_malformed_user_agent", "label": "robots.txt has malformed User-agent lines",
              "type": "Issue", "priority": "High", "source": "robots.txt", "detail": "x"}
    r = compute_scores([p], mode="page", site_facts={"site_issues": [robots]})
    assert r["site_health"]["score"] == 36 and r["site_health"]["band"] == "Fair"
    assert sum(i["impact"] for i in r["score_explanation"]) == -64
    warnings_only = page(2, H1={"Multiple": True}, Meta_Description={"Missing": True})
    assert compute_scores([warnings_only], mode="page")["site_health"]["score"] == 100  # warnings never cut health
