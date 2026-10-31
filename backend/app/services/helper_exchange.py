"""Hand-off between the crawler and the AuditPro Helper browser extension.

The backend cannot reach the extension; the user's open dashboard can. So the crawler publishes a "helper batch"
here, the dashboard polls it (GET /api/crawls/{id}/helper/batch), relays it to the extension, and posts the results
back (POST /api/crawls/{id}/helper/results). The crawler waits a bounded time for them, then analyses them exactly
like its own fetches.

Backends
- In-memory (default, CRAWL_RUNNER=inline): the API process runs the crawls, so one dict is shared.
- Redis (CRAWL_RUNNER=worker): API and worker are separate processes and share state through Redis keys with a
  TTL. Without a reachable Redis the helper is simply never offered in worker mode (server outcomes are kept).

Nothing here is persisted in the database: a restart loses only helper state, never crawl data.
"""
import asyncio
import base64
import binascii
import json
import logging
import os
import time
import zlib
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import quote, unquote, urlparse

logger = logging.getLogger("crawler")


def _float_env(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, str(default)))
    except ValueError:
        return default


HELPER_PRESENCE_S = _float_env("HELPER_PRESENCE_SECONDS", 20.0)   # a dashboard poll this recent = helper connected
HELPER_IDLE_S = _float_env("HELPER_IDLE_SECONDS", 60.0)           # no result/progress for this long: stop waiting
HELPER_WAIT_USER_S = _float_env("HELPER_WAIT_USER_SECONDS", 180.0)  # idle limit while the user is asked to act
HELPER_ROUND_S = _float_env("HELPER_ROUND_SECONDS", 300.0)        # hard cap for one batch
HELPER_TOTAL_S = _float_env("HELPER_TOTAL_SECONDS", 900.0)        # hard cap for all helper rounds of one crawl
HELPER_MAX_ROUNDS = 5
HELPER_MAX_URLS = 5000                       # protocol limit per batch
MAX_HELPER_PAGE_BYTES = 3 * 1024 * 1024      # decoded HTML per page
MAX_HELPER_GZ_B64 = 4 * 1024 * 1024          # base64 text per page before decoding
MAX_RESULTS_BODY_BYTES = 24 * 1024 * 1024    # one POST
MAX_RESULTS_PER_POST = 20
STATE_TTL_S = 3600

# States the dashboard reports while the user is asked to do something (allow the site, pass a human check).
USER_WAIT_STATES = ("awaiting_permission", "needs_verification")
FINAL_STATES = ("done", "failed", "declined", "stopped")
HELPER_STATES = ("running",) + USER_WAIT_STATES + FINAL_STATES

HELPER_OUTCOMES = ("ok", "site_error", "crawler_error", "blocked", "unverified", "robots_blocked")
HELPER_SIDES = ("site", "ours", "unknown", "blocked")
ALLOWED_HEADERS = ("content-type", "x-robots-tag", "link", "refresh", "content-security-policy",
                   "strict-transport-security", "x-frame-options", "x-content-type-options", "referrer-policy",
                   "retry-after", "cf-mitigated", "server")


class HelperPayloadError(ValueError):
    """A helper result that cannot be accepted (bad encoding, too large)."""


# ------------------------------------------------------------------ URL matching and payload decoding

def url_key(url: str) -> str:
    """One spelling per URL so the helper's `new URL(u).href` matches the URL the server offered."""
    try:
        p = urlparse((url or "").split("#")[0].strip())
        scheme = (p.scheme or "").lower()
        host = (p.hostname or "").lower()
        port = p.port
        if port and not ((scheme == "http" and port == 80) or (scheme == "https" and port == 443)):
            host = f"{host}:{port}"
        path = quote(unquote(p.path or "/"), safe="/:@!$&'()*+,;=-._~")
        return f"{scheme}://{host}{path}" + (f"?{p.query}" if p.query else "")
    except ValueError:
        return url or ""


def site_hosts(seed_url: str) -> Tuple[str, ...]:
    """The crawl's host and its www./apex twin (the same rule the helper uses for a site)."""
    host = (urlparse(seed_url).hostname or "").lower()
    bare = host[4:] if host.startswith("www.") else host
    return (bare, f"www.{bare}")


