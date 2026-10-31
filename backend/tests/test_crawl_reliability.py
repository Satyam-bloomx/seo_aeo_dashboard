"""Crawler reliability: deferred bounded retries, failure attribution, circuit breaker, bot detection,
adaptive politeness, the crawl queue, alerts and the shared parser/browser pools."""
import asyncio
import socket
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import httpx
import pytest

from app.services import fetch_outcome as fo
from app.services.politeness import AdaptiveLimiter


# ------------------------------------------------------------------ classification (pure)

def test_temporary_vs_permanent_exceptions():
    assert fo.classify_exception(httpx.ReadTimeout("t")).temporary
    assert fo.classify_exception(httpx.ConnectTimeout("t")).reason == "Request timed out"
    assert fo.classify_exception(httpx.RemoteProtocolError("closed")).temporary
    refused = httpx.ConnectError("refused")
    refused.__cause__ = ConnectionRefusedError()
    assert fo.classify_exception(refused).temporary

    loop = fo.classify_exception(httpx.TooManyRedirects("loop"))
    assert (loop.temporary, loop.outcome, loop.side) == (False, "site_error", "site")

    nx = httpx.ConnectError("dns")
    nx.__cause__ = socket.gaierror(-2, "Name or service not known")
    f = fo.classify_exception(nx)
    assert (f.temporary, f.outcome, f.side) == (False, "site_error", "site") and "does not exist" in f.reason

    dns_timeout = httpx.ConnectError("dns")
    dns_timeout.__cause__ = socket.gaierror(-3, "Temporary failure in name resolution")
    assert fo.classify_exception(dns_timeout).temporary

    tls = httpx.ConnectError("[SSL: CERTIFICATE_VERIFY_FAILED] certificate verify failed")
    f = fo.classify_exception(tls)
    assert (f.temporary, f.side, f.reason) == (False, "site", "Invalid TLS certificate")

    pool = fo.classify_exception(httpx.PoolTimeout("pool"))
    assert pool.temporary and pool.side == "ours"


def test_unresolvable_host_from_the_ssrf_guard_is_nxdomain_not_retried():
    from app.core.url_safety import UnsafeURLError
    err = UnsafeURLError("Hostname could not be resolved")
    err.__cause__ = socket.gaierror(-2, "nope")
    f = fo.classify_exception(err)
    assert not f.temporary and f.side == "site"
    private = fo.classify_exception(UnsafeURLError("URL resolves to a private or reserved network address"))
    assert not private.temporary


def test_response_classification():
    assert fo.classify_response(200, {}, "<html>fine</html>") is None
    assert fo.classify_response(404, {}, "<html>nope</html>") is None  # permanent: stored as an ordinary 404
    assert fo.classify_response(403, {}, "<html>forbidden</html>") is None
    f = fo.classify_response(503, {"Retry-After": "7"}, "<html>down</html>")
    assert f.temporary and f.retry_after == 7 and f.side == "site" and f.outcome == "site_error"
    f = fo.classify_response(429, {}, "")
    assert f.temporary and f.outcome == "blocked" and f.side == "unknown"
    assert fo.classify_response(502, {}, "").temporary and fo.classify_response(504, {}, "").temporary


@pytest.mark.parametrize("status,headers,body,provider", [
    (403, {}, "<html><head><title>Just a moment...</title></head><body>Enable JavaScript. cf-chl-opt</body></html>", "Cloudflare"),
    (200, {}, "<html><head><title>Just a moment...</title></head><body></body></html>", "Cloudflare"),
    (403, {"cf-mitigated": "challenge"}, "", "Cloudflare"),
    (403, {}, "<html><title>Attention Required! | Cloudflare</title></html>", "Cloudflare"),
    (403, {}, "<html><body><div id='px-captcha'></div></body></html>", "PerimeterX"),
    (403, {"Server": "DataDome"}, "<html></html>", "DataDome"),
    (403, {}, "<html><body>Request unsuccessful. Incapsula incident ID: 123</body></html>", "Imperva"),
    (403, {}, "<html><body>Access Denied. Reference #18.abc errors.edgesuite.net</body></html>", "Akamai"),
])
def test_bot_protection_pages_are_recognised(status, headers, body, provider):
    assert fo.detect_bot_challenge(status, headers, body) == provider
    failure = fo.classify_response(status, headers, body)
    assert failure.outcome == "blocked" and failure.side == "unknown" and failure.provider == provider


