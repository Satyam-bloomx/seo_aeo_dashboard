import logging
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func, delete
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
import asyncio
import re
from urllib.parse import urlparse

from app.core.database import get_db, AsyncSessionLocal, vacuum_sqlite_db, run_db_maintenance
from app.models.domain import Project, Crawl, Page, Link, Image, Integration
from app.models.schemas import CrawlRequest, CrawlResponse, PageSummary, LinkSummary, MAX_CRAWL_PAGES
from app.services.crawler import CrawlerService
from app.services.crawl_queue import CRAWL_RUNNER, CrawlJob, crawl_queue
from app.core.auth import get_current_user, get_user_project_id, UserSession
from app.core.rate_limit import rate_limit
from app.core.url_safety import UnsafeURLError, assert_public_url, safe_async_client, get_limited
from app.services.prompt_engine import (
    PlatformDetector,
    AuditDossierBuilder,
    PromptArchetypes,
    PromptEngine,
    active_ai_provider,
)

router = APIRouter()
logger = logging.getLogger(__name__)

# Active background crawler tasks tracked for graceful cancellation on wipe
active_crawler_tasks: Dict[int, asyncio.Task] = {}

async def _owned_crawl(db: AsyncSession, crawl_id: int, user: UserSession) -> Crawl:
    """Return the crawl if it belongs to the caller's workspace; 404 otherwise (no existence oracle)."""
    project_id = await get_user_project_id(db, user)
    crawl = await db.get(Crawl, crawl_id)
    if not crawl or crawl.project_id != project_id:
        raise HTTPException(status_code=404, detail="Crawl not found")
    return crawl


async def _owned_page(db: AsyncSession, page_id: int, user: UserSession) -> Page:
    page = await db.get(Page, page_id)
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    project_id = await get_user_project_id(db, user)
    crawl = await db.get(Crawl, page.crawl_id)
    if not crawl or crawl.project_id != project_id:
        raise HTTPException(status_code=404, detail="Page not found")
    return page


def _project_page_by_url(url: str, project_id: int):
    """Latest crawled Page with this URL inside the caller's workspace only."""
    return (
        select(Page)
        .join(Crawl, Page.crawl_id == Crawl.id)
        .where(Page.url == url, Crawl.project_id == project_id)
        .order_by(Page.id.desc())
    )

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

async def _delete_crawl_rows(db: AsyncSession, crawl_ids: List[int]):
    """Delete crawls with their images and pages (links live on the pages). Leftover rows in the legacy
    `links` table are removed too while it exists. Commits."""
    await db.execute(delete(Image).where(Image.crawl_id.in_(crawl_ids)))
    await db.execute(delete(Link).where(Link.crawl_id.in_(crawl_ids)))
    await db.execute(delete(Page).where(Page.crawl_id.in_(crawl_ids)))
    await db.execute(delete(Crawl).where(Crawl.id.in_(crawl_ids)))
    await db.commit()


async def replace_previous_crawls(db: AsyncSession, project_id: int, keep_crawl_id: int) -> int:
    """One stored crawl per account: once `keep_crawl_id` has completed, delete the workspace's other
    crawls (any mode). Crawls still running are left alone. Returns how many were deleted."""
    res = await db.execute(select(Crawl.id).where(
        Crawl.project_id == project_id, Crawl.id != keep_crawl_id, Crawl.status.notin_(("running", "queued"))))
    old_ids = list(res.scalars().all())
    if old_ids:
        await _delete_crawl_rows(db, old_ids)
        asyncio.create_task(vacuum_sqlite_db())
    return len(old_ids)


async def _wipe_all_crawl_data(db: AsyncSession, project_id: Optional[int] = None, mode: Optional[str] = None):
    """
    Safely cancels active running crawlers and deletes previous crawl data
    strictly scoped to the target project. Never executes an unqualified global wipe.
    Reclaims SQLite storage space to prevent database bloat.
    """
    target_project_id = project_id if project_id is not None else 1
    try:
        # 1. Fetch crawl IDs belonging strictly to this project
        # mode=None wipes everything (Clear); otherwise only the previous audit of the same mode is
        # replaced, so a single-page check never deletes the whole-site crawl (and vice versa).
        crawl_q = select(Crawl.id).where(Crawl.project_id == target_project_id)
        if mode:
            crawl_q = crawl_q.where(Crawl.mode == mode)
        c_res = await db.execute(crawl_q)
        crawl_ids = list(c_res.scalars().all())

        # Remove queued crawls and cancel running ones for this project
        for cid in crawl_ids:
            crawl_queue.cancel(cid)
            task = active_crawler_tasks.pop(cid, None)
            if task and not task.done():
                task.cancel()

        # Delete child and crawl records for this project
        if crawl_ids:
            await _delete_crawl_rows(db, crawl_ids)
            print(f"Successfully cleaned previous crawl data for project {target_project_id}.")
            
            # Reclaim SQLite database disk space asynchronously
            asyncio.create_task(vacuum_sqlite_db())
    except Exception as e:
        print(f"Warning wiping previous crawl data for project {target_project_id}: {e}")
        await db.rollback()


def crawl_settings_used(request: CrawlRequest) -> dict:
    """The settings a crawl actually runs with (single-page audits override several), saved on Crawl.summary."""
    single = request.mode == "page"
    ua = (request.user_agent or "").strip()
    settings = {
        "mode": request.mode,
        "max_pages": 2 if single else request.max_pages,
        "max_depth": 0 if single else request.max_depth,
        "exclude_paths": [p.strip() for p in (request.exclude_paths or "").split("\n") if p.strip()],
        "ignore_robots": request.ignore_robots,
        "js_rendering": request.js_rendering,
        "ignore_url_params": request.ignore_url_params,
        "check_external_links": request.check_external_links and not single,
        "crawl_author_archives": getattr(request, "crawl_author_archives", False),
        "stay_in_folder": getattr(request, "stay_in_folder", True),
    }
    if ua and ua != "SEO-Spider-Bot":
        settings["user_agent"] = ua[:256]
    return settings


