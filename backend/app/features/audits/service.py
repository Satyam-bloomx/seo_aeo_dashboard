import asyncio
from app.features.audits.scrapers.seo_scraper import run_seo_audit, fetch_page_data
from app.features.audits.scrapers.aeo_scraper import run_aeo_audit
from app.features.audits.scrapers.geo_scraper import run_geo_audit
from app.features.audits.scrapers.ai_tracker import check_brand_with_gemini
from app.features.audits.scrapers.crawler import run_crawler, extract_main_pages
from app.features.audits.evaluator import evaluate_audits
from urllib.parse import urlparse

async def audit_single_main_page(page_url: str, raw_html: str = None):
    """Runs the full heavy audit on a single main page."""
    if not raw_html:
        page_data = await fetch_page_data(page_url)
        raw_html = page_data.get("html", "")
        
    if not raw_html:
        return None
        
    seo_task = run_seo_audit(page_url)
    aeo_task = run_aeo_audit(raw_html, page_url)
    geo_task = run_geo_audit(page_url, raw_html)
    ai_task = check_brand_with_gemini(page_url, raw_html)
    
    seo, aeo, geo, ai = await asyncio.gather(seo_task, aeo_task, geo_task, ai_task)
    
    return {
        "url": page_url,
        "seo_audit": seo,
        "aeo_audit": aeo,
        "geo_audit": geo,
        "ai_tracking": ai
    }

async def run_full_audit(url: str):
    """Orchestrates the Hybrid Crawl (Full audit on main pages, fast audit on subpages)."""
    
    # 1. Fetch homepage to extract main pages
    page_data = await fetch_page_data(url)
    raw_html = page_data.get("html", "")
    
    if not raw_html:
        return {"error": "Failed to fetch page HTML."}
        
    parsed_url = urlparse(url)
    current_domain = parsed_url.netloc
    
    # 2. Extract main pages (limit to 3 for performance in MVP)
    main_urls = extract_main_pages(raw_html, url, current_domain, max_pages=3)
    if url not in main_urls:
        main_urls.insert(0, url)
    main_urls = list(set(main_urls))[:3] # ensure uniqueness and max 3
    
    # 3. Run full audits concurrently on main pages
    tasks = []
    for m_url in main_urls:
        if m_url == url:
            tasks.append(audit_single_main_page(m_url, raw_html))
        else:
            tasks.append(audit_single_main_page(m_url))
            
    main_page_results = await asyncio.gather(*tasks)
    main_page_results = [res for res in main_page_results if res is not None]
    
    # 4. Run crawler (which automatically does fast audits on subpages)
    crawl_results = await run_crawler(url, max_pages=20, max_depth=3)
    
    # 5. Compile raw report
    raw_data = {
        "url": url,
        "status": "completed",
        "main_pages": main_page_results,
        "crawl_audit": crawl_results
    }
    
    # 6. Evaluate to get structured checks and scores
    evaluated_report = evaluate_audits(raw_data)
    
    return {
        "url": url,
        "status": "completed",
        **evaluated_report
    }
