"""AuditPro Helper integration: the batch/results relay endpoints (auth, ownership, validation, size limits, only
offered URLs), "Audit this tab" captures, and the crawler's bounded wait and processing path."""
import asyncio
import base64
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest
from sqlalchemy import select

from app.services import helper_exchange as hx
from conftest import auth, wait_for_crawl

CHALLENGE = "<html><head><title>Just a moment...</title></head><body>cf-chl</body></html>"
RESCUED = ("<html><head><title>Rescued pricing page from the helper</title></head><body><h1>Pricing</h1>"
           "<a href='/found-by-helper'>more</a></body></html>")


def _run(coro):
    return asyncio.run(coro)


async def _make_crawl(user: str, seed: str = "https://example.com/", status: str = "running", **summary):
    from app.core.auth import get_or_create_user_project
    from app.core.database import AsyncSessionLocal
    from app.models.domain import Crawl
    async with AsyncSessionLocal() as db:
        pid = await get_or_create_user_project(db, user)
        crawl = Crawl(project_id=pid, seed_url=seed, status=status, mode="site", summary=summary or {})
        db.add(crawl)
        await db.commit()
        return crawl.id


def _result(url, **kw):
    r = {"url": url, "final_url": url, "status": 200, "headers": {"content-type": "text/html; charset=utf-8"},
         "html_gzip_b64": hx.gzip_b64(RESCUED), "redirects": [], "timing_ms": 120, "attempts": 1,
         "outcome": "ok", "side": "site", "reason": None, "provider": None}
    r.update(kw)
    return r


@pytest.fixture()
def fresh_exchange():
    hx.set_exchange(hx.InMemoryHelperExchange())
    yield hx.get_exchange()
    hx.set_exchange(None)


# ------------------------------------------------------------------ pure helpers

def test_decode_html_limits_and_url_matching():
    assert hx.decode_html(hx.gzip_b64("<p>héllo</p>")) == "<p>héllo</p>"
    with pytest.raises(hx.HelperPayloadError):
        hx.decode_html("not base64!!")
    with pytest.raises(hx.HelperPayloadError):
        hx.decode_html(base64.b64encode(b"plain, not gzip").decode())
    bomb = hx.gzip_b64("a" * (hx.MAX_HELPER_PAGE_BYTES + 10))  # compresses to a few KB
    with pytest.raises(hx.HelperPayloadError, match="larger than 3 MB"):
        hx.decode_html(bomb)
    # the helper sends `new URL(u).href`; the server offered its own spelling
    assert hx.url_key("https://Example.com:443/a%20b") == hx.url_key("https://example.com/a b")
    assert hx.url_in_site("https://www.example.com/x", "https://example.com/")
    assert not hx.url_in_site("https://evil.com/x", "https://example.com/")
    assert not hx.url_in_site("javascript:alert(1)", "https://example.com/")
    assert hx.clean_headers({"Content-Type": "text/html", "Set-Cookie": "secret=1"}) == {"content-type": "text/html"}


# ------------------------------------------------------------------ endpoints

def test_batch_and_results_require_auth_and_ownership(client, fresh_exchange):
    cid = _run(_make_crawl("helper-owner"))
    assert client.get(f"/api/crawls/{cid}/helper/batch").status_code in (401, 403)
    assert client.post(f"/api/crawls/{cid}/helper/results", json={"batch_id": "x"}).status_code in (401, 403)
    other = auth("helper-intruder")
    assert client.get(f"/api/crawls/{cid}/helper/batch", headers=other).status_code == 404
    assert client.post(f"/api/crawls/{cid}/helper/results", headers=other, json={"batch_id": f"{cid}-1"}).status_code == 404
    assert client.post(f"/api/crawls/{cid}/helper/capture", headers=other,
                       json={"url": "https://example.com/", "html_gzip_b64": hx.gzip_b64("<p>x</p>")}).status_code == 404


