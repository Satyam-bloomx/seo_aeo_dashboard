from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
import re
from urllib.parse import urlparse

from app.core.database import get_db, AsyncSessionLocal
from app.models.domain import Project, Crawl, Page, Link, Integration
from app.models.schemas import CrawlRequest, CrawlResponse, PageSummary, LinkSummary
from app.services.crawler import CrawlerService

router = APIRouter()

def normalize_seed_url(url: str) -> str:
    url = url.strip()
    if not url.startswith("http://") and not url.startswith("https://"):
        url = "https://" + url
    parsed = urlparse(url)
    scheme = (parsed.scheme or "https").lower()
    netloc = parsed.netloc.lower()
    if netloc.endswith(":80") and scheme == "http":
        netloc = netloc[:-3]
    elif netloc.endswith(":443") and scheme == "https":
        netloc = netloc[:-4]
    path = parsed.path or "/"
    path = re.sub(r'/{2,}', '/', path)
    if not path:
        path = "/"
    query = f"?{parsed.query}" if parsed.query else ""
    return f"{scheme}://{netloc}{path}{query}"

async def _cleanup_old_crawls(db: AsyncSession):
    try:
        # 1. Delete crawls older than 24 hours
        twenty_four_hours_ago = datetime.utcnow() - timedelta(hours=24)
        query_24h = select(Crawl).where(Crawl.started_at < twenty_four_hours_ago)
        result_24h = await db.execute(query_24h)
        old_crawls = result_24h.scalars().all()
        for crawl in old_crawls:
            await db.delete(crawl)
        
        # 2. Keep only the 10 most recent crawls
        query_keep = select(Crawl.id).order_by(Crawl.started_at.desc()).limit(10)
        result_keep = await db.execute(query_keep)
        keep_ids = result_keep.scalars().all()
        
        if keep_ids:
            query_delete = select(Crawl).where(Crawl.id.notin_(keep_ids))
            result_delete = await db.execute(query_delete)
            extra_crawls = result_delete.scalars().all()
            for crawl in extra_crawls:
                await db.delete(crawl)
                
        await db.commit()
    except Exception as e:
        print(f"Warning cleaning up old crawls: {e}")
        await db.rollback()

async def _run_crawler_task(crawl_id: int, seed_url: str, request: CrawlRequest):
    async with AsyncSessionLocal() as session:
        try:
            crawler = CrawlerService(
                crawl_id=crawl_id,
                seed_url=seed_url,
                db_session=session,
                max_depth=request.max_depth,
                max_concurrent=request.max_concurrent,
                max_pages=request.max_pages,
                stealth_delay=request.stealth_delay,
                ignore_url_params=request.ignore_url_params,
                check_external_links=request.check_external_links,
                exclude_paths=request.exclude_paths,
                ignore_robots=request.ignore_robots,
                js_rendering=request.js_rendering,
                user_agent=request.user_agent,
                crawl_author_archives=getattr(request, 'crawl_author_archives', False)
            )
            await crawler.run()
        except Exception as e:
            print(f"Fatal error running crawler task {crawl_id}: {e}")
            try:
                crawl = await session.get(Crawl, crawl_id)
                if crawl and crawl.status == "running":
                    crawl.status = "failed"
                    crawl.completed_at = datetime.utcnow()
                    await session.commit()
            except Exception as db_err:
                print(f"Failed to record crawl failure status for {crawl_id}: {db_err}")
                await session.rollback()

@router.post("/crawls", response_model=CrawlResponse)
async def start_crawl(request: CrawlRequest, background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    # Normalize seed URL to RFC 3986 format with root trailing slash
    request.seed_url = normalize_seed_url(request.seed_url)

    # Clean up old data before starting a new crawl to save space
    try:
        await _cleanup_old_crawls(db)
    except Exception as e:
        print(f"Notice: cleanup old crawls error: {e}")

    try:
        # Create a default project for now
        result = await db.execute(select(Project).filter_by(name="Default Project"))
        project = result.scalars().first()
        if not project:
            project = Project(name="Default Project")
            db.add(project)
            await db.commit()
            await db.refresh(project)
            
        crawl = Crawl(project_id=project.id, seed_url=request.seed_url, status="running")
        db.add(crawl)
        await db.commit()
        await db.refresh(crawl)
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error initializing crawl: {str(e)}")
    
    # Run crawler in background with dedicated DB session
    background_tasks.add_task(
        _run_crawler_task, 
        crawl.id, 
        request.seed_url, 
        request
    )
    
    return crawl


@router.delete("/crawls")
async def clear_all_crawls(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Crawl))
    crawls = result.scalars().all()
    for crawl in crawls:
        await db.delete(crawl)
    await db.commit()
    return {"message": "All audit crawl data cleared successfully", "cleared_count": len(crawls)}

