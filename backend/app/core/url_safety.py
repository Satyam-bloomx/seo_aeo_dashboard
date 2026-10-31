"""
Outbound request safety (SSRF protection) for every fetch of a user-supplied or crawled URL.

Rules enforced on every request, including each redirect hop:
  * only http/https schemes,
  * the hostname must resolve, and every resolved address must be publicly routable
    (no loopback, RFC1918, link-local / cloud metadata, CGNAT, multicast, reserved, unique-local),
  * response bodies are read with a cap on *decompressed* bytes (defeats compression bombs).

Note: validation happens at DNS-resolution time. To fully close DNS-rebinding windows,
also run crawlers on a network segment whose egress firewall blocks private ranges.
"""
import asyncio
import ipaddress
import os
import socket
from dataclasses import dataclass, field
from typing import Optional
from urllib.parse import urlsplit

import httpx

ALLOWED_SCHEMES = {"http", "https"}
DEFAULT_MAX_BYTES = 5 * 1024 * 1024  # 5 MB of decoded HTML per page
DEFAULT_MAX_REDIRECTS = 5

# Local development escape hatch for auditing a site on localhost. Never enable in production.
_ALLOW_PRIVATE = os.getenv("ALLOW_PRIVATE_NETWORK_FETCH", "").lower() in ("1", "true", "yes")

CRAWLER_USER_AGENT = os.getenv(
    "CRAWLER_USER_AGENT",
    "AuditProBot/1.0 (+https://auditpro.ai/bot)",
)


class UnsafeURLError(ValueError):
    """Raised when a URL targets a non-public destination or an unsupported scheme."""


def _is_public_ip(ip: ipaddress._BaseAddress) -> bool:
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
        ip = ip.ipv4_mapped
    return bool(ip.is_global) and not ip.is_multicast and not ip.is_reserved


async def assert_public_url(url: str) -> None:
    """Raise UnsafeURLError unless url is http(s) and every address its host resolves to is public."""
    try:
        parts = urlsplit(url)
    except ValueError as e:
        raise UnsafeURLError("Malformed URL") from e
    if parts.scheme.lower() not in ALLOWED_SCHEMES:
        raise UnsafeURLError("Only http and https URLs can be audited")
    host = parts.hostname
    if not host:
        raise UnsafeURLError("URL has no hostname")
    if parts.username or parts.password:
        raise UnsafeURLError("URLs with embedded credentials are not allowed")
    if _ALLOW_PRIVATE:
        return

    port = parts.port or (443 if parts.scheme.lower() == "https" else 80)
    try:
        infos = await asyncio.get_running_loop().getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except (socket.gaierror, UnicodeError) as e:
        raise UnsafeURLError("Hostname could not be resolved") from e
    if not infos:
        raise UnsafeURLError("Hostname could not be resolved")
    for info in infos:
        addr = info[4][0].split("%", 1)[0]  # strip IPv6 zone id
        if not _is_public_ip(ipaddress.ip_address(addr)):
            raise UnsafeURLError("URL resolves to a private or reserved network address")


async def _ssrf_request_hook(request: httpx.Request) -> None:
    await assert_public_url(str(request.url))


def safe_async_client(**kwargs) -> httpx.AsyncClient:
    """httpx.AsyncClient that validates every outgoing request (redirect hops included)."""
    hooks = kwargs.pop("event_hooks", {}) or {}
    hooks.setdefault("request", [])
    hooks["request"] = [_ssrf_request_hook, *hooks["request"]]
    headers = {"User-Agent": CRAWLER_USER_AGENT, **(kwargs.pop("headers", None) or {})}
    kwargs.setdefault("timeout", httpx.Timeout(20.0, connect=10.0))
    kwargs.setdefault("max_redirects", DEFAULT_MAX_REDIRECTS)
    return httpx.AsyncClient(event_hooks=hooks, headers=headers, **kwargs)


@dataclass
class LimitedResponse:
    status_code: int
    url: str
    headers: httpx.Headers
    text: str
    truncated: bool = False
    history: list = field(default_factory=list)


async def get_limited(
    client: httpx.AsyncClient,
    url: str,
    max_bytes: int = DEFAULT_MAX_BYTES,
    follow_redirects: bool = True,
    method: str = "GET",
    read_body: bool = True,
) -> LimitedResponse:
    """Fetch url, reading at most max_bytes of decoded body. Non-text bodies are not read."""
    async with client.stream(method, url, follow_redirects=follow_redirects) as resp:
        content_type = resp.headers.get("content-type", "").lower()
        is_text = any(t in content_type for t in ("text/", "xml", "json", "javascript")) or not content_type
        chunks, total, truncated = [], 0, False
        if read_body and is_text and method != "HEAD":
            async for chunk in resp.aiter_bytes():
                total += len(chunk)
                if total > max_bytes:
                    chunks.append(chunk[: max(0, max_bytes - (total - len(chunk)))])
                    truncated = True
                    break
                chunks.append(chunk)
        raw = b"".join(chunks)
        encoding = resp.charset_encoding or "utf-8"
        try:
            text = raw.decode(encoding, errors="replace")
        except LookupError:
            text = raw.decode("utf-8", errors="replace")
        return LimitedResponse(
            status_code=resp.status_code,
            url=str(resp.url),
            headers=resp.headers,
            text=text,
            truncated=truncated,
            history=list(resp.history),
        )


async def playwright_route_guard(route) -> None:
    """Playwright route handler: block navigations and sub-resources that target non-public hosts."""
    url = route.request.url
    scheme = urlsplit(url).scheme.lower()
    if scheme in ("data", "blob"):
        await route.continue_()
        return
    try:
        await assert_public_url(url)
    except UnsafeURLError:
        await route.abort("blockedbyclient")
        return
    await route.continue_()


def clamp_delay(value: Optional[str], default: float, ceiling: float = 30.0) -> float:
    """Parse a server-provided delay (Retry-After / Crawl-delay) and cap it."""
    try:
        seconds = float(value) if value is not None else default
    except (TypeError, ValueError):
        seconds = default
    return max(0.0, min(seconds, ceiling))
