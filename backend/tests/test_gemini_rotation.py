"""Gemini model rotation per key: selected model first, a daily primary once a model hits its daily limit, limited
models never called again until the quota day ends, per-minute limits waited out instead of skipped for the day.
Free keys keep the two free-grounding models for grounded work only; paid keys use the selected model only."""
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


FLASH, LITE = rot.FREE_GROUNDING_MODELS


def test_free_grounded_uses_only_the_two_free_grounding_models(monkeypatch):
    _listed(monkeypatch, ["gemini-3.5-flash", FLASH, LITE, "gemini-3.8-flash"])
    assert asyncio.run(rot.order(KEY, "gemini-3.5-flash", grounded=True)) == [FLASH, LITE]  # no free grounding on 3.x
    assert asyncio.run(rot.order(KEY, LITE, grounded=True)) == [LITE, FLASH]  # the user's pick of the two leads
    rot.mark_limited(KEY, FLASH, "day")
    rot.mark_success(KEY, LITE, grounded=True)
    assert asyncio.run(rot.order(KEY, FLASH, grounded=True)) == [LITE]  # today's primary, limited model gone


def test_free_general_work_never_touches_the_grounding_models(monkeypatch):
    _listed(monkeypatch, ["gemini-3.5-flash", FLASH, LITE, "gemini-2.5-pro", "gemma-4-31b-it"])
    order = asyncio.run(rot.order(KEY, FLASH, grounded=False, fallbacks=(FLASH,)))
    assert order == ["gemini-3.5-flash", "gemini-2.5-pro"]
    assert asyncio.run(rot.order(KEY, "gemini-2.5-pro", grounded=False))[0] == "gemini-2.5-pro"  # selection leads


def test_primaries_are_kept_per_kind_of_work(monkeypatch):
    _listed(monkeypatch, ["gemini-3.5-flash", "gemini-3.8-flash", FLASH, LITE])
    rot.mark_success(KEY, "gemini-3.8-flash", grounded=False)
    rot.mark_success(KEY, LITE, grounded=True)
    assert asyncio.run(rot.order(KEY, "gemini-3.5-flash", grounded=False))[0] == "gemini-3.8-flash"
    assert asyncio.run(rot.order(KEY, FLASH, grounded=True))[0] == LITE
    assert rot.status(KEY)["primary"] == {"general": "gemini-3.8-flash", "search": LITE}


def test_paid_key_uses_the_selected_model_only_and_never_rotates(monkeypatch):
    _listed(monkeypatch, ["gemini-3.5-flash", FLASH, LITE])
    for grounded in (True, False):
        assert asyncio.run(rot.order(KEY, "gemini-3.5-flash", grounded=grounded, tier="paid")) == ["gemini-3.5-flash"]
    rot.mark_limited(KEY, "gemini-3.5-flash", "day")
    assert asyncio.run(rot.order(KEY, "gemini-3.5-flash", grounded=True, tier="paid")) == []
    msg = rot.exhausted_message(KEY, "paid", grounded=True, chosen="gemini-3.5-flash")
    assert "gemini-3.5-flash" in msg and "Integrations" in msg


def test_tier_defaults_to_free_unless_the_user_said_paid():
    assert rot.tier_of(None) == "free" and rot.tier_of({}) == "free" and rot.tier_of({"tier": "x"}) == "free"
    assert rot.tier_of({"tier": "paid"}) == "paid"


def test_per_minute_limit_pauses_briefly_never_for_the_day(monkeypatch):
    _listed(monkeypatch, ["gemini-a", "gemini-b"])
    rot.mark_limited(KEY, "gemini-a", "minute", 5)
    assert "gemini-a" not in asyncio.run(rot.order(KEY, "gemini-a", grounded=False))
    assert rot.status(KEY)["limited_today"] == {}  # not marked as used up for the day
    monkeypatch.setattr(rot.time, "time", lambda: 10 ** 12)  # later
    assert "gemini-a" in asyncio.run(rot.order(KEY, "gemini-a", grounded=False))


def test_a_new_quota_day_restores_every_model(monkeypatch):
    _listed(monkeypatch, ["gemini-a"])
    rot.mark_limited(KEY, "gemini-a", "day")
    assert asyncio.run(rot.order(KEY, "gemini-a", grounded=False)) == []
    monkeypatch.setattr(rot, "quota_day", lambda: "2099-01-01")
    assert asyncio.run(rot.order(KEY, "gemini-a", grounded=False)) == ["gemini-a"]


def test_gemma_is_never_used(monkeypatch):
    _listed(monkeypatch, ["gemma-4-31b-it", "gemini-3.5-flash"])
    assert asyncio.run(rot.order(KEY, "gemma-4-31b-it", grounded=False)) == ["gemini-3.5-flash"]


def test_free_grounded_check_rotates_between_the_two_and_wastes_no_calls(monkeypatch):
    """Free key: Flash refuses (daily limit), Flash-Lite answers and becomes the search primary; the second question
    goes straight to it. The user's 3.x selection and the key's other models are never called for grounded work."""
    _listed(monkeypatch, ["gemini-3.8-flash", "gemini-3.5-flash", FLASH, LITE])
    calls = []

    def handler(request):
        model = request.url.path.split("/models/")[1].split(":")[0]
        calls.append(model)
        return _quota("GenerateRequestsPerDayPerProjectPerModel-FreeTier") if model == FLASH else _grounded()

    cfg = SimpleNamespace(api_key=KEY, config_json={"selected_model": "gemini-3.8-flash", "model_selected_by_user": True,
                                                    "tier": "free"})

    async def go():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as c:
            first = await kt.gemini_check(c, cfg, "q1?", "acme.com", runs=1)
            second = await kt.gemini_check(c, cfg, "q2?", "acme.com", runs=1)
            return first, second
    first, second = asyncio.run(go())
    assert first["model"] == LITE and second["model"] == LITE
    assert calls == [FLASH, LITE, LITE]
    assert rot.status(KEY)["primary"] == {"search": LITE}


def test_paid_grounded_check_calls_only_the_selected_model(monkeypatch):
    _listed(monkeypatch, ["gemini-3.8-flash", FLASH, LITE])
    calls = []

    def handler(request):
        calls.append(request.url.path.split("/models/")[1].split(":")[0])
        return _quota("GenerateRequestsPerDayPerProjectPerModel")
    cfg = SimpleNamespace(api_key=KEY, config_json={"selected_model": "gemini-3.8-flash", "model_selected_by_user": True,
                                                    "tier": "paid"})

    async def go():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as c:
            return await kt.gemini_check(c, cfg, "q?", "acme.com", runs=1)
    with pytest.raises(kt.AiLimitError) as e:
        asyncio.run(go())
    assert calls == ["gemini-3.8-flash"] and "choose another model in Integrations" in str(e.value)


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
    assert "today's free limit" in str(e.value) and "midnight Pacific" in str(e.value)
