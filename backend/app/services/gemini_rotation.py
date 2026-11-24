"""Gemini model rotation per API key, with a daily primary model.

The user says whether a key is FREE or PAID when connecting it:
  * Paid key: the model the user selected is the only model used (paid usage is credit-based). When it reaches a
    limit the user changes the model in Integrations; nothing rotates.
  * Free key: Google Search grounding is free only on FREE_GROUNDING_MODELS (Gemini 2.5 Flash and Flash-Lite; Gemini 3
    and newer have no free grounding). Those two models are kept exclusively for grounded work (the GEO score) and
    rotate between themselves. Every other task (generating questions, AI audits, summaries) rotates through the
    key's other models and never touches the two grounding models, so their small free allowance is not spent on
    work any model could do.

Each Gemini model has its own rate limits. For one key:
  * The model the user selected in Integrations is tried first.
  * When a model hits its *daily* limit (or has no free quota on this key), it is skipped for the rest of the quota
    day, and the model that answered next becomes that key's primary for the day. Calls go straight to it, so no
    time is wasted on models already known to be limited. Gemini's daily quotas reset at midnight Pacific time.
  * A *per-minute* limit is not a daily limit: the caller waits the delay Google asks for, and only if it persists is
    the model paused for about a minute.
  * Candidate models come from the key's live model list (GET /v1beta/models, cached for a few hours), ranked:
    selected model, then stable Flash models (newest first), Flash-Lite, Pro, then others. Models that cannot answer
    with Google Search (Gemma) are left out of grounded calls.

Rotating between models of one key is within Google's terms: each model has its own published quota. Rotating
between keys of different accounts to get past limits is not (Google APIs Terms of Service s.2(d)), so this module
works per key only.

State lives in this process (one server for 1-5 audits a day): after a restart a limited model is tried once more,
then marked again.
"""
import hashlib
import re
import time
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple
from zoneinfo import ZoneInfo

import httpx

MODELS_URL = "https://generativelanguage.googleapis.com/v1beta/models"
MODEL_LIST_TTL_S = 6 * 3600
MINUTE_PAUSE_S = 65
PACIFIC = ZoneInfo("America/Los_Angeles")
# Model families that are not general text answerers (speech, images, music, agents, embeddings...).
SKIP = ("tts", "image", "embedding", "aqa", "live", "audio", "robotics", "computer-use", "veo", "imagen", "learnlm",
        "native", "transcribe", "lyria", "nano-banana", "antigravity", "deep-research", "customtools", "omni")
NO_SEARCH = ("gemma",)  # answer, but cannot use the Google Search tool
# The only models with free Google Search grounding (Gemini API pricing: Gemini 3+ grounding is "Not available" on the
# free tier). Google may change this list; update it here.
FREE_GROUNDING_MODELS = ("gemini-2.5-flash", "gemini-2.5-flash-lite")

_models: Dict[str, Tuple[float, List[str]]] = {}
_day: Dict[str, Dict[str, Any]] = {}          # key -> {"day", "limited": {model: reason}, "primary": {purpose: model}}
_paused: Dict[Tuple[str, str], float] = {}    # (key, model) -> resume time (per-minute limits, overloads)


def _fp(api_key: str) -> str:
    return hashlib.sha256((api_key or "").encode()).hexdigest()[:16]


def quota_day() -> str:
    return datetime.now(PACIFIC).strftime("%Y-%m-%d")


def _today(api_key: str) -> Dict[str, Any]:
    fp, day = _fp(api_key), quota_day()
    state = _day.get(fp)
    if not state or state["day"] != day:  # a new quota day: every model gets its daily allowance back
        state = _day[fp] = {"day": day, "limited": {}, "primary": {}}
    return state


def tier_of(config: Any) -> str:
    """"paid" only when the user said so; a key without an answer is treated as free (the cautious choice)."""
    cfg = config if isinstance(config, dict) else {}
    return "paid" if cfg.get("tier") == "paid" else "free"


def _purpose(grounded: bool) -> str:
    return "search" if grounded else "general"


def rank(name: str) -> tuple:
    """Lower sorts first: stable before preview, Flash before Flash-Lite before Pro, newest version first."""
    n = name.lower()
    m = re.search(r"gemini-(\d+(?:\.\d+)?)", n)
    version = float(m.group(1)) if m else 0.0
    family = 0 if "flash" in n and "lite" not in n else 1 if "lite" in n else 2 if "pro" in n else 3
    alias = "latest" in n  # gemini-flash-latest etc. point at a model already in the list
    return ("preview" in n or "exp" in n, alias, family, -version, n)