def test_normal_pages_and_plain_403_are_not_challenges():
    long_page = "<html><head><title>Blog</title></head><body>" + "<p>captcha is a word in an article</p>" * 800 + "</body></html>"
    assert fo.detect_bot_challenge(200, {}, long_page) is None
    assert fo.detect_bot_challenge(200, {}, "<html><title>Just a moment of your time</title></html>") is None
    assert fo.detect_bot_challenge(403, {}, "<html><body>You may not view this directory.</body></html>") is None


def test_js_exception_classification():
    assert fo.classify_js_exception(Exception("net::ERR_NAME_NOT_RESOLVED at https://x")).temporary is False
    assert fo.classify_js_exception(Exception("net::ERR_CERT_DATE_INVALID")).side == "site"
    crash = fo.classify_js_exception(Exception("Target closed"))
    assert crash.temporary and crash.side == "ours" and crash.kind == "crash"
    class TimeoutError_(Exception):
        pass
    TimeoutError_.__name__ = "TimeoutError"
    timeout = fo.classify_js_exception(TimeoutError_("Page.goto: Timeout 30000ms exceeded"))
    assert timeout.temporary and timeout.side == "ours" and timeout.kind == "render"


def test_circuit_breaker_rate_and_consecutive_rules():
    b = fo.CircuitBreaker()
    for _ in range(8):
        b.record(False)
    b.record(True)
    b.record(True)  # 2 of 10 = 20%: not more than 20%
    assert not b.tripped
    b.record(True)  # 3 of 11
    assert b.tripped and "3 of 11" in b.tripped_reason

    c = fo.CircuitBreaker()
    for _ in range(9):
        c.record(True)
    assert not c.tripped  # 9 in a row, and fewer than 10 attempts for the rate rule
    c.record(True)
    assert c.tripped and "10 requests in a row" in c.tripped_reason

    d = fo.CircuitBreaker()
    for i in range(200):
        d.record(i % 9 == 0)  # ~11% failures spread out: healthy
    assert not d.tripped


def test_uncounted_helper():
    assert fo.is_uncounted({"Fetch": fo.fetch_block("crawler_error", "ours", 3, "render failed")})
    assert fo.is_uncounted({"Fetch": fo.fetch_block("blocked", "unknown", 3)})
    assert fo.is_uncounted({"Fetch": fo.fetch_block("unverified", "unknown", 3)})
    assert not fo.is_uncounted({"Fetch": fo.fetch_block("site_error", "site", 1, "HTTP 404")})
    assert not fo.is_uncounted({"Fetch": fo.ok_block()}) and not fo.is_uncounted({})


# ------------------------------------------------------------------ adaptive politeness

class FakeClock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now


def test_limiter_slows_on_throttle_honours_retry_after_and_recovers():
    clock = FakeClock()
    lim = AdaptiveLimiter(start=10, ceiling=15, min_delay=0.0, clock=clock)
    assert lim.limit == 10
    lim.on_throttle(retry_after=4)
    assert lim.limit == 5 and lim.extra_delay == 0.5 and lim._pause_until == clock.now + 4
    lim.on_throttle(retry_after=500)  # burst inside the cooldown: one slowdown only, pause capped at 30s
    assert lim.limit == 5 and lim._pause_until == clock.now + 30
    clock.now += 5
    lim.on_throttle()
    assert lim.limit == 2 and lim.extra_delay == 1.0
    for _ in range(20 * 4):
        lim.on_success()
    assert lim.extra_delay == 0.0  # the delay is shed first...
    for _ in range(20 * 20):
        lim.on_success()
    assert lim.limit == 15  # ...then concurrency creeps back up, never above the ceiling
    assert lim.snapshot()["slowdowns"] == 2


def test_limiter_never_goes_below_the_users_delay_and_cap_reduces_concurrency():
    async def go():
        lim = AdaptiveLimiter(start=3, ceiling=3, min_delay=0.05)
        t0 = time.monotonic()
        for _ in range(4):
            await lim.acquire(0.0)
            lim.release()
        assert time.monotonic() - t0 >= 0.14  # four requests spaced by at least the user's delay
        lim.cap(1)
        assert lim.limit == 1 and lim.ceiling == 1
        await lim.acquire(0.0)
        second = asyncio.ensure_future(lim.acquire(0.0))
        await asyncio.sleep(0.1)
        assert not second.done()  # only one slot
        lim.release()
        await asyncio.wait_for(second, 1)
    asyncio.run(go())


# ------------------------------------------------------------------ crawler against a misbehaving site

BODY = "<html><head><title>{t} page of the reliability fixture</title></head><body><h1>{t}</h1>{links}</body></html>"
# 70 healthy pages first, then the misbehaving ones: a site with a few bad URLs, not an outage
HOME_LINKS = " ".join(f"<a href='/{p}'>{p}</a>" for p in
                      [f"good{i}" for i in range(70)] + ["ok1", "flaky", "dead", "gone", "reset", "challenge", "limited"])


