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

if db_url.startswith("sqlite") and ("./seo_audit.db" in db_url or db_url.endswith("seo_audit.db")):
    backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    db_file_path = os.path.join(backend_dir, "seo_audit.db").replace("\\", "/")
    db_url = f"sqlite+aiosqlite:///{db_file_path}"

# Configure engine
from sqlalchemy import event, text

if "postgresql" in db_url or "asyncpg" in db_url:
    connect_args = {}
    # If using Supabase / transaction poolers or pgbouncer, disable prepared statement caching to prevent pooler errors
    if "pooler.supabase.com" in db_url or ":6543" in db_url or "pgbouncer" in db_url:
        connect_args["statement_cache_size"] = 0
        connect_args["command_timeout"] = 60
        connect_args["server_settings"] = {"application_name": "seo_audit_api"}

    engine = create_async_engine(
        db_url,
        echo=False,
        pool_size=15,
        max_overflow=20,
        pool_pre_ping=True,
        pool_recycle=1800,
        pool_timeout=30,
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
    
    # SQLite async engine with 30s busy timeout and pool_pre_ping
    engine = create_async_engine(
        db_url, 
        echo=False,
        pool_pre_ping=True,
        connect_args={"timeout": 30.0}
    )

    # Attach SQLite PRAGMAs for concurrency (WAL), integrity (foreign_keys), and performance
    @event.listens_for(engine.sync_engine, "connect")
    def set_sqlite_pragmas(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys = ON;")
        cursor.execute("PRAGMA journal_mode = WAL;")
        cursor.execute("PRAGMA synchronous = NORMAL;")
        cursor.execute("PRAGMA busy_timeout = 30000;")
        cursor.execute("PRAGMA cache_size = -64000;")
        cursor.execute("PRAGMA temp_store = MEMORY;")
        cursor.close()

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

async def vacuum_sqlite_db():
    """
    Reclaims unused freelist disk space from SQLite after bulk deletions
    to prevent file size ballooning.
    """
    if "sqlite" in db_url:
        try:
            async with engine.connect() as conn:
                await conn.execution_options(isolation_level="AUTOCOMMIT")
                await conn.execute(text("VACUUM;"))
        except Exception as e:
            print(f"Notice: SQLite VACUUM skipped: {e}")

async def run_db_maintenance():
    """Performs WAL checkpointing and incremental cleanup."""
    if "sqlite" in db_url:
        try:
            async with engine.connect() as conn:
                await conn.execution_options(isolation_level="AUTOCOMMIT")
                await conn.execute(text("PRAGMA wal_checkpoint(PASSIVE);"))
        except Exception as e:
            print(f"Notice: SQLite checkpoint maintenance: {e}")

