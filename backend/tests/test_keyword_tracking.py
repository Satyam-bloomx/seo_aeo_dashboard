"""Keywords & AI answers: matching, list cleaning, SerpAPI parsing (saved-style responses, no paid calls),
scoring, and the API flow (list, check in the background, dashboard card)."""
import asyncio
import json

import httpx

from app.services import keyword_tracking as kt
from conftest import auth

DOMAIN = "bloomx.in"


def _organic(*links):
    return [{"position": i + 1, "link": link, "title": link} for i, link in enumerate(links)]


def test_host_matching_is_by_host_not_substring():
    assert kt.host_matches("https://www.bloomx.in/services", DOMAIN)
    assert kt.host_matches("https://blog.bloomx.in/a", DOMAIN)
    assert not kt.host_matches("https://notbloomx.in/", DOMAIN)
    assert not kt.host_matches("https://example.com/?ref=bloomx.in", DOMAIN)
    assert not kt.host_matches(None, DOMAIN)
    assert kt.site_host("https://WWW.BloomX.in/x") == DOMAIN


def test_brand_token_and_branded_detection():
    assert kt.brand_token("bloomxsolutions.com") == "bloomxsolutions"
    assert kt.brand_token("shop.example.co.in") == "example"
    assert kt.brand_token("blog.example.com") == "example"
    assert kt.is_branded("BloomX Solutions reviews", "bloomxsolutions.com")
    assert not kt.is_branded("seo agency pune", "bloomxsolutions.com")
    assert kt.is_branded("acme widgets price", "xyz.com", business_name="Acme Widgets")


def test_clean_items_dedupes_validates_and_caps():
    raw = [
        {"text": "  seo agency   pune ", "intent": "local", "local": True},
        {"text": "SEO agency Pune"},  # duplicate after normalising
        {"text": "how do I fix crawl errors?"},
        {"text": "bloomx reviews", "intent": "service"},
        {"text": "", "kind": "keyword"},
        {"text": "x" * 500, "kind": "nonsense", "intent": "bogus"},
    ]
    items = kt.clean_items(raw, DOMAIN)
    assert [i["text"] for i in items][:3] == ["seo agency pune", "how do I fix crawl errors?", "bloomx reviews"]
    assert items[0]["local"] and items[0]["intent"] == "local"
    assert items[1]["kind"] == "question"
    assert items[2]["branded"] and items[2]["intent"] == "brand"
    assert len(items[3]["text"]) == kt.MAX_TEXT and items[3]["kind"] == "keyword" and items[3]["intent"] == "service"
    many = kt.clean_items([{"text": f"term {n}"} for n in range(50)], DOMAIN)
    assert len(many) == kt.MAX_ITEMS


def test_parse_google_page_one():
    data = {
        "organic_results": _organic("https://competitor.com/a", "https://www.bloomx.in/seo", "https://other.org/"),
        "related_questions": [{"question": "What does SEO cost?", "link": "https://bloomx.in/pricing"},
                              {"question": "Is SEO worth it?", "link": "https://x.com/"}],
        "local_results": {"places": [{"position": 1, "title": "Rival Digital"},
                                     {"position": 2, "title": "BloomX Solutions Pvt Ltd"}]},
        "ai_overview": {"text_blocks": [{"type": "paragraph"}],
                        "references": [{"link": "https://competitor.com/a"}, {"link": "https://bloomx.in/blog"}]},
        "answer_box": {"link": "https://competitor.com/a"},
    }
    page = kt.parse_google(data, DOMAIN, business_name="BloomX Solutions")
    assert page["rank"] == 2 and page["url"] == "https://www.bloomx.in/seo"
    assert page["competitors"] == ["competitor.com", "other.org"]
    assert page["paa"] == ["What does SEO cost?", "Is SEO worth it?"] and page["paa_cited"]
    assert page["local_rank"] == 2 and page["local_pack"] == ["Rival Digital", "BloomX Solutions Pvt Ltd"]
    assert page["featured_snippet"] and not page["featured_snippet_cited"]
    aio = kt.parse_ai_overview(page["aio"], DOMAIN)
    assert aio == {"shown": True, "cited": True, "sources": ["competitor.com"]}


