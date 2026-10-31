"""Crawl worker: runs queued crawls from the database, separately from the API.

    python -m app.worker

Only active when CRAWL_RUNNER=worker. With CRAWL_RUNNER=inline (the default) the API runs crawls itself and this
process idles (it stays healthy so the same docker-compose.yml works in both modes; it never claims a crawl,
which would run it twice).

Design
- Claiming: a crawl row with status "queued" is claimed atomically by flipping it to "running" in one statement.
  PostgreSQL: UPDATE ... WHERE id = (SELECT id ... FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING ..., so any number of
  workers can poll the same table without double-claiming. SQLite (development): compare-and-set
  UPDATE ... WHERE id = :id AND status = 'queued' (SQLite has a single writer, so this is equally safe).
- Slots: CRAWL_SLOTS normal + JS_CRAWL_SLOTS JavaScript crawls per worker process. A crawl is "JavaScript" when
  summary.request.js_rendering is true and its mode is not "page" (same rule as the API's enqueue_crawl).
- Memory valve: no new crawl is claimed while the container uses more than WORKER_MAX_MEMORY_PCT of its limit.
- Running: the same function the API uses (app.api.endpoints._run_crawler_task), so results are identical.
- Heartbeat: every WORKER_HEARTBEAT_SECONDS the worker writes summary.worker_heartbeat (unix seconds) on each crawl it
  runs, with an atomic jsonb_set / json_set so it never overwrites what the crawler writes. A crawl row that
  disappears (the user cleared it or started a newer crawl) has its task cancelled.
- Recovery: any "running" crawl whose heartbeat is older than WORKER_STALE_SECONDS belongs to a worker that died
  (OOM kill, host reboot). After a confirmation wait (the heartbeat must stay unchanged, so a crawl that a live
  worker is still running is never touched) it is marked failed with a clear reason. Running crawls without any
  heartbeat (started by an API in inline mode) are only failed after STUCK_CRAWL_HOURS, which is also the time
  limit for crawls this worker runs.
- Shutdown (SIGTERM / SIGINT): stop claiming, let running crawls finish for up to WORKER_GRACE_SECONDS, then cancel
  the rest and mark them failed ("worker stopped before the crawl finished"). Keep the container's stop timeout
  (docker-compose stop_grace_period) above the grace period.
- Health: WORKER_HEALTH_FILE gets the current unix time after every successful poll of the database; the compose
  healthcheck fails when it is older than 90 s.
"""
import asyncio
import json
import logging
import os
import signal
import socket
import sys
import time
from datetime import datetime
from typing import Dict, Optional, Tuple

from dotenv import load_dotenv

load_dotenv()

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logging.getLogger("httpx").setLevel(logging.WARNING)
logger = logging.getLogger("worker")

from sqlalchemy import select, text  # noqa: E402
from sqlalchemy.orm.attributes import flag_modified  # noqa: E402

from app.core.database import AsyncSessionLocal, engine  # noqa: E402
import app.models.domain  # noqa: E402,F401  (register all models)
from app.models.domain import Crawl  # noqa: E402


def _int_env(name: str, default: int, minimum: int = 1) -> int:
    try:
        return max(minimum, int(os.getenv(name, str(default))))
    except ValueError:
        return default


def _float_env(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, str(default)))
    except ValueError:
        return default


CRAWL_RUNNER = (os.getenv("CRAWL_RUNNER") or "inline").strip().lower()
SLOTS = _int_env("CRAWL_SLOTS", 3)
JS_SLOTS = _int_env("JS_CRAWL_SLOTS", 1)
POLL_SECONDS = _float_env("WORKER_POLL_SECONDS", 2.0)
HEARTBEAT_SECONDS = _float_env("WORKER_HEARTBEAT_SECONDS", 15.0)
STALE_SECONDS = _float_env("WORKER_STALE_SECONDS", 180.0)
SWEEP_SECONDS = _float_env("WORKER_SWEEP_SECONDS", 60.0)
GRACE_SECONDS = _float_env("WORKER_GRACE_SECONDS", 100.0)
MAX_MEMORY_PCT = _float_env("WORKER_MAX_MEMORY_PCT", 75.0)
STUCK_CRAWL_HOURS = _float_env("STUCK_CRAWL_HOURS", 2.0)
HEALTH_FILE = os.getenv("WORKER_HEALTH_FILE", "/tmp/worker-heartbeat")
WORKER_ID = f"{socket.gethostname()}:{os.getpid()}"