async def _run_crawler_task(crawl_id: int, seed_url: str, request: CrawlRequest):
    crawler = None
    try:
        active_crawler_tasks[crawl_id] = asyncio.current_task()
        async with AsyncSessionLocal() as session:
            try:
                # The crawl left the queue: it is running now (a crawl deleted while waiting is skipped).
                row = await session.get(Crawl, crawl_id)
                if row is None or row.status not in ("queued", "running"):
                    return
                row.status = "running"
                row.started_at = datetime.utcnow()
                row.summary = {**(row.summary or {}), "phase": "crawling"}
                await session.commit()
                single = request.mode == "page"
                crawler = CrawlerService(
                    crawl_id=crawl_id,
                    seed_url=seed_url,
                    db_session=session,
                    # Single page: depth 0 (no link following); 2 slots so a redirecting URL's target is audited.
                    max_depth=0 if single else request.max_depth,
                    max_concurrent=1 if single else request.max_concurrent,
                    max_pages=2 if single else request.max_pages,
                    mode=request.mode,
                    stealth_delay=request.stealth_delay,
                    ignore_url_params=request.ignore_url_params,
                    check_external_links=request.check_external_links and not single,
                    exclude_paths=request.exclude_paths,
                    ignore_robots=request.ignore_robots,
                    js_rendering=request.js_rendering,
                    user_agent=request.user_agent,
                    crawl_author_archives=getattr(request, 'crawl_author_archives', False),
                    stay_in_folder=getattr(request, 'stay_in_folder', True)
                )
                await crawler.run()
                # The new crawl replaces the previous one only once it has completed; a failed crawl keeps it.
                try:
                    crawl_row = await session.get(Crawl, crawl_id)
                    if crawl_row is not None and crawl_row.status == "completed":
                        removed = await replace_previous_crawls(session, crawl_row.project_id, crawl_id)
                        if removed:
                            logger.info("Crawl %s completed: replaced %s previous crawl(s).", crawl_id, removed)
                except Exception:
                    logger.exception("Could not remove the previous crawl after crawl %s completed", crawl_id)
                    await session.rollback()
            except asyncio.CancelledError:
                print(f"Crawler task {crawl_id} cancelled.")
                raise
            except Exception as e:
                print(f"Fatal error running crawler task {crawl_id}: {e}")
                from app.services.crawler import mark_crawl_status
                await mark_crawl_status(session, crawl_id, "failed")
                try:
                    from app.services.alerts import send_crawl_alert
                    if crawler is not None:
                        crawler.send_alert(failed_reason=f"{type(e).__name__}: {e}"[:300])
                    else:
                        send_crawl_alert(crawl_id, seed_url, [f"crawl failed before starting: {type(e).__name__}"], error=True)
                except Exception:
                    pass
    finally:
        active_crawler_tasks.pop(crawl_id, None)

@router.post("/crawls", response_model=CrawlResponse, dependencies=[Depends(rate_limit("crawl"))])
async def start_crawl(
    request: CrawlRequest, 
    db: AsyncSession = Depends(get_db),
    user: UserSession = Depends(get_current_user)
):
    # Normalize seed URL to RFC 3986 format with root trailing slash
    request.seed_url = normalize_seed_url(request.seed_url)

    try:
        await assert_public_url(request.seed_url)
    except UnsafeURLError as e:
        raise HTTPException(status_code=400, detail=f"This URL cannot be audited: {e}.")

    # Pre-crawl reachability check so unreachable URLs never wipe existing audit data.
    try:
        async with safe_async_client(timeout=10.0) as check_client:
            await get_limited(check_client, request.seed_url, read_body=False)
    except Exception:
        raise HTTPException(
            status_code=400,
            detail="Unable to reach this website. Please verify the domain is online and publicly accessible. Existing audit data was preserved."
        )

    # Resolve user's isolated workspace project
    user_project_id = await get_user_project_id(db, user)

    # One stored crawl per account: the previous crawl stays until this one completes (see replace_previous_crawls).
    try:
        # A crawl still waiting in the queue is replaced by this newer one (same workspace and mode).
        waiting = (await db.execute(select(Crawl.id).where(
            Crawl.project_id == user_project_id, Crawl.mode == request.mode, Crawl.status == "queued"))).scalars().all()
        for old_id in waiting:
            crawl_queue.cancel(old_id)
        if waiting:
            await _delete_crawl_rows(db, list(waiting))
        # Starts "queued"; the request is stored so a restart can put the crawl back in the queue.
        crawl = Crawl(project_id=user_project_id, seed_url=request.seed_url, status="queued", mode=request.mode,
                      summary={"settings": crawl_settings_used(request), "request": request.model_dump(), "phase": "queued"})
        db.add(crawl)
        await db.commit()
        await db.refresh(crawl)
    except Exception as e:
        await db.rollback()
        logger.exception("Database error initializing crawl")
        raise HTTPException(status_code=500, detail="Could not start the crawl. Please try again.")

    enqueue_crawl(crawl.id, request.seed_url, request)
    return crawl


def enqueue_crawl(crawl_id: int, seed_url: str, request: CrawlRequest) -> None:
    """Put a crawl in the queue; it runs when a normal (or, for JS rendering, a JS) slot is free."""
    if CRAWL_RUNNER == "worker":
        return  # the row is already "queued": a worker process claims it from the database
    crawl_queue.enqueue(CrawlJob(crawl_id=crawl_id, js=bool(request.js_rendering) and request.mode != "page",
                                 run=lambda: _run_crawler_task(crawl_id, seed_url, request)))