def test_only_offered_urls_are_accepted_once(client, fresh_exchange):
    me = auth("helper-user-1")
    cid = _run(_make_crawl("helper-user-1"))
    # no batch yet: nothing to do, and the poll with a version is the heartbeat
    body = client.get(f"/api/crawls/{cid}/helper/batch", params={"helper_version": "0.1.0"}, headers=me).json()
    assert body["batch"] is None
    assert hx.presence_fresh(_run(fresh_exchange.presence(cid)))

    offered = ["https://example.com/pricing", "https://example.com/a b"]
    _run(fresh_exchange.open_batch(cid, {"batch_id": f"{cid}-1", "site": "https://example.com", "urls": offered,
                                         "total": 2}))
    batch = client.get(f"/api/crawls/{cid}/helper/batch", headers=me).json()["batch"]
    assert batch["batch_id"] == f"{cid}-1" and set(batch["urls"]) == set(offered)

    post = lambda payload: client.post(f"/api/crawls/{cid}/helper/results", headers=me, json=payload)
    r = post({"batch_id": f"{cid}-1", "state": "running", "results": [
        _result("https://example.com/pricing"),
        _result("https://example.com/not-offered"),
        _result("https://evil.com/pricing"),
        _result("https://example.com/a%20b", html_gzip_b64="@@@"),  # offered, but the payload is broken
    ]})
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["accepted"] == 1 and out["remaining"] == 1
    reasons = {x["url"]: x["reason"] for x in out["rejected"]}
    assert "not requested" in reasons["https://example.com/not-offered"]
    assert "site" in reasons["https://evil.com/pricing"]
    assert "base64" in reasons["https://example.com/a%20b"]
    results = _run(fresh_exchange.drain_results(cid))
    assert [x["url"] for x in results] == ["https://example.com/pricing"]
    assert results[0]["html"] == RESCUED and results[0]["headers"] == {"content-type": "text/html; charset=utf-8"}

    # the same URL twice: refused; the poll no longer lists it
    again = post({"batch_id": f"{cid}-1", "results": [_result("https://example.com/pricing")]}).json()
    assert again["accepted"] == 0 and "already answered" in again["rejected"][0]["reason"]
    assert client.get(f"/api/crawls/{cid}/helper/batch", headers=me).json()["batch"]["urls"] == ["https://example.com/a b"]
    # the helper's href spelling of an offered URL matches
    assert post({"batch_id": f"{cid}-1", "results": [_result("https://example.com/a%20b")]}).json()["accepted"] == 1

    # wrong or closed batch
    assert post({"batch_id": f"{cid}-9", "results": []}).status_code == 409
    _run(fresh_exchange.close_batch(cid))
    assert post({"batch_id": f"{cid}-1", "results": [_result("https://example.com/pricing")]}).status_code == 409


def test_results_validation_and_size_limits(client, fresh_exchange, monkeypatch):
    me = auth("helper-user-2")
    cid = _run(_make_crawl("helper-user-2"))
    _run(fresh_exchange.open_batch(cid, {"batch_id": f"{cid}-1", "urls": ["https://example.com/big", "https://example.com/r"]}))
    post = lambda payload, **kw: client.post(f"/api/crawls/{cid}/helper/results", headers=me, json=payload, **kw)

    # a page that decodes to more than 3 MB is refused (and stays unanswered)
    big = post({"batch_id": f"{cid}-1", "results": [_result("https://example.com/big", html_gzip_b64=hx.gzip_b64("x" * (3 * 1024 * 1024 + 1)))]}).json()
    assert big["accepted"] == 0 and "larger than 3 MB" in big["rejected"][0]["reason"]
    # schema: unknown outcome, too many results, bad state
    assert post({"batch_id": f"{cid}-1", "results": [_result("https://example.com/big", outcome="hacked")]}).status_code == 422
    assert post({"batch_id": f"{cid}-1", "results": [_result("https://example.com/big")] * (hx.MAX_RESULTS_PER_POST + 1)}).status_code == 422
    assert post({"batch_id": f"{cid}-1", "state": "whatever"}).status_code == 422
    # a request body over the cap is cut off before decoding
    monkeypatch.setattr(hx, "MAX_RESULTS_BODY_BYTES", 2000)
    assert post({"batch_id": f"{cid}-1", "results": [_result("https://example.com/big", reason="x" * 400)] * 5}).status_code == 413
    monkeypatch.undo()
    # a redirect off the site keeps the hop but never another site's HTML
    ok = post({"batch_id": f"{cid}-1", "results": [_result("https://example.com/r", final_url="https://other.com/landing")]}).json()
    assert ok["accepted"] == 1
    res = _run(fresh_exchange.drain_results(cid))[0]
    assert res["final_url"] == "https://other.com/landing" and res["html"] is None
    # progress/state are recorded as activity for the crawler's idle timer
    assert post({"batch_id": f"{cid}-1", "state": "needs_verification", "progress": {"done": 3, "evil": "x"}}).status_code == 200
    act = _run(fresh_exchange.activity(cid))
    assert act["state"] == "needs_verification" and act["progress"] == {"done": 3}


