"""Classify fetch results: temporary or permanent, whose fault it is, and bot-protection detection.

Every fetched URL ends with an "outcome" stored in audit_data["Fetch"]:
  ok             the page was fetched and analysed
  site_error     the site itself answered with an error (HTTP 4xx/5xx, NXDOMAIN, bad TLS, redirect loop, robots.txt)
  crawler_error  our side failed (JS rendering, browser crash, our network/resource limits)
  blocked        bot protection or rate limiting stopped the crawler
  unverified     the URL could not be reached on any attempt, so nothing can be said about it
`side` says who is accountable: "site" counts in the score; "ours" and "unknown" never do.
"""
import errno
import socket
import ssl
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

import httpx

# Attempt 1 happens in the normal crawl; a temporary failure is parked and retried after the queue drains.
MAX_ATTEMPTS = 3                 # 1 + at most 2 retries
RETRY_GAPS = (10.0, 30.0)        # minimum seconds since the URL last failed, for retry pass 1 and pass 2
FAILED_URL_CAP = 200             # dead-letter entries stored on Crawl.summary["failed_urls"]
TEMPORARY_STATUSES = (429, 502, 503, 504)

OUTCOME_OK, OUTCOME_SITE, OUTCOME_OURS = "ok", "site_error", "crawler_error"
OUTCOME_BLOCKED, OUTCOME_UNVERIFIED = "blocked", "unverified"
SIDE_SITE, SIDE_OURS, SIDE_UNKNOWN = "site", "ours", "unknown"
UNCOUNTED_SIDES = (SIDE_OURS, SIDE_UNKNOWN)


@dataclass
class Failure:
    """Why one attempt to fetch a URL did not produce a usable page."""
    reason: str
    temporary: bool
    outcome: str = OUTCOME_UNVERIFIED      # outcome if no further attempt is made
    side: str = SIDE_UNKNOWN
    status_code: int = 0
    retry_after: Optional[float] = None
    provider: Optional[str] = None         # bot-protection vendor, when a challenge page was recognised
    kind: str = "network"                  # network | status | challenge | render | crash


def fetch_block(outcome: str, side: str, attempts: int, reason: str = "", rendered: bool = False) -> Dict[str, Any]:
    return {"outcome": outcome, "side": side, "attempts": attempts, "reason": reason, "rendered": rendered}


def ok_block(attempts: int = 1, rendered: bool = False) -> Dict[str, Any]:
    return fetch_block(OUTCOME_OK, SIDE_SITE, attempts, "", rendered)


def is_uncounted(audit_data: Optional[dict]) -> bool:
    """True for pages whose fetch problem is not the site's fault: they stay out of rules, denominators and link checks."""
    fetch = (audit_data or {}).get("Fetch")
    return isinstance(fetch, dict) and (fetch.get("side") in UNCOUNTED_SIDES
                                        or fetch.get("outcome") in (OUTCOME_OURS, OUTCOME_BLOCKED, OUTCOME_UNVERIFIED))


# ------------------------------------------------------------------ bot protection

_STRONG_MARKERS = (  # recognised on 403/429/503, or on a short page of any status
    ("Cloudflare", ("<title>just a moment...", "attention required! | cloudflare", "cf-browser-verification",
                    "/cdn-cgi/challenge-platform/h/b/orchestrate", "checking your browser before accessing")),
    ("PerimeterX", ("px-captcha", "press & hold to confirm", "_pxhd", "perimeterx")),
    ("DataDome", ("captcha-delivery.com", "geo.captcha-delivery.com", "datadome")),
    ("Imperva", ("_incapsula_resource", "incapsula incident id", "request unsuccessful. incapsula")),
    ("Akamai", ("errors.edgesuite.net", "akamai reference", "you don't have permission to access")),
    ("Sucuri", ("sucuri website firewall",)),
)
# On a normal (200) answer only the challenge page's own structure counts, never a vendor name in the text:
# an ordinary short article that mentions "DataDome" or "access denied" must still be audited.
_STRUCTURAL_MARKERS = (
    ("Cloudflare", ("<title>just a moment...", "cf-browser-verification", "/cdn-cgi/challenge-platform/h/b/orchestrate",
                    "window._cf_chl_opt")),
    ("PerimeterX", ('id="px-captcha"', "/captcha/captcha.js?a=c&m=0")),
    ("DataDome", ("geo.captcha-delivery.com/captcha", "ct.captcha-delivery.com/c.js")),
    ("Imperva", ("/_incapsula_resource?",)),
)
_WEAK_MARKERS = (  # only meaningful on 403/429/503 responses
    ("Cloudflare", ("cf-chl", "cf_chl_opt", "challenge-platform")),
    ("Bot protection", ("captcha", "are you a robot", "unusual traffic", "access denied", "verify you are human")),
)
_CHALLENGE_STATUSES = (403, 429, 503)