async def requeue_waiting_crawls() -> int:
    """After a restart: crawls that were still queued go back in the queue (oldest first)."""
    async with AsyncSessionLocal() as session:
        rows = (await session.execute(select(Crawl).where(Crawl.status == "queued").order_by(Crawl.id.asc()))).scalars().all()
        count = 0
        for crawl in rows:
            try:
                request = CrawlRequest(**((crawl.summary or {}).get("request") or {}))
            except Exception:
                crawl.status, crawl.completed_at = "failed", datetime.utcnow()  # nothing to re-run it from
                continue
            enqueue_crawl(crawl.id, crawl.seed_url, request)
            count += 1
        await session.commit()
        return count


@router.delete("/crawls")
async def clear_all_crawls(
    db: AsyncSession = Depends(get_db),
    user: UserSession = Depends(get_current_user)
):
    # User requirement: As soon as Clear is clicked, wipe this user's audit data
    user_project_id = await get_user_project_id(db, user)
    await _wipe_all_crawl_data(db, project_id=user_project_id)
    return {"message": "Audit crawl data cleared and wiped successfully", "cleared": True}

@router.get("/crawls")
async def list_crawls(
    db: AsyncSession = Depends(get_db),
    user: UserSession = Depends(get_current_user)
):
    cutoff = datetime.utcnow() - timedelta(hours=24)
    user_project_id = await get_user_project_id(db, user)
    result = await db.execute(
        select(Crawl)
        .where(
            Crawl.project_id == user_project_id,
            Crawl.started_at >= cutoff
        )
        .order_by(Crawl.id.asc())
    )
    return result.scalars().all()

@router.get("/crawls/latest")
async def get_latest_crawl(
    mode: Optional[str] = Query(None, pattern="^(site|page)$"),
    db: AsyncSession = Depends(get_db),
    user: UserSession = Depends(get_current_user)
):
    user_project_id = await get_user_project_id(db, user)
    latest_q = select(Crawl).where(Crawl.project_id == user_project_id)
    if mode:
        latest_q = latest_q.where(Crawl.mode == mode)
    result = await db.execute(latest_q.order_by(Crawl.id.desc()).limit(1))
    crawl = result.scalars().first()
    if not crawl:
        raise HTTPException(status_code=404, detail="No crawl found for current workspace")
    
    # 24-hour Retention Verification
    cutoff = datetime.utcnow() - timedelta(hours=24)
    ref_time = crawl.completed_at or crawl.started_at
    if ref_time and ref_time < cutoff:
        from app.services.ttl_cleanup_service import purge_expired_crawls
        asyncio.create_task(purge_expired_crawls(max_age_hours=24))
        raise HTTPException(
            status_code=404, 
            detail="Audit data expired (24-hour retention limit). Please start a fresh audit."
        )
        
    return crawl

@router.get("/crawls/{crawl_id}/status")
async def get_crawl_status(
    crawl_id: int, 
    db: AsyncSession = Depends(get_db),
    user: UserSession = Depends(get_current_user)
):
    crawl = await _owned_crawl(db, crawl_id, user)
        
    cutoff = datetime.utcnow() - timedelta(hours=24)
    ref_time = crawl.completed_at or crawl.started_at
    if ref_time and ref_time < cutoff:
        from app.services.ttl_cleanup_service import purge_expired_crawls
        asyncio.create_task(purge_expired_crawls(max_age_hours=24))
        raise HTTPException(status_code=404, detail="Crawl expired (24-hour retention limit)")

    page_count = await db.scalar(select(func.count(Page.id)).where(Page.crawl_id == crawl_id))
    if crawl.status == "queued" and CRAWL_RUNNER == "worker":
        # Position among queued crawls of the same kind (normal or JavaScript), oldest first, from the database.
        def _is_js(mode, summary):
            return bool(((summary or {}).get("request") or {}).get("js_rendering")) and mode != "page"
        mine = _is_js(crawl.mode, crawl.summary)
        rows = (await db.execute(select(Crawl.mode, Crawl.summary).where(
            Crawl.status == "queued", Crawl.id <= crawl.id))).all()
        queue_position = sum(1 for mode, s in rows if _is_js(mode, s) == mine) or 1
    else:
        queue_position = crawl_queue.position(crawl_id) if crawl.status == "queued" else None
        if crawl.status == "queued" and queue_position is None and not crawl_queue.is_running(crawl_id):
            queue_position = 1  # queued in the database but not in this process's queue (between restart and re-queue)

    return {
        "status": crawl.status,
        "mode": getattr(crawl, "mode", "site"),
        # queued -> crawling -> analysing (duplicates, links, sitemaps) -> enriching (PageSpeed, Search Console, AI)
        "phase": "queued" if crawl.status == "queued" else (
            (crawl.summary or {}).get("phase", "crawling") if crawl.status == "running" else crawl.status),
        "queue_position": queue_position,
        "pages_crawled": page_count,
        # AuditPro Helper: pages offered to / fetched by the user's browser (None when the helper was not used).
        "helper": (crawl.summary or {}).get("helper"),
        "started_at": crawl.started_at,
        "completed_at": crawl.completed_at
    }

