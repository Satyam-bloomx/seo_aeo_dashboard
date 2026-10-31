import asyncio
import logging
from datetime import datetime, timedelta
from typing import Dict, Any, List

from sqlalchemy import select, delete
from app.core.database import AsyncSessionLocal, engine, vacuum_sqlite_db
from app.models.domain import Crawl, Page, Link, Image

logger = logging.getLogger("ttl_cleaner")

async def purge_expired_crawls(max_age_hours: int = 24) -> Dict[str, Any]:
    """
    Automatically flushes crawl telemetry older than `max_age_hours` (default: 24 hours / 1 day).
    Deletes expired crawls and cascaded pages, links, and images.
    Preserves all `integrations` (API keys, tokens) and `projects` 100% untouched.
    """
    cutoff = datetime.utcnow() - timedelta(hours=max_age_hours)
    purged_count = 0
    expired_ids: List[int] = []

    try:
        async with AsyncSessionLocal() as session:
            # Find all crawl IDs older than the cutoff threshold
            stmt = select(Crawl.id).where(
                (Crawl.started_at < cutoff) | 
                ((Crawl.completed_at.isnot(None)) & (Crawl.completed_at < cutoff))
            )
            result = await session.execute(stmt)
            expired_ids = list(result.scalars().all())

            if not expired_ids:
                return {
                    "purged_crawls": 0,
                    "cutoff": cutoff.isoformat(),
                    "status": "clean"
                }

            logger.info(f"[TTL Cleaner] Found {len(expired_ids)} crawl(s) older than {max_age_hours}h. Commencing purge...")

            # Clean cascaded child telemetry records
            await session.execute(delete(Link).where(Link.crawl_id.in_(expired_ids)))
            await session.execute(delete(Image).where(Image.crawl_id.in_(expired_ids)))
            await session.execute(delete(Page).where(Page.crawl_id.in_(expired_ids)))
            await session.execute(delete(Crawl).where(Crawl.id.in_(expired_ids)))
            
            await session.commit()
            purged_count = len(expired_ids)
            logger.info(f"[TTL Cleaner] Successfully purged {purged_count} expired crawl(s) and their child telemetry records.")

            # If running SQLite, trigger vacuum to reclaim disk space
            if "sqlite" in str(engine.url):
                asyncio.create_task(vacuum_sqlite_db())

    except Exception as e:
        logger.error(f"[TTL Cleaner] Error purging expired crawls: {e}", exc_info=True)
        return {
            "purged_crawls": 0,
            "error": str(e),
            "cutoff": cutoff.isoformat()
        }

    return {
        "purged_crawls": purged_count,
        "expired_crawl_ids": expired_ids,
        "cutoff": cutoff.isoformat(),
        "status": "success"
    }


async def fail_stale_running_crawls(max_running_hours: int = 2) -> int:
    """Mark crawls that have been 'running' longer than max_running_hours as failed (a crawl whose final status
    write was lost, or whose worker died, would otherwise show as running forever). Returns how many were closed."""
    from sqlalchemy import update
    cutoff = datetime.utcnow() - timedelta(hours=max_running_hours)
    try:
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                update(Crawl)
                .where(Crawl.status == "running", Crawl.started_at < cutoff)
                .values(status="failed", completed_at=datetime.utcnow())
            )
            await session.commit()
            closed = result.rowcount or 0
        if closed:
            logger.warning("[Stale sweep] Marked %s crawl(s) running for over %sh as failed.", closed, max_running_hours)
        return closed
    except Exception as e:
        logger.error("[Stale sweep] Failed: %s", type(e).__name__)
        return 0


async def start_periodic_ttl_worker(interval_seconds: int = 12 * 3600, max_age_hours: int = 24):
    """
    Background worker that runs periodically (every 12 hours by default)
    to automatically purge audit data exceeding the 24-hour retention window.
    """
    logger.info(f"[TTL Worker] Background audit retention worker active (interval: {interval_seconds}s / {interval_seconds // 3600}h, TTL: {max_age_hours}h).")
    while True:
        try:
            res = await purge_expired_crawls(max_age_hours=max_age_hours)
            if res.get("purged_crawls", 0) > 0:
                print(f"[TTL Worker] Purged {res['purged_crawls']} crawl(s) older than {max_age_hours}h.")
        except asyncio.CancelledError:
            logger.info("[TTL Worker] Task cancelled, exiting loop.")
            break
        except Exception as e:
            logger.error(f"[TTL Worker] Error in periodic run: {e}")
        await fail_stale_running_crawls()

        await asyncio.sleep(interval_seconds)
