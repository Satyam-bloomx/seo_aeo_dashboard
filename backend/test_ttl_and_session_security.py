import asyncio
import os
import sys
import time
from datetime import datetime, timedelta

if sys.platform == "win32":
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

sys.path.insert(0, os.getcwd())

import jwt
from fastapi import HTTPException
from sqlalchemy import select, text
from app.core.database import AsyncSessionLocal
from app.models.domain import Project, Crawl, Page, Link, Image, Integration
from app.services.ttl_cleanup_service import purge_expired_crawls
from app.core.auth import decode_supabase_jwt

async def run_ttl_and_security_tests():
    print("==================================================")
    print("  TESTING 24-HOUR AUDIT TTL & 3-DAY SESSION EXPIRY")
    print("==================================================")

    # -----------------------------------------------------------------
    # TEST 1: Automated 24-hour Audit TTL Flush
    # -----------------------------------------------------------------
    print("\n--- 1. Testing 24-Hour Audit TTL Cleanup ---")
    async with AsyncSessionLocal() as session:
        # Ensure project exists
        p = await session.get(Project, 1)
        if not p:
            p = Project(id=1, name="Default Test Workspace")
            session.add(p)
            await session.commit()

        # Create Stale Crawl (26 hours ago)
        stale_crawl = Crawl(
            project_id=1,
            seed_url="https://stale-site-example.com",
            status="completed",
            started_at=datetime.utcnow() - timedelta(hours=26),
            completed_at=datetime.utcnow() - timedelta(hours=25)
        )
        session.add(stale_crawl)
        await session.commit()
        await session.refresh(stale_crawl)
        stale_cid = stale_crawl.id

        # Add child page, link, image to stale crawl
        stale_page = Page(crawl_id=stale_cid, url="https://stale-site-example.com/p1", status_code=200)
        session.add(stale_page)
        await session.commit()
        await session.refresh(stale_page)

        stale_link = Link(crawl_id=stale_cid, source_page_id=stale_page.id, destination_url="https://stale-site-example.com/p2")
        stale_img = Image(crawl_id=stale_cid, page_id=stale_page.id, url="https://stale-site-example.com/img.png")
        session.add_all([stale_link, stale_img])

        # Create Fresh Crawl (2 hours ago)
        fresh_crawl = Crawl(
            project_id=1,
            seed_url="https://fresh-site-example.com",
            status="completed",
            started_at=datetime.utcnow() - timedelta(hours=2),
            completed_at=datetime.utcnow() - timedelta(hours=1, minutes=50)
        )
        session.add(fresh_crawl)
        await session.commit()
        await session.refresh(fresh_crawl)
        fresh_cid = fresh_crawl.id

        fresh_page = Page(crawl_id=fresh_cid, url="https://fresh-site-example.com/p1", status_code=200)
        session.add(fresh_page)
        await session.commit()

    print(f"[SETUP] Created stale crawl #{stale_cid} (26h old) and fresh crawl #{fresh_cid} (2h old).")

    # Run TTL Purge with 24-hour limit
    res = await purge_expired_crawls(max_age_hours=24)
    print(f"[RUN] TTL Purge Result: {res}")
    assert res["purged_crawls"] >= 1, "Expected at least 1 crawl to be purged"
    assert stale_cid in res["expired_crawl_ids"], f"Stale crawl #{stale_cid} was not purged!"

    # Verify Database state
    async with AsyncSessionLocal() as session:
        # Stale crawl must be gone
        c_stale = await session.get(Crawl, stale_cid)
        assert c_stale is None, f"Stale crawl #{stale_cid} still exists in DB!"

        # Stale child records must be gone
        p_res = await session.execute(select(Page).where(Page.crawl_id == stale_cid))
        assert len(p_res.scalars().all()) == 0, "Stale pages were not cascaded!"

        l_res = await session.execute(select(Link).where(Link.crawl_id == stale_cid))
        assert len(l_res.scalars().all()) == 0, "Stale links were not cascaded!"

        # Fresh crawl must STILL exist
        c_fresh = await session.get(Crawl, fresh_cid)
        assert c_fresh is not None, f"Fresh crawl #{fresh_cid} was accidentally deleted!"
        print(f"[PASS] 1. Stale crawl #{stale_cid} purged; Fresh crawl #{fresh_cid} preserved.")

        # Integrations and projects must be 100% untouched
        integrations_cnt = (await session.execute(text("SELECT count(*) FROM integrations"))).scalar()
        assert integrations_cnt == 14, f"Integrations count changed! Expected 14, got {integrations_cnt}"
        print(f"[PASS] 2. Integrations table completely untouched ({integrations_cnt} rows).")

        # Clean up fresh test crawl
        await session.execute(text(f"DELETE FROM pages WHERE crawl_id = {fresh_cid}"))
        await session.execute(text(f"DELETE FROM crawls WHERE id = {fresh_cid}"))
        await session.commit()
        print(f"[PASS] 3. Test fixtures cleaned up.")

    # -----------------------------------------------------------------
    # TEST 2: 3-Day Session Security Expiry
    # -----------------------------------------------------------------
    print("\n--- 2. Testing 3-Day Session Security Re-Login Expiry ---")
    
    # 2a. Token issued 4 days ago (must be rejected)
    four_days_ago = int(time.time()) - (4 * 24 * 3600)
    expired_token = jwt.encode(
        {"sub": "user-test-123", "email": "test@domain.com", "auth_time": four_days_ago, "aud": "authenticated"},
        "dummy-secret",
        algorithm="HS256"
    )

    try:
        decode_supabase_jwt(f"Bearer {expired_token}")
        assert False, "Expired 4-day token was accepted! Security check failed."
    except HTTPException as e:
        assert e.status_code == 401
        assert "3 days" in e.detail or "Session expired" in e.detail
        print(f"[PASS] 4. 4-day-old session token rejected with HTTP 401: '{e.detail}'")

    # 2b. Token issued 1 day ago (within 3 days, must be accepted)
    one_day_ago = int(time.time()) - (1 * 24 * 3600)
    valid_token = jwt.encode(
        {"sub": "user-test-123", "email": "test@domain.com", "auth_time": one_day_ago, "aud": "authenticated"},
        "dummy-secret",
        algorithm="HS256"
    )
    payload = decode_supabase_jwt(f"Bearer {valid_token}")
    assert payload["sub"] == "user-test-123"
    print(f"[PASS] 5. 1-day-old session token accepted successfully (sub={payload['sub']}).")

    # 2c. Demo guest token handling
    demo_payload = decode_supabase_jwt("Bearer demo-token")
    assert demo_payload["sub"] == "demo-guest-user"
    print(f"[PASS] 6. Demo guest session handled cleanly.")

    print("\n==================================================")
    print("  ALL 24-HOUR TTL & 3-DAY RE-LOGIN TESTS PASSED!  ")
    print("==================================================")

if __name__ == "__main__":
    asyncio.run(run_ttl_and_security_tests())