def url_in_site(url: str, seed_url: str) -> bool:
    try:
        p = urlparse(url)
    except ValueError:
        return False
    return p.scheme in ("http", "https") and (p.hostname or "").lower() in site_hosts(seed_url)


def site_origin(seed_url: str) -> str:
    p = urlparse(seed_url)
    return f"{p.scheme}://{p.netloc}"


def decode_html(b64: Optional[str], cap: int = MAX_HELPER_PAGE_BYTES) -> Optional[str]:
    """gzip+base64 -> text, refusing anything that decodes to more than `cap` bytes (zip bombs included)."""
    if b64 is None:
        return None
    if not isinstance(b64, str) or len(b64) > MAX_HELPER_GZ_B64:
        raise HelperPayloadError("page is too large")
    try:
        raw = base64.b64decode(b64, validate=True)
    except (binascii.Error, ValueError):
        raise HelperPayloadError("html is not valid base64")
    try:
        d = zlib.decompressobj(16 + zlib.MAX_WBITS)
        out = d.decompress(raw, cap + 1)
    except zlib.error:
        raise HelperPayloadError("html is not valid gzip")
    if len(out) > cap or d.unconsumed_tail:
        raise HelperPayloadError(f"page is larger than {cap // (1024 * 1024)} MB")
    return out.decode("utf-8", errors="replace")


def gzip_b64(text: str) -> str:
    """Test/tooling helper: the encoding the extension uses."""
    c = zlib.compressobj(6, zlib.DEFLATED, 16 + zlib.MAX_WBITS)
    return base64.b64encode(c.compress(text.encode("utf-8")) + c.flush()).decode("ascii")


def clean_headers(headers: Any) -> Dict[str, str]:
    if not isinstance(headers, dict):
        return {}
    out = {}
    for k, v in headers.items():
        name = str(k).lower()
        if name in ALLOWED_HEADERS and isinstance(v, (str, int, float)):
            out[name] = str(v)[:2000]
    return out


# ------------------------------------------------------------------ exchange backends

class HelperExchange:
    """State for one crawl: presence (dashboard heartbeat), the open batch, results waiting for the crawler,
    the last activity the dashboard reported and tab captures to add."""

    async def touch_presence(self, crawl_id: int, info: dict) -> None: ...
    async def presence(self, crawl_id: int) -> Optional[dict]: ...
    async def open_batch(self, crawl_id: int, batch: dict) -> None: ...
    async def get_batch(self, crawl_id: int) -> Optional[dict]: ...
    async def close_batch(self, crawl_id: int) -> None: ...
    async def claim(self, crawl_id: int, batch_id: str, key: str) -> Optional[str]:
        """The offered URL for `key` if it is in the open batch `batch_id` and not answered yet (atomic)."""
    async def answered_keys(self, crawl_id: int) -> List[str]: ...
    async def push_results(self, crawl_id: int, results: List[dict]) -> None: ...
    async def drain_results(self, crawl_id: int) -> List[dict]: ...
    async def note_activity(self, crawl_id: int, state: Optional[str], progress: Optional[dict] = None) -> None: ...
    async def activity(self, crawl_id: int) -> Optional[dict]: ...
    async def push_capture(self, crawl_id: int, capture: dict) -> None: ...
    async def drain_captures(self, crawl_id: int) -> List[dict]: ...
    async def clear(self, crawl_id: int) -> None: ...


