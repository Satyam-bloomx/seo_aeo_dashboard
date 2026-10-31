"""
Clean Crawl Data Utility
-----------------------
Safely purges ephemeral crawl telemetry (links, images, pages, crawls)
while leaving all `integrations` (API keys, OAuth tokens) and `projects` 100% untouched.
"""

import asyncio
import os
import sys

if sys.platform == "win32":
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

sys.path.insert(0, os.getcwd())

from app.core.database import AsyncSessionLocal, engine
from sqlalchemy import text

async def inspect_and_clean(dry_run: bool = True):
    print("==================================================")
    print("   SEO AUDIT DATABASE HYGIENE & PURGE UTILITY     ")
    print("==================================================")
    
    async with AsyncSessionLocal() as session:
        # 1. Inspect current counts
        print("\n[CURRENT DATABASE STATE]")
        counts = {}
        for tbl in ["integrations", "projects", "crawls", "pages", "images", "links"]:
            try:
                res = await session.execute(text(f"SELECT count(*) FROM {tbl}"))
                counts[tbl] = res.scalar()
                print(f"  • {tbl:14}: {counts[tbl]:,}")
            except Exception as e:
                print(f"  • {tbl:14}: error ({e})")

        print("\n[SAFETY VERIFICATION]")
        print(f"  PROTECTED: 'integrations' ({counts.get('integrations', 0)} rows) - WILL NOT BE TOUCHED")
        print(f"  PROTECTED: 'projects'     ({counts.get('projects', 0)} rows) - WILL NOT BE TOUCHED")
        
        telemetry_total = counts.get('links', 0) + counts.get('images', 0) + counts.get('pages', 0) + counts.get('crawls', 0)
        print(f"  TARGET PURGE: {telemetry_total:,} crawl telemetry rows across links, images, pages, and crawls.")

        if dry_run:
            print("\n[DRY RUN MODE] No data was modified.")
            print("To execute the clean purge, run with --execute:")
            print("  python clean_crawl_data.py --execute")
            return

        print("\n[EXECUTING CLEAN PURGE] Purging crawl telemetry...")
        is_postgres = "postgresql" in str(engine.url) or "asyncpg" in str(engine.url)
        
        if is_postgres:
            # PostgreSQL TRUNCATE CASCADE with ID reset
            await session.execute(text("TRUNCATE TABLE links, images, pages, crawls RESTART IDENTITY CASCADE;"))
            await session.commit()
        else:
            # SQLite DELETE with foreign keys
            await session.execute(text("DELETE FROM links;"))
            await session.execute(text("DELETE FROM images;"))
            await session.execute(text("DELETE FROM pages;"))
            await session.execute(text("DELETE FROM crawls;"))
            await session.commit()
            await session.execute(text("VACUUM;"))

        print("[SUCCESS] Crawl telemetry successfully purged and reset!")
        
        # 2. Inspect post-clean counts
        print("\n[POST-CLEAN DATABASE STATE]")
        for tbl in ["integrations", "projects", "crawls", "pages", "images", "links"]:
            res = await session.execute(text(f"SELECT count(*) FROM {tbl}"))
            print(f"  • {tbl:14}: {res.scalar():,}")

if __name__ == "__main__":
    should_execute = "--execute" in sys.argv
    asyncio.run(inspect_and_clean(dry_run=not should_execute))
