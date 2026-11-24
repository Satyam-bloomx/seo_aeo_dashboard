"""Gemini model rotation per API key, with a daily primary model.

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

_models: Dict[str, Tuple[float, List[str]]] = {}
_day: Dict[str, Dict[str, Any]] = {}          # key -> {"day", "limited": {model: reason}, "primary"}
_paused: Dict[Tuple[str, str], float] = {}    # (key, model) -> resume time (per-minute limits, overloads)


def _fp(api_key: str) -> str:
    return hashlib.sha256((api_key or "").encode()).hexdigest()[:16]


def quota_day() -> str:
    return datetime.now(PACIFIC).strftime("%Y-%m-%d")


def _today(api_key: str) -> Dict[str, Any]:
    fp, day = _fp(api_key), quota_day()
    state = _day.get(fp)
    if not state or state["day"] != day:  # a new quota day: every model gets its daily allowance back
        state = _day[fp] = {"day": day, "limited": {}, "primary": None}
    return state


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
                fallbacks: Tuple[str, ...] = ()) -> List[str]:
    """Models to try now, best first: today's primary, the selected model, then the rest of the key's models.
    Models limited today or briefly paused are left out."""
    state, now = _today(api_key), time.time()
    live = await available_models(api_key, client)
    pool = list(dict.fromkeys([m for m in (state["primary"], chosen) if m] + live + list(fallbacks)))
    # Gemma can't use Google Search (grounded calls) and doesn't take the JSON response schema (the other calls).
    pool = [m for m in pool if not m.lower().startswith(NO_SEARCH)]
    return [m for m in pool if m not in state["limited"] and _paused.get((_fp(api_key), m), 0) <= now]


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
        if state["primary"] == model:
            state["primary"] = None
    else:
        _paused[(_fp(api_key), model)] = time.time() + max(delay or 0, MINUTE_PAUSE_S)


def mark_success(api_key: str, model: str) -> None:
    """The model that answered becomes the key's primary for the rest of the quota day."""
    _today(api_key)["primary"] = model


def status(api_key: str) -> Dict[str, Any]:
    state = _today(api_key)
    return {"day": state["day"], "primary": state["primary"], "limited_today": dict(state["limited"])}


def exhausted_message(api_key: str) -> str:
    n = len(_today(api_key)["limited"])
    return (f"All {n} Gemini models available to this key have reached today's limit (or have no free allowance). "
            "They reset at midnight Pacific time; add billing to the Gemini key for more.")