IS_POSTGRES = engine.dialect.name == "postgresql"

REASON_SHUTDOWN = "The crawl worker was stopped (redeploy or restart) before the crawl finished. Please start the audit again."
REASON_STALE = "The crawl worker running this crawl stopped responding (crashed or was restarted). Please start the audit again."
REASON_STUCK = "The crawl did not finish within the time limit and was stopped. Please start the audit again."
REASON_BAD_REQUEST = "The stored crawl settings could not be read, so the crawl could not start."
REASON_NO_FINAL_STATUS = "The crawl ended without recording a result."


def _is_js(request: dict, mode: Optional[str]) -> bool:
    return bool((request or {}).get("js_rendering")) and (mode or (request or {}).get("mode") or "site") != "page"


def _as_dict(value) -> dict:
    if value is None:
        return {}
    if isinstance(value, (bytes, str)):
        try:
            value = json.loads(value)
        except ValueError:
            return {}
    return value if isinstance(value, dict) else {}


def _touch_health() -> None:
    try:
        with open(HEALTH_FILE, "w") as fh:
            fh.write(str(time.time()))
    except OSError:
        pass


def _memory_pct() -> Optional[float]:
    """Container memory use (excluding reclaimable page cache) as % of its limit; None when unknown."""
    try:
        if os.path.exists("/sys/fs/cgroup/memory.current"):  # cgroup v2
            current = int(open("/sys/fs/cgroup/memory.current").read())
            raw_max = open("/sys/fs/cgroup/memory.max").read().strip()
            stat_path, inactive_key = "/sys/fs/cgroup/memory.stat", "inactive_file"
        elif os.path.exists("/sys/fs/cgroup/memory/memory.usage_in_bytes"):  # cgroup v1
            current = int(open("/sys/fs/cgroup/memory/memory.usage_in_bytes").read())
            raw_max = open("/sys/fs/cgroup/memory/memory.limit_in_bytes").read().strip()
            stat_path, inactive_key = "/sys/fs/cgroup/memory/memory.stat", "total_inactive_file"
        else:
            return None
        inactive = 0
        with open(stat_path) as fh:
            for line in fh:
                key, _, val = line.partition(" ")
                if key == inactive_key:
                    inactive = int(val)
                    break
        limit = None if raw_max == "max" else int(raw_max)
        if not limit or limit > (1 << 60):  # no limit set: compare with host memory
            with open("/proc/meminfo") as fh:
                for line in fh:
                    if line.startswith("MemTotal:"):
                        limit = int(line.split()[1]) * 1024
                        break
        if not limit:
            return None
        return max(0, current - inactive) * 100.0 / limit
    except (OSError, ValueError):
        return None


