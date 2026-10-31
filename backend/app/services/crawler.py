import sys
import os
import asyncio
import re
from collections import Counter, deque
from dataclasses import dataclass, field
from typing import Any, Deque, Dict, Optional, Set, List
from urllib.parse import urlparse, quote
import httpx
import time
import json
from datetime import datetime

import logging
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.domain import Page, Image, Crawl, IndexabilityStatus
from app.services.link_store import compact_outlink
from app.services.extractor import MAX_LINKS_PER_PAGE
from app.services.parse_pool import parse_page
from app.services.browser_pool import browser_pool
from app.services.politeness import AdaptiveLimiter
from app.services.alerts import send_crawl_alert
from app.services.fetch_outcome import (
    Failure, CircuitBreaker, MAX_ATTEMPTS, RETRY_GAPS, FAILED_URL_CAP, OUTCOME_SITE, OUTCOME_OURS, OUTCOME_BLOCKED,
    SIDE_SITE, SIDE_OURS, SIDE_UNKNOWN, fetch_block, ok_block, classify_exception, classify_response,
    classify_js_exception, dead_letter_entry,
)

MAX_URL_LENGTH = 2048  # size of the url / destination_url columns
MAX_CONCURRENCY = 15          # adaptive ceiling for healthy sites
JS_NAV_TIMEOUT_MS = 30000     # a page must reach "load" within this
PAGINATION_PARAMS = {"page", "p", "pg", "paged", "pagenum", "pageno", "page_no", "page_number", "pagenumber"}
HELPER_POLL_S = 1.0           # how often the crawler looks for helper results while it waits
REQUEST_TIMEOUT_S = 20.0      # a page that has not answered in 20 s counts as timed out (Screaming Frog uses 20 s too)
JS_IDLE_GRACE_MS = 3000       # then up to this long for the network to go quiet; not an error if it never does
logger = logging.getLogger("crawler")
DB_RETRY_PAUSE_SECONDS = 1.5
STATUS_RETRY_DELAYS = (1.0, 2.0, 4.0)  # pauses between attempts to record a crawl's final status


def is_connection_error(exc: BaseException) -> bool:
    """True for dropped connections, DNS failures and timeouts (worth one retry), not for data errors."""
    from sqlalchemy.exc import DBAPIError, InterfaceError, OperationalError
    if isinstance(exc, (OSError, asyncio.TimeoutError, InterfaceError, OperationalError)):
        return True
    if isinstance(exc, DBAPIError) and exc.connection_invalidated:
        return True
    text = f"{type(exc).__name__} {exc}".lower()
    return any(k in text for k in ("getaddrinfo", "connection was closed", "connection refused", "connection reset",
                                   "name or service not known", "temporary failure in name resolution", "timeout"))


async def mark_crawl_status(db: AsyncSession, crawl_id: int, status: str, attempts: int = 4) -> bool:
    """Record a crawl's final status, retrying with backoff: a crawl must never stay 'running' because one
    UPDATE hit a network blip. The last attempt uses a fresh session in case the original connection is dead."""
    from app.core.database import AsyncSessionLocal
    for attempt in range(attempts):
        try:
            if attempt == attempts - 1 and attempts > 1:
                async with AsyncSessionLocal() as fresh:
                    crawl = await fresh.get(Crawl, crawl_id)
                    if crawl:
                        crawl.status = status
                        crawl.completed_at = datetime.utcnow()
                        await fresh.commit()
                return True
            crawl = await db.get(Crawl, crawl_id)
            if crawl:
                crawl.status = status
                crawl.completed_at = datetime.utcnow()
                await db.commit()
            return True
        except Exception as e:
            try:
                await db.rollback()
            except Exception:
                pass
            logger.warning("Could not record status '%s' for crawl %s (attempt %s/%s): %s",
                           status, crawl_id, attempt + 1, attempts, type(e).__name__)
            if attempt < attempts - 1:
                await asyncio.sleep(STATUS_RETRY_DELAYS[min(attempt, len(STATUS_RETRY_DELAYS) - 1)])
    logger.error("Crawl %s status '%s' was never recorded; the stale-crawl sweep will close it.", crawl_id, status)
    return False
from app.services.robots import robots_service
from sqlalchemy.future import select
from app.models.domain import Integration

try:
    import playwright.async_api  # noqa: F401
    HAS_PLAYWRIGHT = True
except ImportError:
    HAS_PLAYWRIGHT = False

try:
    from axe_playwright_python.async_playwright import Axe
    HAS_AXE = True
except ImportError:
    HAS_AXE = False

from app.core.url_safety import (
    UnsafeURLError, assert_public_url, safe_async_client, get_limited,
    playwright_route_guard, clamp_delay, CRAWLER_USER_AGENT,
)


NON_PAGE_EXTENSIONS = (
    '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.bmp', '.tiff', '.avif',
    '.pdf', '.zip', '.rar', '.tar', '.gz', '.7z', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.mp4', '.mp3', '.avi', '.mov', '.wmv', '.wav', '.ogg', '.webm',
    '.css', '.js', '.woff', '.woff2', '.ttf', '.eot', '.map',
    '.xml', '.rss', '.atom', '.json', '.txt'
)

@dataclass
class QueueItem:
    """A URL waiting to be fetched. `attempts` counts failed attempts so far (max MAX_ATTEMPTS in total)."""
    url: str
    depth: int
    attempts: int = 0
    last_failure: Optional[Failure] = None
    last_failure_at: float = 0.0


@dataclass
class Fetched:
    """A response ready to be stored, from either fetcher (plain HTTP or the JS-rendering browser)."""
    status_code: int
    headers: Dict[str, str]
    content_type: str
    final_url: str
    html: str = ""
    history: List[dict] = field(default_factory=list)   # [{"url", "status"}] redirect hops
    first_hop_status: Optional[int] = None
    response_time_ms: int = 0
    rendered: bool = False
    js_errors: List[str] = field(default_factory=list)
    violations: List[dict] = field(default_factory=list)
    fallback_reason: Optional[str] = None               # set when a plain fetch replaced a failed render
    via: Optional[str] = None                           # "helper" / "tab_capture": fetched by the user's browser
    attempts: Optional[int] = None                      # attempts made by whoever fetched it (helper results)
    note: Optional[str] = None                          # shown with the fetch details (e.g. what a capture is)