def _transport(responses, calls):
    """A SerpAPI stand-in: picks the response by engine/start and records every request."""
    def handler(request: httpx.Request) -> httpx.Response:
        params = dict(request.url.params)
        calls.append(params)
        key = params.get("engine") + ":" + params.get("start", "0")
        body = responses.get(key, {"organic_results": []})
        status = body.pop("_status", 200) if isinstance(body, dict) else 200
        return httpx.Response(status, json=body)
    return httpx.MockTransport(handler)


def test_check_item_follows_ai_overview_token_and_pages_deeper():
    calls = []
    responses = {
        "google:0": {"organic_results": _organic("https://a.com/", "https://b.com/"),
                     "ai_overview": {"page_token": "tok123"}},
        "google_ai_overview:0": {"ai_overview": {"text_blocks": [{}], "references": [{"link": "https://www.bloomx.in/x"}]}},
        "google:10": {"organic_results": _organic("https://c.com/", "https://d.com/", "https://bloomx.in/page")},
    }
    item = kt.clean_items([{"text": "seo audit tool"}], DOMAIN)[0]

    async def go():
        async with httpx.AsyncClient(transport=_transport(responses, calls)) as client:
            return await kt.check_item(client, "KEY", item, DOMAIN, "Pune,Maharashtra,India")

    result, used = asyncio.run(go())
    assert used == 3  # page 1, AI Overview follow-up, page 2 (found there: page 3 not fetched)
    assert result["ai_overview"]["cited"] and result["ai_overview"]["shown"]
    assert result["rank"] == 3 and result["url"] == "https://bloomx.in/page"  # position as returned on page 2
    first = calls[0]
    assert first["gl"] == "in" and first["hl"] == "en" and first["location"] == "Pune,Maharashtra,India"
    assert first["no_cache"] == "true" and first["device"] == "desktop"
    assert calls[1] == {"engine": "google_ai_overview", "page_token": "tok123", "api_key": "KEY", "no_cache": "true"}


def test_check_item_stops_at_page_three():
    calls = []
    responses = {f"google:{s}": {"organic_results": _organic("https://a.com/")} for s in (0, 10, 20, 30)}
    item = kt.clean_items([{"text": "x y"}], DOMAIN)[0]

    async def go():
        async with httpx.AsyncClient(transport=_transport(responses, calls)) as client:
            return await kt.check_item(client, "KEY", item, DOMAIN, "")

    result, used = asyncio.run(go())
    assert used == 3 and result["rank"] is None
    assert [c.get("start") for c in calls] == [None, "10", "20"]
    assert "location" not in calls[0]


def test_run_check_stops_on_quota_and_keeps_partial_results(monkeypatch):
    monkeypatch.setattr(kt, "CONCURRENCY", 1)
    calls = []
    state = {"n": 0}

    def handler(request):
        calls.append(1)
        state["n"] += 1
        if state["n"] == 1:
            return httpx.Response(200, json={"organic_results": _organic("https://bloomx.in/")})
        return httpx.Response(429, json={"error": "Your account has run out of searches."})

    items = kt.clean_items([{"text": "one"}, {"text": "two"}, {"text": "three"}], DOMAIN)

    async def go():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await kt.run_check(items, DOMAIN, "", serp_key="KEY", client=client)

    out = asyncio.run(go())
    statuses = [r["status"] for r in out["results"]]
    assert statuses == ["ok", "error", "error"]  # nothing else measured them
    assert len(calls) == 2  # nothing sent after the quota error
    assert "run out of searches" in out["stopped_reason"]
    assert out["searches_used"] == 1


def _result(rank=None, branded=False, local=False, aio=None, local_rank=None, paa=None, paa_cited=False):
    return {"status": "ok", "rank": rank, "position": rank, "serp_checked": True, "branded": branded, "local": local,
            "local_rank": local_rank,
            "ai_overview": aio or {"shown": False, "cited": False, "sources": []},
            "paa": paa or [], "paa_cited": paa_cited, "competitors": ["rival.com"]}


