"""
robots.txt handling per RFC 9309, using Protego (Google-compatible wildcards and longest-match rules).

* Fetched with the honest crawler user-agent through the SSRF-guarded client.
* Redirects are followed (up to 5 hops, each re-validated).
* 4xx  -> no restrictions (RFC 9309 §2.3.1.3).
* 5xx / network failure -> treat as complete disallow (RFC 9309 §2.3.1.4).
* Cached per crawl with a TTL and a bounded size; bodies are capped at 500 KiB (§2.5).
"""
import time
from collections import OrderedDict
from typing import Optional, Tuple
from urllib.parse import urlparse

import httpx
from protego import Protego

from app.core.url_safety import safe_async_client, get_limited, UnsafeURLError, clamp_delay

ROBOTS_MAX_BYTES = 500 * 1024
CACHE_TTL_SECONDS = 3600
CACHE_MAX_ENTRIES = 1000

_ALLOW_ALL = ""
_DISALLOW_ALL = "User-agent: *\nDisallow: /"


class RobotsParserService:
    def __init__(self):
        self._parsers: "OrderedDict[str, Tuple[float, Protego, Optional[str]]]" = OrderedDict()

    @staticmethod
    def _origin(url: str) -> str:
        parsed = urlparse(url)
        return f"{parsed.scheme}://{parsed.netloc}"

    async def _fetch(self, origin: str) -> Tuple[str, Optional[str]]:
        try:
            async with safe_async_client(timeout=10.0) as client:
                resp = await get_limited(client, f"{origin}/robots.txt", max_bytes=ROBOTS_MAX_BYTES)
        except (UnsafeURLError, httpx.HTTPError):
            return _DISALLOW_ALL, "unreachable"
        if 200 <= resp.status_code < 300:
            return resp.text, None
        if 400 <= resp.status_code < 500:
            return _ALLOW_ALL, None
        return _DISALLOW_ALL, f"HTTP {resp.status_code}"

    async def get_parser(self, url: str) -> Protego:
        origin = self._origin(url)
        cached = self._parsers.get(origin)
        if cached and time.monotonic() - cached[0] < CACHE_TTL_SECONDS:
            self._parsers.move_to_end(origin)
            return cached[1]

        body, error = await self._fetch(origin)
        parser = Protego.parse(body)
        self._parsers[origin] = (time.monotonic(), parser, error)
        self._parsers.move_to_end(origin)
        while len(self._parsers) > CACHE_MAX_ENTRIES:
            self._parsers.popitem(last=False)
        return parser

    async def is_allowed(self, url: str, user_agent: str = "*") -> bool:
        parser = await self.get_parser(url)
        return parser.can_fetch(url, user_agent)

    async def get_crawl_delay(self, url: str, user_agent: str = "*") -> float:
        parser = await self.get_parser(url)
        return clamp_delay(parser.crawl_delay(user_agent), default=0.0)

    async def get_sitemaps(self, url: str) -> list:
        parser = await self.get_parser(url)
        return list(parser.sitemaps)


robots_service = RobotsParserService()
