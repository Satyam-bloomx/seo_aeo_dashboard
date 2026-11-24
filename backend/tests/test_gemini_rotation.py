"""Gemini model rotation per key: selected model first, a daily primary once a model hits its daily limit, limited
models never called again until the quota day ends, per-minute limits waited out instead of skipped for the day."""
import asyncio
from types import SimpleNamespace

import httpx
import pytest

from app.services import gemini_rotation as rot
from app.services import keyword_tracking as kt

KEY = "key-1"


@pytest.fixture(autouse=True)
def fresh(monkeypatch):
    monkeypatch.setattr(rot, "_day", {})
    monkeypatch.setattr(rot, "_paused", {})
    monkeypatch.setattr(rot, "_models", {})


def _listed(monkeypatch, models):
    async def listed(*_a, **_k):
        return list(models)
    monkeypatch.setattr(rot, "available_models", listed)


def _quota(quota_id=None, delay=None):
    details = []
    if quota_id:
        details.append({"@type": "type.googleapis.com/google.rpc.QuotaFailure", "violations": [{"quotaId": quota_id}]})
    if delay:
        details.append({"@type": "type.googleapis.com/google.rpc.RetryInfo", "retryDelay": delay})
    return httpx.Response(429, json={"error": {"message": "You exceeded your current quota", "details": details}})


def _grounded():
    return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": "Try acme.com"}]},
                                                     "groundingMetadata": {"groundingChunks": [{"web": {"title": "acme.com"}}]}}]})


def test_ranking_prefers_stable_flash_newest_first():
    names = ["gemini-2.5-pro", "gemini-3-flash-preview", "gemini-2.5-flash-lite", "gemini-3.5-flash",
             "gemini-flash-latest", "gemini-2.5-flash", "gemini-4-argon"]
    assert sorted(names, key=rot.rank) == ["gemini-3.5-flash", "gemini-2.5-flash", "gemini-2.5-flash-lite",
                                           "gemini-2.5-pro", "gemini-4-argon", "gemini-flash-latest",
                                           "gemini-3-flash-preview"]


def test_classify_daily_minute_unavailable():
    assert rot.classify(_quota("GenerateRequestsPerDayPerProjectPerModel-FreeTier")) == ("day", None)
    assert rot.classify(_quota())[0] == "day"  # "check your plan and billing": no free allowance on this model
    assert rot.classify(_quota("GenerateRequestsPerMinutePerProjectPerModel-FreeTier", "17s")) == ("minute", 17.0)
    gone = httpx.Response(404, json={"error": {"message": "This model models/gemini-2.5-pro is no longer available"}})
    assert rot.classify(gone) == ("unavailable", None)
    assert rot.classify(httpx.Response(503, json={}))[0] == "minute"


def test_selected_model_first_then_a_daily_primary(monkeypatch):
    _listed(monkeypatch, ["gemini-3.5-flash", "gemini-2.5-flash", "gemini-2.5-flash-lite"])
    order = asyncio.run(rot.order(KEY, "gemini-2.5-flash", grounded=True))
    assert order[0] == "gemini-2.5-flash" and len(order) == 3  # the user's selection leads
    rot.mark_limited(KEY, "gemini-2.5-flash", "day")
    rot.mark_success(KEY, "gemini-2.5-flash-lite")
    order = asyncio.run(rot.order(KEY, "gemini-2.5-flash", grounded=True))
    assert order == ["gemini-2.5-flash-lite", "gemini-3.5-flash"]  # today's primary first, limited model gone


def test_per_minute_limit_pauses_briefly_never_for_the_day(monkeypatch):
    _listed(monkeypatch, ["gemini-a", "gemini-b"])
    rot.mark_limited(KEY, "gemini-a", "minute", 5)
    assert "gemini-a" not in asyncio.run(rot.order(KEY, "gemini-a", grounded=True))
    assert rot.status(KEY)["limited_today"] == {}  # not marked as used up for the day
    monkeypatch.setattr(rot.time, "time", lambda: 10 ** 12)  # later
    assert "gemini-a" in asyncio.run(rot.order(KEY, "gemini-a", grounded=True))


def test_a_new_quota_day_restores_every_model(monkeypatch):
    _listed(monkeypatch, ["gemini-a"])
    rot.mark_limited(KEY, "gemini-a", "day")
    assert asyncio.run(rot.order(KEY, "gemini-a", grounded=True)) == []
    monkeypatch.setattr(rot, "quota_day", lambda: "2099-01-01")
    assert asyncio.run(rot.order(KEY, "gemini-a", grounded=True)) == ["gemini-a"]


def test_gemma_is_never_used_it_cannot_search(monkeypatch):
    _listed(monkeypatch, ["gemma-4-31b-it", "gemini-2.5-flash-lite"])
    assert asyncio.run(rot.order(KEY, "gemma-4-31b-it", grounded=True)) == ["gemini-2.5-flash-lite"]


def test_rotation_through_many_models_and_no_wasted_calls(monkeypatch):
    """Five models: four refuse (daily, no allowance, unavailable, daily), the fifth answers and becomes the primary.
    A second question goes straight to it."""
    models = ["gemini-3.8-flash", "gemini-3.5-flash", "gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.5-flash-lite"]
    _listed(monkeypatch, models)
    calls = []
    refusals = {"gemini-3.8-flash": _quota("GenerateRequestsPerDayPerProjectPerModel-FreeTier"),
                "gemini-3.5-flash": _quota(),
                "gemini-2.5-pro": httpx.Response(404, json={"error": {"message": "model not available"}}),
                "gemini-2.5-flash": _quota("GenerateRequestsPerDayPerProjectPerModel-FreeTier")}

    def handler(request):
        model = request.url.path.split("/models/")[1].split(":")[0]
        calls.append(model)
        return refusals.get(model) or _grounded()

    cfg = SimpleNamespace(api_key=KEY, config_json={"selected_model": "gemini-3.8-flash", "model_selected_by_user": True})

    async def go():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as c:
            first = await kt.gemini_check(c, cfg, "q1?", "acme.com", runs=1)
            second = await kt.gemini_check(c, cfg, "q2?", "acme.com", runs=1)
            return first, second
    first, second = asyncio.run(go())
    assert first["model"] == "gemini-2.5-flash-lite" and second["model"] == "gemini-2.5-flash-lite"
    assert calls == models + ["gemini-2.5-flash-lite"]  # the second question skips all four limited models
    assert rot.status(KEY)["primary"] == "gemini-2.5-flash-lite"


def test_when_every_model_is_limited_the_reason_is_clear(monkeypatch):
    _listed(monkeypatch, ["gemini-a", "gemini-b"])

    def handler(_request):
        return _quota("GenerateRequestsPerDayPerProjectPerModel-FreeTier")
    cfg = SimpleNamespace(api_key=KEY, config_json={})

    async def go():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as c:
            return await kt.gemini_check(c, cfg, "q?", "acme.com", runs=1)
    with pytest.raises(kt.AiLimitError) as e:
        asyncio.run(go())
    assert "reached today's limit" in str(e.value) and "midnight Pacific" in str(e.value)
