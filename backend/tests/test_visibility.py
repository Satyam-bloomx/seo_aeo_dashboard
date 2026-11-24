"""Measured visibility: engines share one result shape, scores come only from real answers / Google results, and
anything unmeasured is reported as such (never a filled-in number)."""
import asyncio

import httpx

from app.services import visibility as vis

DOMAIN = "acme-gems.com"
QUESTIONS = [{"id": f"q{i}", "text": f"Where to buy natural ruby {i}?", "kind": "question", "branded": False,
              "source": "auto" if i < 3 else "user"} for i in range(5)]


def _check(google=None, ai=None, engines=None, serp=None):
    rows = []
    for i, q in enumerate(QUESTIONS):
        row = {"id": q["id"], "text": q["text"], "source": q["source"], "ai": (ai or {}).get(i, {})}
        if google and i in google:
            row["google"] = google[i]
        rows.append(row)
    check = {"questions": rows, "engines": engines or {}, "google": serp or {"status": "ok"}}
    check["scores"] = vis.score_visibility(check)
    return check


def _engine(name, visible, total=2, cited=0):
    answers = [{"mentioned": i < visible, "cited": i < cited, "sources": ["other.com"], "excerpt": "..."} for i in range(total)]
    return {"engine": name, "model": "m", "runs": total, "mentioned": visible, "cited": cited, "sources": [], "answers": answers}


# ---------------------------------------------------------------- parsers (recorded response shapes)

def test_openai_response_parsing_reads_text_and_url_citations():
    data = {"output": [
        {"type": "web_search_call", "status": "completed"},
        {"type": "message", "content": [{"type": "output_text", "text": "Try Acme Gems (acme-gems.com) or Ratna.",
                                         "annotations": [{"type": "url_citation", "url": "https://www.acme-gems.com/ruby"},
                                                         {"type": "url_citation", "url": "https://ratna.in/x"}]}]}]}
    text, urls = vis.parse_openai_response(data)
    a = vis._answer(text, urls, DOMAIN, "Acme Gems")
    assert a["mentioned"] and a["cited"] and a["sources"] == ["ratna.in"]


def test_claude_message_parsing_reads_citations_and_search_results():
    data = {"content": [
        {"type": "server_tool_use", "name": "web_search"},
        {"type": "web_search_tool_result", "content": [{"type": "web_search_result", "url": "https://ratna.in/a", "title": "R"}]},
        {"type": "text", "text": "Ratna sells certified rubies.", "citations": [{"type": "web_search_result_location", "url": "https://ratna.in/a"}]},
    ]}
    text, urls = vis.parse_claude_message(data)
    a = vis._answer(text, urls, DOMAIN, "Acme Gems")
    assert not a["mentioned"] and not a["cited"] and a["sources"] == ["ratna.in"]
    # a search error is an object, not a list: it must not break parsing
    err = {"content": [{"type": "web_search_tool_result", "content": {"type": "web_search_tool_result_error", "error_code": "max_uses_exceeded"}}]}
    assert vis.parse_claude_message(err) == ("", [])


def test_openai_engine_with_a_mocked_api():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/v1/responses"
        body = request.read().decode()
        assert '"web_search"' in body  # live web search is always on
        return httpx.Response(200, json={"output": [{"type": "message", "content": [
            {"type": "output_text", "text": "acme-gems.com is a good option.", "annotations": []}]}]})
    cfg = type("C", (), {"api_key": "sk-x", "config_json": {}})()

    async def go():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as c:
            return await vis.ask_openai(c, cfg, "q?", DOMAIN, "", runs=2)
    r = asyncio.run(go())
    assert r["engine"] == "openai" and r["runs"] == 2 and r["mentioned"] == 2 and len(r["answers"]) == 2


def test_openai_engine_stops_on_a_rejected_key():
    def handler(_request):
        return httpx.Response(401, json={"error": {"message": "Incorrect API key provided"}})
    cfg = type("C", (), {"api_key": "sk-test", "config_json": {}})()

    async def go():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as c:
            return await vis.ask_openai(c, cfg, "q?", DOMAIN, "", runs=2)
    try:
        asyncio.run(go())
        raise AssertionError("expected EngineLimit")
    except vis.EngineLimit as e:
        assert "Incorrect API key" in str(e)


# ---------------------------------------------------------------- scores

def test_geo_with_only_gemini_is_labelled_and_suggests_the_other_engines():
    ai = {i: {"gemini": _engine("gemini", visible=1 if i < 2 else 0)} for i in range(5)}
    geo = _check(ai=ai)["scores"]["geo"]
    assert geo["status"] == "ok" and geo["answers"] == 10 and geo["visible_answers"] == 2 and geo["score"] == 20
    assert geo["engines"] == ["Gemini"] and geo["label"] == "Based on Gemini (10 answers)"
    assert "ChatGPT" in geo["reason"] and "Claude" in geo["reason"]
    lo, hi = geo["interval"]
    assert lo < 20 < hi and hi - lo > 30  # 10 answers: an honest, wide interval


