"""SSRF-safe, deduplicated broken image checker.

Checks unique image URLs discovered during a crawl using HEAD (falling back to
GET without reading body on 405/403). Strictly bounded by MAX_UNIQUE_IMAGES and
per-request timeouts so large crawls stay fast and polite.
"""
import asyncio
from typing import Dict, Iterable, Optional
from urllib.parse import urlparse

import httpx

from app.core.url_safety import UnsafeURLError, get_limited, safe_async_client

MAX_UNIQUE_IMAGES = 60
IMAGE_CONCURRENCY = 8
IMAGE_TIMEOUT_S = 5.0


def _is_checkable_http_url(url: str) -> bool:
    if not url or not isinstance(url, str):
        return False
    u = url.strip()
    if u.startswith("data:") or u.startswith("blob:") or u.startswith("javascript:"):
        return False
    parsed = urlparse(u)
    return parsed.scheme in ("http", "https") and bool(parsed.netloc)


async def check_image_urls(
    urls: Iterable[str],
    *,
    max_unique: int = MAX_UNIQUE_IMAGES,
    client: Optional[httpx.AsyncClient] = None,
) -> Dict[str, int]:
    """Return {url: status_code} for up to max_unique deduplicated HTTP(S) image URLs.
    status_code == 0 indicates connection/timeout failure; unsafe/SSRF URLs are omitted."""
    unique = []
    seen = set()
    for u in urls:
        if not _is_checkable_http_url(u):
            continue
        clean = u.strip()
        if clean not in seen:
            seen.add(clean)
            unique.append(clean)
            if len(unique) >= max_unique:
                break
    if not unique:
        return {}

    sem = asyncio.Semaphore(IMAGE_CONCURRENCY)

    async def _probe(c: httpx.AsyncClient, url: str) -> Optional[tuple[str, int]]:
        async with sem:
            try:
                r = await get_limited(c, url, max_bytes=1024, method="HEAD", read_body=False)
                if r.status_code in (403, 405, 501):
                    r = await get_limited(c, url, max_bytes=1024, method="GET", read_body=False)
                return (url, int(r.status_code))
            except UnsafeURLError:
                return None  # SSRF blocked: never probe private/metadata hosts
            except httpx.HTTPError:
                return (url, 0)

    if client is None:
        async with safe_async_client(timeout=IMAGE_TIMEOUT_S) as c:
            results = await asyncio.gather(*(_probe(c, u) for u in unique))
    else:
        results = await asyncio.gather(*(_probe(client, u) for u in unique))

    return {u: code for item in results if item is not None for u, code in (item,)}


def is_broken_image_status(status_code: Optional[int]) -> bool:
    if status_code is None:
        return False
    return status_code == 0 or status_code >= 400