def test_scores_exclude_branded_and_reweight_missing_parts():
    results = [
        _result(rank=1), _result(rank=8), _result(rank=25), _result(rank=None),
        _result(rank=1, branded=True),
        _result(rank=None, aio={"shown": True, "cited": True, "sources": ["rival.com"]}),
        _result(rank=None, aio={"shown": True, "cited": False, "sources": ["rival.com"]}),
        {"status": "error", "branded": False},
    ]
    s = kt.score_results(results)
    assert s["scored_items"] == 6 and s["branded_items"] == 1
    assert s["google"] == round(100 * (1 + 0.6 + 0.2) / 6)
    assert s["ai"] == 50 and s["aio_shown"] == 2 and s["aio_cited"] == 1
    assert s["paa"] is None and s["local"] is None
    # Only Google (30) and AI (35) have data: weighted between those two.
    assert s["combined"] == round((30 * s["google"] + 35 * 50) / 65)
    assert s["top3"] == 1 and s["top10"] == 2 and s["top30"] == 3 and s["branded_top3"] == 1
    assert s["competitors"][0] == {"host": "rival.com", "organic": 6, "ai": 2}


def test_local_score_uses_map_pack_top3():
    s = kt.score_results([_result(local=True, local_rank=2), _result(local=True, local_rank=None),
                          _result(local=True, local_rank=5)])
    assert s["local"] == 33 and s["local_items"] == 3 and s["local_top3"] == 1


def test_competition_level_counts_big_sites_in_top5():
    assert kt.competition_level(["amazon.in", "www.justdial.com", "en.wikipedia.org", "small.in"])["level"] == "hard"
    assert kt.competition_level(["indiamart.com", "a.in", "b.in"]) == {"level": "medium", "big_sites": ["indiamart.com"]}
    assert kt.competition_level(["a.in", "b.in"])["level"] == "winnable"
    assert not kt.is_big_site("notamazon.in")


def test_related_searches_are_parsed():
    page = kt.parse_google({"related_searches": [{"query": "seo audit cost"}, {"bad": 1}]}, DOMAIN)
    assert page["related"] == ["seo audit cost"]


def test_gsc_queries_only_for_this_domain():
    data = {"is_live_data": True, "property": "sc-domain:bloomx.in", "top_queries": [{"query": "seo audit"}]}
    assert kt.gsc_queries(data, DOMAIN) == [{"query": "seo audit"}]
    assert kt.gsc_queries({**data, "property": "https://other.in/"}, DOMAIN) == []
    assert kt.gsc_queries({**data, "is_live_data": False}, DOMAIN) == []


def _page(url, title, h1, ptype="Service"):
    from types import SimpleNamespace
    return SimpleNamespace(url=url, status_code=200, content_type="text/html", indexability_status="Indexable",
                           crawl_depth=1, title_1=title, h1_1=h1, audit_data={"Page_Type": {"Type": ptype}})


def test_ideas_come_only_from_google_with_proof_and_skip_tracked():
    state = {
        "items": kt.clean_items([{"text": "seo audit"}], DOMAIN),
        "last_check": {"results": [{"text": "seo audit", "related": ["seo audit checklist", "SEO audit"],
                                    "paa": ["How much does an SEO audit cost?"]}]},
    }
    gsc = [{"query": "seo audit pune", "impressions": 340, "clicks": 4, "position": 12.3},
           {"query": "bloomx", "impressions": 90, "clicks": 50, "position": 1.0}]
    auto = {"seo audit": ["seo audit checklist", "seo audit tool free"]}
    cands = {c["text"]: c for c in kt.collect_candidates(state, gsc, auto, DOMAIN)}
    assert "SEO audit" not in cands and "seo audit" not in cands  # already tracked
    assert cands["seo audit checklist"]["sources"] == ["autocomplete", "related_search"]
    assert cands["How much does an SEO audit cost?"]["kind"] == "question"
    assert cands["seo audit pune"]["gsc"]["position"] == 12.3
    assert kt.idea_type(cands["seo audit pune"]) == "quick_win"
    assert cands["bloomx"]["branded"] and kt.idea_type(cands["bloomx"]) == "winning"
    # A quick win from Search Console outranks an autocomplete-only idea; a branded one goes last.
    order = sorted(cands.values(), key=kt.idea_priority, reverse=True)
    assert order[0]["text"] == "seo audit pune" and order[-1]["text"] == "bloomx"


