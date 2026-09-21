from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import declarative_base, sessionmaker
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite+aiosqlite:///./seo_audit.db"
    REDIS_URL: str = "redis://localhost:6379/0"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()

import os
from urllib.parse import urlparse

# Clean and normalize database URL
db_url = (settings.DATABASE_URL or "sqlite+aiosqlite:///./seo_audit.db").strip().strip('"\'')

if db_url.startswith("postgresql://"):
    db_url = db_url.replace("postgresql://", "postgresql+asyncpg://", 1)
elif db_url.startswith("postgres://"):
    db_url = db_url.replace("postgres://", "postgresql+asyncpg://", 1)
elif db_url.startswith("sqlite://") and not db_url.startswith("sqlite+aiosqlite://"):
    db_url = db_url.replace("sqlite://", "sqlite+aiosqlite://", 1)

# Configure engine
if "postgresql" in db_url or "asyncpg" in db_url:
    connect_args = {}
    # If using Supabase / transaction poolers or pgbouncer, disable prepared statement caching to prevent pooler errors
    if "pooler.supabase.com" in db_url or ":6543" in db_url or "pgbouncer" in db_url:
        connect_args["statement_cache_size"] = 0

    engine = create_async_engine(
        db_url,
        echo=False,
        pool_size=25,
        max_overflow=15,
        pool_pre_ping=True,
        pool_recycle=300,
        connect_args=connect_args
    )
else:
    # Ensure SQLite parent directory exists if a path is specified (e.g., /app/data/seo_audit.db)
    if "sqlite" in db_url:
        sqlite_path = db_url.split(":///")[-1] if ":///" in db_url else ""
        if sqlite_path and os.path.dirname(sqlite_path):
            try:
                os.makedirs(os.path.dirname(sqlite_path), exist_ok=True)
            except Exception:
                pass
    engine = create_async_engine(db_url, echo=False)

AsyncSessionLocal = sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)

Base = declarative_base()

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
