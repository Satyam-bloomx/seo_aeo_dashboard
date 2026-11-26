"""Security and edge-case tests for Phases 1-3:
- SSRF-safe broken image checker & deduplication
- Viewport, lang, OG/Twitter checks & decorative alt=""
- 4-state graceful degradation (crawl_only, gsc_only, ga4_only, gsc+ga4)
- Zero-LLM GSC -> AEO/GEO question bridge (AI credit savings)
- Free Google Autocomplete fallback
"""
import asyncio
import httpx

from app.services import visibility
from app.services.autocomplete import fetch_autocomplete
from app.services.extractor import extract_seo_metrics
from app.services.image_checker import check_image_urls, is_broken_image_status
from app.services.scoring import compute_scores


def _make_page(pid, *, gsc=None, ga4=None, **audit):
    base = {"Page_Titles": {"Missing": False}, "H1": {"Missing": False}, "Security": {"HTTP URLs": False}}
    base.update(audit)
    if gsc is not None:
        base["Search_Console"] = gsc
    if ga4 is not None:
        base["Google_Analytics"] = ga4
    return {
        "id": pid,
        "url": f"https://example.com/p{pid}",
        "status_code": 200,
        "content_type": "text/html",
        "indexability": "Indexable",
        "indexability_status": "Indexable",
        "audit_data": base,
    }


def _rule_result(scores, rule_id):
    return next(r for r in scores["rules"] if r["id"] == rule_id)


def test_broken_image_checker_ssrf_and_dedup_and_head_fallback():
    # SSRF protection: private IPs and non-http schemes must never be probed
    ssrf_out = asyncio.run(check_image_urls([
        "http://127.0.0.1/img.png",
        "http://169.254.169.254/latest/meta-data/",
        "data:image/png;base64,AAA",
        "file:///etc/passwd",
    ]))
    assert ssrf_out == {}

    # Deduplication, max_unique cap, HEAD 405 -> GET fallback, and 404 detection
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append((request.method, str(request.url)))
        if "405-ok.png" in str(request.url):
            return httpx.Response(405 if request.method == "HEAD" else 200)
        if "missing.png" in str(request.url):
            return httpx.Response(404)
        return httpx.Response(200)

    async def go():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await check_image_urls(
                [
                    "https://cdn.example.com/ok.png",
                    "https://cdn.example.com/ok.png",  # duplicate
                    "https://cdn.example.com/405-ok.png",
                    "https://cdn.example.com/missing.png",
                    "https://cdn.example.com/over-cap.png",
                ],
                max_unique=3,
                client=client,
            )

    res = asyncio.run(go())
    assert len(res) == 3  # capped at max_unique=3
    assert res["https://cdn.example.com/ok.png"] == 200
    assert res["https://cdn.example.com/405-ok.png"] == 200  # fell back from HEAD 405 to GET 200
    assert is_broken_image_status(res["https://cdn.example.com/missing.png"]) is True
    assert "https://cdn.example.com/over-cap.png" not in res


def test_viewport_lang_og_twitter_checks():
    minimal = "<html><head><title>Hi</title></head><body><h1>Hi</h1></body></html>"
    m = extract_seo_metrics(minimal, "https://example.com/")
    v = m["audit_data"]["Validation"]
    assert v["Missing Viewport Meta Tag"] is True
    assert v["Missing HTML Lang Attribute"] is True
    assert v["Missing OpenGraph Tags"] is True
    assert v["Missing Twitter Card Tags"] is True

    rich = (
        '<html lang="en"><head>'
        '<meta name="viewport" content="width=device-width, initial-scale=1">'
        '<meta property="og:title" content="Hi">'
        '<meta name="twitter:card" content="summary">'
        '<title>Hi</title></head><body><h1>Hi</h1></body></html>'
    )
    m2 = extract_seo_metrics(rich, "https://example.com/")
    v2 = m2["audit_data"]["Validation"]
    assert v2["Missing Viewport Meta Tag"] is False
    assert v2["Missing HTML Lang Attribute"] is False
    assert v2["Missing OpenGraph Tags"] is False
    assert v2["Missing Twitter Card Tags"] is False