class InMemoryHelperExchange(HelperExchange):
    def __init__(self):
        self._s: Dict[int, dict] = {}

    def _get(self, crawl_id: int) -> dict:
        s = self._s.get(crawl_id)
        if s is None:
            s = self._s[crawl_id] = {"presence": None, "batch": None, "offered": {}, "answered": set(),
                                     "results": [], "activity": None, "captures": [], "at": time.time()}
        s["at"] = time.time()
        self._expire()
        return s

    def _expire(self):
        cutoff = time.time() - STATE_TTL_S
        for cid in [c for c, s in self._s.items() if s["at"] < cutoff]:
            self._s.pop(cid, None)

    async def touch_presence(self, crawl_id, info):
        self._get(crawl_id)["presence"] = {**info, "at": time.time()}

    async def presence(self, crawl_id):
        s = self._s.get(crawl_id)
        return s and s["presence"]

    async def open_batch(self, crawl_id, batch):
        s = self._get(crawl_id)
        s["batch"] = {k: v for k, v in batch.items() if k != "urls"}
        s["offered"] = {url_key(u): u for u in batch["urls"]}
        s["answered"] = set()
        s["activity"] = None

    async def get_batch(self, crawl_id):
        s = self._s.get(crawl_id)
        if not s or not s["batch"]:
            return None
        return {**s["batch"], "urls": list(s["offered"].values())}

    async def close_batch(self, crawl_id):
        s = self._s.get(crawl_id)
        if s:
            s["batch"], s["offered"], s["answered"] = None, {}, set()

    async def claim(self, crawl_id, batch_id, key):
        s = self._s.get(crawl_id)
        if not s or not s["batch"] or s["batch"].get("batch_id") != batch_id:
            return None
        if key not in s["offered"] or key in s["answered"]:
            return None
        s["answered"].add(key)
        return s["offered"][key]

    async def answered_keys(self, crawl_id):
        s = self._s.get(crawl_id)
        return list(s["answered"]) if s else []

    async def push_results(self, crawl_id, results):
        self._get(crawl_id)["results"].extend(results)

    async def drain_results(self, crawl_id):
        s = self._s.get(crawl_id)
        if not s:
            return []
        out, s["results"] = s["results"], []
        return out

    async def note_activity(self, crawl_id, state, progress=None):
        s = self._get(crawl_id)
        prev = s["activity"] or {}
        s["activity"] = {"state": state or prev.get("state"), "progress": progress or prev.get("progress"), "at": time.time()}

    async def activity(self, crawl_id):
        s = self._s.get(crawl_id)
        return s and s["activity"]

    async def push_capture(self, crawl_id, capture):
        s = self._get(crawl_id)
        s["captures"] = (s["captures"] + [capture])[-5:]

    async def drain_captures(self, crawl_id):
        s = self._s.get(crawl_id)
        if not s:
            return []
        out, s["captures"] = s["captures"], []
        return out

    async def clear(self, crawl_id):
        self._s.pop(crawl_id, None)


