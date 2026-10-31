"""24-hour retention: expired crawls are purged with their pages and links; fresh crawls and
integrations are kept. Runs on the isolated test database (never DATABASE_URL from .env)."""
import asyncio
from datetime import datetime, timedelta

from sqlalchemy import func, select


def test_ttl_purge_removes_only_expired_crawls(client):  # client fixture creates the schema
    from app.core.auth import get_or_create_user_project
    from app.core.database import AsyncSessionLocal
    from app.models.domain import Crawl, Integration, Link, Page
    from app.services.ttl_cleanup_service import purge_expired_crawls

    async def go():
        async with AsyncSessionLocal() as db:
            pid = await get_or_create_user_project(db, "ttl-user")
            stale = Crawl(project_id=pid, seed_url="https://stale.example/", status="completed",
                          started_at=datetime.utcnow() - timedelta(hours=26),
                          completed_at=datetime.utcnow() - timedelta(hours=25))
            fresh = Crawl(project_id=pid, seed_url="https://fresh.example/", status="completed",
                          started_at=datetime.utcnow() - timedelta(hours=2),
                          completed_at=datetime.utcnow() - timedelta(hours=1))
            db.add_all([stale, fresh])
            await db.flush()
            stale_page = Page(crawl_id=stale.id, url="https://stale.example/p1", status_code=200)
            db.add_all([stale_page, Page(crawl_id=fresh.id, url="https://fresh.example/p1", status_code=200)])
            await db.flush()
            db.add(Link(crawl_id=stale.id, source_page_id=stale_page.id, destination_url="https://stale.example/p2"))
            db.add(Integration(project_id=pid, integration_type="pagespeed", connected=True, api_key="AIza-test-key-123456"))
            await db.commit()
            stale_id, fresh_id = stale.id, fresh.id

        result = await purge_expired_crawls(max_age_hours=24)
        async with AsyncSessionLocal() as db:
            assert stale_id in result["expired_crawl_ids"]
            assert await db.get(Crawl, stale_id) is None
            assert await db.scalar(select(func.count(Page.id)).where(Page.crawl_id == stale_id)) == 0
            assert await db.scalar(select(func.count(Link.id)).where(Link.crawl_id == stale_id)) == 0
            assert await db.get(Crawl, fresh_id) is not None
            assert await db.scalar(select(func.count(Integration.id)).where(Integration.project_id == pid)) == 1

    asyncio.run(go())