@router.get("/crawls/{crawl_id}/summary")
async def get_crawl_summary(
    crawl_id: int,
    db: AsyncSession = Depends(get_db),
    user: UserSession = Depends(get_current_user),
):
    """Scores (Site Health, categories, page scores, per-rule results, integration scores) from the
    single backend scoring engine. Cached on the crawl once it has completed."""
    from app.services.scoring import SCORING_VERSION, compute_scores
    from sqlalchemy.orm.attributes import flag_modified

    crawl = await _owned_crawl(db, crawl_id, user)
    cached = (crawl.summary or {}).get("scores")
    if crawl.status == "completed" and cached and cached.get("scoring_version") == SCORING_VERSION:
        return {**cached, "crawl": _crawl_facts(crawl, cached)}

    rows = (await db.execute(
        select(Page.id, Page.url, Page.status_code, Page.content_type, Page.indexability,
               Page.indexability_status, Page.audit_data).where(Page.crawl_id == crawl_id)
    )).all()
    pages = [
        {"id": r.id, "url": r.url, "status_code": r.status_code, "content_type": r.content_type,
         "indexability": getattr(r.indexability, "value", r.indexability),
         "indexability_status": r.indexability_status, "audit_data": r.audit_data or {}}
        for r in rows
    ]
    integ_rows = (await db.execute(
        select(Integration.integration_type, Integration.config_json)
        .where(Integration.project_id == crawl.project_id, Integration.connected == True)
    )).all()
    integration_data = {t: (cfg or {}).get("data") or {} for t, cfg in integ_rows}

    scores = compute_scores(pages, mode=getattr(crawl, "mode", "site") or "site", integration_data=integration_data)
    if crawl.status == "completed":
        crawl.summary = {**(crawl.summary or {}), "scores": scores}
        flag_modified(crawl, "summary")
        await db.commit()
    return {**scores, "crawl": _crawl_facts(crawl, scores)}


def _crawl_facts(crawl: Crawl, scores: Optional[dict] = None) -> dict:
    summary = crawl.summary or {}
    return {
        "id": crawl.id, "mode": getattr(crawl, "mode", "site"), "status": crawl.status,
        "seed_url": crawl.seed_url, "sitemap": summary.get("sitemap"),
        "ai_crawlers": summary.get("ai_crawlers"),
        # What was crawled and why any discovered URLs were left out (limits, exclusions).
        "coverage": summary.get("coverage"),
        # Settings the crawl ran with, and how many HTML pages were left out of duplicate checks (and why).
        "settings": summary.get("settings"),
        "duplicates_excluded": summary.get("duplicates_excluded"),
        # Ordered [{label, impact, detail}] explaining the headline Site Health score (impacts sum to score - 100).
        "score_explanation": (scores or {}).get("score_explanation"),
        # Pages whose fetch failed for a reason that is not the site's fault: excluded from the score.
        "not_counted": (scores or {}).get("not_counted"),
        # Bot protection that stopped the crawler: {"provider", "count", "user_agent"}; None when not blocked.
        "blocked": summary.get("blocked"),
        # URLs that still failed after all retries (capped list) and how many there were in total.
        "failed_urls": summary.get("failed_urls"),
        "failed_urls_total": summary.get("failed_urls_total"),
    }


@router.get("/crawls/{crawl_id}/pages", response_model=List[PageSummary])
async def get_crawl_pages(
    crawl_id: int,
    filter: str = "internal",
    skip: int = Query(0, ge=0),
    limit: int = Query(1000, ge=1, le=MAX_CRAWL_PAGES),
    after_id: Optional[int] = Query(None, ge=0, description="Keyset pagination / incremental polling: only pages with id > after_id"),
    db: AsyncSession = Depends(get_db),
    user: UserSession = Depends(get_current_user),
):
    await _owned_crawl(db, crawl_id, user)
    query = select(Page).where(Page.crawl_id == crawl_id).order_by(Page.id.asc())
    if after_id is not None:
        query = query.where(Page.id > after_id)
    
    if filter == "internal":
        query = query.where(Page.status_code.is_not(None))
    elif filter == "client_error":
        query = query.where(Page.status_code >= 400).where(Page.status_code < 500)
    
    query = query.offset(skip).limit(limit)
    result = await db.execute(query)
    pages = result.scalars().all()
    
    return pages

@router.get("/pages/{page_id}", response_model=PageSummary)
async def get_page(page_id: int, db: AsyncSession = Depends(get_db), user: UserSession = Depends(get_current_user)):
    return await _owned_page(db, page_id, user)

@router.get("/pages/{page_id}/inlinks", response_model=List[LinkSummary])
async def get_page_inlinks(page_id: int, db: AsyncSession = Depends(get_db), user: UserSession = Depends(get_current_user)):
    """Pages that link here: a sample (up to 100) stored on the page by post-processing; the full count is
    in audit_data.Links.Inlinks."""
    page = await _owned_page(db, page_id, user)
    sample = (await db.execute(select(Page.inlinks_sample).where(Page.id == page_id))).scalar() or []
    source_ids = {rec.get("p") for rec in sample if rec.get("p") is not None}
    source_urls: Dict[int, str] = {}
    if source_ids:
        rows = await db.execute(select(Page.id, Page.url).where(Page.id.in_(source_ids), Page.crawl_id == page.crawl_id))
        source_urls = {pid: url for pid, url in rows.all()}
    return [
        LinkSummary(
            id=idx,
            source_page_id=rec.get("p"),
            source_url=source_urls.get(rec.get("p")),
            destination_url=page.url,
            anchor_text=rec.get("a"),
            is_follow=not rec.get("n"),
            link_type=rec.get("t") or "A",
            is_internal=True,
        )
        for idx, rec in enumerate(sample, start=1)
        if rec.get("p") in source_urls
    ]

@router.get("/pages/{page_id}/outlinks", response_model=List[LinkSummary])
async def get_page_outlinks(page_id: int, db: AsyncSession = Depends(get_db), user: UserSession = Depends(get_current_user)):
    page = await _owned_page(db, page_id, user)
    outlinks = (await db.execute(select(Page.outlinks).where(Page.id == page_id))).scalar() or []
    return [
        LinkSummary(
            id=idx,
            source_page_id=page_id,
            source_url=page.url,
            destination_url=rec.get("u") or "",
            anchor_text=rec.get("a"),
            is_follow=not rec.get("n"),
            link_type=rec.get("t") or "A",
            is_internal=not rec.get("x"),
        )
        for idx, rec in enumerate(outlinks, start=1)
    ]

from pydantic import BaseModel, Field
import os
from app.models.domain import Integration
from app.services.enrichment_service import EnrichmentService