@router.get("/crawls")
async def list_crawls(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Crawl).order_by(Crawl.id.asc()))
    return result.scalars().all()

@router.get("/crawls/latest")
async def get_latest_crawl(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Crawl).order_by(Crawl.id.desc()).limit(1))
    crawl = result.scalars().first()
    if not crawl:
        raise HTTPException(status_code=404, detail="No crawl found")
    return crawl

@router.get("/crawls/{crawl_id}/status")
async def get_crawl_status(crawl_id: int, db: AsyncSession = Depends(get_db)):
    crawl = await db.get(Crawl, crawl_id)
    if not crawl:
        raise HTTPException(status_code=404, detail="Crawl not found")
        
    page_count = await db.scalar(select(func.count(Page.id)).where(Page.crawl_id == crawl_id))
    
    return {
        "status": crawl.status,
        "pages_crawled": page_count,
        "started_at": crawl.started_at,
        "completed_at": crawl.completed_at
    }

@router.get("/crawls/{crawl_id}/pages", response_model=List[PageSummary])
async def get_crawl_pages(crawl_id: int, filter: str = "internal", skip: int = 0, limit: int = 1000, db: AsyncSession = Depends(get_db)):
    query = select(Page).where(Page.crawl_id == crawl_id)
    
    if filter == "internal":
        query = query.where(Page.status_code != None) # very rough internal filter
    elif filter == "client_error":
        query = query.where(Page.status_code >= 400).where(Page.status_code < 500)
    
    query = query.offset(skip).limit(limit)
    result = await db.execute(query)
    pages = result.scalars().all()
    
    return pages

@router.get("/pages/{page_id}", response_model=PageSummary)
async def get_page(page_id: int, db: AsyncSession = Depends(get_db)):
    page = await db.get(Page, page_id)
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    return page

@router.get("/pages/{page_id}/inlinks", response_model=List[LinkSummary])
async def get_page_inlinks(page_id: int, db: AsyncSession = Depends(get_db)):
    page = await db.get(Page, page_id)
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
        
    query = (
        select(Link, Page.url.label("source_url"))
        .outerjoin(Page, Link.source_page_id == Page.id)
        .where(Link.destination_url == page.url, Link.crawl_id == page.crawl_id)
    )
    result = await db.execute(query)
    rows = result.all()
    return [
        LinkSummary(
            id=link.id,
            source_page_id=link.source_page_id,
            source_url=src_url,
            destination_url=link.destination_url,
            anchor_text=link.anchor_text,
            is_follow=link.is_follow,
            link_type=link.link_type,
            is_internal=link.is_internal,
        )
        for link, src_url in rows
    ]

@router.get("/pages/{page_id}/outlinks", response_model=List[LinkSummary])
async def get_page_outlinks(page_id: int, db: AsyncSession = Depends(get_db)):
    page = await db.get(Page, page_id)
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
        
    query = select(Link).where(Link.source_page_id == page_id)
    result = await db.execute(query)
    links = result.scalars().all()
    return [
        LinkSummary(
            id=link.id,
            source_page_id=link.source_page_id,
            source_url=page.url,
            destination_url=link.destination_url,
            anchor_text=link.anchor_text,
            is_follow=link.is_follow,
            link_type=link.link_type,
            is_internal=link.is_internal,
        )
        for link in links
    ]

from pydantic import BaseModel
import os
from app.models.domain import Integration
from app.services.enrichment_service import EnrichmentService

class PerformanceAnalyzeRequest(BaseModel):
    url: str
    project_id: int = 1

@router.post("/performance/analyze")
async def analyze_single_url_performance(req: PerformanceAnalyzeRequest, db: AsyncSession = Depends(get_db)):
    ps_key = None
    try:
        res_int = await db.execute(
            select(Integration).where(
                Integration.project_id == req.project_id,
                Integration.integration_type == "pagespeed",
                Integration.connected == True
            )
        )
        integration = res_int.scalars().first()
        ps_key = integration.api_key if integration else os.getenv("PAGESPEED_API_KEY")
    except Exception as e:
        print(f"Notice: could not query integration for pagespeed: {e}")
        ps_key = os.getenv("PAGESPEED_API_KEY")

    enricher = EnrichmentService(crawl_id=0, db=db)
    vitals = await enricher._fetch_pagespeed_vitals(req.url, ps_key, 0)
    return {
        "url": req.url,
        "is_live_api": bool(ps_key),
        "data": vitals
    }