def test_results_refused_when_the_crawl_is_not_running(client, fresh_exchange):
    me = auth("helper-user-3")
    cid = _run(_make_crawl("helper-user-3", status="completed"))
    _run(fresh_exchange.open_batch(cid, {"batch_id": f"{cid}-1", "urls": ["https://example.com/p"]}))
    assert client.post(f"/api/crawls/{cid}/helper/results", headers=me,
                       json={"batch_id": f"{cid}-1", "results": [_result("https://example.com/p")]}).status_code == 409
    body = client.get(f"/api/crawls/{cid}/helper/batch", params={"helper_version": "0.1.0"}, headers=me).json()
    assert body["batch"] is None and _run(fresh_exchange.presence(cid)) is None  # no heartbeat for a finished crawl


def test_capture_is_added_to_a_running_crawl_of_the_same_site_only(client, fresh_exchange):
    me = auth("helper-user-4")
    cid = _run(_make_crawl("helper-user-4"))
    cap = {"url": "https://example.com/pricing#plans", "title": "Pricing", "html_gzip_b64": hx.gzip_b64(RESCUED)}
    assert client.post(f"/api/crawls/{cid}/helper/capture", headers=me, json={**cap, "url": "https://evil.com/"}).status_code == 400
    assert client.post(f"/api/crawls/{cid}/helper/capture", headers=me, json={**cap, "html_gzip_b64": "!!"}).status_code == 400
    r = client.post(f"/api/crawls/{cid}/helper/capture", headers=me, json=cap)
    assert r.status_code == 200 and r.json()["queued"]
    caps = _run(fresh_exchange.drain_captures(cid))
    assert caps[0]["url"] == "https://example.com/pricing" and caps[0]["html"] == RESCUED
    done = _run(_make_crawl("helper-user-4", status="completed"))
    assert client.post(f"/api/crawls/{done}/helper/capture", headers=me, json=cap).status_code == 409


def test_helper_download_is_for_signed_in_users(client):
    assert client.get("/api/helper/download").status_code in (401, 403)
    info = client.get("/api/helper/info", headers=auth("helper-dl")).json()
    if not info["available"]:
        pytest.skip("no helper zip in this checkout")
    r = client.get("/api/helper/download", headers=auth("helper-dl"))
    assert r.status_code == 200 and r.content[:2] == b"PK" and info["filename"].endswith(".zip")


# ------------------------------------------------------------------ crawler: bounded wait and processing path

class BlockedSite(BaseHTTPRequestHandler):
    hits = {}

    def log_message(self, *a):
        pass

    def _send(self, code, body):
        data = body.encode()
        self.send_response(code)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        self.hits[self.path] = self.hits.get(self.path, 0) + 1
        if self.path == "/robots.txt":
            return self._send(404, "")
        if self.path == "/":
            return self._send(200, "<html><head><title>Home page of the helper fixture</title></head><body>"
                                   "<a href='/pricing'>pricing</a> <a href='/about'>about</a></body></html>")
        if self.path in ("/about", "/found-by-helper"):
            return self._send(200, f"<html><head><title>Server page {self.path}</title></head><body>ok</body></html>")
        if self.path == "/pricing":
            return self._send(403, CHALLENGE)
        return self._send(404, "<html></html>")


