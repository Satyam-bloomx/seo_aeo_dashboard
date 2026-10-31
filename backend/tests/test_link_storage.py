"""Links live on the page rows (JSON), one stored crawl per account, and the AI summary is stored with the crawl."""
import asyncio
import json
from datetime import datetime

from sqlalchemy import func, select

from test_crawl_pipeline import fixture_site  # noqa: F401  (pytest fixture: local fixture website)


def _run(coro):
    return asyncio.run(coro)


def test_crawl_stores_links_on_pages_not_rows(client, fixture_site, monkeypatch):
    from conftest import auth, wait_for_crawl
    from app.core import url_safety
    from app.core.database import AsyncSessionLocal
    from app.models.domain import Link, Page
    monkeypatch.setattr(url_safety, "_ALLOW_PRIVATE", True)
    h = auth("link-storage-user")

    crawl = client.post("/api/crawls", json={"seed_url": f"{fixture_site}/", "max_pages": 20}, headers=h).json()
    wait_for_crawl(client, crawl["id"], h)
    pages = client.get(f"/api/crawls/{crawl['id']}/pages", headers=h).json()
    by_url = {p["url"].replace(fixture_site, ""): p for p in pages}

    # The heavy columns never travel with the page list.
    assert all("outlinks" not in p and "inlinks_sample" not in p for p in pages)

    async def stored():
        async with AsyncSessionLocal() as db:
            n_links = await db.scalar(select(func.count(Link.id)).where(Link.crawl_id == crawl["id"]))
            home = (await db.execute(select(Page.outlinks).where(Page.id == by_url["/"]["id"]))).scalar()
            return n_links, home
    n_links, home_out = _run(stored())
    assert n_links == 0, "no Link rows are written any more"
    dests = {r["u"].replace(fixture_site, "") for r in home_out}
    assert {"/about/", "/old", "/missing", "/chain"} <= dests

    out = client.get(f"/api/pages/{by_url['/']['id']}/outlinks", headers=h).json()
    assert {l["destination_url"].replace(fixture_site, "") for l in out} >= {"/about/", "/old"}
    assert all(l["source_url"] == by_url["/"]["url"] and l["is_internal"] and l["is_follow"] for l in out)

    inl = client.get(f"/api/pages/{by_url['/about/']['id']}/inlinks", headers=h).json()
    assert by_url["/"]["url"] in {l["source_url"] for l in inl}
    assert all(l["destination_url"] == by_url["/about/"]["url"] for l in inl)
    assert by_url["/about/"]["audit_data"]["Links"]["Inlinks"] >= len(inl) >= 1


def test_post_processor_counts_from_outlink_lists_and_caps_inlink_sample(client, monkeypatch):
    from app.core.auth import get_or_create_user_project
    from app.core.database import AsyncSessionLocal
    from app.models.domain import Crawl, Page
    from app.services import ai_crawlers
    from app.services.link_store import INLINK_SAMPLE_CAP, compact_outlink
    from app.services.post_processor import PostProcessor

    async def no_ai(_seed):
        return {"status": "ok", "agents": []}
    monkeypatch.setattr(ai_crawlers, "check_ai_crawler_access", no_ai)
    n_sources = INLINK_SAMPLE_CAP + 50

    async def go():
        async with AsyncSessionLocal() as db:
            pid = await get_or_create_user_project(db, "pp-user")
            crawl = Crawl(project_id=pid, seed_url="https://pp.test/", status="running", mode="page")
            db.add(crawl)
            await db.flush()
            hub = Page(crawl_id=crawl.id, url="https://pp.test/hub/", status_code=200, audit_data={})
            gone = Page(crawl_id=crawl.id, url="https://pp.test/gone", status_code=404, audit_data={})
            db.add_all([hub, gone])
            for i in range(n_sources):
                outs = [compact_outlink("https://pp.test/hub/", f"hub {i}", True, "A", True),
                        compact_outlink("https://other.test/x", "ext", True, "A", False),
                        compact_outlink("https://pp.test/canon/", "Canonical Tag", True, "CANONICAL", True)]
                if i == 0:
                    outs.append(compact_outlink("https://pp.test/gone", "dead", False, "A", True))
                db.add(Page(crawl_id=crawl.id, url=f"https://pp.test/s{i}/", status_code=200, audit_data={}, outlinks=outs))
            await db.commit()
            await PostProcessor(crawl.id, db, mode="page").run()
            rows = (await db.execute(select(Page).where(Page.crawl_id == crawl.id))).scalars().all()
            hub_sample = (await db.execute(select(Page.inlinks_sample).where(Page.id == hub.id))).scalar()
            return {p.url: p for p in rows}, hub_sample

    pages, hub_sample = _run(go())
    hub = pages["https://pp.test/hub/"]
    assert hub.audit_data["Links"]["Inlinks"] == n_sources
    assert len(hub_sample) == INLINK_SAMPLE_CAP and all("p" in r and "u" not in r for r in hub_sample)
    first = pages["https://pp.test/s0/"]
    assert first.audit_data["Links"]["Outlinks"] == 3  # hub + external + dead; canonical is not a navigational link
    assert first.audit_data["Links"]["Internal Links To Broken Pages"] is True
    assert pages["https://pp.test/s1/"].audit_data["Links"]["Internal Links To Broken Pages"] is False
    assert pages["https://pp.test/gone"].audit_data["Links"]["Inlinks"] == 1
    assert hub.audit_data["Links"]["Link_Score"] > pages["https://pp.test/s1/"].audit_data["Links"]["Link_Score"]


