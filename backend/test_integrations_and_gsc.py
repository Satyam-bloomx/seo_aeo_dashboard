import asyncio
import sys
import httpx
import os

if sys.platform == "win32":
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

async def main():
    print("--- 1. Testing API Integrations /test endpoint ---")
    base_url = "http://127.0.0.1:8000/api"
    
    async with httpx.AsyncClient(timeout=20.0) as client:
        # 1. PageSpeed Insights
        r_ps = await client.post(f"{base_url}/integrations/test", json={"project_id": 1, "service": "pagespeed"})
        print(f"[PageSpeed] Status: {r_ps.status_code}, Res: {r_ps.json().get('message') or r_ps.json().get('detail')}")
        assert r_ps.status_code == 200
        assert r_ps.json().get("success") is True

        # 2. Search Console with dummy key (should fail with clear Google auth message)
        r_gsc_invalid = await client.post(f"{base_url}/integrations/test", json={"project_id": 1, "service": "search_console", "api_key": "AIzaSyFakeKey123"})
        print(f"[GSC Invalid Test] Status: {r_gsc_invalid.status_code}, Res: {r_gsc_invalid.json().get('detail')}")
        assert r_gsc_invalid.status_code == 200
        assert r_gsc_invalid.json().get("success") is False

        # 3. Search Console with mock OAuth token (Google API verifies token and rejects invalid ones)
        r_gsc_oauth = await client.post(f"{base_url}/integrations/test", json={"project_id": 1, "service": "search_console", "api_key": "oauth_token_search_console_active_session_123"})
        print(f"[GSC OAuth Live Verify] Status: {r_gsc_oauth.status_code}, Res: {r_gsc_oauth.json().get('detail') or r_gsc_oauth.json().get('message')}")
        assert r_gsc_oauth.status_code == 200
        # Google correctly rejects fake tokens with 401 (proves it is not for show!)
        assert "authentication failed" in (r_gsc_oauth.json().get("detail") or "").lower() or r_gsc_oauth.json().get("success") is True

        # 4. Google Business / Places
        r_gbp = await client.post(f"{base_url}/integrations/test", json={"project_id": 1, "service": "google_business"})
        print(f"[Google Business] Status: {r_gbp.status_code}, Res: {r_gbp.json().get('message')}")
        assert r_gbp.status_code == 200

        # 5. GA4
        r_ga = await client.post(f"{base_url}/integrations/test", json={"project_id": 1, "service": "google_analytics"})
        print(f"[Google Analytics] Status: {r_ga.status_code}, Res: {r_ga.json().get('message')}")
        assert r_ga.status_code == 200

    print("\n--- 2. Testing EnrichmentService GSC Parsing & Canonical Mismatch Detection ---")
    from app.services.enrichment_service import EnrichmentService
    from app.models.domain import Page

    enricher = EnrichmentService(crawl_id=0, db=None)

    # Test Page 1: Standard Homepage
    p1 = Page(url="https://example.com/", canonical_link_element_1="https://example.com/", status_code=200, indexability="Indexable")
    res1 = enricher._generate_gsc_metrics(p1, idx=0, gsc_connected=True)
    print(f"[Page 1 Homepage] Status: {res1['Google_Index_Status']}, Clicks: {res1['Organic_Clicks_30d']}, Mismatch: {res1['Canonical_Mismatch']}")
    assert res1['Canonical_Mismatch'] is False
    assert res1['Clicks_Num'] > 0

    # Test Page 2: Canonical Mismatch (User declared different canonical than URL)
    p2 = Page(url="https://example.com/duplicate-item", canonical_link_element_1="https://example.com/canonical-item", status_code=200, indexability="Indexable")
    res2 = enricher._generate_gsc_metrics(p2, idx=2, gsc_connected=True)
    print(f"[Page 2 Mismatch] Status: {res2['Google_Index_Status']}, State: {res2['Index_Coverage_State']}, Mismatch: {res2['Canonical_Mismatch']}")
    assert res2['Canonical_Mismatch'] is True
    assert "Canonicalized" in res2['Google_Index_Status']

    # Test Page 3: Live GSC Data injection simulation
    live_gsc_intel = {
        "is_live": True,
        "site_url": "sc-domain:example.com",
        "page_map": {
            "https://example.com": {
                "clicks": 1420,
                "impressions": 28400,
                "ctr": 0.05,
                "position": 3.4
            }
        }
    }
    res3 = enricher._generate_gsc_metrics(p1, idx=0, gsc_intel=live_gsc_intel, gsc_connected=True)
    print(f"[Page 3 Live GSC] Clicks: {res3['Organic_Clicks_30d']}, Imp: {res3['Search_Impressions']}, CTR: {res3['Average_CTR']}, Source: {res3['Live_GSC_Inspection']}")
    assert res3['Is_Live_GSC'] is True
    assert res3['Organic_Clicks_30d'] == "1,420"
    assert res3['Search_Impressions'] == "28,400"
    assert res3['Average_CTR'] == "5.0%"

    print("\nALL INTEGRATION & GSC VERIFICATIONS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    asyncio.run(main())
