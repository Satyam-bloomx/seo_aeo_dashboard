"""End-to-end crawl of a local fixture site: link graph, redirects, sitemaps, structured data, directives."""
import asyncio
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest

PAGES = {
    "/": ("<html><head><title>Home page of the fixture site</title>"
          '<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"X"}</script>'
          "</head><body><h1>Home</h1><a href='/about/'>About</a> <a href='/old'>Old</a> "
          "<a href='/missing'>Missing</a> <a href='/chain'>Chain</a> <a href='/about'>About again</a></body></html>"),
    "/about/": ("<html><head><title>About the fixture site company</title>"
                '<script type="application/ld+json">{not valid json</script>'
                "</head><body><h1>About</h1><a href='/'>Home</a></body></html>"),
    "/private/": ("<html><head><title>Private area of the fixture</title></head>"
                  "<body><h1>Private</h1></body></html>"),
}
SITEMAP = None  # filled with the server origin at startup


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_GET(self):
        if self.path == "/robots.txt":
            body = f"User-agent: *\nAllow: /\nSitemap: {SITEMAP}\n".encode()
            return self._send(200, body, "text/plain")
        if self.path == "/sitemap.xml":
            origin = SITEMAP.rsplit("/", 1)[0]
            body = (
                '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
                f"<url><loc>{origin}/</loc></url><url><loc>{origin}/about/</loc></url>"
                f"<url><loc>{origin}/orphan-only-in-sitemap/</loc></url></urlset>"
            ).encode()
            return self._send(200, body, "application/xml")
        if self.path == "/chain":
            self.send_response(302)
            self.send_header("Location", "/old")
            self.end_headers()
            return
        if self.path == "/old":
            self.send_response(301)
            self.send_header("Location", "/about/")
            self.end_headers()
            return
        if self.path in PAGES:
            extra = {"X-Robots-Tag": "noindex"} if self.path == "/private/" else {}
            return self._send(200, PAGES[self.path].encode(), "text/html; charset=utf-8", extra)
        return self._send(404, b"<html><head><title>Not found</title></head><body>404</body></html>", "text/html")

    def _send(self, code, body, ctype, extra=None):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


@pytest.fixture(scope="module")
def fixture_site():
    global SITEMAP
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    origin = f"http://127.0.0.1:{server.server_address[1]}"
    SITEMAP = f"{origin}/sitemap.xml"
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield origin
    server.shutdown()


