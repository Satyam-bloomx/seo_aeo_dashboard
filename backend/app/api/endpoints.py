from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func
from typing import List
from datetime import datetime, timedelta

from app.core.database import get_db, AsyncSessionLocal
from app.models.domain import Project, Crawl, Page, Link
from app.models.schemas import CrawlRequest, CrawlResponse, PageSummary, LinkSummary
from app.services.crawler import CrawlerService

router = APIRouter()

async def _cleanup_old_crawls(db: AsyncSession):
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

async def _run_crawler_task(crawl_id: int, seed_url: str, request: CrawlRequest):
    async with AsyncSessionLocal() as session:
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
            user_agent=request.user_agent
        )
        await crawler.run()

@router.post("/crawls", response_model=CrawlResponse)
async def start_crawl(request: CrawlRequest, background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    # Clean up old data before starting a new crawl to save space
    await _cleanup_old_crawls(db)

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
    
    # Run crawler in background with dedicated DB session
    background_tasks.add_task(
        _run_crawler_task, 
        crawl.id, 
        request.seed_url, 
        request
    )
    
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
async def get_crawl_pages(crawl_id: int, filter: str = "internal", skip: int = 0, limit: int = 100, db: AsyncSession = Depends(get_db)):
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
        
    query = select(Link).where(Link.destination_url == page.url, Link.crawl_id == page.crawl_id)
    result = await db.execute(query)
    return result.scalars().all()

@router.get("/pages/{page_id}/outlinks", response_model=List[LinkSummary])
async def get_page_outlinks(page_id: int, db: AsyncSession = Depends(get_db)):
    query = select(Link).where(Link.source_page_id == page_id)
    result = await db.execute(query)
    return result.scalars().all()
