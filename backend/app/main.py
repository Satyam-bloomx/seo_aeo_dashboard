import sys
import asyncio
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime

from dotenv import load_dotenv
load_dotenv()

if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text, update

from app.api.endpoints import router as api_router
from app.api.integrations import router as integrations_router
from app.api.helper import router as helper_router
from app.api.keywords import router as keywords_router
from app.core.redis import init_redis, close_redis
from app.core.database import engine, Base
from app.core.config import IS_PRODUCTION, cors_origins
import app.models.domain  # Register all models with Base.metadata

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
# httpx logs full request URLs at INFO, which can include third-party API keys.
logging.getLogger("httpx").setLevel(logging.WARNING)
logger = logging.getLogger("app")


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    except Exception:
        logger.exception("Database initialization failed during startup")

    # Crawls still marked "running" were interrupted by a restart: record them as failed,
    # never as completed, so partial data is not presented as a finished audit.
    # This assumes a SINGLE backend instance: with two or more instances on one database, restarting one
    # would also fail the crawls the others are still running. Add a per-instance owner id to Crawl before scaling out.
    # In worker mode the API never touches crawl state on start-up: workers recover their own crawls by heartbeat.
    from app.services.crawl_queue import CRAWL_RUNNER
    if CRAWL_RUNNER != "worker":
        try:
            from app.models.domain import Crawl
            async with engine.begin() as conn:
                await conn.execute(
                    update(Crawl)
                    .where(Crawl.status == "running")
                    .values(status="failed", completed_at=datetime.utcnow())
                )
        except Exception:
            logger.exception("Could not mark interrupted crawls as failed")

        # Crawls that were still waiting for a slot go back in the queue.
        try:
            from app.api.endpoints import requeue_waiting_crawls
            requeued = await requeue_waiting_crawls()
            if requeued:
                logger.info("Re-queued %s crawl(s) that were waiting when the server stopped", requeued)
        except Exception:
            logger.exception("Could not re-queue waiting crawls")

    # 24-hour retention: purge on startup, then hourly so data never outlives the TTL by much.
    try:
        from app.services.ttl_cleanup_service import purge_expired_crawls, start_periodic_ttl_worker
        ttl_res = await purge_expired_crawls(max_age_hours=24)
        if ttl_res.get("purged_crawls", 0) > 0:
            logger.info("TTL startup purge removed %s expired crawl(s)", ttl_res["purged_crawls"])
        app.state.ttl_worker_task = asyncio.create_task(
            start_periodic_ttl_worker(interval_seconds=3600, max_age_hours=24)
        )
    except Exception:
        logger.exception("TTL purge service initialization failed")

    await init_redis()
    yield

    task = getattr(app.state, "ttl_worker_task", None)
    if task:
        task.cancel()
    from app.api.endpoints import active_crawler_tasks
    from app.services.crawl_queue import crawl_queue
    await crawl_queue.shutdown()
    for crawl_task in list(active_crawler_tasks.values()):
        crawl_task.cancel()
    try:
        from app.services.browser_pool import browser_pool
        from app.services.parse_pool import shutdown_pool
        await browser_pool.close()
        shutdown_pool()
    except Exception:
        logger.exception("Could not release the shared browser / parser pool")
    await close_redis()


app = FastAPI(
    title="SEO Audit API",
    lifespan=lifespan,
    docs_url=None if IS_PRODUCTION else "/docs",
    redoc_url=None if IS_PRODUCTION else "/redoc",
    openapi_url=None if IS_PRODUCTION else "/openapi.json",
)

# Crawl JSON compresses ~25x (measured 1.9 MB -> 71 KB for 500 pages).
app.add_middleware(GZipMiddleware, minimum_size=1024)

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins(),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("Cache-Control", "no-store")
    if IS_PRODUCTION:
        response.headers.setdefault("Strict-Transport-Security", "max-age=63072000; includeSubDomains")
    return response


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    # Never leak stack traces, SQL or upstream error bodies to clients.
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


@app.get("/")
async def root():
    return {"status": "ok", "service": "SEO Audit API"}


@app.get("/health")
async def health():
    return {"status": "healthy"}


@app.get("/health/ready")
async def readiness():
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
    except Exception:
        logger.exception("Readiness check failed")
        return JSONResponse(status_code=503, content={"status": "unavailable"})
    return {"status": "ready"}


app.include_router(api_router, prefix="/api")
app.include_router(integrations_router, prefix="/api/integrations")
app.include_router(helper_router, prefix="/api")  # AuditPro Helper relay (browser extension)
app.include_router(keywords_router, prefix="/api")  # Keywords & AI answers (SerpAPI checks)
# The legacy synchronous /api/audits pipeline was removed: it was
# unauthenticated, unthrottled and fetched arbitrary URLs.

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=not IS_PRODUCTION)