def test_build_ideas_without_ai_maps_pages_by_words(monkeypatch):
    from app.services import prompt_engine

    async def no_ai(**kwargs):
        return False, "No AI provider available", {}
    monkeypatch.setattr(prompt_engine.PromptEngine, "execute_llm_json", classmethod(lambda cls, **kw: no_ai(**kw)))
    pages = [_page("https://bloomx.in/", "BloomX", "Welcome", "Home"),
             _page("https://bloomx.in/seo-audit", "Technical SEO Audit Services", "SEO audit services")]
    calls = []

    def handler(request):
        calls.append(dict(request.url.params))
        return httpx.Response(200, json={"suggestions": [{"value": "seo audit services pune"}, {"value": "seo audit price"}]})

    async def go():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await kt.build_ideas({}, pages, DOMAIN, {"items": kt.clean_items([{"text": "seo audit"}], DOMAIN)},
                                        {}, "KEY", True, client=client)

    out = asyncio.run(go())
    assert out["searches_used"] == 1 and calls[0]["engine"] == "google_autocomplete" and calls[0]["gl"] == "in"
    by_text = {i["text"]: i for i in out["items"]}
    assert by_text["seo audit services pune"]["target_url"] == "https://bloomx.in/seo-audit"
    assert by_text["seo audit services pune"]["sources"] == ["autocomplete"]
    assert all(i["action"] for i in out["items"]) and out["reviewed_by"] is None


def test_build_ideas_ai_cannot_invent_pages_and_drops_low_relevance(monkeypatch):
    from app.services import prompt_engine

    async def ai(**kwargs):
        return True, "Google Gemini", {"ideas": [
            {"n": 1, "relevance": "high", "intent": "buy", "target_url": "https://bloomx.in/made-up", "action": "Do it"},
            {"n": 2, "relevance": "low", "intent": "learn", "target_url": "", "action": "x"}]}
    monkeypatch.setattr(prompt_engine.PromptEngine, "execute_llm_json", classmethod(lambda cls, **kw: ai(**kw)))
    state = {"items": [], "last_check": {"results": [{"text": "q", "related": ["seo audit cost", "free movies"]}]}}
    out = asyncio.run(kt.build_ideas({"gemini": object()}, [_page("https://bloomx.in/a", "A", "A")], DOMAIN,
                                     state, {}, None, True))
    assert out["searches_used"] == 0 and out["reviewed_by"] == "Google Gemini"
    assert [i["text"] for i in out["items"]] == ["seo audit cost"]
    assert out["items"][0]["target_url"] == ""  # the AI named a page that does not exist


def test_summary_card_needs_ten_scored_searches():
    assert kt.summary_card({})["status"] == "no_data"
    state = {"last_check": {"checked_at": "t", "results": [{}], "scores": {"scored_items": 4, "combined": 40}}}
    assert kt.summary_card(state)["status"] == "insufficient"
    state["last_check"]["scores"]["scored_items"] = 12
    card = kt.summary_card(state)
    assert card["status"] == "ok" and card["score"] == 40 and card["tracked_keywords"] == 12


def test_fallback_suggestions_without_ai():
    from types import SimpleNamespace as P
    pages = [
        P(url="https://bloomx.in/", status_code=200, content_type="text/html", h1_1="Welcome", title_1="Home",
          audit_data={"Page_Type": {"Type": "Home"}}),
        P(url="https://bloomx.in/seo", status_code=200, content_type="text/html", h1_1="Technical SEO Audits",
          title_1="Technical SEO Audits | BloomX",
          audit_data={"Page_Type": {"Type": "Service"},
                      "Content_Outline": {"Headings": [{"level": 2, "text": "How long does an SEO audit take?"}]}}),
    ]
    items = kt.fallback_suggestions(pages, DOMAIN)
    assert [i["text"] for i in items] == ["Technical SEO Audits", "How long does an SEO audit take?"]


def _seed_completed_crawl(user_sub: str, seed: str) -> int:
    from app.core.auth import get_or_create_user_project
    from app.core.database import AsyncSessionLocal
    from app.models.domain import Crawl

    async def go():
        async with AsyncSessionLocal() as db:
            project_id = await get_or_create_user_project(db, user_sub)
            crawl = Crawl(project_id=project_id, seed_url=seed, status="completed", mode="site")
            db.add(crawl)
            await db.commit()
            return crawl.id
    return asyncio.run(go())


