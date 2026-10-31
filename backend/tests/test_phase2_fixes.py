"""Fixes to the reliability work: no false bot-challenge detection on normal pages, and our own DNS failures
are never blamed on the site."""
import asyncio

from app.services.crawler import CrawlerService, QueueItem
from app.services.fetch_outcome import (
    Failure, OUTCOME_OURS, OUTCOME_SITE, SIDE_OURS, SIDE_SITE, detect_bot_challenge,
)


def test_article_mentioning_bot_vendors_is_not_a_challenge():
    body = ("<html><head><title>How DataDome and PerimeterX stop bots</title></head><body>"
            "<p>Access denied pages and captcha flows explained.</p></body></html>")
    assert detect_bot_challenge(200, {}, body) is None


def test_cloudflare_challenge_on_200_is_still_detected():
    body = "<html><head><title>Just a moment...</title></head><body><script>window._cf_chl_opt={}</script></body></html>"
    assert detect_bot_challenge(200, {}, body) == "Cloudflare"


def test_vendor_markers_count_on_challenge_statuses():
    assert detect_bot_challenge(403, {}, "<html>geo.captcha-delivery.com</html>") == "DataDome"


def _crawler():
    c = CrawlerService.__new__(CrawlerService)
    CrawlerService.__init__(c, crawl_id=1, seed_url="https://example.com/", db_session=None)
    return c


def test_dns_not_found_after_site_answered_is_our_problem():
    c = _crawler()
    c._on_attempt_ok()  # the site answered once
    item = QueueItem("https://example.com/about", 1)
    nx = Failure("Domain does not exist (DNS lookup failed)", False, OUTCOME_SITE, SIDE_SITE)
    asyncio.run(c._on_failure(item, nx))
    assert item in c.parked  # retried, not final
    assert item.last_failure.side == SIDE_OURS and item.last_failure.outcome == OUTCOME_OURS


def test_dns_not_found_before_any_answer_is_the_site():
    c = _crawler()
    item = QueueItem("https://example.com/", 0)
    nx = Failure("Domain does not exist (DNS lookup failed)", False, OUTCOME_SITE, SIDE_SITE)
    saved = []

    async def fake_finalize(it, failure):
        saved.append(failure)

    c._finalize_failure = fake_finalize
    asyncio.run(c._on_failure(item, nx))
    assert saved and saved[0].side == SIDE_SITE and item not in c.parked


def test_single_5xx_does_not_throttle_but_frequent_5xx_does():
    c = _crawler()
    one = Failure("Server error (HTTP 503)", True, OUTCOME_SITE, SIDE_SITE, status_code=503, kind="status")
    assert c._is_load_signal(one) is False
    for _ in range(3):
        c._is_load_signal(one)
    assert c._is_load_signal(one) is True  # 5 of the last 20 answers were 5xx


def test_rate_limit_always_throttles():
    c = _crawler()
    rl = Failure("Rate limited by the server (HTTP 429)", True, status_code=429, kind="status")
    assert c._is_load_signal(rl) is True


def test_breaker_ignores_failures_in_retry_passes():
    c = _crawler()
    c.in_retry_pass = True
    timeout = Failure("Request timed out", True)
    for i in range(15):
        asyncio.run(c._on_failure(QueueItem(f"https://example.com/p{i}", 1), timeout))
    assert not c.breaker.tripped


def test_retry_pass_drops_built_up_delay():
    from app.services.politeness import AdaptiveLimiter
    now = [100.0]
    lim = AdaptiveLimiter(start=10, ceiling=10, clock=lambda: now[0])
    lim.on_throttle(retry_after=30)
    assert lim.extra_delay > 0
    lim.start_retry_pass()
    assert lim.extra_delay == 0 and lim._pause_until <= now[0] + 10