def test_compact_link_json_stays_small_for_500_pages():
    """~60 links per page for 500 pages (60,000 link rows before: ~110 MB incl. indexes)."""
    from app.services.link_store import compact_inlink, compact_outlink
    total = 0
    for p in range(500):
        outs = [compact_outlink(f"https://example.com/category/product-{(p * 7 + i) % 500}/", f"Product {i}", True, "A", True)
                for i in range(60)]
        ins = [compact_inlink(1000 + i, f"Anchor {i}", True) for i in range(40)]
        total += len(json.dumps(outs, separators=(",", ":"))) + len(json.dumps(ins, separators=(",", ":")))
    assert total < 6_000_000, total  # raw JSON, before PostgreSQL TOAST compression


def test_replace_previous_crawls_only_after_success(client):
    from app.api.endpoints import replace_previous_crawls
    from app.core.auth import get_or_create_user_project
    from app.core.database import AsyncSessionLocal
    from app.models.domain import Crawl, Image, Link, Page

    async def go():
        async with AsyncSessionLocal() as db:
            pid = await get_or_create_user_project(db, "replace-user")
            other_pid = await get_or_create_user_project(db, "replace-other-user")
            old = Crawl(project_id=pid, seed_url="https://old.test/", status="completed", mode="site")
            old_page_mode = Crawl(project_id=pid, seed_url="https://old.test/p", status="completed", mode="page")
            running = Crawl(project_id=pid, seed_url="https://run.test/", status="running")
            new = Crawl(project_id=pid, seed_url="https://new.test/", status="completed")
            foreign = Crawl(project_id=other_pid, seed_url="https://foreign.test/", status="completed")
            db.add_all([old, old_page_mode, running, new, foreign])
            await db.flush()
            page = Page(crawl_id=old.id, url="https://old.test/", status_code=200)
            db.add(page)
            await db.flush()
            db.add_all([Image(crawl_id=old.id, page_id=page.id, url="https://old.test/i.png"),
                        Link(crawl_id=old.id, source_page_id=page.id, destination_url="https://old.test/x")])
            await db.commit()
            ids = dict(old=old.id, old_page=old_page_mode.id, running=running.id, new=new.id, foreign=foreign.id)

            removed = await replace_previous_crawls(db, pid, ids["new"])
            alive = set((await db.execute(select(Crawl.id))).scalars().all())
            leftovers = [await db.scalar(select(func.count(m.id)).where(m.crawl_id == ids["old"])) for m in (Page, Image, Link)]
            return removed, ids, alive, leftovers

    removed, ids, alive, leftovers = _run(go())
    assert removed == 2 and leftovers == [0, 0, 0]
    assert ids["new"] in alive and ids["foreign"] in alive and ids["running"] in alive
    assert ids["old"] not in alive and ids["old_page"] not in alive


def test_failed_crawl_keeps_previous_crawl(client, fixture_site, monkeypatch):
    from conftest import auth, wait_for_crawl
    from app.api import endpoints
    from app.core import url_safety
    monkeypatch.setattr(url_safety, "_ALLOW_PRIVATE", True)
    h = auth("keep-on-fail-user")
    first = client.post("/api/crawls", json={"seed_url": f"{fixture_site}/", "max_pages": 20}, headers=h).json()
    wait_for_crawl(client, first["id"], h)

    async def boom(self):
        raise RuntimeError("crawl blew up")
    monkeypatch.setattr(endpoints.CrawlerService, "run", boom)
    second = client.post("/api/crawls", json={"seed_url": f"{fixture_site}/about/", "max_pages": 20}, headers=h).json()
    wait_for_crawl(client, second["id"], h)

    assert client.get(f"/api/crawls/{second['id']}/status", headers=h).json()["status"] == "failed"
    assert client.get(f"/api/crawls/{first['id']}/status", headers=h).json()["status"] == "completed"
    latest = client.get("/api/crawls/latest?mode=site", headers=h).json()
    assert latest["id"] == second["id"]  # newest crawl; the previous completed one is still stored


def test_executive_summary_is_stored_with_the_crawl(client, monkeypatch):
    from conftest import auth
    from app.core.auth import get_or_create_user_project
    from app.core.database import AsyncSessionLocal
    from app.models.domain import Crawl
    from app.services.prompt_engine import PromptEngine
    h = auth("summary-user")
    calls = []

    async def fake_llm(**kwargs):
        calls.append(1)
        return True, "test-model", {"executive_takeaway": f"Brief #{len(calls)}", "priority_actions": []}
    monkeypatch.setattr(PromptEngine, "execute_llm_json", staticmethod(fake_llm))

    async def make():
        async with AsyncSessionLocal() as db:
            pid = await get_or_create_user_project(db, "summary-user")
            c = Crawl(project_id=pid, seed_url="https://sum.test/", status="completed", completed_at=datetime.utcnow())
            db.add(c)
            await db.commit()
            return c.id
    cid = _run(make())

    def ask(**extra):
        return client.post("/api/audits/ai-executive-summary", json={"crawl_id": cid, "domain": "sum.test", **extra}, headers=h).json()
    first = ask()
    assert first["data"]["executive_takeaway"] == "Brief #1" and not first.get("cached")
    second = ask()
    assert second["data"]["executive_takeaway"] == "Brief #1" and second["cached"] is True and len(calls) == 1
    third = ask(regenerate=True)
    assert third["data"]["executive_takeaway"] == "Brief #2" and len(calls) == 2
    assert ask()["data"]["executive_takeaway"] == "Brief #2"

    # Another workspace cannot read or generate against this crawl.
    other = client.post("/api/audits/ai-executive-summary", json={"crawl_id": cid}, headers=auth("summary-intruder"))
    assert other.status_code == 404