@pytest.fixture()
def blocked_site(client, monkeypatch, fresh_exchange):
    from app.core import url_safety
    from app.services import crawler as crawler_mod
    from app.services import robots as robots_mod
    monkeypatch.setattr(url_safety, "_ALLOW_PRIVATE", True)
    monkeypatch.setattr(crawler_mod, "RETRY_GAPS", (0.1, 0.2))
    monkeypatch.setattr(crawler_mod, "HELPER_POLL_S", 0.05)
    monkeypatch.setattr(crawler_mod, "send_crawl_alert", lambda *a, **k: None)
    robots_mod.robots_service._parsers.clear()
    BlockedSite.hits = {}
    server = ThreadingHTTPServer(("127.0.0.1", 0), BlockedSite)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{server.server_address[1]}"
    server.shutdown()


def _start(client, origin, user):
    r = client.post("/api/crawls", headers=auth(user), json={"seed_url": f"{origin}/", "max_pages": 20, "max_depth": 3})
    assert r.status_code == 200, r.text
    return r.json()["id"]


def _pages(crawl_id):
    async def go():
        from app.core.database import AsyncSessionLocal
        from app.models.domain import Crawl, Page
        async with AsyncSessionLocal() as db:
            rows = (await db.execute(select(Page).where(Page.crawl_id == crawl_id))).scalars().all()
            crawl = await db.get(Crawl, crawl_id)
            return crawl, {urlpath(p.url): p for p in rows}
    return _run(go())


def urlpath(u):
    from urllib.parse import urlparse
    return urlparse(u).path or "/"


def _relay(client, crawl_id, user, answer, stop_after_batch=False, timeout=20.0):
    """Play the dashboard: poll with the helper's version, answer each batch with `answer(url)`."""
    me = auth(user)
    deadline = time.time() + timeout
    seen = []
    while time.time() < deadline:
        body = client.get(f"/api/crawls/{crawl_id}/helper/batch", params={"helper_version": "0.1.0"}, headers=me).json()
        if body["crawl_status"] != "running":
            return seen
        batch = body["batch"]
        if batch and batch["urls"]:
            seen.append(batch)
            if stop_after_batch:
                return seen  # the tab closes: no more polls, no answers
            results = [answer(u) for u in batch["urls"]]
            r = client.post(f"/api/crawls/{crawl_id}/helper/results", headers=me,
                            json={"batch_id": batch["batch_id"], "state": "running", "results": [x for x in results if x]})
            assert r.status_code in (200, 409), r.text
        time.sleep(0.05)
    return seen


def test_helper_rescues_blocked_pages_through_the_normal_analysis_path(client, blocked_site):
    user = "helper-e2e-1"
    cid = _start(client, blocked_site, user)
    seen = _relay(client, cid, user, lambda u: _result(u) if u.endswith("/pricing") else None)
    # only what the server could not fetch is offered
    assert seen and all(u.endswith("/pricing") for b in seen for u in b["urls"])
    assert wait_for_crawl(client, cid, auth(user))["status"] == "completed"
    crawl, pages = _pages(cid)

    fetch = pages["/pricing"].audit_data["Fetch"]
    assert fetch["outcome"] == "ok" and fetch["via"] == "helper" and fetch["server_attempts"] == 3
    assert pages["/pricing"].status_code == 200 and "Rescued pricing page" in pages["/pricing"].title_1
    # the rescued page's links were followed by the server as usual
    assert "/found-by-helper" in pages and "via" not in pages["/found-by-helper"].audit_data["Fetch"]
    assert BlockedSite.hits["/pricing"] == 3  # the server's own 1 + 2 retries, nothing more
    assert crawl.summary["helper"]["rescued"] == 1 and crawl.summary["helper"]["offered"] == 1
    assert not any(f["url"].endswith("/pricing") for f in crawl.summary.get("failed_urls", []))
    assert "blocked" not in crawl.summary


