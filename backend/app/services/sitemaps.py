"""XML sitemap discovery and parsing (sitemaps.org protocol), SSRF-guarded and size-bounded."""
import asyncio
import gzip
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from typing import List, Set
from urllib.parse import urlparse

import httpx

from app.core.url_safety import UnsafeURLError, safe_async_client
from app.services.robots import robots_service

_NS = "{http://www.sitemaps.org/schemas/sitemap/0.9}"
MAX_SITEMAP_FILES = 50
MAX_SITEMAP_URLS = 50_000          # protocol limit per file; also our total cap
MAX_SITEMAP_BYTES = 50 * 1024 * 1024  # protocol limit (uncompressed)
FETCH_TIMEOUT = 8.0


@dataclass
class SitemapResult:
    found: bool = False
    sitemap_files: List[str] = field(default_factory=list)
    urls: Set[str] = field(default_factory=set)
    errors: List[str] = field(default_factory=list)


async def _fetch_xml(client: httpx.AsyncClient, url: str) -> bytes:
    async with client.stream("GET", url, follow_redirects=True) as resp:
        if resp.status_code != 200:
            raise ValueError(f"HTTP {resp.status_code}")
        chunks, total = [], 0
        async for chunk in resp.aiter_raw():
            total += len(chunk)
            if total > MAX_SITEMAP_BYTES:
                raise ValueError("sitemap too large")
            chunks.append(chunk)
    body = b"".join(chunks)
    if body[:2] == b"\x1f\x8b":  # gzip magic
        body = gzip.decompress(body)[:MAX_SITEMAP_BYTES]
    elif resp.headers.get("content-encoding", "").lower() == "gzip":
        body = gzip.decompress(body)[:MAX_SITEMAP_BYTES]
    return body


def _locs(root: ET.Element, tag: str) -> List[str]:
    """<loc> values of every <url> (or <sitemap>) entry."""
    out = []
    for entry in root.iter(f"{_NS}{tag}"):
        loc = entry.find(f"{_NS}loc")
        if loc is not None and loc.text and loc.text.strip():
            out.append(loc.text.strip())
    return out


async def discover_sitemap_urls(seed_url: str) -> SitemapResult:
    """Collect page URLs from robots.txt-declared sitemaps, falling back to the conventional paths."""
    parsed = urlparse(seed_url)
    origin = f"{parsed.scheme}://{parsed.netloc}"
    result = SitemapResult()

    declared = []
    try:
        declared = await robots_service.get_sitemaps(seed_url)
    except Exception as e:  # robots problems should not block the crawl report
        result.errors.append(f"robots.txt: {type(e).__name__}")
    queue = list(dict.fromkeys(declared or [f"{origin}/sitemap.xml", f"{origin}/sitemap_index.xml"]))
    seen: Set[str] = set()

    async with safe_async_client(timeout=FETCH_TIMEOUT) as client:
        while queue and len(seen) < MAX_SITEMAP_FILES and len(result.urls) < MAX_SITEMAP_URLS:
            batch = [u for u in queue[:8] if u not in seen]
            queue = queue[8:]
            seen.update(batch)
            bodies = await asyncio.gather(*(_fetch_xml(client, u) for u in batch), return_exceptions=True)
            for url, body in zip(batch, bodies):
                if isinstance(body, (Exception, UnsafeURLError)):
                    result.errors.append(f"{url}: {type(body).__name__}")
                    continue
                try:
                    root = ET.fromstring(body)  # stdlib parser does not resolve external entities
                except ET.ParseError:
                    result.errors.append(f"{url}: invalid XML")
                    continue
                result.found = True
                result.sitemap_files.append(url)
                if root.tag == f"{_NS}sitemapindex":
                    queue.extend(u for u in _locs(root, "sitemap") if u not in seen)
                else:
                    for loc in _locs(root, "url"):
                        if len(result.urls) >= MAX_SITEMAP_URLS:
                            break
                        result.urls.add(loc)
    return result


def sitemap_key(url: str) -> str:
    """Comparison key tolerant of trailing slashes and host case."""
    p = urlparse(url.strip())
    return f"{p.scheme.lower()}://{p.netloc.lower()}{(p.path or '/').rstrip('/') or '/'}{'?' + p.query if p.query else ''}"