class FlakySite(BaseHTTPRequestHandler):
    hits = {}
    log = []
    lock = threading.Lock()

    def log_message(self, *a):
        pass

    def _send(self, code, body, extra=None, ctype="text/html; charset=utf-8"):
        data = body.encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        path = self.path
        if path == "/robots.txt":
            return self._send(404, "no robots")
        with self.lock:
            self.hits[path] = n = self.hits.get(path, 0) + 1
            self.log.append((path, n, time.monotonic()))
        if path == "/":
            return self._send(200, BODY.format(t="Home", links=HOME_LINKS))
        if path == "/ok1" or path.startswith("/good"):
            return self._send(200, BODY.format(t=f"Ok {path[1:]}", links=""))
        if path == "/flaky":  # fails twice, answers on the third attempt
            return self._send(503, "down", {"Retry-After": "0"}) if n <= 2 else self._send(200, BODY.format(t="Flaky", links=""))
        if path == "/dead":
            return self._send(503, "<html>down</html>")
        if path == "/gone":
            return self._send(404, "<html><title>gone</title></html>")
        if path == "/reset":
            self.connection.close()  # no response at all
            return
        if path == "/challenge":
            return self._send(403, "<html><head><title>Just a moment...</title></head><body>cf-chl</body></html>")
        if path == "/limited":
            return self._send(429, "slow down", {"Retry-After": "0"})
        return self._send(404, "<html></html>")


class AlwaysDownSite(FlakySite):
    hits = {}
    log = []

    def do_GET(self):
        if self.path == "/robots.txt":
            return self._send(404, "no robots")
        with self.lock:
            self.hits[self.path] = self.hits.get(self.path, 0) + 1
        if self.path == "/":
            links = " ".join(f"<a href='/p{i}'>p{i}</a>" for i in range(40))
            return self._send(200, BODY.format(t="Home", links=links))
        return self._send(503, "<html>down</html>")


def _serve(handler):
    handler.hits, handler.log = {}, []
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, f"http://127.0.0.1:{server.server_address[1]}"


def _crawl(origin, monkeypatch, **kw):
    """Crawl `origin` with a fresh crawler; returns (crawler, crawl_row, pages by path)."""
    from app.core import url_safety
    monkeypatch.setattr(url_safety, "_ALLOW_PRIVATE", True)
    from app.services import crawler as crawler_mod
    monkeypatch.setattr(crawler_mod, "RETRY_GAPS", (0.3, 0.6))
    from app.services import robots as robots_mod
    robots_mod.robots_service._parsers.clear()
    from sqlalchemy import select
    from app.core.auth import get_or_create_user_project
    from app.core.database import AsyncSessionLocal
    from app.models.domain import Crawl, Page

    sent = []
    monkeypatch.setattr(crawler_mod, "send_crawl_alert", lambda *a, **k: sent.append((a, k)))

    async def go():
        async with AsyncSessionLocal() as db:
            pid = await get_or_create_user_project(db, f"reliability-{time.time_ns()}")
            crawl = Crawl(project_id=pid, seed_url=f"{origin}/", status="running")
            db.add(crawl)
            await db.commit()
            params = dict(max_depth=3, max_pages=120, max_concurrent=3, ignore_url_params=False)
            params.update(kw)
            crawler = crawler_mod.CrawlerService(crawl_id=crawl.id, seed_url=f"{origin}/", db_session=db, **params)
            await crawler.run()
            rows = (await db.execute(select(Page).where(Page.crawl_id == crawl.id))).scalars().all()
            await db.refresh(crawl)
            return crawler, crawl, {p.url.replace(origin, "") or "/": p for p in rows}
    crawler, crawl, pages = asyncio.run(go())
    return crawler, crawl, pages, sent


@pytest.fixture()
def flaky(client):  # `client` creates the schema
    server, origin = _serve(FlakySite)
    yield origin
    server.shutdown()