class PerformanceAnalyzeRequest(BaseModel):
    url: str
    project_id: int = 1

@router.post("/performance/analyze", dependencies=[Depends(rate_limit("ai"))])
async def analyze_single_url_performance(
    req: PerformanceAnalyzeRequest, 
    db: AsyncSession = Depends(get_db),
    user: UserSession = Depends(get_current_user)
):
    # Workspace is always derived from the verified user; any client-supplied project_id is ignored.
    req.project_id = await get_user_project_id(db, user)
    try:
        await assert_public_url(req.url)
    except UnsafeURLError as e:
        raise HTTPException(status_code=400, detail=f"This URL cannot be analysed: {e}.")
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
    issue_name: str = Field(..., max_length=200)
    url: str = Field(..., max_length=2048)
    current_value: Optional[str] = Field(None, max_length=1000)
    page_title: Optional[str] = None
    h1_elements: Optional[List[str]] = None
    meta_description: Optional[str] = None
    word_count: Optional[int] = None

import httpx
import json
from typing import Optional
from app.services.prompt_engine import JSON_SCHEMAS, _clean, CORE_RULES


async def _page_dossier(db: AsyncSession, url: str, project_id: int, integrations: Dict[str, Any]):
    """Facts for a URL: the crawled page if this workspace has it, otherwise a live SSRF-guarded fetch."""
    page = (await db.execute(_project_page_by_url(url, project_id))).scalars().first()
    if page:
        return AuditDossierBuilder.build_page_dossier(page), page
    try:
        await assert_public_url(url)
    except UnsafeURLError as e:
        raise HTTPException(status_code=400, detail=f"This URL cannot be analysed: {e}.")
    html_content, status_code = "", 0
    try:
        async with safe_async_client(timeout=10.0) as client:
            r = await get_limited(client, url)
            status_code, html_content = r.status_code, r.text
    except Exception as e:
        logger.info("Live fetch failed for %s: %s", url, type(e).__name__)
    ps_data = None
    ps_int = integrations.get("pagespeed")
    if html_content and ps_int and getattr(ps_int, "api_key", None):
        try:
            vitals = await EnrichmentService(crawl_id=0, db=db)._fetch_pagespeed_vitals(url, ps_int.api_key, 0)
            ps_data = vitals
        except Exception:
            ps_data = None
    dossier = AuditDossierBuilder.build_scraped_dossier(url, html_content, status_code)
    if ps_data:
        dossier = AuditDossierBuilder.build_scraped_dossier(url, html_content, status_code, pagespeed_data=ps_data)
    return dossier, None


def _ai_off_response(message: str, data: Dict[str, Any]) -> Dict[str, Any]:
    return {"success": True, "powered_by": message, "is_live_ai": False, "data": data}


@router.post("/audits/ai-remediate", dependencies=[Depends(rate_limit("ai"))])
async def generate_ai_remediation(
    req: AiRemediateRequest,
    db: AsyncSession = Depends(get_db),
    user: UserSession = Depends(get_current_user)
):
    # Workspace is always derived from the verified user; any client-supplied project_id is ignored.
    req.project_id = await get_user_project_id(db, user)
    integrations = await PromptEngine.resolve_integrations(db, req.project_id)
    dossier, _page = await _page_dossier(db, req.url, req.project_id, integrations)

    user_prompt = (
        f"Flagged issue: {_clean(req.issue_name, 200)}\n"
        f"Flagged value reported by the crawler: {_clean(req.current_value, 500) or 'not provided'}\n\n"
        f"{AuditDossierBuilder.format_dossier_markdown(dossier)}\n\n"
        "Explain this issue for this page and give the exact fix."
    )
    success, powered_by, data = await PromptEngine.execute_llm_json(
        system_prompt=PromptArchetypes.get_issue_remediation_system_prompt(),
        user_prompt=user_prompt, integrations=integrations, max_output_tokens=1500,
        response_schema=JSON_SCHEMAS["remediation"],
    )
    if success and data:
        return {"success": True, "powered_by": powered_by, "is_live_ai": True, "data": data}

    platform = dossier["platform"]
    return _ai_off_response("Rule-based guidance (no AI provider connected)", {
        "summary": f"'{req.issue_name}' was flagged on {req.url}.",
        "root_cause": "Connect an AI provider (Gemini, OpenAI or Claude) in Integrations for a page-specific explanation.",
        "recommendations": [f"Where to fix on this site: {platform['template_hint']}",
                            "Apply the fix described in the issue's fix guide, then re-run the audit to confirm."],
        "code_snippet": "",
        "best_practice_rule": "",
    })


class AiExecutiveSummaryRequest(BaseModel):
    project_id: int = 1
    domain: str = Field("", max_length=300)
    health_score: Optional[int] = None
    critical_count: int = 0
    warning_count: int = 0
    opportunity_count: int = 0
    top_issues: Optional[List[str]] = None
    perplexity_citation_status: Optional[str] = None
    # The summary is stored with the crawl: returned from there when present, generated (and stored) otherwise.
    crawl_id: Optional[int] = None
    regenerate: bool = False


async def _latest_completed_crawl(db: AsyncSession, project_id: int, mode: Optional[str] = "site") -> Optional[Crawl]:
    q = select(Crawl).where(Crawl.project_id == project_id, Crawl.status == "completed")
    if mode:
        q = q.where(Crawl.mode == mode)
    return (await db.execute(q.order_by(Crawl.id.desc()).limit(1))).scalars().first()