class CrawlWorker:
    def __init__(self) -> None:
        self.stopping = asyncio.Event()
        self.wake = asyncio.Event()
        self.running: Dict[int, Tuple[asyncio.Task, bool]] = {}
        self.cancel_reason: Dict[int, str] = {}
        self.summary_type = "jsonb"
        self._memory_paused = False

    # ---------- database helpers ----------

    async def _detect_summary_type(self) -> None:
        """crawls.summary is jsonb when created by the app and json when added by migration d4e5f6a7b8c9."""
        if not IS_POSTGRES:
            return
        async with engine.connect() as conn:
            data_type = await conn.scalar(text(
                "SELECT data_type FROM information_schema.columns "
                "WHERE table_name = 'crawls' AND column_name = 'summary' "
                "ORDER BY (table_schema = current_schema()) DESC LIMIT 1"))
        self.summary_type = "json" if data_type == "json" else "jsonb"

    async def claim(self, js: bool) -> Optional[Tuple[int, str, dict]]:
        """Atomically move the oldest queued crawl of this kind to "running". Returns (id, seed_url, request)."""
        now = round(time.time(), 3)
        if IS_POSTGRES:
            col = self.summary_type
            js_expr = ("(COALESCE(CAST(summary AS jsonb)->'request'->>'js_rendering', 'false') = 'true' "
                       "AND COALESCE(mode, 'site') <> 'page')")
            kind = js_expr if js else f"NOT {js_expr}"
            sql = text(f"""
                UPDATE crawls SET status = 'running',
                    summary = CAST(jsonb_set(jsonb_set(COALESCE(CAST(summary AS jsonb), CAST('{{}}' AS jsonb)),
                        '{{worker_id}}', to_jsonb(CAST(:wid AS text))),
                        '{{worker_heartbeat}}', to_jsonb(CAST(:now AS double precision))) AS {col})
                WHERE status = 'queued' AND id = (
                    SELECT id FROM crawls WHERE status = 'queued' AND {kind}
                    ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1)
                RETURNING id, seed_url, CAST(CAST(summary AS jsonb)->'request' AS text) AS request
            """)
            async with engine.begin() as conn:
                row = (await conn.execute(sql, {"wid": WORKER_ID, "now": now})).first()
            if row is None:
                return None
            return row.id, row.seed_url, _as_dict(row.request)

        # SQLite (development): pick in Python, then compare-and-set.
        async with engine.begin() as conn:
            rows = (await conn.execute(text(
                "SELECT id, seed_url, summary, mode FROM crawls WHERE status = 'queued' ORDER BY id LIMIT 100"))).all()
            for row in rows:
                request = _as_dict(_as_dict(row.summary).get("request"))
                if _is_js(request, row.mode) != js:
                    continue
                res = await conn.execute(text(
                    "UPDATE crawls SET status = 'running', summary = json_set(COALESCE(summary, '{}'), "
                    "'$.worker_id', :wid, '$.worker_heartbeat', :now) WHERE id = :id AND status = 'queued'"),
                    {"wid": WORKER_ID, "now": now, "id": row.id})
                if res.rowcount == 1:
                    return row.id, row.seed_url, request
        return None

    async def heartbeat(self, crawl_id: int) -> Optional[bool]:
        """True: heartbeat written. False: the crawl is no longer running. None: the crawl row is gone."""
        now = round(time.time(), 3)
        async with engine.begin() as conn:
            if IS_POSTGRES:
                # Never wait long behind a lock held by the crawler's own session.
                await conn.execute(text("SET LOCAL lock_timeout = '5s'"))
                col = self.summary_type
                sql = text(f"""
                    UPDATE crawls SET summary = CAST(jsonb_set(COALESCE(CAST(summary AS jsonb), CAST('{{}}' AS jsonb)),
                        '{{worker_heartbeat}}', to_jsonb(CAST(:now AS double precision))) AS {col})
                    WHERE id = :id AND status = 'running'""")
            else:
                sql = text("UPDATE crawls SET summary = json_set(COALESCE(summary, '{}'), '$.worker_heartbeat', :now) "
                           "WHERE id = :id AND status = 'running'")
            res = await conn.execute(sql, {"now": now, "id": crawl_id})
            if res.rowcount:
                return True
            exists = await conn.scalar(text("SELECT 1 FROM crawls WHERE id = :id"), {"id": crawl_id})
            return False if exists else None

    async def mark_failed(self, crawl_id: int, reason: str, only_if_heartbeat: Optional[float] = None) -> bool:
        """Mark a still-running crawl failed with a reason. With only_if_heartbeat, only when the heartbeat is
        unchanged (row locked first on PostgreSQL), so a crawl a live worker refreshed is left alone."""
        async with AsyncSessionLocal() as session:
            q = select(Crawl).where(Crawl.id == crawl_id)
            if IS_POSTGRES:
                q = q.with_for_update()
            crawl = (await session.execute(q)).scalars().first()
            if crawl is None or crawl.status != "running":
                return False
            summary = _as_dict(crawl.summary)
            if only_if_heartbeat is not None and summary.get("worker_heartbeat") != only_if_heartbeat:
                return False
            crawl.status = "failed"
            crawl.completed_at = datetime.utcnow()
            crawl.summary = {**summary, "phase": "failed", "failed_reason": reason}
            flag_modified(crawl, "summary")
            await session.commit()
            return True

    # ---------- loops ----------

    def _count(self, js: bool) -> int:
        return sum(1 for _task, kind in self.running.values() if kind == js)

    async def claim_loop(self) -> None:
        while not self.stopping.is_set():
            try:
                pct = _memory_pct()
                if pct is not None and pct > MAX_MEMORY_PCT:
                    if not self._memory_paused:
                        logger.warning("Memory at %.0f%% (> %.0f%%): new crawls wait until it drops", pct, MAX_MEMORY_PCT)
                        self._memory_paused = True
                else:
                    if self._memory_paused:
                        logger.info("Memory back to %.0f%%: claiming crawls again", pct or 0)
                        self._memory_paused = False
                    for js, cap in ((False, SLOTS), (True, JS_SLOTS)):
                        while not self.stopping.is_set() and self._count(js) < cap:
                            claimed = await self.claim(js)
                            if claimed is None:
                                break
                            self.start(*claimed, js=js)
                _touch_health()
            except Exception:
                logger.exception("Polling the crawl queue failed; retrying")
                await asyncio.sleep(min(30.0, POLL_SECONDS * 5))
            self.wake.clear()
            try:
                await asyncio.wait_for(self.wake.wait(), timeout=POLL_SECONDS)
            except asyncio.TimeoutError:
                pass

    def start(self, crawl_id: int, seed_url: str, request_data: dict, js: bool) -> None:
        task = asyncio.get_running_loop().create_task(self._run(crawl_id, seed_url, request_data))
        self.running[crawl_id] = (task, js)
        logger.info("Claimed crawl %s (%s) %s | running: %s normal / %s JS",
                    crawl_id, "JS" if js else "normal", seed_url, self._count(False), self._count(True))

    async def _run(self, crawl_id: int, seed_url: str, request_data: dict) -> None:
        from app.api.endpoints import _run_crawler_task
        from app.models.schemas import CrawlRequest
        started = time.monotonic()
        try:
            try:
                request = CrawlRequest(**request_data)
            except Exception:
                logger.error("Crawl %s has an unreadable stored request; marking failed", crawl_id)
                await self.mark_failed(crawl_id, REASON_BAD_REQUEST)
                return
            try:
                # The stuck-crawl limit is the only time limit (a healthy crawl finishes in minutes).
                await asyncio.wait_for(_run_crawler_task(crawl_id, seed_url, request), timeout=STUCK_CRAWL_HOURS * 3600)
            except asyncio.TimeoutError:
                logger.warning("Crawl %s ran longer than %s h: stopped and marked failed", crawl_id, STUCK_CRAWL_HOURS)
                await self.mark_failed(crawl_id, REASON_STUCK)
                return
            # Safety net: the run function returned but the crawl is still "running".
            async with AsyncSessionLocal() as session:
                status = await session.scalar(select(Crawl.status).where(Crawl.id == crawl_id))
            if status == "running":
                await self.mark_failed(crawl_id, REASON_NO_FINAL_STATUS)
                status = "failed"
            logger.info("Crawl %s finished: %s in %.0f s", crawl_id, status or "deleted", time.monotonic() - started)
        except asyncio.CancelledError:
            logger.warning("Crawl %s cancelled (%s)", crawl_id, self.cancel_reason.get(crawl_id, "shutdown"))
        except Exception:
            logger.exception("Crawl %s crashed", crawl_id)
            try:
                await self.mark_failed(crawl_id, REASON_NO_FINAL_STATUS)
            except Exception:
                logger.exception("Could not mark crawl %s failed", crawl_id)
        finally:
            self.running.pop(crawl_id, None)
            self.cancel_reason.pop(crawl_id, None)
            self.wake.set()

    async def heartbeat_loop(self) -> None:
        while True:
            for crawl_id, (task, _js) in list(self.running.items()):
                try:
                    state = await self.heartbeat(crawl_id)
                except Exception as e:
                    logger.warning("Heartbeat for crawl %s failed: %s", crawl_id, type(e).__name__)
                    continue
                if state is None and not task.done():
                    # Deleted by the user (Clear, or replaced by a newer crawl): stop working on it.
                    self.cancel_reason[crawl_id] = "crawl deleted"
                    task.cancel()
            await asyncio.sleep(HEARTBEAT_SECONDS)

    async def sweep_loop(self) -> None:
        """Fail crawls whose worker died. Runs on start-up (recovers this worker's own crawls after a crash) and then
        every WORKER_SWEEP_SECONDS."""
        while True:
            try:
                await self.sweep()
            except Exception:
                logger.exception("Stale-crawl sweep failed")
            await asyncio.sleep(SWEEP_SECONDS)

    async def sweep(self) -> None:
        now = round(time.time(), 3)
        stuck_before = datetime.utcnow().timestamp() - STUCK_CRAWL_HOURS * 3600
        async with AsyncSessionLocal() as session:
            rows = (await session.execute(
                select(Crawl.id, Crawl.started_at, Crawl.summary).where(Crawl.status == "running"))).all()
        stale: Dict[int, float] = {}
        stuck = []
        for crawl_id, started_at, summary in rows:
            if crawl_id in self.running:
                continue
            hb = _as_dict(summary).get("worker_heartbeat")
            if isinstance(hb, (int, float)):
                if now - hb > STALE_SECONDS:
                    stale[crawl_id] = hb
            elif started_at is not None and started_at.timestamp() < stuck_before:
                # No heartbeat: started by an API in inline mode. Only the long stuck-crawl limit applies.
                stuck.append(crawl_id)
        for crawl_id in stuck:
            if await self.mark_failed(crawl_id, REASON_STUCK):
                logger.warning("Crawl %s ran for more than %s h without a worker heartbeat: marked failed",
                               crawl_id, STUCK_CRAWL_HOURS)
        if not stale:
            return
        # Confirmation wait: a live worker refreshes its heartbeat every HEARTBEAT_SECONDS; a crawler write of an
        # older summary copy can briefly roll the value back, so only a value that stays unchanged counts.
        await asyncio.sleep(2 * HEARTBEAT_SECONDS + 5)
        for crawl_id, hb in stale.items():
            if await self.mark_failed(crawl_id, REASON_STALE, only_if_heartbeat=hb):
                logger.warning("Crawl %s: no worker heartbeat for %.0f s; marked failed", crawl_id, time.time() - hb)

    # ---------- lifecycle ----------

    def request_stop(self, signame: str) -> None:
        if not self.stopping.is_set():
            logger.info("%s received: no new crawls will be claimed; %s crawl(s) running", signame, len(self.running))
            self.stopping.set()
            self.wake.set()

    def _install_signal_handlers(self) -> None:
        loop = asyncio.get_running_loop()
        for sig in (signal.SIGTERM, signal.SIGINT):
            try:
                loop.add_signal_handler(sig, self.request_stop, sig.name)
            except (NotImplementedError, RuntimeError):  # Windows
                signal.signal(sig, lambda s, _f: loop.call_soon_threadsafe(self.request_stop, signal.Signals(s).name))

    async def idle(self) -> None:
        logger.warning("CRAWL_RUNNER=%s: the API runs crawls itself, so this worker stays idle. "
                       "Set CRAWL_RUNNER=worker on BOTH services to move crawls here.", CRAWL_RUNNER)
        while not self.stopping.is_set():
            _touch_health()
            try:
                await asyncio.wait_for(self.stopping.wait(), timeout=30)
            except asyncio.TimeoutError:
                pass

    async def run(self) -> None:
        self._install_signal_handlers()
        if CRAWL_RUNNER != "worker":
            await self.idle()
            return
        import app.api.endpoints  # noqa: F401  (fail fast if the crawl code cannot be imported)
        await self._detect_summary_type()
        logger.info("Crawl worker %s started: %s normal + %s JavaScript slots, database %s, memory valve %.0f%%",
                    WORKER_ID, SLOTS, JS_SLOTS, engine.dialect.name, MAX_MEMORY_PCT)
        background = [asyncio.create_task(self.heartbeat_loop()), asyncio.create_task(self.sweep_loop())]
        try:
            await self.claim_loop()
            await self.drain()
        finally:
            for task in background:
                task.cancel()
            await asyncio.gather(*background, return_exceptions=True)

    async def drain(self) -> None:
        if not self.running:
            return
        tasks = {crawl_id: task for crawl_id, (task, _js) in self.running.items()}
        logger.info("Waiting up to %.0f s for %s running crawl(s) to finish", GRACE_SECONDS, len(tasks))
        _done, pending = await asyncio.wait(tasks.values(), timeout=GRACE_SECONDS)
        if not pending:
            logger.info("All running crawls finished before shutdown")
            return
        unfinished = [cid for cid, task in tasks.items() if task in pending]
        for cid in unfinished:
            self.cancel_reason[cid] = "worker shutdown grace period ended"
            tasks[cid].cancel()
        await asyncio.gather(*pending, return_exceptions=True)
        for cid in unfinished:
            try:
                if await self.mark_failed(cid, REASON_SHUTDOWN):
                    logger.warning("Crawl %s did not finish within the %.0f s shutdown grace period: marked failed",
                                   cid, GRACE_SECONDS)
            except Exception:
                logger.exception("Could not mark crawl %s failed during shutdown", cid)


async def _cleanup() -> None:
    try:
        from app.services.browser_pool import browser_pool
        from app.services.parse_pool import shutdown_pool
        await browser_pool.close()
        shutdown_pool()
    except Exception:
        logger.exception("Could not release the shared browser / parser pool")
    await engine.dispose()


async def main() -> None:
    worker = CrawlWorker()
    try:
        await worker.run()
    finally:
        await _cleanup()
        logger.info("Crawl worker stopped")


if __name__ == "__main__":
    asyncio.run(main())