def detect_bot_challenge(status_code: int, headers: Any, body: str = "") -> Optional[str]:
    """Vendor name when the response is a bot-protection challenge/block page, else None."""
    h = {str(k).lower(): str(v) for k, v in dict(headers or {}).items()}
    if "challenge" in h.get("cf-mitigated", "").lower():
        return "Cloudflare"
    if "datadome" in h.get("server", "").lower() or "x-datadome" in h or "x-dd-b" in h:
        if status_code in _CHALLENGE_STATUSES:
            return "DataDome"
    if "x-iinfo" in h and status_code in _CHALLENGE_STATUSES and len(body) < 4000:
        return "Imperva"
    text = (body or "")[:30000].lower()
    if not text:
        return None
    short = len(text) < 15000
    if status_code in _CHALLENGE_STATUSES:
        for vendor, needles in _STRONG_MARKERS:
            if any(n in text for n in needles):
                return vendor
    elif short:
        for vendor, needles in _STRUCTURAL_MARKERS:
            if any(n in text for n in needles):
                return vendor
    if status_code in _CHALLENGE_STATUSES and short:
        for vendor, needles in _WEAK_MARKERS:
            if any(n in text for n in needles):
                return vendor
    return None


# ------------------------------------------------------------------ classification

def _root_causes(exc: BaseException):
    seen, cur = set(), exc
    while cur is not None and id(cur) not in seen:
        seen.add(id(cur))
        yield cur
        cur = cur.__cause__ or cur.__context__


def _dns_errno(exc: BaseException) -> Optional[int]:
    for e in _root_causes(exc):
        if isinstance(e, socket.gaierror):
            return e.errno if e.errno is not None else (e.args[0] if e.args else None)
    return None


# EAI_AGAIN (temporary DNS failure) is -3 on Linux/macOS and 11002 (WSATRY_AGAIN) on Windows.
_DNS_TEMPORARY = {-3, 11002, getattr(socket, "EAI_AGAIN", -3)}


def classify_exception(exc: BaseException) -> Failure:
    """Map an exception raised while fetching to a Failure (temporary ones are retried, permanent ones are final)."""
    from app.core.url_safety import UnsafeURLError

    if isinstance(exc, httpx.TooManyRedirects):
        return Failure("Redirect loop or too many redirects", False, OUTCOME_SITE, SIDE_SITE, kind="network")

    dns = _dns_errno(exc)
    if isinstance(exc, UnsafeURLError):
        if dns is not None and dns in _DNS_TEMPORARY:
            return Failure("DNS lookup timed out", True, OUTCOME_UNVERIFIED, SIDE_UNKNOWN)
        if "could not be resolved" in str(exc):
            return Failure("Domain does not exist (DNS lookup failed)", False, OUTCOME_SITE, SIDE_SITE)
        return Failure(f"Blocked: {exc}", False, OUTCOME_SITE, SIDE_SITE)

    for e in _root_causes(exc):
        if isinstance(e, ssl.SSLCertVerificationError) or "CERTIFICATE_VERIFY_FAILED" in str(e):
            return Failure("Invalid TLS certificate", False, OUTCOME_SITE, SIDE_SITE)
    if dns is not None:
        if dns in _DNS_TEMPORARY:
            return Failure("DNS lookup timed out", True, OUTCOME_UNVERIFIED, SIDE_UNKNOWN)
        return Failure("Domain does not exist (DNS lookup failed)", False, OUTCOME_SITE, SIDE_SITE)

    if isinstance(exc, httpx.PoolTimeout):
        return Failure("Crawler connection pool exhausted", True, OUTCOME_OURS, SIDE_OURS, kind="crash")
    if isinstance(exc, httpx.TimeoutException):
        return Failure("Request timed out", True)
    for e in _root_causes(exc):
        if isinstance(e, ConnectionRefusedError) or getattr(e, "errno", None) == errno.ECONNREFUSED:
            return Failure("Connection refused", True)
        if isinstance(e, ConnectionResetError):
            return Failure("Connection reset by the server", True)
    if isinstance(exc, (MemoryError, OSError)) and getattr(exc, "errno", None) in (errno.EMFILE, errno.ENOMEM, errno.ENOBUFS):
        return Failure("Crawler ran out of resources", True, OUTCOME_OURS, SIDE_OURS, kind="crash")
    if isinstance(exc, httpx.ConnectError):
        return Failure("Could not connect to the server", True)
    if isinstance(exc, httpx.RemoteProtocolError):
        return Failure("Server closed the connection unexpectedly", True)
    if isinstance(exc, httpx.HTTPError):
        return Failure(f"Network error ({type(exc).__name__})", True)
    return Failure(f"Unexpected fetch error ({type(exc).__name__})", True, OUTCOME_OURS, SIDE_OURS, kind="crash")