def test_temporary_failures_are_parked_retried_at_most_twice_then_dead_lettered(flaky, monkeypatch):
    crawler, crawl, pages, sent = _crawl(flaky, monkeypatch)
    hits = FlakySite.hits
    fetch = lambda p: pages[p].audit_data["Fetch"]

    assert crawl.status == "completed"
    # recovers on the third attempt (two retries), then analysed like any page
    assert hits["/flaky"] == 3 and fetch("/flaky")["outcome"] == "ok" and fetch("/flaky")["attempts"] == 3
    assert pages["/flaky"].status_code == 200 and pages["/flaky"].title_1
    # permanent outcomes are never retried
    assert hits["/gone"] == 1 and fetch("/gone") == fo.fetch_block("site_error", "site", 1, "HTTP 404")
    assert hits["/ok1"] == 1 and fetch("/ok1")["outcome"] == "ok" and fetch("/ok1")["rendered"] is False
    # a server that keeps failing: 3 attempts, final outcome is the site's error
    assert hits["/dead"] == 3 and (fetch("/dead")["outcome"], fetch("/dead")["side"], fetch("/dead")["attempts"]) == ("site_error", "site", 3)
    assert pages["/dead"].status_code == 503
    # dropped connections on every attempt: nothing can be said about the page (not the site's fault, not ours)
    assert hits["/reset"] == 3 and (fetch("/reset")["outcome"], fetch("/reset")["side"]) == ("unverified", "unknown")
    assert pages["/reset"].status_code == 0
    # bot protection: recognised, not analysed, blocked
    assert (fetch("/challenge")["outcome"], fetch("/challenge")["side"], fetch("/challenge")["provider"]) == ("blocked", "unknown", "Cloudflare")
    assert pages["/challenge"].title_1 is None
    assert (fetch("/limited")["outcome"], fetch("/limited")["side"]) == ("blocked", "unknown") and hits["/limited"] == 3

    # dead-letter list on the crawl summary: url, attempts, reason, side
    failed = {f["url"].replace(flaky, ""): f for f in crawl.summary["failed_urls"]}
    assert set(failed) == {"/dead", "/reset", "/challenge", "/limited"}
    assert failed["/dead"]["attempts"] == 3 and failed["/dead"]["side"] == "site" and failed["/reset"]["side"] == "unknown"
    assert crawl.summary["failed_urls_total"] == 4
    assert crawl.summary["blocked"]["provider"] == "Cloudflare" and crawl.summary["blocked"]["count"] == 2
    assert "AuditPro" in crawl.summary["blocked"]["user_agent"]

    # one grouped alert for the whole crawl
    assert len(sent) == 1 and "dead-lettered" in " ".join(sent[0][0][2])


def test_retries_are_deferred_until_the_queue_drains_and_wait_for_the_gap(flaky, monkeypatch):
    _crawl(flaky, monkeypatch)
    log = FlakySite.log
    first_attempts = [i for i, (p, n, _t) in enumerate(log) if n == 1 and p not in ("/sitemap.xml", "/sitemap_index.xml", "/llms.txt")]
    retries = [i for i, (_p, n, _t) in enumerate(log) if n >= 2]
    assert max(first_attempts) < min(retries), "no retry may run before every first attempt has been made"
    t_first = {p: t for p, n, t in log if n == 1}
    for p, n, t in log:
        if n == 2:
            assert t - t_first[p] >= 0.3 - 0.02, f"retry pass 1 of {p} came too early"
    for p, n, t in log:
        if n == 3:
            t_second = next(tt for pp, nn, tt in log if pp == p and nn == 2)
            assert t - t_second >= 0.6 - 0.02, f"retry pass 2 of {p} came too early"


def test_circuit_breaker_stops_retrying_and_alerts_once(client, monkeypatch):
    server, origin = _serve(AlwaysDownSite)
    try:
        crawler, crawl, pages, sent = _crawl(origin, monkeypatch, max_concurrent=1)
    finally:
        server.shutdown()
    assert crawl.status == "completed"
    assert crawler.breaker.tripped
    assert "unreachable or blocking" in crawl.summary["coverage"]["stopped_reason"]
    assert crawl.summary["coverage"]["not_crawled_unreachable"] > 0
    # nothing was retried once the breaker opened: the first 10 consecutive failures are all it took
    assert all(n <= 1 for n in AlwaysDownSite.hits.values())
    assert len(AlwaysDownSite.hits) < 41
    assert len(sent) == 1 and sent[0][1]["error"] is True
    assert any("circuit breaker" in line for line in sent[0][0][2])


def test_failed_urls_list_is_capped(monkeypatch):
    from app.services.crawler import CrawlerService
    c = CrawlerService.__new__(CrawlerService)
    c.dead_letters, c.dead_letter_total = [], 0
    for i in range(fo.FAILED_URL_CAP + 50):
        c._dead_letter(f"https://e.com/{i}", 3, "Request timed out", "unknown")
    assert len(c.dead_letters) == fo.FAILED_URL_CAP and c.dead_letter_total == fo.FAILED_URL_CAP + 50