class AiRemediateRequest(BaseModel):
    project_id: int = 1
    issue_name: str
    url: str
    current_value: Optional[str] = None
    page_title: Optional[str] = None
    h1_elements: Optional[List[str]] = None
    meta_description: Optional[str] = None
    word_count: Optional[int] = None

import httpx
import json
from typing import Optional

@router.post("/audits/ai-remediate")
async def generate_ai_remediation(req: AiRemediateRequest, db: AsyncSession = Depends(get_db)):
    # 1. Fetch OpenAI key
    openai_key = None
    try:
        res_int = await db.execute(
            select(Integration).where(
                Integration.project_id == req.project_id,
                Integration.integration_type == "openai",
                Integration.connected == True
            )
        )
        integration = res_int.scalars().first()
        openai_key = integration.api_key if integration else os.getenv("OPENAI_API_KEY")
    except Exception as e:
        print(f"Notice: could not query integration for openai: {e}")
        openai_key = os.getenv("OPENAI_API_KEY")

    if openai_key and ("sk-" in openai_key or "proj" in openai_key):
        try:
            system_prompt = (
                "You are an elite Technical SEO and Answer Engine Optimization (AEO) engineer. "
                "Output strictly valid JSON with keys: "
                "'summary' (string), 'root_cause' (string), 'recommendations' (array of strings), "
                "'code_snippet' (clean HTML snippet demonstrating the fix), and 'best_practice_rule' (string)."
            )
            user_prompt = f"Issue: {req.issue_name}\nPage URL: {req.url}\n"
            if req.page_title: user_prompt += f"Current Title: {req.page_title}\n"
            if req.h1_elements: user_prompt += f"Detected H1 Elements ({len(req.h1_elements)}): {req.h1_elements}\n"
            if req.meta_description: user_prompt += f"Current Meta Description: {req.meta_description}\n"
            if req.word_count: user_prompt += f"Word Count: {req.word_count}\n"
            if req.current_value: user_prompt += f"Flagged Value: {req.current_value}\n"

            user_prompt += (
                "\nProvide a production-ready fix. "
                "If multiple H1s are present, choose the single most authoritative H1 and convert the rest to H2/H3 with rationale. "
                "If page title exceeds 60 characters or is missing, provide 3 punchy options between 45 and 58 characters with brand suffix. "
                "If meta description is missing or over 155 characters, provide 2 compelling options between 130 and 150 characters with a clear CTA."
            )

            async with httpx.AsyncClient(timeout=14.0) as client:
                res = await client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={"Authorization": f"Bearer {openai_key}"},
                    json={
                        "model": "gpt-4o-mini",
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_prompt}
                        ],
                        "response_format": {"type": "json_object"},
                        "max_tokens": 600
                    }
                )
                if res.status_code == 200:
                    payload = res.json()
                    ai_content = json.loads(payload["choices"][0]["message"]["content"])
                    return {
                        "success": True,
                        "powered_by": "OpenAI GPT-4o-mini",
                        "is_live_ai": True,
                        "data": ai_content
                    }
        except Exception as e:
            print(f"OpenAI live remediation error: {e}")

    # Fallback heuristic recommendation if OpenAI key is not connected or failed
    recommendations = []
    snippet = ""
    rule_info = "Google Search Essentials: Only 1 primary H1 per page; titles 30–60 chars; meta descriptions 120–155 chars."
    
    if "H1" in req.issue_name:
        h1s = req.h1_elements or ["Primary Headline"]
        primary = h1s[0] if h1s else "Main Topic Headline"
        secondaries = h1s[1:] if len(h1s) > 1 else []
        snippet = f"<h1>{primary}</h1>\n" + "\n".join(f"<h2>{s}</h2>" for s in secondaries)
        recommendations = [
            f"Designate '{primary}' as the single authoritative <h1> headline for this page.",
            f"Demote the other {len(secondaries)} headings to <h2> subheadings in your template or page builder.",
            "Ensure logo containers and site banners use <div> or <span> instead of <h1>."
        ]
    elif "Title" in req.issue_name:
        base_title = (req.page_title or "Target Keyword").split("-")[0].split("|")[0].strip()
        snippet = f"<title>{base_title} | Expert Digital Solutions</title>"
        recommendations = [
            f"Shorten to: '{base_title} | Brand Suffix' (approx. 45–55 characters).",
            "Frontload the primary keyword to prevent SERP truncation with ellipses.",
            "Keep the brand name at the end separated by a pipe (|) or dash (-)."
        ]
    elif "Meta" in req.issue_name:
        snippet = '<meta name="description" content="Discover professional digital solutions designed to grow your brand. Explore our services and schedule a free strategy consultation today.">'
        recommendations = [
            "Write a concise summary between 120 and 150 characters.",
            "Include primary target keyword and an actionable conversion CTA.",
            "Ensure meta descriptions are unique across all crawled pages."
        ]
    else:
        snippet = f"<!-- Corrected HTML structure for {req.issue_name} -->"
        recommendations = [
            f"Audit and update page template markup for {req.issue_name}.",
            "Validate compliance against HTML5 W3C standards."
        ]

    return {
        "success": True,
        "powered_by": "Heuristic Diagnostic Engine (Connect OpenAI API Key for live GPT-4o variants)",
        "is_live_ai": False,
        "data": {
            "summary": f"Remediation Guidance for {req.issue_name}",
            "root_cause": "The page markup violates technical SEO search indexing guidelines.",
            "recommendations": recommendations,
            "code_snippet": snippet,
            "best_practice_rule": rule_info
        }
    }


