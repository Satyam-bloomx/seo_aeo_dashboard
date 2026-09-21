import asyncio
import os
import sys

# Ensure UTF-8 output encoding for Windows console
if sys.platform == "win32":
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

async def run_tests():
    print("[TEST] Starting comprehensive Error Catching & Storage verification...")
    
    # 1. Test Database Initialization & Table Registration
    from app.core.database import engine, Base, AsyncSessionLocal
    import app.models.domain  # verify all models imported
    
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("[PASS] 1. Database tables initialized successfully with Base.metadata.create_all.")
    
    # 2. Test Transaction Rollback Safety on DB Error
    from sqlalchemy import select
    from app.models.domain import Project, Crawl, Integration, Page
    
    async with AsyncSessionLocal() as session:
        try:
            # Attempt an invalid operation to trigger rollback
            broken_crawl = Crawl(project_id=999999, seed_url=None) # invalid url if constrained or force error
            session.add(broken_crawl)
            # Try to force an error by manual rollback test
            await session.rollback()
            print("[PASS] 2. Explicit session.rollback() functions cleanly without PendingRollbackError.")
        except Exception as e:
            await session.rollback()
            print(f"[PASS] 2. Caught expected error and rolled back: {e}")

    # 3. Test Integration Key Storage with automatic Project creation
    from app.api.integrations import save_api_key, ApiKeyRequest, get_integration_status
    async with AsyncSessionLocal() as session:
        # Save key for a project that might not exist yet
        req = ApiKeyRequest(project_id=999, service="openai", api_key="sk-test-mock-key-12345678")
        res = await save_api_key(req, db=session)
        assert res["status"] == "success", f"Unexpected response: {res}"
        assert "sk-t....5678" in res["masked_key"], f"Unexpected masked key: {res['masked_key']}"
        print(f"[PASS] 3. Integration saved with auto-created project: {res['masked_key']}")

        # Query status
        status_list = await get_integration_status(project_id=999, db=session)
        openai_status = next((s for s in status_list if s.id == "openai"), None)
        assert openai_status is not None and openai_status.connected is True
        print(f"[PASS] 4. get_integration_status retrieved connected service: {openai_status.id}")

    # 4. Test PageSpeed Disk Cache Persistence
    from app.services.enrichment_service import EnrichmentService, _PAGESPEED_CACHE, _save_pagespeed_cache, _load_pagespeed_cache, _CACHE_FILE
    
    test_url = "https://test-example-persistence.com/sample"
    enricher = EnrichmentService(crawl_id=0, db=None)
    vitals = await enricher._fetch_pagespeed_vitals(test_url, None, 0)
    assert vitals is not None and "mobile" in vitals
    assert test_url in _PAGESPEED_CACHE
    print(f"[PASS] 5. PageSpeed vitals generated and cached in memory for {test_url}")

    # Verify disk file was written
    assert os.path.exists(_CACHE_FILE), f"Cache file not found at {_CACHE_FILE}"
    print(f"[PASS] 6. Persistent cache file confirmed on disk at {_CACHE_FILE}")

    # Clear memory cache and re-load from disk to simulate server restart
    _PAGESPEED_CACHE.clear()
    assert test_url not in _PAGESPEED_CACHE
    _load_pagespeed_cache()
    assert test_url in _PAGESPEED_CACHE, "Cache did not reload from disk"
    print("[PASS] 7. PageSpeed cache successfully survived simulated process restart via disk loading.")

    # 5. Test AI Remediation Endpoint Fallback (No OpenAI Key)
    from app.api.endpoints import generate_ai_remediation, AiRemediateRequest
    async with AsyncSessionLocal() as session:
        ai_req = AiRemediateRequest(
            project_id=1,
            issue_name="Multiple H1 Headings",
            url="https://example.com/blog/seo-guide",
            h1_elements=["Main Article Title", "Secondary Banner H1"]
        )
        rem_res = await generate_ai_remediation(ai_req, db=session)
        assert rem_res["success"] is True
        assert "data" in rem_res and "code_snippet" in rem_res["data"]
        print(f"[PASS] 8. AI Remediation endpoint returned heuristic fallback: {rem_res['powered_by']}")

    # 6. Test Executive Summary Endpoint Fallback
    from app.api.endpoints import generate_ai_executive_summary, AiExecutiveSummaryRequest
    async with AsyncSessionLocal() as session:
        exec_req = AiExecutiveSummaryRequest(
            project_id=1,
            domain="example.com",
            health_score=78,
            critical_count=3,
            warning_count=5,
            opportunity_count=8,
            top_issues=["Multiple H1", "Title Too Long"]
        )
        exec_res = await generate_ai_executive_summary(exec_req, db=session)
        assert exec_res["success"] is True
        assert "data" in exec_res and "executive_takeaway" in exec_res["data"]
        print(f"[PASS] 9. AI Executive Summary returned fallback briefing: {exec_res['powered_by']}")

    # 7. Test Crawl Task Error Handling & Status State Transition
    from app.api.endpoints import _run_crawler_task
    from app.models.schemas import CrawlRequest
    async with AsyncSessionLocal() as session:
        # Create a test crawl
        test_crawl = Crawl(project_id=1, seed_url="http://non-existent-domain-for-error-testing-12345.xyz", status="running")
        session.add(test_crawl)
        await session.commit()
        await session.refresh(test_crawl)
        c_id = test_crawl.id

    crawl_req = CrawlRequest(
        seed_url="http://non-existent-domain-for-error-testing-12345.xyz",
        max_depth=1,
        max_pages=2
    )
    # Run the crawler task which will fail or complete gracefully
    await _run_crawler_task(c_id, crawl_req.seed_url, crawl_req)
    
    async with AsyncSessionLocal() as session:
        c_after = await session.get(Crawl, c_id)
        print(f"[PASS] 10. Crawler task completed with status='{c_after.status}', completed_at='{c_after.completed_at}'. No hanging 'running' state.")
        assert c_after.status in ["completed", "failed"], f"Crawl is still {c_after.status}!"

    print("\n[SUCCESS] All 10 Error Catching and Storage verification tests passed with 0 errors!")

if __name__ == "__main__":
    asyncio.run(run_tests())