def test_slow_start_does_not_sleep_inside_a_worker(flaky, monkeypatch):
    """The only sleeps are the pass-level waits: while a URL waits for its retry, other work keeps flowing."""
    crawler, crawl, pages, _ = _crawl(flaky, monkeypatch, max_concurrent=3)
    assert crawler.retry_concurrency == 2 and crawler.limiter.ceiling <= 2  # retry passes ran with reduced concurrency


# ------------------------------------------------------------------ scoring and link checks

def _page(pid, status=200, fetch=None, **audit):
    ad = {"Page_Titles": {"Missing": False}, "Security": {"HTTP URLs": False}}
    ad.update(audit)
    if fetch:
        ad["Fetch"] = fetch
    return {"id": pid, "url": f"https://e.com/{pid}", "status_code": status, "content_type": "text/html",
            "indexability": "Indexable", "indexability_status": "Indexable", "audit_data": ad}


def test_pages_that_are_not_the_sites_fault_do_not_count_in_the_score():
    from app.services.scoring import compute_scores
    pages = [
        _page(1), _page(2),
        _page(3, status=404, fetch=fo.fetch_block("site_error", "site", 1, "HTTP 404")),
        _page(4, status=0, fetch=fo.fetch_block("crawler_error", "ours", 3, "browser crashed")),
        _page(5, status=403, fetch=fo.fetch_block("blocked", "unknown", 3, "bot protection")),
        _page(6, status=0, fetch=fo.fetch_block("unverified", "unknown", 3, "timeout")),
    ]
    r = compute_scores(pages)
    assert r["not_counted"] == {"ours": 1, "unknown": 1, "blocked": 1}
    assert r["urls_evaluated"] == 3  # the two healthy pages and the genuine 404
    by_id = {x["id"]: x for x in r["rules"]}
    assert by_id["Response Codes: Client Error (4xx)"]["failing_page_ids"] == [3]  # the 403 challenge is not a 4xx finding
    assert by_id["Response Codes: Blocked or Failed (No Response)"]["failing_count"] == 0
    assert set(r["page_scores"]) == {"1", "2", "3"}
    note = next(i for i in r["score_explanation"] if i["label"] == "Pages not counted")
    assert note["impact"] == 0 and "problem on our side" in note["detail"] and "not counted in the score" in note["detail"]

    clean = compute_scores([_page(1), _page(2)])
    assert clean["not_counted"] == {"ours": 0, "unknown": 0, "blocked": 0}
    assert all(i["label"] != "Pages not counted" for i in clean["score_explanation"])
    # without the failed-on-our-side pages the genuine 404 alone sets the score
    assert r["site_health"]["score"] == compute_scores(pages[:3])["site_health"]["score"]


def test_links_to_pages_we_could_not_check_are_not_broken_links(client, monkeypatch):
    from sqlalchemy import select
    from app.core.auth import get_or_create_user_project
    from app.core.database import AsyncSessionLocal
    from app.models.domain import Crawl, Page
    from app.services import ai_crawlers
    from app.services.link_store import compact_outlink
    from app.services.post_processor import PostProcessor

    async def no_ai(_seed):
        return {"status": "ok", "agents": []}
    monkeypatch.setattr(ai_crawlers, "check_ai_crawler_access", no_ai)

    async def go():
        async with AsyncSessionLocal() as db:
            pid = await get_or_create_user_project(db, "uncounted-links")
            crawl = Crawl(project_id=pid, seed_url="https://u.test/", status="running")
            db.add(crawl)
            await db.flush()
            db.add_all([
                Page(crawl_id=crawl.id, url="https://u.test/", status_code=200, audit_data={}, outlinks=[
                    compact_outlink("https://u.test/ours", "a", True, "A", True),
                    compact_outlink("https://u.test/blocked", "b", True, "A", True)]),
                Page(crawl_id=crawl.id, url="https://u.test/ours", status_code=0,
                     audit_data={"Fetch": fo.fetch_block("crawler_error", "ours", 3, "browser crashed")}),
                Page(crawl_id=crawl.id, url="https://u.test/blocked", status_code=403,
                     audit_data={"Fetch": fo.fetch_block("blocked", "unknown", 3, "Blocked by bot protection (Cloudflare)")}),
                Page(crawl_id=crawl.id, url="https://u.test/real404", status_code=404,
                     audit_data={"Fetch": fo.fetch_block("site_error", "site", 1, "HTTP 404")}),
                Page(crawl_id=crawl.id, url="https://u.test/links-to-404", status_code=200, audit_data={}, outlinks=[
                    compact_outlink("https://u.test/real404", "c", True, "A", True)]),
            ])
            await db.commit()
            await PostProcessor(crawl.id, db, mode="site").run()
            rows = (await db.execute(select(Page).where(Page.crawl_id == crawl.id))).scalars().all()
            return {p.url: p for p in rows}
    pages = asyncio.run(go())
    assert pages["https://u.test/"].audit_data["Links"]["Internal Links To Broken Pages"] is False
    assert pages["https://u.test/links-to-404"].audit_data["Links"]["Internal Links To Broken Pages"] is True
    assert pages["https://u.test/blocked"].indexability_status == "Blocked by bot protection (Cloudflare)"
    assert pages["https://u.test/real404"].indexability_status == "Client Error (404)"