def test_no_helper_means_no_wait_and_server_outcomes(client, blocked_site):
    user = "helper-e2e-2"
    started = time.time()
    cid = _start(client, blocked_site, user)
    assert wait_for_crawl(client, cid, auth(user))["status"] == "completed"
    assert time.time() - started < 15
    crawl, pages = _pages(cid)
    fetch = pages["/pricing"].audit_data["Fetch"]
    assert fetch["outcome"] == "blocked" and "via" not in fetch
    assert "helper" not in crawl.summary
    assert any(f["url"].endswith("/pricing") for f in crawl.summary["failed_urls"])


def test_helper_disconnect_ends_the_wait_and_keeps_server_outcome(client, blocked_site, monkeypatch):
    monkeypatch.setattr(hx, "HELPER_PRESENCE_S", 0.5)
    monkeypatch.setattr(hx, "HELPER_IDLE_S", 30.0)
    user = "helper-e2e-3"
    cid = _start(client, blocked_site, user)
    seen = _relay(client, cid, user, lambda u: None, stop_after_batch=True)
    assert seen, "the crawler should have offered the blocked page"
    t0 = time.time()
    assert wait_for_crawl(client, cid, auth(user))["status"] == "completed"
    assert time.time() - t0 < 10, "a vanished helper must not hold the crawl"
    crawl, pages = _pages(cid)
    assert pages["/pricing"].audit_data["Fetch"]["outcome"] == "blocked"
    assert crawl.summary["helper"]["offered"] == 1 and crawl.summary["helper"]["rescued"] == 0


def test_silent_helper_times_out_and_a_failed_helper_attempt_is_noted(client, blocked_site, monkeypatch):
    monkeypatch.setattr(hx, "HELPER_IDLE_S", 0.6)
    user = "helper-e2e-4"
    cid = _start(client, blocked_site, user)
    t0 = time.time()
    # keeps polling (connected) but never answers: the idle limit ends the wait
    _relay(client, cid, user, lambda u: None, timeout=8.0)
    assert wait_for_crawl(client, cid, auth(user))["status"] == "completed"
    assert time.time() - t0 < 12
    assert _pages(cid)[1]["/pricing"].audit_data["Fetch"]["outcome"] == "blocked"

    user = "helper-e2e-5"
    cid = _start(client, blocked_site, user)
    _relay(client, cid, user, lambda u: _result(u, outcome="blocked", side="blocked", status=403, html_gzip_b64=None,
                                                 attempts=3, reason="Blocked by bot protection", provider="cloudflare"))
    assert wait_for_crawl(client, cid, auth(user))["status"] == "completed"
    fetch = _pages(cid)[1]["/pricing"].audit_data["Fetch"]
    assert fetch["outcome"] == "blocked" and fetch["helper"]["outcome"] == "blocked" and "via" not in fetch


def test_a_challenge_page_sent_as_ok_is_not_analysed(client, blocked_site):
    user = "helper-e2e-6"
    cid = _start(client, blocked_site, user)
    _relay(client, cid, user, lambda u: _result(u, status=403, outcome="site_error", html_gzip_b64=hx.gzip_b64(CHALLENGE)))
    assert wait_for_crawl(client, cid, auth(user))["status"] == "completed"
    fetch = _pages(cid)[1]["/pricing"].audit_data["Fetch"]
    assert fetch["outcome"] == "blocked" and fetch["helper"]["outcome"] == "blocked"


def test_audit_this_tab_starts_a_single_page_audit_from_the_capture(client, blocked_site):
    user = "helper-e2e-7"
    cap = {"url": f"{blocked_site}/pricing", "title": "Pricing", "html_gzip_b64": hx.gzip_b64(RESCUED)}
    r = client.post("/api/helper/capture-audit", headers=auth(user), json=cap)
    assert r.status_code == 200, r.text
    cid = r.json()["id"]
    assert wait_for_crawl(client, cid, auth(user))["status"] == "completed"
    crawl, pages = _pages(cid)
    fetch = pages["/pricing"].audit_data["Fetch"]
    assert fetch["via"] == "tab_capture" and fetch["outcome"] == "ok" and "browser" in fetch["note"]
    assert "Rescued pricing page" in pages["/pricing"].title_1
    assert BlockedSite.hits.get("/pricing", 0) == 0  # never fetched by the server
    assert crawl.mode == "page"