class CrawlerService:
    def __init__(self, crawl_id: int, seed_url: str, db_session: AsyncSession, max_depth: int = 100, max_concurrent: int = 5, js_rendering: bool = False, max_pages: int = 500, stealth_delay: float = 0.0, ignore_url_params: bool = False, check_external_links: bool = False, exclude_paths: str = "", ignore_robots: bool = False, user_agent: str = "SEO-Spider-Bot", crawl_author_archives: bool = False, mode: str = "site",
                 stay_in_folder: bool = True):
        self.crawl_id = crawl_id
        self.mode = mode
        self.ignore_url_params = ignore_url_params
        # Canonicalize and normalize seed URL immediately (RFC 3986)
        self.seed_url = self._clean_crawl_url(seed_url)
        self.db = db_session
        self.max_depth = max_depth
        self.js_rendering = js_rendering
        self.max_pages = max_pages
        self.stealth_delay = stealth_delay
        self.check_external_links = check_external_links
        self.crawl_author_archives = crawl_author_archives
        self.stay_in_folder = stay_in_folder
        self.skipped_outside_folder: Set[str] = set()
        
        # Parse exclude paths into a list of strings
        if isinstance(exclude_paths, list):
            self.exclude_paths_list = [str(p).strip() for p in exclude_paths if str(p).strip()]
        elif isinstance(exclude_paths, str):
            self.exclude_paths_list = [p.strip() for p in exclude_paths.split('\n') if p.strip()]
        else:
            self.exclude_paths_list = []
        
        self.ignore_robots = ignore_robots
        # Identify honestly. A blank or default value uses the platform crawler user-agent.
        ua = (user_agent or "").strip()
        self.user_agent = CRAWLER_USER_AGENT if ua in ("", "SEO-Spider-Bot") else ua[:256]
        self.http_client = None
        self.external_link_tasks: List[asyncio.Task] = []
        self.external_link_semaphore = asyncio.Semaphore(5)
        # Number of distinct URLs admitted to the crawl (visited_urls also stores slash variants,
        # so its size must not be compared against max_pages).
        self.admitted_count = 0
        # Internal URLs that were found but not crawled, by reason, so results can say what was left out.
        self.skipped_page_limit: Set[str] = set()
        self.skipped_depth: Set[str] = set()
        self.skipped_excluded: Set[str] = set()
        self.link_capped_pages = 0
        
        if self.js_rendering and not HAS_PLAYWRIGHT:
            print("Playwright not installed. Falling back to HTTPX.")
            self.js_rendering = False
            
        self.max_concurrent = min(max(max_concurrent, 1), MAX_CONCURRENCY)
        # Start at the requested concurrency; a healthy site may ramp up to 15 when 10 or more was asked for.
        ceiling = MAX_CONCURRENCY if self.max_concurrent >= 10 else self.max_concurrent
        if self.js_rendering:
            from app.services.browser_pool import js_tab_limit
            ceiling = min(ceiling, js_tab_limit())
            self.max_concurrent = min(self.max_concurrent, ceiling)
        self.stealth_delay = clamp_delay(stealth_delay, default=0.0, ceiling=10.0)
        self.limiter = AdaptiveLimiter(start=self.max_concurrent, ceiling=ceiling, min_delay=self.stealth_delay)
        self.retry_concurrency = max(2, self.max_concurrent // 3)
        self.breaker = CircuitBreaker()
        self._breaker_logged = False
        self.host_reached = False  # the site answered at least once during this crawl
        self.in_retry_pass = False
        self._recent_5xx: Deque[bool] = deque(maxlen=20)  # recent answers: was it a 5xx?
        self.parked: List[QueueItem] = []           # temporary failures waiting for a retry pass
        self.dead_letters: List[dict] = []          # capped at FAILED_URL_CAP entries
        self.dead_letter_total = 0
        self.not_attempted = 0
        self.blocked_count = 0
        self.blocked_providers: Counter = Counter()
        self._psi_task = None
        # AuditPro Helper: URLs the server could not fetch wait here (clean URL -> (item, failure or None when never
        # attempted)) until the helper rescued them or the bounded wait ended; then they get their server outcome.
        self.helper_pending: Dict[str, tuple] = {}
        self.helper_notes: Dict[str, dict] = {}
        self.helper_stats = {"offered": 0, "rescued": 0, "rounds": 0, "captures": 0}
        self.prefetched: Dict[str, "Fetched"] = {}   # captured from the user's tab: used instead of fetching
            
        self.visited_urls: Set[str] = set()
        self.saved_urls: Set[str] = set()
        self.batch_count = 0
        self._uncommitted: list = []  # rows flushed in the open transaction; replayed if the commit fails
        self._track_uncommitted()
        self.last_flush_time = time.time()
        self.BATCH_SIZE = 100   # links live on the pages as JSON, so rows are cheap to batch
        self.FLUSH_INTERVAL = 2.0
        self.queue: asyncio.Queue = asyncio.Queue()
        self.db_lock = asyncio.Lock()
        self.request_lock = asyncio.Lock()
        self.last_request_time = 0.0
        
        parsed_seed = urlparse(self.seed_url)
        self.allowed_domain = parsed_seed.netloc.lower()
        
    def _get_url_variants(self, url: str) -> List[str]:
        """
        Returns equivalent URL variants with and without trailing slash.
        Used for RFC 3986 canonical deduplication so links are NEVER doubled.
        """
        try:
            url_clean = url.split("#")[0].strip()
            parsed = urlparse(url_clean)
            scheme = (parsed.scheme or "https").lower()
            netloc = parsed.netloc.lower()
            if netloc.endswith(":80") and scheme == "http":
                netloc = netloc[:-3]
            elif netloc.endswith(":443") and scheme == "https":
                netloc = netloc[:-4]

            path = parsed.path or "/"
            path = re.sub(r'/{2,}', '/', path)
            query_part = f"?{parsed.query}" if parsed.query else ""
            
            # Root path (e.g. https://example.com/ and https://example.com)
            if not path or path == "/":
                return [
                    f"{scheme}://{netloc}/{query_part}",
                    f"{scheme}://{netloc}{query_part}"
                ]
            
            # Subpaths (e.g. https://example.com/about/ and https://example.com/about)
            if path.endswith("/"):
                alt_path = path.rstrip("/")
                return [
                    f"{scheme}://{netloc}{path}{query_part}",
                    f"{scheme}://{netloc}{alt_path}{query_part}"
                ]
            else:
                alt_path = path + "/"
                return [
                    f"{scheme}://{netloc}{path}{query_part}",
                    f"{scheme}://{netloc}{alt_path}{query_part}"
                ]
        except Exception:
            return [url]

    async def run(self):
        for variant in self._get_url_variants(self.seed_url):
            self.visited_urls.add(variant)
        self.admitted_count = 1
        self.queue.put_nowait(QueueItem(self.seed_url, 0))

        self.active_integrations = []
        async with self.db_lock:
            crawl = await self.db.get(Crawl, self.crawl_id)
            if crawl:
                res = await self.db.execute(select(Integration).where(Integration.project_id == crawl.project_id, Integration.connected == True))
                self.active_integrations = [i.integration_type for i in res.scalars().all()]

        await self._load_prefetched()

        # PageSpeed for the home page runs while the crawl is fetching; enrichment later finds it cached.
        self._psi_task = asyncio.create_task(self._prefetch_pagespeed())

        limits = httpx.Limits(max_keepalive_connections=40, max_connections=60)
        default_headers = {
            'User-Agent': self.user_agent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
        }
        async with safe_async_client(http2=True, timeout=REQUEST_TIMEOUT_S, limits=limits, headers=default_headers) as client:
            self.http_client = client
            context = None
            if self.js_rendering:
                try:
                    context = await browser_pool.new_context(self.user_agent, playwright_route_guard)
                except Exception as e:
                    # No usable browser on this host: fall back to the HTTP fetcher instead of failing the crawl.
                    print(f"[Crawler] JS rendering unavailable ({type(e).__name__}); using the HTTP fetcher.")
                    self.js_rendering = False
                    await self._note_setting("js_rendering", False)
            try:
                if context is not None:
                    axe = Axe() if HAS_AXE else None
                    fetcher = lambda item: self._fetch_js(context, axe, item)
                else:
                    fetcher = lambda item: self._fetch_http(client, item)
                await self._crawl_all(fetcher)
                await self._helper_phase(fetcher)
            finally:
                if context is not None:
                    try:
                        await context.close()
                    except Exception:
                        pass

        # External link checks run in both fetch modes (previously skipped with JS rendering).
        if self.external_link_tasks:
            await asyncio.gather(*self.external_link_tasks, return_exceptions=True)

        # Ensure any buffered pages from the crawl are fully flushed and committed
        async with self.db_lock:
            await self._flush_db_batch(force=True)
        await self._record_coverage()

        await self._set_phase("analysing")
        try:
            from app.services.post_processor import PostProcessor
            processor = PostProcessor(self.crawl_id, self.db, mode=self.mode)
            await processor.run()
        except Exception as e:
            print(f"PostProcessor warning for crawl {self.crawl_id}: {e}")

        await self._set_phase("enriching")
        try:
            await asyncio.wait_for(asyncio.shield(self._psi_task), timeout=90)
        except Exception:
            pass
        try:
            from app.services.enrichment_service import EnrichmentService
            enricher = EnrichmentService(self.crawl_id, self.db)
            await enricher.run()
        except Exception as e:
            print(f"EnrichmentService warning for crawl {self.crawl_id}: {e}")

        # Update crawl status (retried with backoff: a crawl must never stay "running" forever)
        async with self.db_lock:
            await mark_crawl_status(self.db, self.crawl_id, "completed")
        self.send_alert()

    # ------------------------------------------------------------------ crawl loop, retries, circuit breaker

    async def _prefetch_pagespeed(self):
        """Start the home page's PageSpeed measurement now instead of after the crawl (result is cached)."""
        try:
            key = os.getenv("PAGESPEED_API_KEY")
            async with self.db_lock:
                crawl = await self.db.get(Crawl, self.crawl_id)
                if crawl:
                    res = await self.db.execute(select(Integration).where(
                        Integration.project_id == crawl.project_id, Integration.connected == True,
                        Integration.integration_type.in_(("pagespeed", "google_pagespeed"))))
                    row = res.scalars().first()
                    if row is not None and getattr(row, "api_key", None):
                        key = row.api_key
            if not key:
                return
            from app.services.enrichment_service import EnrichmentService
            await EnrichmentService(self.crawl_id, None)._fetch_pagespeed_vitals(self.seed_url, key, 0)
        except Exception as e:
            logger.info("PageSpeed prefetch skipped: %s", type(e).__name__)

    async def _drain(self, fetcher, workers: int):
        tasks = [asyncio.create_task(self._worker(fetcher)) for _ in range(max(1, workers))]
        try:
            await self.queue.join()
        finally:
            for t in tasks:
                t.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)

    async def _crawl_all(self, fetcher):
        """Main pass, then at most two deferred retry passes for URLs parked after a temporary failure.
        Nothing sleeps inside a worker: the wait for the retry gap happens here, between passes."""
        await self._drain(fetcher, self.limiter.ceiling)
        for gap in RETRY_GAPS:
            if not self.parked or self.breaker.tripped:
                break
            batch, self.parked = self.parked, []
            remaining = gap - (time.monotonic() - max(i.last_failure_at for i in batch))
            if remaining > 0:
                await asyncio.sleep(remaining)
            self.limiter.cap(self.retry_concurrency)  # retry passes run with reduced concurrency
            self.limiter.start_retry_pass()
            self.in_retry_pass = True
            for item in batch:
                self.queue.put_nowait(item)
            await self._drain(fetcher, self.limiter.ceiling)
        # Only a tripped circuit breaker leaves URLs parked here: they go to the dead-letter list as they are.
        leftover, self.parked = self.parked, []
        for item in leftover:
            await self._finalize_failure(item, item.last_failure)

    async def _worker(self, fetcher):
        while True:
            item = await self.queue.get()
            try:
                await self._handle_item(item, fetcher)
            except asyncio.CancelledError:
                raise
            except Exception as e:
                logger.exception("Crawler worker error on %s: %s", item.url, type(e).__name__)
            finally:
                self.queue.task_done()

    async def _handle_item(self, item: "QueueItem", fetcher):
        if item.depth > self.max_depth:
            return
        captured = self.prefetched.pop(self._clean_crawl_url(item.url), None) if self.prefetched else None
        if captured is not None:
            # The user opened this page in their own browser and captured it: analyse that, nothing to fetch.
            await self._finish(item, captured)
            return
        if self.breaker.tripped:
            self._note_not_attempted(item)
            return
        ua = getattr(self, 'user_agent', 'SEO-Spider-Bot')
        robots_delay = 0.0
        if not self.ignore_robots:
            if item.attempts == 0 and not await robots_service.is_allowed(item.url, ua):
                await self._save_error_page(item.url, item.depth, status_code=0, error_reason="Blocked by robots.txt",
                                            fetch=fetch_block(OUTCOME_SITE, SIDE_SITE, 1, "Blocked by robots.txt"))
                return
            robots_delay = await robots_service.get_crawl_delay(item.url, ua)
        delay = clamp_delay(max(robots_delay, self.stealth_delay), default=0.0)

        await self.limiter.acquire(delay)
        try:
            result = await fetcher(item)
        finally:
            self.limiter.release()

        if isinstance(result, Failure):
            await self._on_failure(item, result)
        else:
            self._on_attempt_ok()
            await self._finish(item, result)

    def _is_load_signal(self, failure: Failure) -> bool:
        """Should this failure slow the whole crawl down? Rate limits, challenges and timeouts always do.
        A 5xx on one URL is usually that page being broken, so 5xx only throttles when it is frequent
        (4 or more of the last 20 answers); otherwise a few broken pages would cut speed for the whole site."""
        if failure.kind == "challenge" or failure.status_code == 429:
            return True
        if failure.kind == "status":
            self._recent_5xx.append(True)
            return bool(failure.retry_after) or sum(self._recent_5xx) >= 4
        return failure.kind == "network"

    def _on_attempt_ok(self):
        self._recent_5xx.append(False)
        self.host_reached = True
        self.breaker.record(False)
        self.limiter.on_success()

    async def _on_failure(self, item: "QueueItem", failure: Failure):
        """Temporary failures are parked for a deferred retry; permanent ones are final immediately."""
        item.attempts += 1
        if failure.kind == "status":
            self.host_reached = True
        elif (self.host_reached and not failure.temporary and failure.reason.startswith("Domain does not exist")
              and urlparse(item.url).netloc.lower() == self.allowed_domain):
            # The site's domain resolved earlier in this crawl, so "not found" now is our DNS resolver failing,
            # not the site disappearing: retry it, and never count it against the site.
            failure = Failure("DNS lookup failed on our side (the site answered earlier in this crawl)", True,
                              OUTCOME_OURS, SIDE_OURS, kind="network")
        item.last_failure, item.last_failure_at = failure, time.monotonic()
        if failure.kind in ("network", "status", "challenge"):
            if failure.temporary and self._is_load_signal(failure):
                self.limiter.on_throttle(failure.retry_after or 0.0)
            # Retry passes hold only URLs that already failed, so failures in a row there say nothing about
            # the site being down: the breaker judges the main pass only.
            if not self.in_retry_pass:
                if failure.temporary:
                    if self.breaker.record(True) and not self._breaker_logged:
                        self._breaker_logged = True
                        logger.warning("Crawl %s: circuit breaker open (%s); retries stopped.", self.crawl_id, self.breaker.tripped_reason)
                else:
                    self.breaker.record(False)  # the site answered (404, bad certificate...): not an outage
        if failure.temporary and item.attempts < MAX_ATTEMPTS and not self.breaker.tripped:
            self.parked.append(item)
            return
        await self._finalize_failure(item, failure)

    def _note_not_attempted(self, item: "QueueItem"):
        """The circuit breaker is open, so the server does not try this URL. The helper may still fetch it."""
        self._defer_to_helper(item, None)

    def _record_not_attempted(self, item: "QueueItem"):
        self.not_attempted += 1
        self._dead_letter(item.url, item.attempts, "Not crawled: the site is unreachable or blocking the crawler", SIDE_UNKNOWN)

    def _dead_letter(self, url: str, attempts: int, reason: str, side: str):
        self.dead_letter_total += 1
        if len(self.dead_letters) < FAILED_URL_CAP:
            self.dead_letters.append(dead_letter_entry(url, attempts, reason, side))

    async def _finalize_failure(self, item: "QueueItem", failure: Optional[Failure]):
        """The server is done with this URL. Bot protection, rate limits and network failures (not the site's own
        errors) wait for the helper first; everything else is recorded now."""
        failure = failure or Failure("Could not be fetched", True)
        if failure.temporary and failure.outcome != OUTCOME_SITE:
            self._defer_to_helper(item, failure)
            return
        await self._record_failure(item, failure)

    async def _record_failure(self, item: "QueueItem", failure: Failure, via: Optional[str] = None,
                              attempts: Optional[int] = None, helper_note: Optional[dict] = None):
        """The URL's final outcome: stored on the page row; dead-lettered when retries were used up (or stopped)."""
        url = self._clean_crawl_url(item.url)
        attempts = attempts if attempts is not None else max(item.attempts, 1)
        if failure.temporary:
            self._dead_letter(url, attempts, failure.reason, failure.side)
        if failure.outcome == OUTCOME_BLOCKED:
            self.blocked_count += 1
            if failure.provider:
                self.blocked_providers[failure.provider] += 1
        block = fetch_block(failure.outcome, failure.side, attempts, failure.reason, False)
        if failure.provider:
            block["provider"] = failure.provider
        if via:
            block["via"] = via
        if helper_note:
            block["helper"] = helper_note  # the helper tried too and could not get the page either
        await self._save_error_page(url, item.depth, status_code=failure.status_code, error_reason=failure.reason, fetch=block)

    # ------------------------------------------------------------------ fetchers

    async def _fetch_http(self, client: httpx.AsyncClient, item: "QueueItem"):
        """One plain HTTP attempt: a Fetched page or a Failure. Never sleeps or retries."""
        try:
            await assert_public_url(item.url)
            start = time.time()
            resp = await get_limited(client, item.url)
        except Exception as e:
            return classify_exception(e)
        content_type = resp.headers.get("content-type", "")
        is_html = "html" in content_type.lower() or not content_type
        failure = classify_response(resp.status_code, resp.headers, resp.text if is_html else "", is_html)
        if failure:
            return failure
        return Fetched(
            status_code=resp.status_code, headers=dict(resp.headers), content_type=content_type, final_url=str(resp.url),
            html=resp.text if "text/html" in content_type.lower() else "",
            history=[{"url": str(h.url), "status": h.status_code} for h in resp.history],
            response_time_ms=int((time.time() - start) * 1000))

    async def _fetch_js(self, context, axe, item: "QueueItem"):
        """One rendered attempt in a pooled tab. The last attempt falls back to a plain HTTP fetch."""
        if item.attempts >= MAX_ATTEMPTS - 1:
            fetched = await self._fetch_http(self.http_client, item)
            if isinstance(fetched, Fetched):
                fetched.fallback_reason = "JavaScript rendering failed; the page was analysed from its unrendered HTML"
            return fetched
        js_errors: list = []
        try:
            async with browser_pool.tab(context) as page:
                page.on("pageerror", lambda err: js_errors.append(err.message))
                start = time.time()
                # "load" fires on any site; waiting for "networkidle" never ends on pages with analytics/chat widgets.
                response = await page.goto(item.url, wait_until="load", timeout=JS_NAV_TIMEOUT_MS)
                try:
                    await page.wait_for_load_state("networkidle", timeout=JS_IDLE_GRACE_MS)
                except Exception:
                    pass  # still busy after the grace period: render what is there
                response_time_ms = int((time.time() - start) * 1000)
                if not response:
                    return Failure("The browser received no response", True, OUTCOME_OURS, SIDE_OURS, kind="render")
                status_code = response.status
                headers = dict(response.headers)
                content_type = headers.get("content-type", "")
                final_url = page.url
                is_html = "text/html" in content_type.lower()
                html = await page.content() if is_html else ""
                failure = classify_response(status_code, headers, html, is_html)
                if failure:
                    return failure
                first_hop = None
                if self._clean_crawl_url(final_url) != self._clean_crawl_url(item.url):
                    first_hop, prev = 301, response.request.redirected_from
                    if prev:
                        prev_response = await prev.response()
                        if prev_response:
                            first_hop = prev_response.status
                violations = []
                if is_html and status_code < 400 and first_hop is None and axe is not None:
                    try:
                        violations = (await axe.run(page)).get("violations", [])
                    except Exception as e:
                        print(f"Axe error: {e}")
                return Fetched(status_code=status_code, headers=headers, content_type=content_type, final_url=final_url,
                               html=html, first_hop_status=first_hop, response_time_ms=response_time_ms, rendered=True,
                               js_errors=js_errors, violations=violations)
        except Exception as e:
            return classify_js_exception(e)

    # ------------------------------------------------------------------ a fetched page

    async def _finish(self, item: "QueueItem", f: "Fetched"):
        """Store a successfully fetched URL: redirect, error status, non-HTML asset or analysed page.
        Pages fetched by the helper (or captured from a tab) take exactly this path too."""
        attempts = f.attempts if f.attempts is not None else item.attempts + 1
        depth = item.depth
        clean_req = self._clean_crawl_url(item.url)
        clean_final = self._clean_crawl_url(f.final_url)
        if f.fallback_reason:
            page_fetch = fetch_block(OUTCOME_OURS, SIDE_OURS, attempts, f.fallback_reason, False)
        else:
            page_fetch = ok_block(attempts, f.rendered)
        page_fetch = self._tag_fetch(page_fetch, f, item)

        if clean_final != clean_req:
            first_hop = f.first_hop_status or (f.history[0]["status"] if f.history else 301)
            await self._save_redirect_page(clean_req, depth, first_hop, clean_final, chain=f.history or None,
                                           fetch=self._tag_fetch(ok_block(attempts, f.rendered), f, item))
            if urlparse(clean_final).netloc == self.allowed_domain:
                variants = self._get_url_variants(clean_final)
                if not any(v in self.visited_urls for v in variants) and self.admitted_count < self.max_pages:
                    self.admitted_count += 1
                    for v in variants:
                        self.visited_urls.add(v)
                    if f.status_code >= 400:
                        await self._save_error_page(clean_final, depth, status_code=f.status_code, error_reason="Client/Server Error",
                                                    fetch=self._tag_fetch(self._status_fetch(f.status_code, attempts), f, item))
                    elif f.html:
                        await self._process_page_data(clean_final, depth, f.html, f.status_code, f.content_type,
                                                      f.response_time_ms, headers=f.headers, fetch=page_fetch, fetched=f)
            return

        if f.status_code >= 400:
            await self._save_error_page(clean_req, depth, status_code=f.status_code, error_reason="Client/Server Error",
                                        fetch=self._tag_fetch(self._status_fetch(f.status_code, attempts), f, item))
            return
        if "text/html" not in f.content_type.lower():
            await self._save_error_page(clean_req, depth, status_code=f.status_code, error_reason="Non-HTML Asset",
                                        fetch=self._tag_fetch(ok_block(attempts, f.rendered), f, item))
            return
        await self._process_page_data(clean_req, depth, f.html, f.status_code, f.content_type, f.response_time_ms,
                                      headers=f.headers, fetch=page_fetch, fetched=f)

    @staticmethod
    def _status_fetch(status_code: int, attempts: int) -> dict:
        return fetch_block(OUTCOME_SITE, SIDE_SITE, attempts, f"HTTP {status_code}", False)

    @staticmethod
    def _tag_fetch(block: dict, f: "Fetched", item: "QueueItem") -> dict:
        """Record who fetched the page: audit_data["Fetch"]["via"] is "helper" or "tab_capture" for the user's browser."""
        if f.via:
            block["via"] = f.via
            block["server_attempts"] = item.attempts
        if f.note:
            block["note"] = f.note
        return block

    # ------------------------------------------------------------------ AuditPro Helper (the user's browser)

    def _defer_to_helper(self, item: "QueueItem", failure: Optional[Failure]):
        key = self._clean_crawl_url(item.url)
        if key not in self.helper_pending:
            self.helper_pending[key] = (item, failure)

    async def _helper_phase(self, fetcher):
        """Offer what the server could not fetch to the user's helper, in bounded rounds. Pages the helper rescues
        can link to new pages: the server crawls those as usual, and what it cannot fetch goes to the next round.
        No helper connected, a disconnect or silence: every remaining URL simply keeps its server outcome."""
        from app.services import helper_exchange as hx
        ex = hx.get_exchange()
        started = time.monotonic()
        try:
            for round_no in range(1, hx.HELPER_MAX_ROUNDS + 1):
                await self._apply_captures(ex)
                if not self.helper_pending:
                    break
                budget = hx.HELPER_TOTAL_S - (time.monotonic() - started)
                if budget <= 0 or not hx.presence_fresh(await ex.presence(self.crawl_id)):
                    break
                await self._helper_round(ex, round_no, min(hx.HELPER_ROUND_S, budget))
                if self.queue.empty():
                    break
                self.in_retry_pass = False  # pages found on rescued pages get a normal first attempt
                await self._crawl_all(fetcher)
            await self._apply_captures(ex)
        finally:
            await self._settle_helper_pending()
            if self.helper_stats["offered"] or self.helper_stats["captures"]:
                await self._record_helper_summary("done")
            await ex.clear(self.crawl_id)

    async def _helper_round(self, ex, round_no: int, limit_s: float):
        """Publish one batch and wait for it: until every URL is answered, the dashboard reports the helper is
        done, nothing arrives for HELPER_IDLE_S (longer while the user is asked to act), the round's time limit
        passes, or the dashboard stops polling (helper or tab gone)."""
        from app.services import helper_exchange as hx
        offered = list(self.helper_pending)[:hx.HELPER_MAX_URLS]
        await ex.open_batch(self.crawl_id, {
            "batch_id": f"{self.crawl_id}-{round_no}", "round": round_no, "site": hx.site_origin(self.seed_url),
            "urls": offered, "total": len(offered), "opened_at": time.time(), "deadline_s": int(limit_s),
            "idle_s": int(hx.HELPER_IDLE_S)})
        self.helper_stats["offered"] += len(offered)
        self.helper_stats["rounds"] = round_no
        await self._record_helper_summary("waiting", batch_total=len(offered))
        logger.info("Crawl %s: offered %s URL(s) to the helper (round %s).", self.crawl_id, len(offered), round_no)
        start = last = time.monotonic()
        answered = 0
        try:
            while True:
                for r in await ex.drain_results(self.crawl_id):
                    answered += 1
                    last = time.monotonic()
                    await self._apply_helper_result(r)
                if answered >= len(offered):
                    break
                act = await ex.activity(self.crawl_id) or {}
                state = act.get("state")
                if act.get("at"):
                    last = max(last, time.monotonic() - max(0.0, time.time() - float(act["at"])))
                if state in hx.FINAL_STATES:
                    break
                now = time.monotonic()
                idle_limit = hx.HELPER_WAIT_USER_S if state in hx.USER_WAIT_STATES else hx.HELPER_IDLE_S
                if now - last > idle_limit or now - start > limit_s:
                    logger.info("Crawl %s: stopped waiting for the helper (%s).", self.crawl_id,
                                "no answer" if now - last > idle_limit else "time limit")
                    break
                if not hx.presence_fresh(await ex.presence(self.crawl_id)):
                    logger.info("Crawl %s: the helper disconnected; the server keeps its own results.", self.crawl_id)
                    break
                await asyncio.sleep(HELPER_POLL_S)
        finally:
            await ex.close_batch(self.crawl_id)  # late answers are refused from now on
            for r in await ex.drain_results(self.crawl_id):
                await self._apply_helper_result(r)
            # Offered but not rescued: the server's own outcome stands (with what the helper saw, if it answered).
            for key in offered:
                entry = self.helper_pending.pop(key, None)
                if entry is not None:
                    await self._settle_one(entry, self.helper_notes.get(key))
            await self._record_helper_summary("waiting")

    async def _apply_helper_result(self, r: dict):
        """One result from the helper, already validated by the API. Usable pages go through _finish exactly like
        the server's own fetches; anything else leaves the server outcome in place."""
        key = self._clean_crawl_url(r.get("url") or "")
        entry = self.helper_pending.get(key)
        if entry is None:
            return
        item = entry[0]
        outcome, status = r.get("outcome"), int(r.get("status") or 0)
        headers = r.get("headers") or {}
        html = r.get("html")
        attempts = max(1, int(r.get("attempts") or 1))
        if outcome == "ok" or (outcome == "site_error" and status >= 400):
            content_type = headers.get("content-type") or ("text/html" if html else "")
            # Same checks as a server fetch: a challenge page the helper did not recognise is still not content.
            problem = classify_response(status, headers, html or "", bool(html))
            if problem is None:
                self.helper_pending.pop(key, None)
                self.helper_stats["rescued"] += 1
                fetched = Fetched(
                    status_code=status, headers=headers, content_type=content_type,
                    final_url=r.get("final_url") or item.url, html=html or "",
                    history=[h for h in (r.get("redirects") or []) if isinstance(h, dict)],
                    response_time_ms=int(r.get("timing_ms") or 0), via="helper", attempts=attempts)
                await self._finish(item, fetched)
                return
            self.helper_notes[key] = {"outcome": problem.outcome, "reason": problem.reason}
            return
        if outcome == "site_error":
            # The site refused the user's browser too (DNS, TLS, redirect loop): that is the site's own error.
            self.helper_pending.pop(key, None)
            self.helper_stats["rescued"] += 1
            await self._record_failure(item, Failure(r.get("reason") or "The site returned an error", False,
                                                     OUTCOME_SITE, SIDE_SITE), via="helper", attempts=attempts)
            return
        self.helper_notes[key] = {"outcome": outcome, "reason": (r.get("reason") or "")[:300]}

    async def _settle_one(self, entry: tuple, note: Optional[dict] = None):
        item, failure = entry
        if failure is None:
            self._record_not_attempted(item)
        else:
            await self._record_failure(item, failure, helper_note=note)

    async def _settle_helper_pending(self):
        pending, self.helper_pending = self.helper_pending, {}
        for key, entry in pending.items():
            await self._settle_one(entry, self.helper_notes.get(key))

    async def _load_prefetched(self):
        """A single-page audit started from "Audit this tab": the captured page replaces the server fetch."""
        from app.services import helper_exchange as hx
        for cap in await hx.get_exchange().drain_captures(self.crawl_id):
            fetched = self._capture_fetched(cap)
            if fetched is not None:
                self.prefetched[self._clean_crawl_url(cap["url"])] = fetched
                self.helper_stats["captures"] += 1

    @staticmethod
    def _capture_fetched(cap: dict) -> Optional["Fetched"]:
        html = cap.get("html")
        if not html or not cap.get("url"):
            return None
        return Fetched(status_code=200, headers={"content-type": "text/html; charset=utf-8"},
                       content_type="text/html; charset=utf-8", final_url=cap["url"], html=html,
                       via="tab_capture", attempts=1,
                       note="Captured from your browser tab: what your browser showed (your session, scripts run).")

    async def _apply_captures(self, ex):
        """Tabs the user captured and added to this crawl. A capture fills a page the server could not fetch, or
        adds a page not reached yet; a page the server already audited is kept as it is."""
        for cap in await ex.drain_captures(self.crawl_id):
            fetched = self._capture_fetched(cap)
            if fetched is None:
                continue
            key = self._clean_crawl_url(cap["url"])
            entry = self.helper_pending.pop(key, None)
            if entry is not None:
                item = entry[0]
            elif key in self.saved_urls or self.admitted_count >= self.max_pages:
                continue
            else:
                for v in self._get_url_variants(key):
                    self.visited_urls.add(v)
                self.admitted_count += 1
                item = QueueItem(key, min(1, self.max_depth))
            self.helper_stats["captures"] += 1
            await self._finish(item, fetched)

    async def _record_helper_summary(self, state: str, batch_total: Optional[int] = None):
        """Crawl.summary["helper"]: what the dashboard shows ("your browser fetched 12 of 15 pages")."""
        from sqlalchemy.orm.attributes import flag_modified
        info = {"state": state, **self.helper_stats, "pending": len(self.helper_pending)}
        if batch_total is not None:
            info["batch_total"] = batch_total
        async with self.db_lock:
            try:
                crawl = await self.db.get(Crawl, self.crawl_id)
                if crawl:
                    summary = crawl.summary or {}
                    extra = {"phase": "helper"} if state == "waiting" else {"phase": "crawling"}
                    crawl.summary = {**summary, **extra, "helper": {**(summary.get("helper") or {}), **info}}
                    flag_modified(crawl, "summary")
                    await self.db.commit()
            except Exception as e:
                await self.db.rollback()
                print(f"Could not record helper progress: {type(e).__name__}")

    def send_alert(self, failed_reason: Optional[str] = None):
        """One grouped developer alert for this crawl: dead-lettered URLs, an open circuit breaker or a failed crawl."""
        lines = []
        if failed_reason:
            lines.append(f"crawl failed: {failed_reason}")
        if self.breaker.tripped:
            lines.append(f"circuit breaker open ({self.breaker.tripped_reason}): site unreachable or blocking the crawler")
        if self.dead_letter_total:
            reasons = Counter(d["reason"] for d in self.dead_letters).most_common(3)
            top = ", ".join(f"{r} x{n}" for r, n in reasons)
            lines.append(f"{self.dead_letter_total} URL(s) dead-lettered after retries ({top})")
        if self.blocked_count:
            lines.append(f"{self.blocked_count} page(s) blocked by bot protection ({', '.join(self.blocked_providers) or 'unknown provider'})")
        send_crawl_alert(self.crawl_id, self.seed_url, lines, error=bool(failed_reason or self.breaker.tripped))

    def coverage_report(self) -> dict:
        """What the crawl covered and why any discovered internal URLs were left out."""
        # A URL skipped from one page can still be reached from another; count only those never crawled.
        def missed(urls):
            return len(urls - self.visited_urls)
        return {
            "crawled": self.admitted_count,
            "max_pages": self.max_pages,
            "max_depth": self.max_depth,
            "not_crawled_page_limit": missed(self.skipped_page_limit),
            "not_crawled_depth_limit": missed(self.skipped_depth),
            "excluded_by_rules": missed(self.skipped_excluded),
            "outside_start_folder": missed(getattr(self, "skipped_outside_folder", set())),
            "start_folder": self._start_folder() if getattr(self, "stay_in_folder", False) else None,
            "pages_over_link_limit": self.link_capped_pages,
            "link_limit_per_page": MAX_LINKS_PER_PAGE,
            "failed_after_retries": getattr(self, "dead_letter_total", 0),
            "stopped_reason": (("Site unreachable or blocking the crawler: " + self.breaker.tripped_reason)
                               if getattr(self, "breaker", None) and self.breaker.tripped else None),
            "not_crawled_unreachable": getattr(self, "not_attempted", 0),
        }

    async def _record_coverage(self):
        from sqlalchemy.orm.attributes import flag_modified
        async with self.db_lock:
            try:
                crawl = await self.db.get(Crawl, self.crawl_id)
                if crawl:
                    extra = {"failed_urls": self.dead_letters, "failed_urls_total": self.dead_letter_total,
                             "politeness": self.limiter.snapshot()}
                    if self.blocked_count:
                        extra["blocked"] = {"provider": self.blocked_providers.most_common(1)[0][0] if self.blocked_providers else "Bot protection",
                                            "count": self.blocked_count, "user_agent": self.user_agent}
                    crawl.summary = {**(crawl.summary or {}), "coverage": self.coverage_report(), **extra}
                    flag_modified(crawl, "summary")
                    await self.db.commit()
            except Exception as e:
                await self.db.rollback()
                print(f"Could not record crawl coverage: {type(e).__name__}")

    async def _note_setting(self, key: str, value):
        """Correct one entry of Crawl.summary["settings"] when the crawl ran differently than requested."""
        from sqlalchemy.orm.attributes import flag_modified
        async with self.db_lock:
            try:
                crawl = await self.db.get(Crawl, self.crawl_id)
                if crawl:
                    summary = crawl.summary or {}
                    crawl.summary = {**summary, "settings": {**(summary.get("settings") or {}), key: value}}
                    flag_modified(crawl, "summary")
                    await self.db.commit()
            except Exception as e:
                await self.db.rollback()
                print(f"Could not record crawl setting: {type(e).__name__}")

    async def _set_phase(self, phase: str):
        """Record what the crawl is doing now (crawling -> analysing -> enriching) for progress UI."""
        from sqlalchemy.orm.attributes import flag_modified
        async with self.db_lock:
            try:
                crawl = await self.db.get(Crawl, self.crawl_id)
                if crawl:
                    crawl.summary = {**(crawl.summary or {}), "phase": phase}
                    flag_modified(crawl, "summary")
                    await self.db.commit()
            except Exception as e:
                await self.db.rollback()
                print(f"Could not record crawl phase: {type(e).__name__}")

    def _track_uncommitted(self):
        """Remember rows flushed (page ids assigned) but not yet committed: a rollback would otherwise lose them."""
        sync_session = getattr(self.db, "sync_session", None)
        if sync_session is None:
            return
        try:
            event.listen(sync_session, "pending_to_persistent", lambda _s, obj: self._uncommitted.append(obj))
            event.listen(sync_session, "after_commit", lambda _s: self._uncommitted.clear())
        except Exception:
            pass

    async def _flush_db_batch(self, force: bool = False):
        """Flushes and commits the current transaction batch to the database safely."""
        if self.batch_count == 0 and not force:
            return
        now = time.time()
        if force or self.batch_count >= self.BATCH_SIZE or (now - self.last_flush_time) >= self.FLUSH_INTERVAL:
            try:
                await self.db.commit()
                self.batch_count = 0
                self.last_flush_time = now
            except Exception as e:
                rows = list(dict.fromkeys([*self._uncommitted, *self.db.new]))
                await self.db.rollback()
                self._uncommitted.clear()
                if is_connection_error(e) and rows:
                    # A dropped connection loses the whole open transaction. Rows keep their ids after the
                    # rollback, so they can be re-added as they were and committed once on a fresh connection.
                    logger.warning("DB commit failed for crawl %s (%s); retrying %s rows once.",
                                   self.crawl_id, type(e).__name__, len(rows))
                    await asyncio.sleep(DB_RETRY_PAUSE_SECONDS)
                    try:
                        self.db.add_all(rows)
                        await self.db.commit()
                        self.batch_count = 0
                        self.last_flush_time = time.time()
                        return
                    except Exception as retry_err:
                        await self.db.rollback()
                        self._uncommitted.clear()
                        logger.error("DB commit retry failed for crawl %s (%s): %s rows were dropped.",
                                     self.crawl_id, type(retry_err).__name__, len(rows))
                else:
                    # One bad row must not cost the whole batch: save the pages one by one, drop only the bad ones.
                    logger.error("DB commit failed for crawl %s (%s: %s); saving %s rows one at a time.",
                                 self.crawl_id, type(e).__name__, e, len(rows))
                    await self._save_rows_individually(rows)
                self.batch_count = 0

    async def _save_rows_individually(self, rows):
        for row in rows:
            if not isinstance(row, Page):
                continue  # images are saved with their page
            try:
                self.db.add(row)
                await self.db.commit()
            except Exception as e:
                await self.db.rollback()
                self._uncommitted.clear()
                logger.error("Crawl %s: page %s was dropped (%s).", self.crawl_id, getattr(row, "url", "?"), type(e).__name__)

    def _clean_crawl_url(self, dest: str) -> str:
        try:
            url_clean = dest.split("#")[0].strip()
            parsed = urlparse(url_clean)
            scheme = (parsed.scheme or "https").lower()
            netloc = parsed.netloc.lower()
            if netloc.endswith(":80") and scheme == "http":
                netloc = netloc[:-3]
            elif netloc.endswith(":443") and scheme == "https":
                netloc = netloc[:-4]

            path = parsed.path or "/"
            # Collapse double or multiple slashes in path (e.g. //service -> /service)
            path = re.sub(r'/{2,}', '/', path)
            if not path:
                path = "/"
            # One spelling per URL: a link written with raw non-ASCII characters and the percent-encoded form
            # the server returns are the same page (otherwise it is crawled twice and reported as a 301).
            path = quote(path, safe="/%:@!$&'()*+,;=-._~")
            path = re.sub(r"%[0-9a-fA-F]{2}", lambda m: m.group(0).upper(), path)

            if getattr(self, 'ignore_url_params', False):
                # Tracking and sort/filter parameters are dropped, but a page number is a different page:
                # stores and blogs that paginate with ?page=2 must still have page 2 onwards crawled.
                from urllib.parse import parse_qsl, urlencode
                keep = [(k, v) for k, v in parse_qsl(parsed.query, keep_blank_values=True)
                        if k.lower() in PAGINATION_PARAMS and v.strip().isdigit()]
                return f"{scheme}://{netloc}{path}" + (f"?{urlencode(keep)}" if keep else "")

            if parsed.query:
                from urllib.parse import parse_qsl, urlencode
                tracking_prefixes = ('utm_', 'fbclid', 'gclid', 'msclkid', 'mc_cid', 'mc_eid', '_ga')
                clean_queries = [(k, v) for k, v in parse_qsl(parsed.query, keep_blank_values=True)
                                 if not any(k.lower().startswith(p) for p in tracking_prefixes)]
                new_query = urlencode(clean_queries)
                return f"{scheme}://{netloc}{path}" + (f"?{new_query}" if new_query else "")
            return f"{scheme}://{netloc}{path}"
        except Exception:
            return dest

    def _start_folder(self) -> str:
        """Folder the crawl started in: "/news/" for https://site.com/news/ or /news/index.html; "/" at the root."""
        path = urlparse(self.seed_url).path or "/"
        return path if path.endswith("/") else path.rsplit("/", 1)[0] + "/"

    def _in_start_folder(self, url: str) -> bool:
        folder = self._start_folder()
        if not getattr(self, "stay_in_folder", False) or folder == "/":
            return True
        path = urlparse(url).path or "/"
        return path.startswith(folder) or path == folder.rstrip("/")

    def _is_excluded(self, url: str) -> bool:
        """Match exclude rules against the URL path, by whole path segment.

        "/cart" excludes /cart and /cart/x but not /cartoons; "*" is a wildcard ("/tag/*/feed").
        A rule starting with "http" is matched as a URL prefix.
        """
        from fnmatch import fnmatchcase
        path = (urlparse(url).path or "/").lower()
        for rule in self.exclude_paths_list:
            r = rule.strip().lower()
            if not r:
                continue
            if r.startswith(("http://", "https://")):
                if url.lower().startswith(r):
                    return True
                continue
            if not r.startswith("/"):
                r = "/" + r
            if "*" in r:
                if fnmatchcase(path, r) or fnmatchcase(path, r.rstrip("/") + "/*"):
                    return True
                continue
            base = r.rstrip("/") or "/"
            if base == "/" or path == base or path.startswith(base + "/"):
                return True
        return False

    async def _process_page_data(self, url, current_depth, html_content, status_code, content_type, response_time_ms,
                                 headers=None, fetch=None, fetched=None):
        # Parsing is CPU-bound: it runs in a process pool (threads as a fallback) so it neither stalls the event
        # loop nor competes for the GIL with the other crawls.
        metrics, links, images = await parse_page(html_content, url, headers)

        missing_alt_text_count = sum(1 for i in images if i.get("Missing_Alt_Text"))
        missing_alt_attr_count = sum(1 for i in images if i.get("Missing_Alt_Attribute"))
        alt_text_over_100_count = sum(1 for i in images if i.get("Alt_Text_Over_100_Characters"))
        missing_size_attrs_count = sum(1 for i in images if i.get("Missing_Size_Attributes"))

        ad = metrics["audit_data"]
        ad["Images"] = {
            "Total Images": len(images),
            "Missing Alt Text": missing_alt_text_count > 0,
            "Missing Alt Attribute": missing_alt_attr_count > 0,
            "Alt Text Over 100 Characters": alt_text_over_100_count > 0,
            "Missing Size Attributes": missing_size_attrs_count > 0
        }
        ad["Fetch"] = fetch or ok_block()
        if fetched is not None and fetched.rendered:
            self._apply_rendering_results(ad, fetched)

        # PageSpeed is measured once per crawl by EnrichmentService with the workspace's own key.

        page_columns = {c.name for c in Page.__table__.columns}
        page_kwargs = {
            "crawl_id": self.crawl_id,
            "url": url,
            "content_type": content_type,
            "status_code": status_code,
            "response_time_ms": response_time_ms,
            "crawl_depth": current_depth,
            "folder_depth": urlparse(url).path.count("/")
        }
        for k, v in metrics.items():
            if k in page_columns:
                page_kwargs[k] = v

        if "indexability" in page_kwargs and isinstance(page_kwargs["indexability"], str):
            page_kwargs["indexability"] = IndexabilityStatus.NON_INDEXABLE if page_kwargs["indexability"] == "Non-Indexable" else IndexabilityStatus.INDEXABLE

        db_page = Page(**page_kwargs)
        if len(links) >= MAX_LINKS_PER_PAGE:
            self.link_capped_pages += 1
        refresh_target = metrics.get("refresh_redirect_url")
        if refresh_target:
            # A refresh redirect is followed like any other redirect, so its destination is crawled too.
            target_host = urlparse(refresh_target).netloc.lower().removeprefix("www.")
            links = links + [{
                "destination_url": refresh_target, "anchor_text": "Refresh redirect", "is_follow": True,
                "link_type": "REFRESH", "is_internal": target_host == self.allowed_domain.removeprefix("www."),
            }]

        outlinks = []
        for link in links:
            dest_url = link["destination_url"]
            # Stored on the page (not one row per link) in the same normalized form as Page.url so the
            # link graph joins correctly; over-long URLs are cut so one never fails the whole page save.
            outlinks.append(compact_outlink(
                self._clean_crawl_url(dest_url)[:MAX_URL_LENGTH],
                link["anchor_text"], link["is_follow"], link["link_type"], link["is_internal"],
            ))

            if link["is_internal"]:
                dest = self._clean_crawl_url(dest_url)
                path_lower = urlparse(dest).path.lower()

                # Skip non-HTML binary asset files from being queued as crawlable pages
                if path_lower.endswith(NON_PAGE_EXTENSIONS):
                    continue

                # Skip author archives if disabled in settings (Screaming Frog standard: disabled by default)
                if not getattr(self, 'crawl_author_archives', False) and ('/author/' in path_lower or path_lower.startswith('/author')):
                    continue

                if len(dest) > MAX_URL_LENGTH:
                    continue  # cannot be stored as a page; browsers and Google also reject URLs this long
                variants = self._get_url_variants(dest)
                if any(v in self.visited_urls for v in variants):
                    continue
                key = variants[0]
                if current_depth >= self.max_depth:
                    self.skipped_depth.add(key)
                elif not self._in_start_folder(dest):
                    self.skipped_outside_folder.add(key)
                elif self._is_excluded(dest):
                    self.skipped_excluded.add(key)
                elif self.admitted_count < self.max_pages:
                    self.admitted_count += 1
                    for v in variants:
                        self.visited_urls.add(v)
                    self.queue.put_nowait(QueueItem(dest, current_depth + 1))
                else:
                    self.skipped_page_limit.add(key)
            elif not link["is_internal"] and getattr(self, 'check_external_links', False):
                clean_ext = self._clean_crawl_url(dest_url)
                ext_variants = self._get_url_variants(clean_ext)
                if not any(v in self.visited_urls for v in ext_variants) and len(self.external_link_tasks) < self.max_pages:
                    for v in ext_variants:
                        self.visited_urls.add(v)
                    self.external_link_tasks.append(
                        asyncio.create_task(self._check_external_link(clean_ext, current_depth + 1))
                    )

        # The canonical target is already stored on the page (canonical_link_element_1); no link record needed.
        db_page.outlinks = outlinks

        # Images are attached through the relationship, so one flush inserts a whole batch of pages with their
        # images and fills in the page ids (no flush per page).
        for img in images:
            Image(crawl_id=self.crawl_id, page=db_page, url=img["url"], alt_text=img["alt_text"], size_bytes=img["size_bytes"])

        await self._store_page(url, db_page)

    @staticmethod
    def _apply_rendering_results(audit_data: dict, f: "Fetched"):
        audit_data.setdefault("JavaScript", {})
        audit_data["JavaScript"]["Pages with JavaScript Errors"] = len(f.js_errors) > 0
        audit_data["JavaScript"]["Contains JavaScript Content"] = True  # confirmed by the browser
        accessibility = audit_data.setdefault("Accessibility", {})
        violations = f.violations or []
        accessibility["Total Violations"] = len(violations)
        accessibility["Needs Improvement"] = len(violations) > 0
        for v in violations:
            vid = v.get("id", "")
            if vid == "color-contrast":
                accessibility["Text Requires Higher Color Contrast to Background"] = True
            if vid == "image-alt":
                accessibility["Alt Text Should Not Be Repeated As Text"] = True  # rough mapping
            if vid == "label":
                accessibility["Form Elements Should Have Visible Label"] = True
            if vid == "html-has-lang":
                accessibility["Lang Attribute Requires Valid Value"] = True
            if "aria" in vid:
                accessibility["Required ARIA Attributes Must Be Provided"] = True

    async def _store_page(self, url: str, page: Page):
        """Buffer one page row (with its images) for the next batched commit."""
        async with self.db_lock:
            if url in self.saved_urls:
                return
            try:
                self.db.add(page)
                self.saved_urls.add(url)
                self.batch_count += 1
                await self._flush_db_batch()
            except Exception as e:
                print(f"Error saving page {url} to DB: {e}")
                self.batch_count = 0

    async def _save_redirect_page(self, url: str, depth: int, status_code: int, redirect_url: str, chain=None, fetch=None):
        status_name = "Moved Permanently" if status_code == 301 else ("Found" if status_code == 302 else ("Temporary Redirect" if status_code == 307 else "Permanent Redirect"))
        audit_data = {
            "Response_Codes": {
                "3xx": True,
                "Redirection (3xx)": True,
                "Redirection_3xx": True,
                "Status Code": status_code,
                "Redirect URL": redirect_url,
                # Every hop with its real status, e.g. [{"url": ..., "status": 301}, ...]; None when not captured.
                "Redirect Chain": chain,
                "Redirect Hops": len(chain) if chain else None,
                "Redirect Chain (2+ Hops)": (len(chain) >= 2) if chain else None,
                "Temporary Redirect (302/307)": status_code in (302, 307),
            },
            "Indexability": {
                "Indexable": False,
                "Non-Indexable Reason": f"Redirect ({status_code})"
            },
            "Fetch": fetch or ok_block(),
        }
        page = Page(
            crawl_id=self.crawl_id,
            url=url,
            status_code=status_code,
            status_name=status_name,
            indexability=IndexabilityStatus.NON_INDEXABLE,
            indexability_status=f"Redirect ({status_code})",
            crawl_depth=depth,
            folder_depth=urlparse(url).path.count("/"),
            audit_data=audit_data
        )
        await self._store_page(url, page)

    async def _save_error_page(self, url: str, depth: int, status_code: int, error_reason: str, fetch=None):
        resp_codes = {}
        if 400 <= status_code < 500:
            resp_codes = {
                "4xx": True,
                "Client Error (4xx)": True,
                "Client_Error_4xx": True,
                "Status Code": status_code,
                "Error": error_reason or "Client Error (4xx)"
            }
        elif status_code >= 500:
            resp_codes = {
                "5xx": True,
                "Server Error (5xx)": True,
                "Server_Error_5xx": True,
                "Status Code": status_code,
                "Error": error_reason or "Server Error (5xx)"
            }
        elif status_code == 0:
            resp_codes = {
                "Blocked": True,
                "Status Code": 0,
                "Error": error_reason or "Blocked by robots.txt"
            }

        audit_data = {
            "Response_Codes": resp_codes,
            "Indexability": {
                "Indexable": False,
                "Non-Indexable Reason": error_reason or f"Error ({status_code})"
            },
            "Fetch": fetch or ok_block(),
        }
        page = Page(
            crawl_id=self.crawl_id,
            url=url,
            status_code=status_code,
            indexability=IndexabilityStatus.NON_INDEXABLE,
            indexability_status=error_reason,
            crawl_depth=depth,
            folder_depth=urlparse(url).path.count("/"),
            audit_data=audit_data
        )
        await self._store_page(url, page)

    async def _check_external_link(self, ext_url: str, depth: int):
        """Checks external outbound links for broken/404 status without crawling recursively."""
        try:
            async with self.external_link_semaphore, safe_async_client(timeout=8.0, headers={'User-Agent': self.user_agent}) as client:
                try:
                    resp = await get_limited(client, ext_url, method="HEAD", read_body=False)
                    if resp.status_code == 405:  # Method Not Allowed for HEAD
                        resp = await get_limited(client, ext_url, read_body=False)
                except UnsafeURLError:
                    return
                except httpx.HTTPError:
                    resp = await get_limited(client, ext_url, read_body=False)
                    
                status_code = resp.status_code
                content_type = resp.headers.get("content-type", "")
                status_name = "OK" if status_code == 200 else ("Not Found" if status_code == 404 else f"HTTP {status_code}")
                
                page_data = {
                    "crawl_id": self.crawl_id,
                    "url": ext_url,
                    "content_type": content_type,
                    "status_code": status_code,
                    "status_name": status_name,
                    "indexability": IndexabilityStatus.NON_INDEXABLE,
                    "indexability_status": "External",
                    "crawl_depth": depth,
                    "folder_depth": urlparse(ext_url).path.count("/"),
                    "audit_data": {
                        "External": {"Status Code": status_code, "Content Type": content_type},
                        "Response_Codes": {
                            "Status Code": status_code,
                            "2xx": 200 <= status_code < 300,
                            "4xx": 400 <= status_code < 500,
                            "5xx": status_code >= 500
                        },
                        "Indexability": {
                            "Indexable": False,
                            "Non-Indexable Reason": "External"
                        }
                    }
                }
                async with self.db_lock:
                    if ext_url in self.saved_urls:
                        return
                    try:
                        self.db.add(Page(**page_data))
                        self.saved_urls.add(ext_url)
                        self.batch_count += 1
                        await self._flush_db_batch()
                    except Exception as e:
                        await self.db.rollback()
                        self.batch_count = 0
                        print(f"Error saving external link check for {ext_url}: {e}")
        except Exception as e:
            page_data = {
                "crawl_id": self.crawl_id,
                "url": ext_url,
                "status_code": 0,
                "status_name": "Connection Error",
                "indexability": IndexabilityStatus.NON_INDEXABLE,
                "indexability_status": "External Error",
                "crawl_depth": depth,
                "folder_depth": urlparse(ext_url).path.count("/"),
                "audit_data": {
                    "External": {"Status Code": 0, "Error": str(e)},
                    "Response_Codes": {"Status Code": 0, "Blocked": True, "Error": str(e)},
                    "Indexability": {"Indexable": False, "Non-Indexable Reason": "External Error"}
                }
            }
            async with self.db_lock:
                if ext_url in self.saved_urls:
                    return
                try:
                    self.db.add(Page(**page_data))
                    self.saved_urls.add(ext_url)
                    self.batch_count += 1
                    await self._flush_db_batch()
                except Exception:
                    await self.db.rollback()
                    self.batch_count = 0