def test_geo_combines_every_engine_that_answered():
    ai = {i: {"gemini": _engine("gemini", 1), "openai": _engine("openai", 2)} for i in range(5)}
    geo = _check(ai=ai)["scores"]["geo"]
    assert geo["answers"] == 20 and geo["score"] == 75 and geo["per_engine"]["openai"]["score"] == 100
    assert geo["missing_engines"] == ["Claude"]


def test_nothing_measured_means_no_score_and_a_reason():
    s = _check(engines={"gemini": {"status": "error", "reason": "Gemini's free daily limit is used up"}},
               serp={"status": "not_connected", "reason": "Connect SerpAPI in Integrations for Google results."})["scores"]
    assert s["geo"] == {"status": "not_measured", "score": None, "reason": "Gemini's free daily limit is used up"}
    assert s["aeo"]["status"] == "not_measured" and s["aeo"]["score"] is None and "SerpAPI" in s["aeo"]["reason"]
    assert s["seo"]["score"] is None


def _g(rank=None, aio_shown=False, aio_cited=False, fs=False, fs_cited=False, paa=None, paa_cited=False):
    return {"rank": rank, "ai_overview": {"shown": aio_shown, "cited": aio_cited, "sources": []},
            "featured_snippet": fs, "featured_snippet_cited": fs_cited, "paa": paa or [], "paa_cited": paa_cited}


def test_aeo_counts_only_questions_where_google_showed_an_answer_feature():
    google = {0: _g(rank=2, aio_shown=True, aio_cited=True), 1: _g(aio_shown=True), 2: _g(paa=["q"], paa_cited=True),
              3: _g(rank=8), 4: _g()}
    s = _check(google=google)["scores"]
    assert s["aeo"]["with_features"] == 3 and s["aeo"]["appears"] == 2 and s["aeo"]["score"] == 67
    assert s["seo"]["page1"] == 2 and s["seo"]["top3"] == 1 and s["seo"]["score"] == round((100 + 60) / 5)


def test_aeo_with_no_answer_features_is_not_a_misleading_zero():
    google = {i: _g() for i in range(5)}
    aeo = _check(google=google)["scores"]["aeo"]
    assert aeo["status"] == "not_measured" and aeo["score"] is None and "no AI Overview" in aeo["reason"]


def test_reuse_only_for_the_same_questions_within_a_day():
    from datetime import datetime, timedelta
    fresh = {"questions_key": vis.questions_key(QUESTIONS), "checked_at": datetime.utcnow().isoformat() + "Z"}
    old = {**fresh, "checked_at": (datetime.utcnow() - timedelta(hours=30)).isoformat() + "Z"}
    assert vis.is_fresh(fresh, QUESTIONS) and not vis.is_fresh(old, QUESTIONS)
    assert not vis.is_fresh(fresh, QUESTIONS[:4] + [{"text": "a different question?"}])


def test_only_non_branded_questions_are_asked_and_at_most_three():
    items = QUESTIONS + [{"id": "b", "text": "is acme gems legit?", "kind": "question", "branded": True},
                         {"id": "k", "text": "ruby price", "kind": "keyword", "branded": False},
                         {"id": "q9", "text": "sixth question?", "kind": "question", "branded": False}]
    picked = vis.visibility_questions({"items": items})
    assert [q["id"] for q in picked] == ["q0", "q1", "q2"]  # 3 questions, each asked once per engine
    assert vis.VISIBILITY_QUESTIONS == 3 and vis.RUNS_PER_ENGINE == 1


def test_only_the_workspace_keys_are_used_never_the_servers(monkeypatch):
    """The server's environment keys must not be spent on users' audits."""
    import asyncio as _a
    from app.services.prompt_engine import PromptEngine
    from app.services import keyword_tracking as kt
    monkeypatch.setenv("GEMINI_API_KEY", "server-gemini")
    monkeypatch.setenv("OPENAI_API_KEY", "server-openai")
    monkeypatch.setenv("SERPAPI_API_KEY", "server-serp")

    class _Res:
        def scalars(self): return self
        def all(self): return []
        def first(self): return None

    class _DB:
        async def execute(self, *_a, **_k): return _Res()
    integrations = _a.run(PromptEngine.resolve_integrations(_DB(), 1))
    assert integrations == {} and vis.connected_engines(integrations) == {}
    assert _a.run(kt.resolve_serpapi_key(_DB(), 1)) is None