def classify_response(status_code: int, headers: Any, body: str = "", is_html: bool = True) -> Optional[Failure]:
    """Failure for a response that must not be analysed as content (challenge page, 429, temporary 5xx).
    None means the response is a normal answer; permanent 4xx/5xx are handled as ordinary error pages."""
    retry_after = None
    try:
        ra = dict(headers or {}).get("retry-after") or dict(headers or {}).get("Retry-After")
        retry_after = float(ra) if ra is not None else None
    except (TypeError, ValueError):
        retry_after = None
    provider = detect_bot_challenge(status_code, headers, body) if (is_html or status_code in _CHALLENGE_STATUSES) else None
    if provider:
        return Failure(f"Blocked by bot protection ({provider})", True, OUTCOME_BLOCKED, SIDE_UNKNOWN,
                       status_code=status_code, retry_after=retry_after, provider=provider, kind="challenge")
    if status_code == 429:
        return Failure("Rate limited by the server (HTTP 429)", True, OUTCOME_BLOCKED, SIDE_UNKNOWN,
                       status_code=429, retry_after=retry_after, kind="status")
    if status_code in TEMPORARY_STATUSES:
        return Failure(f"Server error (HTTP {status_code})", True, OUTCOME_SITE, SIDE_SITE,
                       status_code=status_code, retry_after=retry_after, kind="status")
    return None


# ------------------------------------------------------------------ circuit breaker

class CircuitBreaker:
    """Trips when the site is unreachable or blocking: more than `max_rate` of attempts (at least `min_attempts`)
    failed temporarily, or `max_consecutive` requests in a row did."""

    def __init__(self, min_attempts: int = 10, max_rate: float = 0.20, max_consecutive: int = 10):
        self.min_attempts, self.max_rate, self.max_consecutive = min_attempts, max_rate, max_consecutive
        self.attempts = self.failures = self.consecutive = 0
        self.tripped_reason: Optional[str] = None

    @property
    def tripped(self) -> bool:
        return self.tripped_reason is not None

    def record(self, failed: bool) -> bool:
        """Record one request; True when the breaker is (now) open."""
        self.attempts += 1
        if failed:
            self.failures += 1
            self.consecutive += 1
        else:
            self.consecutive = 0
        if not self.tripped:
            if self.consecutive >= self.max_consecutive:
                self.tripped_reason = f"{self.consecutive} requests in a row failed"
            elif self.attempts >= self.min_attempts and self.failures / self.attempts > self.max_rate:
                self.tripped_reason = f"{self.failures} of {self.attempts} requests failed ({100 * self.failures // self.attempts}%)"
        return self.tripped


def dead_letter_entry(url: str, attempts: int, reason: str, side: str) -> Dict[str, Any]:
    return {"url": url[:300], "attempts": attempts, "reason": reason, "side": side}


def cap_failed(entries: List[dict]) -> List[dict]:
    return entries[:FAILED_URL_CAP]


def classify_js_exception(exc: BaseException) -> Failure:
    """Map a Playwright navigation error. Rendering problems are ours (retried, and the last attempt falls back to a
    plain HTTP fetch); network errors seen by the browser are classified like their HTTP equivalents."""
    name = type(exc).__name__
    text = str(exc)
    low = text.lower()
    if "net::err_name_not_resolved" in low:
        return Failure("Domain does not exist (DNS lookup failed)", False, OUTCOME_SITE, SIDE_SITE)
    if "net::err_cert" in low or "ssl_error" in low:
        return Failure("Invalid TLS certificate", False, OUTCOME_SITE, SIDE_SITE)
    if "err_too_many_redirects" in low:
        return Failure("Redirect loop or too many redirects", False, OUTCOME_SITE, SIDE_SITE)
    if "err_connection_refused" in low:
        return Failure("Connection refused", True)
    if "err_connection_reset" in low or "err_connection_closed" in low or "err_empty_response" in low:
        return Failure("Connection reset by the server", True)
    if "err_connection_timed_out" in low or "err_timed_out" in low:
        return Failure("Request timed out", True)
    if any(k in low for k in ("target closed", "browser has been closed", "crashed", "target page, context or browser")):
        return Failure("The crawler's browser crashed", True, OUTCOME_OURS, SIDE_OURS, kind="crash")
    if name == "TimeoutError" or "timeout" in low:
        return Failure("The page did not finish loading in the browser (timeout)", True, OUTCOME_OURS, SIDE_OURS, kind="render")
    return Failure(f"JavaScript rendering failed ({name})", True, OUTCOME_OURS, SIDE_OURS, kind="render")