@router.post("/audits/ai-executive-summary", dependencies=[Depends(rate_limit("ai"))])
async def generate_ai_executive_summary(
    req: AiExecutiveSummaryRequest,
    db: AsyncSession = Depends(get_db),
    user: UserSession = Depends(get_current_user)
):
    req.project_id = await get_user_project_id(db, user)
    integrations = await PromptEngine.resolve_integrations(db, req.project_id)

    # Ground the summary in the scoring engine's results for the workspace's latest crawl.
    if req.crawl_id is not None:
        crawl = await _owned_crawl(db, req.crawl_id, user)
    else:
        crawl = await _latest_completed_crawl(db, req.project_id) or await _latest_completed_crawl(db, req.project_id, None)
    stored = ((crawl.summary or {}).get("executive_summary") if crawl else None) or {}
    if stored.get("data") and not req.regenerate:
        return {"success": True, "powered_by": stored.get("powered_by"), "is_live_ai": True,
                "data": stored["data"], "cached": True}
    scores = None
    if crawl:
        scores = await get_crawl_summary(crawl.id, db=db, user=user)
    lines = [f"Domain: {_clean(req.domain or (crawl.seed_url if crawl else ''), 200)}"]
    if scores:
        sh = scores["site_health"]
        lines.append(f"Audit type: {'single page' if scores['mode'] == 'page' else 'whole site'}; URLs evaluated: {scores['urls_evaluated']}")
        lines.append(f"Site Health: {sh['score']}/100 ({sh['band']}); URLs without critical errors: {sh['url_pass_rate']}%; "
                     f"severity-weighted check pass rate: {sh['weighted_pass_rate']}%")
        lines.append("URLs with at least one issue: critical {critical}, warning {warning}, notice {notice}".format(**sh["urls_with"]))
        failing = sorted((r for r in scores["rules"] if r["status"] == "fail" and not r.get("integration")),
                         key=lambda r: ({"critical": 0, "warning": 1, "notice": 2}[r["severity"]], -r["failing_count"]))[:8]
        lines.append("Top issues (severity, affected URLs / evaluated URLs):")
        lines += [f"- {r['id']} ({r['severity']}, {r['failing_count']}/{r['evaluated_count']})" for r in failing] or ["- none"]
        cats = ", ".join(f"{k} {v['score']}" for k, v in scores["categories"].items() if v["score"] is not None)
        lines.append(f"Category scores: {cats or 'none'}")
        integ = scores["integrations"]
        gsc, ga = integ.get("search_console", {}), integ.get("google_analytics", {})
        if gsc.get("status") == "ok":
            lines.append(f"Search Console (30 days, crawled URLs): {gsc['clicks']} clicks, {gsc['impressions']} impressions")
        if ga.get("status") in ("ok", "insufficient"):
            lines.append(f"GA4 sessions (30 days): {ga.get('sessions_30d')}")
        ps = integ.get("pagespeed", {})
        if ps.get("status") == "ok":
            lines.append(f"PageSpeed lab score (mobile avg): {ps.get('lab_score_mobile')}; "
                         f"Core Web Vitals field pass: {(ps.get('core_web_vitals') or {}).get('passed', 'no field data')}")
    else:
        lines.append(f"Health score: {req.health_score}; failing checks: {req.critical_count} critical, "
                     f"{req.warning_count} warning, {req.opportunity_count} notice")
        if req.top_issues:
            lines.append("Top issues: " + "; ".join(_clean(i, 120) for i in req.top_issues[:8]))

    success, powered_by, data = await PromptEngine.execute_llm_json(
        system_prompt=PromptArchetypes.get_executive_summary_system_prompt(),
        user_prompt="Audit results:\n" + "\n".join(lines) + "\n\nWrite the summary.",
        integrations=integrations, max_output_tokens=1500, response_schema=JSON_SCHEMAS["executive"],
    )
    if success and data:
        if crawl is not None and crawl.status == "completed":
            from sqlalchemy.orm.attributes import flag_modified
            crawl.summary = {**(crawl.summary or {}), "executive_summary": {
                "data": data, "powered_by": powered_by, "generated_at": datetime.utcnow().isoformat()}}
            flag_modified(crawl, "summary")
            await db.commit()
        return {"success": True, "powered_by": powered_by, "is_live_ai": True, "data": data}

    score = (scores or {}).get("site_health", {}).get("score", req.health_score)
    return _ai_off_response("Rule-based summary (no AI provider connected)", {
        "executive_takeaway": f"Site Health is {score if score is not None else '—'}/100 for this audit.",
        "technical_debt_impact": "Resolve critical issues first: they stop pages from being crawled, indexed or shown correctly.",
        "revenue_growth_opportunity": "Connect an AI provider and Search Console/GA4 for an impact narrative based on your traffic.",
        "priority_actions": [],
        "what_is_working": [],
        "data_gaps": ["AI provider", "Search Console", "GA4"],
    })


class AiDiagnoseIssueRequest(BaseModel):
    project_id: int = 1
    issue_name: str = Field(..., max_length=200)
    category: Optional[str] = Field(None, max_length=80)
    domain: Optional[str] = Field(None, max_length=300)
    total_affected: Optional[int] = 1
    sample_pages: Optional[List[Dict[str, Any]]] = None
    api_key: Optional[str] = None
    ai_provider: Optional[str] = None

# Keyed by workspace + issue + sample URLs so one tenant's output is never served to another; bounded FIFO.
AI_ISSUE_DIAGNOSES_CACHE: Dict[str, Dict[str, Any]] = {}
AI_CACHE_MAX_ENTRIES = 2000