# ------------------------------------------------------------------ JavaScript rendering

def test_last_js_attempt_falls_back_to_plain_http_and_is_attributed_to_us(flaky, monkeypatch):
    """Render failures are parked like any temporary failure; the final retry uses plain HTTP and the page is
    kept (analysed from raw HTML) with the fault recorded as ours, so it does not count in the score."""
    from app.core import url_safety
    monkeypatch.setattr(url_safety, "_ALLOW_PRIVATE", True)
    from app.services import crawler as crawler_mod
    from app.services.crawler import CrawlerService, QueueItem

    calls = {"render": 0}

    class BrokenTab:
        def __call__(self, context):
            calls["render"] += 1
            raise RuntimeError("Target closed")

    monkeypatch.setattr(crawler_mod.browser_pool, "tab", BrokenTab())

    async def go():
        c = CrawlerService.__new__(CrawlerService)
        c._clean_crawl_url = lambda u: u
        async with httpx.AsyncClient() as client_:
            c.http_client = client_
            first = await c._fetch_js(None, None, QueueItem(f"{flaky}/ok1", 1, attempts=0))
            second = await c._fetch_js(None, None, QueueItem(f"{flaky}/ok1", 1, attempts=1))
            last = await c._fetch_js(None, None, QueueItem(f"{flaky}/ok1", 1, attempts=2))
            return first, second, last
    first, second, last = asyncio.run(go())
    assert isinstance(first, fo.Failure) and first.temporary and first.side == "ours" and first.kind == "crash"
    assert isinstance(second, fo.Failure) and calls["render"] == 2
    assert not isinstance(last, fo.Failure) and last.rendered is False and calls["render"] == 2  # no third render
    assert "unrendered HTML" in last.fallback_reason and last.status_code == 200


def _chromium_available() -> bool:
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            b = p.chromium.launch(headless=True)
            b.close()
        return True
    except Exception:
        return False


class NeverIdleSite(BaseHTTPRequestHandler):
    """A page whose analytics-style request never finishes: networkidle is never reached."""
    def log_message(self, *a):
        pass

    def do_GET(self):
        if self.path == "/robots.txt":
            self.send_response(404)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        if self.path == "/slow-beacon":
            time.sleep(8)
            self.send_response(204)
            self.end_headers()
            return
        body = ("<html><head><title>Never idle page of the fixture site</title></head><body><h1>Hi</h1>"
                "<script>setInterval(function(){fetch('/slow-beacon?'+Date.now()).catch(function(){})}, 300);"
                "document.body.appendChild(document.createElement('p')).textContent='rendered by js';</script></body></html>").encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/html")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


@pytest.mark.skipif(not _chromium_available(), reason="Chromium is not installed")
def test_js_crawl_does_not_fail_when_the_network_never_goes_idle(client, monkeypatch):
    from app.services import crawler as crawler_mod
    monkeypatch.setattr(crawler_mod, "JS_IDLE_GRACE_MS", 400)
    server = ThreadingHTTPServer(("127.0.0.1", 0), NeverIdleSite)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    origin = f"http://127.0.0.1:{server.server_address[1]}"
    try:
        t0 = time.time()
        crawler, crawl, pages, _ = _crawl(origin, monkeypatch, js_rendering=True, max_pages=1, max_depth=0, max_concurrent=1)
        elapsed = time.time() - t0
    finally:
        server.shutdown()
        from app.services.browser_pool import browser_pool
        asyncio.run(browser_pool.close())
    home = pages["/"]
    assert home.status_code == 200 and home.audit_data["Fetch"]["outcome"] == "ok"
    assert home.audit_data["Fetch"]["rendered"] is True and home.audit_data["Fetch"]["attempts"] == 1
    assert elapsed < 20


