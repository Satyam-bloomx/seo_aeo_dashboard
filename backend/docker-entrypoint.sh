#!/bin/sh
# Container entrypoint for the backend image (used by both the api and the worker service).
#
# RUN_MIGRATIONS=true (api service only): run `alembic upgrade head` before the command starts, holding a
# PostgreSQL advisory lock so two containers starting at once never migrate concurrently (the second waits,
# then finds nothing to do). Any migration failure stops the container with a clear log line, so Coolify
# marks the deploy failed and the old containers keep serving.
# The worker service never sets RUN_MIGRATIONS: it starts after the api is healthy (docker-compose depends_on).
set -eu

log() { echo "$(date -u '+%Y-%m-%d %H:%M:%S') entrypoint: $*"; }

if [ "${RUN_MIGRATIONS:-false}" = "true" ]; then
  log "RUN_MIGRATIONS=true: applying database migrations (alembic upgrade head)"
  if ! python - <<'PY'
import asyncio, os, subprocess, sys, time

from app.core.database import db_url

LOCK_KEY = 815_203_771  # arbitrary constant shared by every container of this app
LOCK_TIMEOUT = float(os.getenv("MIGRATION_LOCK_TIMEOUT_SECONDS", "300"))
BASELINE = (os.getenv("MIGRATIONS_BASELINE") or "").strip()


def say(msg):
    print(f"migrate: {msg}", flush=True)


def alembic(*args):
    say("alembic " + " ".join(args))
    return subprocess.run([sys.executable, "-m", "alembic", *args], cwd="/app").returncode


async def main():
    if not db_url.startswith("postgresql"):
        say(f"database is not PostgreSQL ({db_url.split(':', 1)[0]}): skipping migrations")
        return 0
    import asyncpg
    dsn = db_url.replace("postgresql+asyncpg://", "postgresql://", 1)
    conn = None
    for attempt in range(1, 31):  # the database may still be starting
        try:
            conn = await asyncpg.connect(dsn, statement_cache_size=0, timeout=10)
            break
        except Exception as e:
            say(f"database not reachable yet ({type(e).__name__}), attempt {attempt}/30")
            await asyncio.sleep(2)
    if conn is None:
        say("ERROR: could not connect to the database")
        return 1
    try:
        deadline = time.monotonic() + LOCK_TIMEOUT
        while not await conn.fetchval("SELECT pg_try_advisory_lock($1)", LOCK_KEY):
            if time.monotonic() > deadline:
                say(f"ERROR: another container held the migration lock for more than {LOCK_TIMEOUT:.0f} s")
                return 1
            say("another container is migrating; waiting for the lock")
            await asyncio.sleep(3)
        say("migration lock acquired")

        has_version = await conn.fetchval("SELECT to_regclass('alembic_version') IS NOT NULL")
        version = await conn.fetchval("SELECT version_num FROM alembic_version LIMIT 1") if has_version else None
        has_tables = await conn.fetchval("SELECT to_regclass('crawls') IS NOT NULL")
        say(f"current revision: {version or 'none'}")
        if version is None and has_tables:
            # Tables were created by the app (create_all) without Alembic: upgrading from zero would fail.
            if not BASELINE:
                say("ERROR: the database has tables but no Alembic revision. Find the revision that matches its "
                    "schema (see docs/DEPLOY_COOLIFY.md, 'Existing database without Alembic history'), set "
                    "MIGRATIONS_BASELINE=<revision> for ONE deploy, then remove it.")
                return 1
            if await asyncio.to_thread(alembic, "stamp", BASELINE):
                say("ERROR: alembic stamp failed")
                return 1
        if await asyncio.to_thread(alembic, "upgrade", "head"):
            say("ERROR: alembic upgrade head failed; the previous containers keep running. Fix the migration "
                "or restore the database, then redeploy.")
            return 1
        version = await conn.fetchval("SELECT version_num FROM alembic_version LIMIT 1")
        say(f"database is at revision {version}")
        return 0
    finally:
        try:
            await conn.execute("SELECT pg_advisory_unlock($1)", LOCK_KEY)
        except Exception:
            pass
        await conn.close()


sys.exit(asyncio.run(main()))
PY
  then
    log "FATAL: database migration failed; not starting the service"
    exit 1
  fi
  log "migrations complete"
fi

exec "$@"