# ------------------------------------------------------------------ exchange backends share one contract

class FakeRedis:
    """The handful of Redis commands RedisHelperExchange uses (decode_responses=True semantics)."""

    def __init__(self):
        self.kv, self.h, self.s, self.l = {}, {}, {}, {}

    async def set(self, k, v, ex=None):
        self.kv[k] = v

    async def get(self, k):
        return self.kv.get(k)

    async def delete(self, k):
        for d in (self.kv, self.h, self.s, self.l):
            d.pop(k, None)

    async def expire(self, k, s):
        return True

    async def hset(self, k, mapping):
        self.h.setdefault(k, {}).update(mapping)

    async def hget(self, k, f):
        return self.h.get(k, {}).get(f)

    async def hgetall(self, k):
        return dict(self.h.get(k, {}))

    async def sadd(self, k, v):
        st = self.s.setdefault(k, set())
        added = v not in st
        st.add(v)
        return int(added)

    async def smembers(self, k):
        return set(self.s.get(k, set()))

    async def rpush(self, k, *vals):
        self.l.setdefault(k, []).extend(vals)

    async def lpop(self, k):
        lst = self.l.get(k) or []
        return lst.pop(0) if lst else None

    async def ltrim(self, k, a, b):
        self.l[k] = self.l.get(k, [])[a:] if b == -1 else self.l.get(k, [])[a:b + 1]


@pytest.mark.parametrize("make", [hx.InMemoryHelperExchange, lambda: hx.RedisHelperExchange(FakeRedis())])
def test_exchange_backends_contract(make):
    ex = make()

    async def go():
        await ex.touch_presence(7, {"version": "0.1.0"})
        assert hx.presence_fresh(await ex.presence(7))
        await ex.open_batch(7, {"batch_id": "7-1", "urls": ["https://e.com/a", "https://e.com/b"], "total": 2})
        assert sorted((await ex.get_batch(7))["urls"]) == ["https://e.com/a", "https://e.com/b"]
        assert await ex.claim(7, "7-1", hx.url_key("https://e.com/a")) == "https://e.com/a"
        assert await ex.claim(7, "7-1", hx.url_key("https://e.com/a")) is None   # once only
        assert await ex.claim(7, "7-2", hx.url_key("https://e.com/b")) is None   # wrong batch
        assert await ex.claim(7, "7-1", hx.url_key("https://e.com/zzz")) is None  # never offered
        await ex.push_results(7, [{"url": "https://e.com/a"}])
        assert await ex.drain_results(7) == [{"url": "https://e.com/a"}] and await ex.drain_results(7) == []
        await ex.note_activity(7, "needs_verification", {"done": 1})
        await ex.note_activity(7, None)
        assert (await ex.activity(7))["state"] == "needs_verification"
        for i in range(7):
            await ex.push_capture(7, {"url": f"https://e.com/{i}"})
        assert [c["url"] for c in await ex.drain_captures(7)] == [f"https://e.com/{i}" for i in range(2, 7)]
        await ex.close_batch(7)
        assert await ex.get_batch(7) is None and await ex.claim(7, "7-1", hx.url_key("https://e.com/b")) is None
        await ex.clear(7)
        assert await ex.presence(7) is None
    _run(go())


def test_a_broken_exchange_never_breaks_a_crawl():
    class Broken(hx.InMemoryHelperExchange):
        async def presence(self, crawl_id):
            raise ConnectionError("redis down")

        async def drain_results(self, crawl_id):
            raise ConnectionError("redis down")
    hx.set_exchange(Broken())
    try:
        ex = hx.get_exchange()
        assert _run(ex.presence(1)) is None and _run(ex.drain_results(1)) == []
    finally:
        hx.set_exchange(None)