def test_full_crawl_pipeline(client, fixture_site, monkeypatch):  # client fixture creates the schema
    from app.core import url_safety
    monkeypatch.setattr(url_safety, "_ALLOW_PRIVATE", True)  # fixture runs on localhost
    from app.services import robots as robots_mod
    robots_mod.robots_service._parsers.clear()

    from sqlalchemy import select
    from app.core.database import AsyncSessionLocal
    from app.core.auth import get_or_create_user_project
    from app.models.domain import Crawl, Page
    from app.services.crawler import CrawlerService

    async def go():
        async with AsyncSessionLocal() as db:
            pid = await get_or_create_user_project(db, "pipeline-user")
            crawl = Crawl(project_id=pid, seed_url=f"{fixture_site}/", status="running")
            db.add(crawl)
            await db.commit()
            crawler = CrawlerService(crawl_id=crawl.id, seed_url=f"{fixture_site}/", db_session=db,
                                     max_depth=5, max_pages=50, max_concurrent=2, ignore_url_params=False)
            await crawler.run()
            pages = (await db.execute(select(Page).where(Page.crawl_id == crawl.id))).scalars().all()
            await db.refresh(crawl)
            return crawl, {p.url.replace(fixture_site, ""): p for p in pages}

    crawl, pages = asyncio.run(go())
    assert crawl.status == "completed"

    home, about = pages["/"], pages["/about/"]
    assert home.status_code == 200 and about.status_code == 200
    assert pages["/missing"].status_code == 404
    old = pages["/old"]
    assert old.status_code == 301
    assert old.audit_data["Response_Codes"]["Redirect URL"].endswith("/about/")
    assert old.audit_data["Response_Codes"]["Redirect Hops"] == 1
    chain = pages["/chain"].audit_data["Response_Codes"]
    assert chain["Redirect Hops"] == 2 and chain["Redirect Chain (2+ Hops)"] is True
    assert [h["status"] for h in chain["Redirect Chain"]] == [302, 301]
    assert chain["Temporary Redirect (302/307)"] is True

    # Link graph: /about/ is linked from home (twice, once without slash) -> inlinks counted on the real page.
    assert about.audit_data["Links"]["Inlinks"] >= 1
    assert home.audit_data["Links"]["Internal Links To Broken Pages"] is True
    assert home.audit_data["Links"]["Internal Links To Redirects"] is True

    # Structured data
    assert home.audit_data["Structured_Data"]["Schema_Types"] == ["Organization"]
    assert about.audit_data["Structured_Data"]["Invalid JSON-LD"] is True

    # Sitemap discovered via robots.txt; the sitemap-only URL is an orphan candidate on the crawl summary.
    sm = crawl.summary["sitemap"]
    assert sm["found"] is True and sm["url_count"] == 3
    assert any(u.endswith("/orphan-only-in-sitemap/") for u in sm["not_linked_sample"])
    assert home.audit_data["Sitemaps"]["URLs In Sitemap"] is True

    # AI crawler access is read from the same robots.txt (fixture allows everything); no llms.txt exists.
    ai = crawl.summary["ai_crawlers"]
    assert ai["status"] == "ok" and ai["search_bots_allowed"] is True
    assert {a["agent"] for a in ai["agents"]} >= {"GPTBot", "ClaudeBot", "PerplexityBot", "Google-Extended"}
    assert ai["llms_txt"]["present"] is False


def test_x_robots_tag_noindex_is_detected(fixture_site, monkeypatch):
    from app.core import url_safety
    monkeypatch.setattr(url_safety, "_ALLOW_PRIVATE", True)
    import httpx
    from app.services.extractor import extract_seo_metrics

    r = httpx.get(f"{fixture_site}/private/")
    m = extract_seo_metrics(r.text, f"{fixture_site}/private/", headers=dict(r.headers))
    assert m["dir_noindex"] is True


def test_single_page_mode_audits_one_url_and_replaces_site_crawl(client, fixture_site, monkeypatch):
    from conftest import auth, wait_for_crawl
    from app.core import url_safety
    monkeypatch.setattr(url_safety, "_ALLOW_PRIVATE", True)
    h = auth("mode-user")

    site = client.post("/api/crawls", json={"seed_url": f"{fixture_site}/", "max_pages": 20}, headers=h).json()
    assert site["status"] == "queued"  # crawls start queued and run when a slot is free
    wait_for_crawl(client, site["id"], h)
    page = client.post("/api/crawls", json={"seed_url": f"{fixture_site}/old", "mode": "page"}, headers=h).json()
    assert site["mode"] == "site" and page["mode"] == "page"
    assert wait_for_crawl(client, page["id"], h)["status"] in ("completed", "gone")
    # One stored crawl per account: the completed single-page audit replaced the site crawl.
    assert client.get("/api/crawls/latest?mode=site", headers=h).status_code == 404
    latest_page = client.get("/api/crawls/latest?mode=page", headers=h).json()
    assert latest_page["id"] == page["id"]
    assert client.get(f"/api/crawls/{site['id']}/status", headers=h).status_code == 404

    pages = client.get(f"/api/crawls/{page['id']}/pages", headers=h).json()
    urls = sorted(p["url"].replace(fixture_site, "") for p in pages)
    assert urls == ["/about/", "/old"], urls  # redirect recorded and its target audited, nothing else

    summary = client.get(f"/api/crawls/{page['id']}/summary", headers=h).json()
    assert summary["mode"] == "page" and summary["page_score"] is not None
    dup = next(r for r in summary["rules"] if r["id"] == "Page Titles: Duplicate")
    assert dup["status"] == "not_evaluated" and dup["reason"] == "site_only"
    assert summary["crawl"]["sitemap"] is None or summary["crawl"]["sitemap"]["found"] is False