def test_four_state_graceful_degradation_for_gsc_and_ga4():
    # 1. Neither connected -> crawl_only
    p1 = _make_page(1, H1={"Missing": True})
    p2 = _make_page(2, Page_Titles={"Missing": True})
    r_none = compute_scores([p1, p2], mode="site")
    assert r_none["prioritization"]["mode"] == "crawl_only"
    assert r_none["prioritization"]["gsc_connected"] is False
    assert r_none["prioritization"]["ga4_connected"] is False
    ti = _rule_result(r_none, "H1: Missing")["traffic_impact"]
    assert ti["gsc_impressions"] is None and ti["ga4_sessions"] is None and ti["impact_score"] > 0

    # 2. Only GSC connected -> gsc_only; high-impression H1 issue outranks 0-impression Title issue
    p1_gsc = _make_page(1, H1={"Missing": True}, gsc={"Is_Live_GSC": True, "Impressions_Num": 25000, "Clicks_Num": 900})
    p2_gsc = _make_page(2, Page_Titles={"Missing": True}, gsc={"Is_Live_GSC": True, "Impressions_Num": 0, "Clicks_Num": 0})
    r_gsc = compute_scores([p1_gsc, p2_gsc], mode="site")
    assert r_gsc["prioritization"]["mode"] == "gsc_only"
    h1_ti = _rule_result(r_gsc, "H1: Missing")["traffic_impact"]
    t_ti = _rule_result(r_gsc, "Page Titles: Missing")["traffic_impact"]
    assert h1_ti["gsc_impressions"] == 25000 and h1_ti["ga4_sessions"] is None
    assert h1_ti["impact_score"] > t_ti["impact_score"]

    # 3. Only GA4 connected -> ga4_only
    p1_ga = _make_page(1, H1={"Missing": True}, ga4={"Sessions_Num": 1200})
    p2_ga = _make_page(2, Page_Titles={"Missing": True}, ga4={"Sessions_Num": 0})
    r_ga = compute_scores([p1_ga, p2_ga], mode="site")
    assert r_ga["prioritization"]["mode"] == "ga4_only"
    h1_ga = _rule_result(r_ga, "H1: Missing")["traffic_impact"]
    assert h1_ga["ga4_sessions"] == 1200 and h1_ga["gsc_impressions"] is None
    assert h1_ga["impact_score"] > _rule_result(r_ga, "Page Titles: Missing")["traffic_impact"]["impact_score"]

    # 4. Both GSC + GA4 connected -> gsc+ga4 + GA4 AI sessions surfaced into geo_readiness
    p_both = _make_page(
        1,
        H1={"Missing": True},
        gsc={"Is_Live_GSC": True, "Impressions_Num": 5000, "Clicks_Num": 200},
        ga4={"Sessions_Num": 400},
    )
    r_both = compute_scores(
        [p_both],
        mode="page",
        integration_data={"google_analytics": {"is_live_data": True, "aeo_spotlight": {"ai_assistant_sessions": 42}}},
    )
    assert r_both["prioritization"]["mode"] == "gsc+ga4"
    assert r_both["geo_readiness"]["ga4_ai_sessions"] == 42


def test_gsc_questions_save_llm_credits(monkeypatch):
    """When GSC provides enough real non-branded queries, ensure_questions must NOT call the LLM."""
    llm_called = {"count": 0}

    async def fake_generate(*_args, **_kwargs):
        llm_called["count"] += 1
        return [], ""

    monkeypatch.setattr(visibility, "generate_questions", fake_generate)

    gsc_queries = [
        {"query": "how to wear rudraksha beads"},
        {"query": "what are benefits of amethyst stone"},
        {"query": "best gemstone for career growth"},
        {"query": "where to buy original rudraksha online"},
        {"query": "how to energize yantra at home"},
        {"query": "which rudraksha is best for meditation"},
    ]
    pages = [_make_page(1, gsc={"Is_Live_GSC": True, "Impressions_Num": 1500, "Top_Queries": gsc_queries})]
    state = {"items": []}
    qs, added = asyncio.run(visibility.ensure_questions(state, {}, pages, "lifechangingastro.com", ""))
    assert added == 6
    assert len(qs) == 6
    assert all(q["source"] == "gsc" for q in qs)
    assert llm_called["count"] == 0  # 100% AI credit saved!


def test_google_autocomplete_dedup_and_error_resilience():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=["rudraksha", ["rudraksha benefits", "Rudraksha Benefits", "rudraksha price"]])

    async def go():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await fetch_autocomplete("rudraksha", client=client)

    out = asyncio.run(go())
    assert out == ["rudraksha benefits", "rudraksha price"]
    assert asyncio.run(fetch_autocomplete("")) == []
