import sys
import asyncio

from dotenv import load_dotenv
load_dotenv()

if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.endpoints import router as api_router
from app.api.integrations import router as integrations_router
from app.features.audits.router import router as audits_router
from app.core.redis import init_redis, close_redis
from app.core.database import engine, Base
import app.models.domain  # Register all models with Base.metadata

import os

app = FastAPI(title="SEO Audit API")

origins_str = (os.getenv("CORS_ORIGINS") or "*").strip().strip('"\'')

if origins_str == "*" or not origins_str:
    # Allow all origins safely with credentials via regex wildcard
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=".*",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    raw_origins = [o.strip().rstrip('/') for o in origins_str.split(",") if o.strip()]
    origins = set()
    for o in raw_origins:
        origins.add(o)
        if o.startswith("http://"):
            origins.add(o.replace("http://", "https://", 1))
        elif o.startswith("https://"):
            origins.add(o.replace("https://", "http://", 1))
        elif "://" not in o:
            origins.add(f"http://{o}")
            origins.add(f"https://{o}")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(origins),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

from sqlalchemy import text

@app.on_event("startup")
async def startup_event():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # If running on PostgreSQL, ensure temporary high-write tables are UNLOGGED for maximum performance
        if engine.dialect.name == "postgresql":
            for table_name in ["pages", "links", "images"]:
                try:
                    await conn.execute(text(f"ALTER TABLE {table_name} SET UNLOGGED;"))
                except Exception as e:
                    print(f"PostgreSQL UNLOGGED notice for {table_name}: {e}")
    await init_redis()

@app.on_event("shutdown")
async def shutdown_event():
    await close_redis()

app.include_router(api_router, prefix="/api")
app.include_router(integrations_router, prefix="/api/integrations")
app.include_router(audits_router, prefix="/api/audits")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)