def test_api_list_check_and_dashboard_card(client, monkeypatch):
    user = "kw-user-1"
    headers = auth(user)
    assert client.get("/api/keywords", headers=headers).status_code == 404  # no audit yet
    crawl_id = _seed_completed_crawl(user, "https://www.bloomx.in/")

    view = client.get("/api/keywords", headers=headers).json()
    assert view["domain"] == DOMAIN and view["items"] == [] and view["serp_connected"] is False

    body = {"location": "Pune,Maharashtra,India", "business_name": "BloomX",
            "items": [{"text": f"seo service {n}"} for n in range(11)] + [{"text": "bloomx reviews"}]}
    view = client.put("/api/keywords", headers=headers, json=body).json()
    assert len(view["items"]) == 12 and view["items"][-1]["branded"]
    assert view["estimate"] == {"min": 12, "max": 48, "ai_calls": 0}

    # No SerpAPI key: refused before any search.
    assert client.post("/api/keywords/check", headers=headers).status_code == 400

    monkeypatch.setenv("SERPAPI_API_KEY", "test-key")
    seen = {}

    async def fake_run_check(items, domain, location, business_name="", serp_key=None, gemini=None, gsc=None,
                             gsc_note=None, client=None):
        seen.update(key=serp_key, n=len(items), domain=domain, location=location, business=business_name)
        results = [{**i, "status": "ok", "rank": 2, "position": 2, "serp_checked": True, "competitors": [], "paa": [],
                    "paa_cited": False,
                    "local_rank": None, "ai_overview": {"shown": True, "cited": True, "sources": []}} for i in items]
        return {"checked_at": "2026-10-31T00:00:00Z", "results": results, "searches_used": len(items),
                "stopped_reason": None, "scores": kt.score_results(results)}

    monkeypatch.setattr(kt, "run_check", fake_run_check)
    started = client.post("/api/keywords/check", headers=headers, json={"serp": True})
    assert started.status_code == 200 and started.json()["running"] is True
    # TestClient runs the background task before returning: the result is stored.
    view = client.get("/api/keywords", headers=headers).json()
    assert view["running"] is False and view["last_check"]["searches_used"] == 12
    assert seen == {"key": "test-key", "n": 12, "domain": DOMAIN, "location": "Pune,Maharashtra,India",
                    "business": "BloomX"}

    summary = client.get(f"/api/crawls/{crawl_id}/summary", headers=headers).json()
    serp = summary["integrations"]["serp"]
    assert serp["status"] == "ok" and serp["tracked_keywords"] == 11 and serp["top3"] == 11
    assert summary["integrations"]["ai_visibility"]["status"] == "ok"
    assert summary["integrations"]["ai_visibility"]["score"] == 100

    # Another workspace sees none of it.
    other = auth("kw-user-2")
    _seed_completed_crawl("kw-user-2", "https://www.bloomx.in/")
    assert client.get("/api/keywords", headers=other).json()["items"] == []
    json.dumps(view)  # serialisable