@router.post("/audits/ai-diagnose-issue", dependencies=[Depends(rate_limit("ai"))])
async def generate_ai_issue_diagnosis(
    req: AiDiagnoseIssueRequest,
    db: AsyncSession = Depends(get_db),
    user: UserSession = Depends(get_current_user)
):
    req.project_id = await get_user_project_id(db, user)
    clean_domain = (req.domain or "").lower().replace("https://", "").replace("http://", "").split("/")[0]
    sample_urls = [str(p.get("url", ""))[:500] for p in (req.sample_pages or [])[:3] if p.get("url")]
    cache_key = f"{req.project_id}:{clean_domain}:{req.issue_name}:{'|'.join(sample_urls)}"
    if cache_key in AI_ISSUE_DIAGNOSES_CACHE:
        return {**AI_ISSUE_DIAGNOSES_CACHE[cache_key], "cached": True}

    integrations = await PromptEngine.resolve_integrations(db, req.project_id)
    if req.api_key:
        provider = "gemini" if (req.api_key.startswith("AIza") or req.ai_provider == "gemini") else "openai"
        integrations[provider] = type("DirectKey", (), {"api_key": req.api_key, "connected": True, "config_json": {}})()

    # Samples are read from this workspace's crawl (real, server-side values), not trusted from the client.
    sample_blocks = []
    platform = None
    for u in sample_urls:
        page = (await db.execute(_project_page_by_url(u, req.project_id))).scalars().first()
        if page:
            dossier = AuditDossierBuilder.build_page_dossier(page)
            platform = platform or dossier["platform"]
            sample_blocks.append(AuditDossierBuilder.format_dossier_markdown(dossier))
    if not sample_blocks:
        sample_blocks.append("<page_facts>\nNo sample pages from this crawl were provided.\n</page_facts>")

    user_prompt = (
        f"Site: {_clean(clean_domain, 200) or 'unknown'}\n"
        f"Issue: {_clean(req.issue_name, 200)} (category {_clean(req.category, 80) or 'SEO'})\n"
        f"Affected URLs: {req.total_affected}\n"
        f"Platform: {(platform or {}).get('name', 'unknown - verify')} | Where to fix: {(platform or {}).get('template_hint', 'unknown - verify')}\n\n"
        "Sample affected pages:\n" + "\n\n".join(sample_blocks)
    )
    success, powered_by, data = await PromptEngine.execute_llm_json(
        system_prompt=PromptArchetypes.get_issue_diagnosis_system_prompt(),
        user_prompt=user_prompt, integrations=integrations, max_output_tokens=1500,
        response_schema=JSON_SCHEMAS["diagnosis"],
    )
    if success and data:
        result = {"success": True, "powered_by": powered_by, "is_live_ai": True, "data": data}
        if len(AI_ISSUE_DIAGNOSES_CACHE) >= AI_CACHE_MAX_ENTRIES:
            AI_ISSUE_DIAGNOSES_CACHE.pop(next(iter(AI_ISSUE_DIAGNOSES_CACHE)))
        AI_ISSUE_DIAGNOSES_CACHE[cache_key] = result
        return result

    # Without AI the UI keeps the curated rule guidance (empty fields fall back to it).
    return _ai_off_response("Curated rule guidance (no AI provider connected)", {
        "rootCause": "", "impact": "", "fixGuide": "", "exampleBefore": "", "exampleAfter": "", "tip": "",
    })


class AiPageDeepDiveRequest(BaseModel):
    project_id: int = 1
    url: str = Field(..., max_length=2048)
    user_query: Optional[str] = Field(None, max_length=1000)


# Element -> (audit_data category, issue flags shown in the Issues tab, recommended length range).
_REWRITE_ELEMENTS = {
    "title": ("Page_Titles", ["Missing", "Duplicate", "Multiple", "Over 60 Characters", "Below 30 Characters", "Same as H1"], (30, 60)),
    "meta_description": ("Meta_Description", ["Missing", "Duplicate", "Multiple", "Over 155 Characters", "Below 70 Characters"], (70, 155)),
    "h1": ("H1", ["Missing", "Duplicate", "Multiple", "Over 70 Characters"], (1, 70)),
}
_REWRITE_LABELS = {"title": "Page title", "meta_description": "Meta description", "h1": "H1 heading"}