def test_shared_browser_pool_bounds_tabs_across_crawls():
    from app.services.browser_pool import BrowserPool

    class FakePage:
        async def close(self):
            pass

    class FakeContext:
        async def new_page(self):
            return FakePage()

    async def go():
        pool = BrowserPool(tabs=2)
        open_now, peak = 0, 0

        async def use():
            nonlocal open_now, peak
            async with pool.tab(FakeContext()):
                open_now += 1
                peak = max(peak, open_now)
                await asyncio.sleep(0.02)
                open_now -= 1
        await asyncio.gather(*[use() for _ in range(8)])
        return peak
    assert asyncio.run(go()) == 2


# ------------------------------------------------------------------ parser pool

def test_process_pool_parses_the_same_as_in_process(monkeypatch):
    from app.services import parse_pool
    from app.services.extractor import extract_page
    html = "<html><head><title>Pool test page title here</title></head><body><h1>Hi</h1><a href='/x'>x</a><img src='/a.png'></body></html>"
    monkeypatch.setenv("PARSE_WORKERS", "2")
    parse_pool.shutdown_pool()
    monkeypatch.setattr(parse_pool, "_disabled", False)

    async def go():
        return await asyncio.gather(*[parse_pool.parse_page(html, "https://p.test/", {}) for _ in range(4)])
    try:
        results = asyncio.run(go())
    finally:
        parse_pool.shutdown_pool()
    expected = extract_page(html, "https://p.test/", {})
    for metrics, links, images in results:
        assert metrics["audit_data"]["Page_Titles"] == expected[0]["audit_data"]["Page_Titles"]
        assert links == expected[1] and images == expected[2]


# ------------------------------------------------------------------ crawl queue

def test_queue_runs_up_to_the_slot_limit_and_reports_positions():
    from app.services.crawl_queue import CrawlJob, InProcessCrawlQueue

    async def go():
        q = InProcessCrawlQueue(slots=2, js_slots=1)
        gate, started = asyncio.Event(), []

        def job(cid, js=False):
            async def run():
                started.append(cid)
                await gate.wait()
            return CrawlJob(cid, js, run)
        for cid in (1, 2, 3, 4):
            q.enqueue(job(cid))
        q.enqueue(job(10, js=True))
        q.enqueue(job(11, js=True))
        await asyncio.sleep(0.05)
        assert sorted(started) == [1, 2, 10]  # 2 normal + 1 JS slot
        assert (q.position(3), q.position(4), q.position(11), q.position(1)) == (1, 2, 1, None)
        assert q.cancel(3) is True  # a waiting crawl is simply removed
        assert q.position(4) == 1
        gate.set()
        await asyncio.sleep(0.1)
        assert sorted(started) == [1, 2, 4, 10, 11] and 3 not in started
        assert q.waiting_ids() == []
    asyncio.run(go())


def test_queued_crawl_status_position_cancel_and_requeue(client, monkeypatch):
    from conftest import auth
    from app.api import endpoints
    from app.core.database import AsyncSessionLocal
    from app.models.domain import Crawl
    from app.services.crawl_queue import InProcessCrawlQueue
    from app.core import url_safety
    monkeypatch.setattr(url_safety, "_ALLOW_PRIVATE", True)
    h = auth("queue-user")

    q = InProcessCrawlQueue(slots=1, js_slots=1)
    release = threading.Event()
    ran = []

    async def slow_runner(crawl_id, seed_url, request):
        ran.append(crawl_id)
        while not release.is_set():
            await asyncio.sleep(0.02)
    monkeypatch.setattr(endpoints, "crawl_queue", q)
    monkeypatch.setattr(endpoints, "_run_crawler_task", slow_runner)

    server, origin = _serve(FlakySite)
    try:
        a = client.post("/api/crawls", json={"seed_url": f"{origin}/", "mode": "site"}, headers=h).json()
        b = client.post("/api/crawls", json={"seed_url": f"{origin}/ok1", "mode": "page"}, headers=h).json()
        c = client.post("/api/crawls", json={"seed_url": f"{origin}/ok1", "mode": "page"}, headers=h).json()
        assert a["status"] == "queued"
        # a holds the only slot; b waited, then c replaced b (same workspace and mode)
        status_a = client.get(f"/api/crawls/{a['id']}/status", headers=h).json()
        assert status_a["queue_position"] is None
        mine = client.get("/api/crawls", headers=h).json()
        assert [x["mode"] for x in mine].count("page") == 1  # b was removed, not left dangling
        assert q.waiting_ids() == [c["id"]]
        status_c = client.get(f"/api/crawls/{c['id']}/status", headers=h).json()
        assert (status_c["status"], status_c["phase"], status_c["queue_position"]) == ("queued", "queued", 1)

        # Clear removes waiting crawls from the queue
        assert client.delete("/api/crawls", headers=h).status_code == 200
        assert q.waiting_ids() == []
        release.set()

        # After a restart, crawls left queued go back in the queue (oldest first)
        release.clear()

        async def make():
            from app.core.auth import get_or_create_user_project
            async with AsyncSessionLocal() as db:
                pid = await get_or_create_user_project(db, "requeue-user")
                rows = [Crawl(project_id=pid, seed_url=f"{origin}/{i}", status="queued", mode="site",
                              summary={"request": {"seed_url": f"{origin}/{i}"}}) for i in range(2)]
                broken = Crawl(project_id=pid, seed_url=f"{origin}/x", status="queued", mode="site", summary={})
                db.add_all([*rows, broken])
                await db.commit()
                return [r.id for r in rows], broken.id
        ids, broken_id = asyncio.run(make())

        async def requeue():
            q2 = InProcessCrawlQueue(slots=1, js_slots=1)
            endpoints.crawl_queue = q2
            n = await endpoints.requeue_waiting_crawls()
            await asyncio.sleep(0.05)
            waiting = q2.waiting_ids()
            await q2.shutdown()
            return n, waiting
        n, waiting = asyncio.run(requeue())
        assert n == 2 and ran[-1] == ids[0] and waiting == [ids[1]]  # oldest runs first, the next one waits

        async def broken_status():
            async with AsyncSessionLocal() as db:
                return (await db.get(Crawl, broken_id)).status
        assert asyncio.run(broken_status()) == "failed"  # no stored request: cannot be re-run
    finally:
        release.set()
        server.shutdown()