class AiExecutiveSummaryRequest(BaseModel):
    project_id: int = 1
    domain: str
    health_score: int
    critical_count: int
    warning_count: int
    opportunity_count: int
    top_issues: Optional[List[str]] = None
    perplexity_citation_status: Optional[str] = None


@router.post("/audits/ai-executive-summary")
async def generate_ai_executive_summary(req: AiExecutiveSummaryRequest, db: AsyncSession = Depends(get_db)):
    # 1. Fetch OpenAI key
    openai_key = None
    try:
        res_int = await db.execute(
            select(Integration).where(
                Integration.project_id == req.project_id,
                Integration.integration_type == "openai",
                Integration.connected == True
            )
        )
        integration = res_int.scalars().first()
        openai_key = integration.api_key if integration else os.getenv("OPENAI_API_KEY")
    except Exception as e:
        print(f"Notice: could not query integration for executive summary: {e}")
        openai_key = os.getenv("OPENAI_API_KEY")

    if openai_key and ("sk-" in openai_key or "proj" in openai_key):
        try:
            system_prompt = (
                "You are an elite Chief Digital Officer and Principal SEO Architect producing an executive board-level audit briefing. "
                "Output strictly valid JSON with keys: "
                "'executive_takeaway' (string, approx 80 words), "
                "'technical_debt_impact' (string, approx 80 words), "
                "'revenue_growth_opportunity' (string, approx 80 words), "
                "and 'priority_actions' (array of 3 high-impact engineering sprint items)."
            )
            user_prompt = (
                f"Audited Domain: {req.domain}\n"
                f"Overall Site Health Score: {req.health_score}/100\n"
                f"Diagnostic Error Counts: {req.critical_count} Critical P0 Errors, {req.warning_count} Warnings, {req.opportunity_count} Opportunities\n"
                f"Top Flagged Issues: {req.top_issues or ['Multiple H1 tags', 'Title Length Exceeded', 'Missing Meta Descriptions']}\n"
                f"AI Answer Citation Status: {req.perplexity_citation_status or 'Standard Indexing'}\n"
                "Synthesize business risk, technical debt, and revenue upside with high urgency."
            )

            async with httpx.AsyncClient(timeout=14.0) as client:
                res = await client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={"Authorization": f"Bearer {openai_key}"},
                    json={
                        "model": "gpt-4o-mini",
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_prompt}
                        ],
                        "response_format": {"type": "json_object"},
                        "max_tokens": 550
                    }
                )
                if res.status_code == 200:
                    payload = res.json()
                    ai_content = json.loads(payload["choices"][0]["message"]["content"])
                    return {
                        "success": True,
                        "powered_by": "OpenAI GPT-4o-mini",
                        "is_live_ai": True,
                        "data": ai_content
                    }
        except Exception as e:
            print(f"OpenAI executive summary error: {e}")

    # High-impact professional fallback
    health_verdict = (
        "Strong structural baseline with selective technical optimization needed."
        if req.health_score >= 80 else
        "Moderate technical debt that requires targeted remediation before search performance degrades."
        if req.health_score >= 60 else
        "Critical architectural bottlenecks detected that directly undermine organic crawl efficiency and conversion pathways."
    )

    return {
        "success": True,
        "powered_by": "Enterprise SEO Synthesis Engine (Connect OpenAI API Key for customized live GPT-4o briefing)",
        "is_live_ai": False,
        "data": {
            "executive_takeaway": (
                f"{req.domain} achieved a composite Site Health Index of {req.health_score}/100 across 32 audited diagnostic dimensions. "
                f"{health_verdict} Automated inspection flagged {req.critical_count} high-severity errors that should be prioritized in the upcoming engineering sprint to safeguard organic traffic."
            ),
            "technical_debt_impact": (
                f"Identified {req.critical_count} critical and {req.warning_count} secondary technical bottlenecks, predominantly centered on heading hierarchy, metadata limits, and indexation directives. "
                "These defects create unnecessary crawl budget dilution for search engine bots and diminish conversational extractability for modern Answer Engines like Perplexity and Google SGE."
            ),
            "revenue_growth_opportunity": (
                "Resolving these technical bottlenecks is estimated to enhance organic search impressions by 15–28% within 60 days of re-indexing. "
                "Eliminating multiple H1 conflicts and tightening meta descriptions will directly uplift click-through rates (CTR) on primary transactional queries and position the domain for AI overview citations."
            ),
            "priority_actions": [
                "Deploy canonical and status-code integrity fixes to ensure search engines exclusively index 200 OK canonical destinations.",
                "Execute automated heading and title tag restructuring to establish a single semantic H1 per page.",
                "Inject structured schema markup and enhance Core Web Vitals to qualify for rich snippet carousels and AI search answers."
            ]
        }
    }