class RedisHelperExchange(HelperExchange):
    """Same contract over Redis, for API + worker processes. Every key expires after STATE_TTL_S."""

    def __init__(self, client):
        self.r = client

    @staticmethod
    def _k(crawl_id: int, name: str) -> str:
        return f"auditpro:helper:{crawl_id}:{name}"

    async def _set_json(self, key, value):
        await self.r.set(key, json.dumps(value), ex=STATE_TTL_S)

    async def _get_json(self, key):
        raw = await self.r.get(key)
        return json.loads(raw) if raw else None

    async def touch_presence(self, crawl_id, info):
        await self._set_json(self._k(crawl_id, "presence"), {**info, "at": time.time()})

    async def presence(self, crawl_id):
        return await self._get_json(self._k(crawl_id, "presence"))

    async def open_batch(self, crawl_id, batch):
        offered = {url_key(u): u for u in batch["urls"]}
        for name in ("offered", "answered", "activity"):
            await self.r.delete(self._k(crawl_id, name))
        if offered:
            await self.r.hset(self._k(crawl_id, "offered"), mapping=offered)
            await self.r.expire(self._k(crawl_id, "offered"), STATE_TTL_S)
        await self._set_json(self._k(crawl_id, "batch"), {k: v for k, v in batch.items() if k != "urls"})

    async def get_batch(self, crawl_id):
        batch = await self._get_json(self._k(crawl_id, "batch"))
        if not batch:
            return None
        offered = await self.r.hgetall(self._k(crawl_id, "offered"))
        return {**batch, "urls": list(offered.values())}

    async def close_batch(self, crawl_id):
        for name in ("batch", "offered", "answered"):
            await self.r.delete(self._k(crawl_id, name))

    async def claim(self, crawl_id, batch_id, key):
        batch = await self._get_json(self._k(crawl_id, "batch"))
        if not batch or batch.get("batch_id") != batch_id:
            return None
        offered = await self.r.hget(self._k(crawl_id, "offered"), key)
        if not offered:
            return None
        added = await self.r.sadd(self._k(crawl_id, "answered"), key)  # atomic: only the first answer wins
        await self.r.expire(self._k(crawl_id, "answered"), STATE_TTL_S)
        return offered if added else None

    async def answered_keys(self, crawl_id):
        return list(await self.r.smembers(self._k(crawl_id, "answered")))

    async def push_results(self, crawl_id, results):
        if results:
            await self.r.rpush(self._k(crawl_id, "results"), *[json.dumps(r) for r in results])
            await self.r.expire(self._k(crawl_id, "results"), STATE_TTL_S)

    async def drain_results(self, crawl_id):
        out = []
        while True:
            raw = await self.r.lpop(self._k(crawl_id, "results"))
            if raw is None:
                return out
            out.append(json.loads(raw))

    async def note_activity(self, crawl_id, state, progress=None):
        prev = await self._get_json(self._k(crawl_id, "activity")) or {}
        await self._set_json(self._k(crawl_id, "activity"), {
            "state": state or prev.get("state"), "progress": progress or prev.get("progress"), "at": time.time()})

    async def activity(self, crawl_id):
        return await self._get_json(self._k(crawl_id, "activity"))

    async def push_capture(self, crawl_id, capture):
        key = self._k(crawl_id, "captures")
        await self.r.rpush(key, json.dumps(capture))
        await self.r.ltrim(key, -5, -1)
        await self.r.expire(key, STATE_TTL_S)

    async def drain_captures(self, crawl_id):
        out = []
        while True:
            raw = await self.r.lpop(self._k(crawl_id, "captures"))
            if raw is None:
                return out
            out.append(json.loads(raw))

    async def clear(self, crawl_id):
        for name in ("presence", "batch", "offered", "answered", "results", "activity", "captures"):
            await self.r.delete(self._k(crawl_id, name))


class _SafeExchange(HelperExchange):
    """Never lets a helper-state problem (Redis down, bad data) break a crawl: reads fall back to 'nothing'."""

    def __init__(self, inner: HelperExchange):
        self.inner = inner

    def __getattribute__(self, name):
        if name in ("inner", "__class__", "__dict__"):
            return object.__getattribute__(self, name)
        target = getattr(object.__getattribute__(self, "inner"), name)
        if not asyncio.iscoroutinefunction(target):
            return target

        async def guarded(*args, **kwargs):
            try:
                return await target(*args, **kwargs)
            except Exception as e:
                logger.warning("Helper exchange %s failed: %s", name, type(e).__name__)
                return [] if name in ("drain_results", "drain_captures", "answered_keys") else None
        return guarded


_exchange: Optional[HelperExchange] = None


def get_exchange() -> HelperExchange:
    global _exchange
    if _exchange is None:
        runner = (os.getenv("CRAWL_RUNNER") or "inline").strip().lower()
        inner: HelperExchange = InMemoryHelperExchange()
        if runner == "worker":
            try:
                import redis.asyncio as redis_lib
                from app.core.database import settings
                inner = RedisHelperExchange(redis_lib.from_url(settings.REDIS_URL, decode_responses=True))
            except Exception as e:
                logger.warning("Helper exchange: Redis unavailable (%s); the helper is off in worker mode.", type(e).__name__)
        _exchange = _SafeExchange(inner)
    return _exchange


def set_exchange(exchange: Optional[HelperExchange]) -> None:
    """Tests: install a specific backend (None resets to the default)."""
    global _exchange
    _exchange = _SafeExchange(exchange) if exchange is not None else None


def presence_fresh(presence: Optional[dict], now: Optional[float] = None) -> bool:
    return bool(presence) and ((now or time.time()) - float(presence.get("at") or 0)) <= HELPER_PRESENCE_S