async def available_models(api_key: str, client: Optional[httpx.AsyncClient] = None) -> List[str]:
    """Text models this key can call, from Google's live list (cached). Empty if the list can't be fetched."""
    fp = _fp(api_key)
    cached = _models.get(fp)
    if cached and time.time() - cached[0] < MODEL_LIST_TTL_S:
        return cached[1]
    own = client is None
    c = client or httpx.AsyncClient(timeout=20.0)
    try:
        res = await c.get(MODELS_URL, params={"pageSize": 200}, headers={"x-goog-api-key": api_key})
        data = res.json() if res.status_code == 200 else {}
    except Exception:  # noqa: BLE001 - no model list means: use the selected model and the known fallbacks
        data = {}
    finally:
        if own:
            await c.aclose()
    names = [m["name"].split("/")[-1] for m in data.get("models") or []
             if "generateContent" in (m.get("supportedGenerationMethods") or [])
             and not any(s in m["name"].lower() for s in SKIP)]
    if names:
        _models[fp] = (time.time(), sorted(names, key=rank))
    return _models.get(fp, (0, []))[1]


async def order(api_key: str, chosen: str, grounded: bool, client: Optional[httpx.AsyncClient] = None,
                fallbacks: Tuple[str, ...] = (), tier: str = "free") -> List[str]:
    """Models to try now, best first. Models limited today or briefly paused are left out.
    Paid: the selected model only. Free + grounded: the two free-grounding models, today's primary first.
    Free + anything else: today's primary, the selected model, then the key's other models, never the
    free-grounding models (kept for the GEO score)."""
    state, now, fp = _today(api_key), time.time(), _fp(api_key)
    if tier == "paid":
        pool = [chosen] if chosen else []
    elif grounded:
        primary = state["primary"].get("search")
        pool = list(dict.fromkeys([m for m in (primary, chosen, *FREE_GROUNDING_MODELS) if m in FREE_GROUNDING_MODELS]))
    else:
        live = await available_models(api_key, client)
        primary = state["primary"].get("general")
        pool = list(dict.fromkeys([m for m in (primary, chosen) if m] + live + list(fallbacks)))
        # Gemma takes no JSON response schema; the free-grounding models are reserved for grounded work.
        pool = [m for m in pool if m not in FREE_GROUNDING_MODELS and not m.lower().startswith(NO_SEARCH)]
    return [m for m in pool if m not in state["limited"] and _paused.get((fp, m), 0) <= now]


def classify(res: httpx.Response) -> Tuple[str, Optional[float]]:
    """Why a model refused: ("day", None), ("minute", seconds), ("unavailable", None) or ("other", None)."""
    if res.status_code in (400, 404) and "model" in res.text.lower():
        return "unavailable", None  # not offered to this key (e.g. "no longer available to new users")
    if res.status_code == 503:
        return "minute", 30.0  # overloaded right now: try another model, come back shortly
    if res.status_code != 429:
        return "other", None
    try:
        details = (res.json().get("error") or {}).get("details") or []
    except ValueError:
        return "day", None
    quota_ids = " ".join(str(v.get("quotaId", "")) for d in details for v in (d.get("violations") or []))
    if "PerDay" in quota_ids or not quota_ids:
        # Per-day limits, and refusals with no quota detail ("check your plan and billing"), which on a free key
        # means the model has no free allowance: neither clears before tomorrow.
        return "day", None
    delay = next((d.get("retryDelay") for d in details if d.get("retryDelay")), "20s")
    try:
        return "minute", min(60.0, max(1.0, float(str(delay).rstrip("s"))))
    except ValueError:
        return "minute", 20.0


def mark_limited(api_key: str, model: str, kind: str, delay: Optional[float] = None) -> None:
    state = _today(api_key)
    if kind in ("day", "unavailable"):
        state["limited"][model] = kind
        state["primary"] = {p: m for p, m in state["primary"].items() if m != model}
    else:
        _paused[(_fp(api_key), model)] = time.time() + max(delay or 0, MINUTE_PAUSE_S)


def mark_success(api_key: str, model: str, grounded: bool = False) -> None:
    """The model that answered becomes the key's primary for that kind of work for the rest of the quota day."""
    _today(api_key)["primary"][_purpose(grounded)] = model


def status(api_key: str) -> Dict[str, Any]:
    state = _today(api_key)
    return {"day": state["day"], "primary": dict(state["primary"]), "limited_today": dict(state["limited"])}


def exhausted_message(api_key: str, tier: str = "free", grounded: bool = False, chosen: str = "") -> str:
    if tier == "paid":
        return (f"Your selected Gemini model ({chosen or 'the selected model'}) has reached its limit. Paid keys use "
                "only the model you select: choose another model in Integrations.")
    if grounded:
        return ("Both free Google Search models (" + ", ".join(FREE_GROUNDING_MODELS) + ") have reached today's free "
                "limit. They reset at midnight Pacific time (1:30 pm India); a paid key removes this limit.")
    n = len([m for m in _today(api_key)["limited"] if m not in FREE_GROUNDING_MODELS])
    return (f"All {n} free Gemini models used for this kind of work have reached today's limit. They reset at "
            "midnight Pacific time (1:30 pm India); a paid key removes this limit.")