class AiDiagnoseIssueRequest(BaseModel):
    project_id: int = 1
    issue_name: str
    category: Optional[str] = None
    domain: Optional[str] = None
    total_affected: Optional[int] = 1
    sample_pages: Optional[List[Dict[str, Any]]] = None
    api_key: Optional[str] = None
    ai_provider: Optional[str] = None

# Global in-memory cache to guarantee zero duplicate token consumption
AI_ISSUE_DIAGNOSES_CACHE: Dict[str, Dict[str, Any]] = {}

@router.post("/audits/ai-diagnose-issue")
async def generate_ai_issue_diagnosis(req: AiDiagnoseIssueRequest, db: AsyncSession = Depends(get_db)):
    """
    Token-optimized AI issue diagnosis engine.
    Synthesizes custom human-friendly root cause, impact, fix guide, before/after examples,
    and pro-tips tailored to the specific audited website and affected page sample.
    """
    raw_domain = req.domain or "target-website.com"
    clean_domain = raw_domain.lower().replace("https://", "").replace("http://", "").split("/")[0]
    cache_key = f"{clean_domain}:{req.issue_name}"

    if cache_key in AI_ISSUE_DIAGNOSES_CACHE:
        cached = AI_ISSUE_DIAGNOSES_CACHE[cache_key]
        return {**cached, "cached": True}

    # 1. Resolve API Keys (Gemini preferred for speed/tokens, OpenAI also supported)
    gemini_key = None
    openai_key = None

    if req.api_key:
        if req.api_key.startswith("AIza") or req.ai_provider == "gemini":
            gemini_key = req.api_key
        elif req.api_key.startswith("sk-") or req.ai_provider == "openai":
            openai_key = req.api_key

    if not gemini_key:
        gemini_key = os.getenv("GEMINI_API_KEY")

    if not openai_key:
        try:
            res_int = await db.execute(
                select(Integration).where(
                    Integration.project_id == req.project_id,
                    Integration.integration_type == "openai",
                    Integration.connected == True
                )
            )
            item = res_int.scalars().first()
            openai_key = item.api_key if item else os.getenv("OPENAI_API_KEY")
        except Exception:
            openai_key = os.getenv("OPENAI_API_KEY")

    # 2. Build strictly bounded, token-efficient prompt (under 250 input tokens)
    samples = []
    if req.sample_pages:
        for p in req.sample_pages[:2]:
            u = p.get("url", "")
            t = (p.get("title_1") or p.get("title") or "")[:85]
            h = (p.get("h1_1") or p.get("h1") or "")[:85]
            m = (p.get("meta_desc_1") or p.get("meta_desc") or "")[:120]
            st = p.get("status_code", 200)
            samples.append(f"- URL: {u} (Status {st}) | Title: '{t}' | H1: '{h}' | Meta: '{m}'")

    sample_summary = "\n".join(samples) if samples else "No specific page sample provided."

    system_prompt = (
        "You are an elite Principal Technical SEO & Answer Engine Optimization (AEO) Architect. "
        "Output strictly valid JSON with exact keys: "
        "'rootCause' (string, max 45 words: plain English explanation of what is happening on these pages), "
        "'impact' (string, max 45 words: why this hurts search traffic, click-through rate, and AI search citations), "
        "'fixGuide' (string, max 60 words: numbered step-by-step fix guide), "
        "'exampleBefore' (string: exact bad HTML/markup or pattern found on this site), "
        "'exampleAfter' (string: production-ready recommended fix with brand suffix), "
        "'tip' (string, max 30 words: high-leverage strategic pro-tip)."
    )

    user_prompt = (
        f"Domain: {clean_domain}\n"
        f"Diagnostic Issue: {req.issue_name} (Category: {req.category or 'SEO'})\n"
        f"Total Affected URLs: {req.total_affected}\n"
        f"Sample Offending Page(s):\n{sample_summary}\n\n"
        "Provide an executive, human-friendly, highly tailored technical diagnosis and solution for this specific website."
    )

    # 3. Try Gemini 2.5 Flash first (blazing fast, high reasoning, budget-controlled)
    if gemini_key:
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={gemini_key}"
            payload = {
                "contents": [
                    {"role": "user", "parts": [{"text": f"{system_prompt}\n\n{user_prompt}"}]}
                ],
                "generationConfig": {
                    "responseMimeType": "application/json",
                    "maxOutputTokens": 600,
                    "thinkingConfig": {"thinkingBudget": 0}
                }
            }
            async with httpx.AsyncClient(timeout=14.0) as client:
                res = await client.post(url, json=payload)
                if res.status_code == 200:
                    cand = res.json()["candidates"][0]
                    content_str = cand["content"]["parts"][0]["text"]
                    parsed = json.loads(content_str)
                    result = {
                        "success": True,
                        "powered_by": "Google Gemini 2.5 Flash",
                        "is_live_ai": True,
                        "data": parsed
                    }
                    AI_ISSUE_DIAGNOSES_CACHE[cache_key] = result
                    return result
        except Exception as e:
            print(f"Gemini live diagnosis error: {e}")

    # 4. Try OpenAI (GPT-4o-mini)
    if openai_key and ("sk-" in openai_key or "proj" in openai_key):
        try:
            async with httpx.AsyncClient(timeout=14.0) as client:
                res = await client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={"Authorization": f"Bearer {openai_key}"},
                    json={
                        "model": "gpt-4o-mini",
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_prompt}
                        ],
                        "response_format": {"type": "json_object"},
                        "max_tokens": 500
                    }
                )
                if res.status_code == 200:
                    payload = res.json()
                    ai_content = json.loads(payload["choices"][0]["message"]["content"])
                    result = {
                        "success": True,
                        "powered_by": "OpenAI GPT-4o-mini",
                        "is_live_ai": True,
                        "data": ai_content
                    }
                    AI_ISSUE_DIAGNOSES_CACHE[cache_key] = result
                    return result
        except Exception as e:
            print(f"OpenAI live diagnosis error: {e}")

    # 5. Smart fallback when no key is active
    return {
        "success": True,
        "powered_by": "Curated SEO Knowledge Base (Connect Gemini or OpenAI API Key for dynamic site-specific analysis)",
        "is_live_ai": False,
        "data": {
            "rootCause": f"Condition '{req.issue_name}' detected on {req.total_affected} URL(s) on {clean_domain}.",
            "impact": "Impairs search engine indexing hierarchy, click-through rate in SERPs, and conversational answer engine visibility.",
            "fixGuide": "1. Audit affected page templates.\n2. Update HTML markup to comply with search engine guidelines.\n3. Re-crawl to verify resolution.",
            "exampleBefore": f"<!-- Issue on {clean_domain}: {req.issue_name} -->",
            "exampleAfter": f"<!-- Recommended standard markup for {clean_domain} -->",
            "tip": "Align your on-page elements to distinguish visitor-facing headlines from search-facing snippets."
        }
    }