def _content_elements(t1: Dict[str, Any], ad: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    """Current title / meta description / H1 and their issues, measured in code (never by the model)."""
    current = {"title": t1.get("page_title"), "meta_description": t1.get("meta_description"), "h1": t1.get("h1_primary")}
    out = {}
    for key, (category, flags, (lo, hi)) in _REWRITE_ELEMENTS.items():
        cat = ad.get(category) or {}
        issues = [f for f in flags if isinstance(cat, dict) and cat.get(f) is True]
        text = (current[key] or "").strip()
        if not text and "Missing" not in issues:
            issues.insert(0, "Missing")
        elif text and not issues and not (lo <= len(text) <= hi):
            issues.append(f"{len(text)} characters (recommended {lo}-{hi})")
        out[key] = {"current": text or None, "issues": issues, "range": [lo, hi]}
    return out


def _merge_rewrites(elements: Dict[str, Dict[str, Any]], proposed: Any) -> List[Dict[str, Any]]:
    """Current copy and issues (from the crawler) next to the model's proposed copy."""
    proposed = proposed if isinstance(proposed, dict) else {}
    rows = []
    for key, el in elements.items():
        p = proposed.get(key) if isinstance(proposed.get(key), dict) else {}
        text = str(p.get("proposed") or "").strip()[:400] or None
        # The model sometimes "proposes" the current copy unchanged: show that as keep-current, not a rewrite.
        keep_current = bool(text and el["current"] and text.casefold() == el["current"].strip().casefold())
        if keep_current:
            text = None
        lo, hi = el["range"]
        rows.append({
            "keep_current": keep_current,
            "element": key,
            "label": _REWRITE_LABELS[key],
            "current": el["current"],
            "current_length": len(el["current"] or ""),
            "issues": el["issues"],
            "status": "fix" if el["issues"] else "ok",
            "proposed": text,
            "proposed_length": len(text or ""),
            "proposed_in_range": bool(text) and lo <= len(text) <= hi,
            "recommended_range": [lo, hi],
            "reason": str(p.get("reason") or "").strip()[:500] or None,
        })
    return rows


@router.post("/audits/ai-page-deepdive", dependencies=[Depends(rate_limit("ai"))])
async def generate_ai_page_deepdive(
    req: AiPageDeepDiveRequest,
    db: AsyncSession = Depends(get_db),
    user: UserSession = Depends(get_current_user)
):
    from app.services.scoring import compute_scores

    req.project_id = await get_user_project_id(db, user)
    target_url = normalize_seed_url(req.url)
    integrations = await PromptEngine.resolve_integrations(db, req.project_id)
    dossier, page = await _page_dossier(db, target_url, req.project_id, integrations)

    # Scores come from the scoring engine (page mode), never from the model.
    t1 = dossier["tier1_crawl"]
    composite, breakdown = None, {}
    if t1.get("fetched", True):
        if page is not None:
            page_dict = {"id": page.id, "url": page.url, "status_code": page.status_code, "content_type": page.content_type,
                         "indexability": getattr(page.indexability, "value", page.indexability),
                         "indexability_status": page.indexability_status, "audit_data": page.audit_data or {}}
        else:  # live-fetched page: score the audit data extracted by the same code as the crawler
            page_dict = {"id": 0, "url": target_url, "status_code": t1.get("status_code"), "content_type": "text/html",
                         "indexability": t1.get("indexability"), "indexability_status": t1.get("indexability_status"),
                         "audit_data": dossier.get("_audit_data") or {}}
        if page_dict:
            sc = compute_scores([page_dict], mode="page")
            composite = sc.get("page_score")
            breakdown = {name: {"score": c["score"], "status": c["band"] or "Not evaluated"}
                         for name, c in sc["categories"].items()}
            ps = sc["integrations"].get("pagespeed", {})
            breakdown["Core Web Vitals"] = {"score": ps.get("lab_score_mobile"),
                                            "status": "Lab (mobile)" if ps.get("status") == "ok" else "Not measured"}

    page_ad = (page.audit_data or {}) if page is not None else (dossier.get("_audit_data") or {})
    elements = _content_elements(t1, page_ad)
    element_lines = "\n".join(
        f"- {_REWRITE_LABELS[k]}: current={_clean(v['current'], 300)!r} ({len(v['current'] or '')} chars); "
        f"issues: {', '.join(v['issues']) or 'none'}"
        for k, v in elements.items()
    )
    user_prompt = (
        f"Review this page: {_clean(target_url, 500)}\n\n{AuditDossierBuilder.format_dossier_markdown(dossier)}\n"
        f"\nCopy to rewrite (issues measured by the crawler):\n{element_lines}\n"
        + (f"\nThe owner asks: {_clean(req.user_query, 1000)}\n" if req.user_query else "")
    )
    success, powered_by, data = await PromptEngine.execute_llm_json(
        system_prompt=PromptArchetypes.get_page_deepdive_system_prompt(),
        user_prompt=user_prompt, integrations=integrations, max_output_tokens=2600,
        response_schema=JSON_SCHEMAS["deepdive"],
    )
    provider = active_ai_provider(integrations)
    if not success or not data:
        if provider:
            reason = powered_by or ""
            if reason.startswith("rate_limited"):
                wait = reason.split(":", 1)[1] if ":" in reason else "60"
                powered_by = f"{provider['label']} rate-limited"
                verdict = (f"{provider['label']} is rate-limiting this API key, so the written review and rewrites "
                           f"were skipped. Retry in about {wait} seconds; if it keeps happening, the key's quota "
                           "is used up for now. Scores below are computed from the page's checks.")
            else:
                powered_by = f"{provider['label']} unavailable"
                verdict = (f"{provider['label']} did not answer (it may be busy). Retry in a minute. "
                           "Scores below are computed from the page's checks.")
        else:
            powered_by = "Crawl facts only (no AI provider connected)"
            verdict = "Connect an AI provider in Integrations for a written review and copy rewrites. Scores below are computed from the page's checks."
        data = {
            "verdict": verdict, "key_takeaway": None, "search_intent": None,
            "critical_findings": [], "production_code_fix": "", "aeo_direct_answer_block": "", "strategic_advice": "",
        }
    # The UI labels this block as proposed copy, so a label from the model would end up in the pasted text.
    answer_block = str(data.get("aeo_direct_answer_block") or "")
    data["aeo_direct_answer_block"] = re.sub(r"^\s*proposed copy[^:]{0,30}:\s*", "", answer_block, flags=re.I)
    data["composite_score"] = composite
    data["score_breakdown"] = breakdown
    data["content_rewrites"] = _merge_rewrites(elements, data.get("content_rewrites") if success else None)
    dossier.pop("_audit_data", None)
    return {
        "success": True,
        "powered_by": powered_by,
        "ai_provider": provider,
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "is_live_ai": success,
        "tier": dossier["tier"],
        "tier_badges": dossier["tier_badges"],
        "platform": dossier["platform"],
        "data": data,
        "dossier": dossier,
        "dossier_markdown": AuditDossierBuilder.format_dossier_markdown(dossier),
    }


@router.delete("/me/data")
async def delete_my_data(
    db: AsyncSession = Depends(get_db),
    user: UserSession = Depends(get_current_user),
):
    """Delete every audit, integration (revoking Google grants) and the workspace for this user.
    The sign-in account itself lives in Supabase Auth and is removed there."""
    from app.api.integrations import remove_integrations
    projects = (await db.execute(select(Project).where(Project.user_id == user.id))).scalars().all()
    for project in projects:
        await _wipe_all_crawl_data(db, project_id=project.id)
        await remove_integrations(db, project.id)
        await db.delete(project)
    await db.commit()
    for key in [k for k in AI_ISSUE_DIAGNOSES_CACHE if any(k.startswith(f"{p.id}:") for p in projects)]:
        AI_ISSUE_DIAGNOSES_CACHE.pop(key, None)
    return {"deleted": True, "workspaces": len(projects)}