def _gemini_response(text, titles):
    return {"candidates": [{"content": {"parts": [{"text": text}]}, "groundingMetadata": {"groundingChunks": [
        {"web": {"uri": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc", "title": t}}
        for t in titles]}}]}


def test_parse_grounding_reads_sites_from_titles_not_redirects():
    out = kt.parse_grounding(_gemini_response("Try BloomX or Rival.", ["bloomx.in", "rival.com", "Some Title"]),
                             DOMAIN, "BloomX")
    assert out == {"mentioned": True, "cited": True, "sources": ["rival.com"], "grounded": True}
    out = kt.parse_grounding(_gemini_response("Use Rival.", ["rival.com"]), DOMAIN, "BloomX")
    assert not out["mentioned"] and not out["cited"]


def test_gemini_check_asks_three_times_with_google_search():
    calls = []
    answers = iter([_gemini_response("BloomX is good", ["bloomx.in"]),
                    _gemini_response("Rival is good", ["rival.com"]),
                    _gemini_response("BloomX and Rival", ["rival.com", "bloomx.in"])])

    def handler(request):
        calls.append(json.loads(request.content))
        return httpx.Response(200, json=next(answers))

    async def go():
        from types import SimpleNamespace
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await kt.gemini_check(client, SimpleNamespace(api_key="G", config_json={}),
                                         "who does seo audits in pune?", DOMAIN, "BloomX")

    out = asyncio.run(go())
    assert len(calls) == 3 and calls[0]["tools"] == [{"google_search": {}}]
    assert out["runs"] == 3 and out["cited"] == 2 and out["mentioned"] == 2 and out["sources"] == ["rival.com"]


def test_run_check_free_sources_gsc_positions_and_gemini(monkeypatch):
    items = kt.clean_items([{"text": "seo audit pune"}, {"text": "who does seo audits in pune?"},
                            {"text": "bloomx reviews"}], DOMAIN)
    gsc = {items[0]["id"]: {"position": 6.4, "impressions": 120, "clicks": 3, "page": "https://bloomx.in/seo"},
           items[1]["id"]: None, items[2]["id"]: {"position": 1.0, "impressions": 50, "clicks": 20, "page": "x"}}

    async def fake_gemini(client, gemini, text, domain, business_name="", runs=3):
        return {"runs": 3, "mentioned": 1, "cited": 1, "sources": ["rival.com"], "model": "m"}
    monkeypatch.setattr(kt, "gemini_check", fake_gemini)

    out = asyncio.run(kt.run_check(items, DOMAIN, "", gemini=object(), gsc=gsc))
    by = {r["text"]: r for r in out["results"]}
    assert by["seo audit pune"]["position"] == 6.4 and by["seo audit pune"]["position_source"] == "search_console"
    assert "gemini" not in by["seo audit pune"]  # keywords are not asked; questions are
    q = by["who does seo audits in pune?"]
    assert q["position"] is None and q["gemini"]["cited"] == 1 and q["status"] == "ok"
    assert "gemini" not in by["bloomx reviews"]  # branded: not asked
    s = out["scores"]
    assert out["searches_used"] == 0 and out["ai_calls"] == 3
    assert s["positioned_items"] == 2 and s["google"] == round(100 * 0.6 / 2)  # #6 = 60%, not shown = 0
    assert s["ai"] == 33 and s["ai_questions"] == 1 and s["ai_cited_questions"] == 1
    assert s["paa"] is None and s["local"] is None
    assert kt.ai_visibility_card({"last_check": out})["engine"] == "gemini_google_search"


def test_gemini_quota_stops_ai_and_keeps_positions(monkeypatch):
    items = kt.clean_items([{"text": "a b?"}, {"text": "c d?"}], DOMAIN)

    async def limited(*a, **k):
        raise kt.AiLimitError("Gemini returned HTTP 429")
    monkeypatch.setattr(kt, "gemini_check", limited)
    out = asyncio.run(kt.run_check(items, DOMAIN, "", gemini=object(), gsc={i["id"]: None for i in items}))
    assert [r["status"] for r in out["results"]] == ["ok", "ok"]  # Search Console still measured them
    assert "429" in out["stopped_reason"]


def test_gsc_positions_aggregates_pages_and_falls_back_to_domain_property():
    from app.core.auth import get_or_create_user_project
    from app.core.database import AsyncSessionLocal
    from app.models.domain import Integration

    items = kt.clean_items([{"text": "SEO Audit Pune"}, {"text": "nothing here"}], DOMAIN)
    calls = []

    def handler(request):
        body = json.loads(request.content)
        expr = body["dimensionFilterGroups"][0]["filters"][0]["expression"]
        calls.append((request.url.path, expr))
        if "sc-domain" not in request.url.path:
            return httpx.Response(403, json={})
        if expr == "seo audit pune":
            return httpx.Response(200, json={"rows": [
                {"keys": ["https://bloomx.in/seo"], "impressions": 300, "clicks": 6, "position": 5.0},
                {"keys": ["https://bloomx.in/"], "impressions": 100, "clicks": 1, "position": 9.0}]})
        return httpx.Response(200, json={})

    async def go():
        async with AsyncSessionLocal() as db:
            pid = await get_or_create_user_project(db, "kw-gsc-user")
            db.add(Integration(project_id=pid, integration_type="search_console", connected=True,
                               api_key="ya29.test-token", config_json={"selected_property": "https://other.in/"}))
            await db.commit()
            async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
                return await kt.gsc_positions(db, pid, DOMAIN, items, client=client)

    positions, note = asyncio.run(go())
    assert note is None
    first = positions[items[0]["id"]]
    assert first == {"position": 6.0, "impressions": 400, "clicks": 7, "page": "https://bloomx.in/seo"}
    assert positions[items[1]["id"]] is None
    assert all(expr == expr.lower() for _, expr in calls)
    assert "other.in" not in " ".join(p for p, _ in calls)  # a property for another site is never queried


def test_grounding_parent_domain_counts_except_shared_platforms():
    out = kt.parse_grounding(_gemini_response("x", ["toscrape.com", "rival.com"]), "books.toscrape.com")
    assert out["cited"] and out["sources"] == ["rival.com"]
    out = kt.parse_grounding(_gemini_response("x", ["blogspot.com"]), "myblog.blogspot.com")
    assert not out["cited"]


def test_grounding_falls_back_to_a_model_with_search_quota(monkeypatch):
    monkeypatch.setattr(kt, "_GROUNDING_COOLDOWN", {})
    seen = []

    def handler(request):
        model = request.url.path.split("/models/")[1].split(":")[0]
        seen.append(model)
        if model != "gemini-2.5-flash":
            return httpx.Response(429, json={"error": {"message": "quota"}})
        return httpx.Response(200, json=_gemini_response("BloomX", ["bloomx.in"]))

    async def go():
        from types import SimpleNamespace
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await kt.gemini_check(client, SimpleNamespace(api_key="G", config_json={}), "q?", DOMAIN)

    out = asyncio.run(go())
    assert out["runs"] == 3 and out["cited"] == 3 and out["model"] == "gemini-2.5-flash"
    assert seen.count("gemini-2.5-flash") == 3 and len(seen) == 4  # the refused model is skipped after one 429


def test_per_minute_gemini_limit_is_waited_out_daily_limit_is_not(monkeypatch):
    def limited(quota_id, delay="2s"):
        return httpx.Response(429, json={"error": {"details": [
            {"@type": "type.googleapis.com/google.rpc.QuotaFailure", "violations": [{"quotaId": quota_id}]},
            {"@type": "type.googleapis.com/google.rpc.RetryInfo", "retryDelay": delay}]}})
    assert kt._per_minute_retry_delay(limited("GenerateRequestsPerMinutePerProjectPerModel-FreeTier", "17s")) == 17.0
    assert kt._per_minute_retry_delay(limited("GenerateRequestsPerDayPerProjectPerModel-FreeTier")) is None

    monkeypatch.setattr(kt, "_GROUNDING_COOLDOWN", {})
    slept = []

    async def no_sleep(s):
        slept.append(s)
    monkeypatch.setattr(kt.asyncio, "sleep", no_sleep)
    state = {"n": 0}

    def handler(request):
        state["n"] += 1
        if state["n"] == 1:
            return limited("GenerateRequestsPerMinutePerProjectPerModel-FreeTier", "5s")
        return httpx.Response(200, json=_gemini_response("x", ["bloomx.in"]))

    async def go():
        from types import SimpleNamespace
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await kt.gemini_check(client, SimpleNamespace(api_key="G", config_json={}), "q?", DOMAIN, runs=1)

    out = asyncio.run(go())
    assert slept == [5.0] and out["runs"] == 1 and out["cited"] == 1


def test_items_no_source_covers_are_not_measured_not_errors(monkeypatch):
    items = kt.clean_items([{"text": "seo audit"}, {"text": "who audits sites?"}], DOMAIN)

    async def fake_gemini(client, gemini, text, domain, business_name="", runs=3):
        return {"runs": 3, "mentioned": 0, "cited": 0, "sources": [], "model": "m"}
    monkeypatch.setattr(kt, "gemini_check", fake_gemini)
    out = asyncio.run(kt.run_check(items, DOMAIN, "", gemini=object()))
    assert [r["status"] for r in out["results"]] == ["not_measured", "ok"]
    assert out["results"][0]["error"] is None
    assert out["scores"]["scored_items"] == 1 and out["scores"]["google"] is None