# ------------------------------------------------------------------ alerts

def test_one_grouped_alert_per_crawl_with_webhook_and_no_retry_storm(monkeypatch):
    from app.services import alerts
    alerts.reset_alerts_for_tests()
    received = []

    class Hook(BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def do_POST(self):
            received.append(self.rfile.read(int(self.headers["Content-Length"])))
            self.send_response(500)  # a failing webhook must not be retried
            self.send_header("Content-Length", "0")
            self.end_headers()
    server = ThreadingHTTPServer(("127.0.0.1", 0), Hook)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    monkeypatch.setenv("ALERT_WEBHOOK_URL", f"http://127.0.0.1:{server.server_address[1]}/hook")

    async def go():
        first = alerts.send_crawl_alert(77, "https://x.test/", ["3 URL(s) dead-lettered after retries"])
        second = alerts.send_crawl_alert(77, "https://x.test/", ["crawl failed: boom"], error=True)
        nothing = alerts.send_crawl_alert(78, "https://x.test/", [])
        await asyncio.sleep(0.5)
        return first, second, nothing
    try:
        first, second, nothing = asyncio.run(go())
    finally:
        server.shutdown()
    assert (first, second, nothing) == (True, False, False)
    assert len(received) == 1
    import json
    payload = json.loads(received[0])
    assert payload["text"].startswith("[CRAWL-ALERT] crawl 77") and "dead-lettered" in payload["text"]


def test_alert_without_webhook_only_logs(monkeypatch, caplog):
    from app.services import alerts
    alerts.reset_alerts_for_tests()
    monkeypatch.delenv("ALERT_WEBHOOK_URL", raising=False)
    with caplog.at_level("WARNING", logger="crawler"):
        assert alerts.send_crawl_alert(90, "https://y.test/", ["circuit breaker open"], error=True)
    assert any("[CRAWL-ALERT]" in r.message and r.levelname == "ERROR" for r in caplog.records)


# ------------------------------------------------------------------ batched writes

def test_batched_page_save_keeps_images_attached_to_their_pages(flaky, monkeypatch):
    from sqlalchemy import select
    from app.core.database import AsyncSessionLocal
    from app.models.domain import Image

    home = ("<html><head><title>Home with images for the batch test</title></head><body><h1>H</h1>"
            "<img src='/a.png' alt='a'><img src='/b.png'><a href='/ok1'>x</a></body></html>")
    orig = FlakySite.do_GET

    def patched(self):
        if self.path == "/":
            return self._send(200, home)
        return orig(self)
    monkeypatch.setattr(FlakySite, "do_GET", patched)
    crawler, crawl, pages, _ = _crawl(flaky, monkeypatch, max_pages=5)

    async def imgs():
        async with AsyncSessionLocal() as db:
            return (await db.execute(select(Image).where(Image.crawl_id == crawl.id))).scalars().all()
    images = asyncio.run(imgs())
    assert len(images) == 2 and {i.page_id for i in images} == {pages["/"].id}
