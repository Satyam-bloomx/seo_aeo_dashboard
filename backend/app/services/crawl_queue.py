"""Crawl queue with slots.

Crawls start "queued" and run when a slot is free: CRAWL_SLOTS (default 3) normal crawls and JS_CRAWL_SLOTS
(default 1) JavaScript crawls across the whole server. The scheduler runs in-process on asyncio behind the small
CrawlQueue interface (enqueue / cancel / position / shutdown), so a separate worker process or a Redis-backed
queue can replace it later without touching the API code.
"""
import asyncio
import logging
import os
from collections import deque
from dataclasses import dataclass
from typing import Awaitable, Callable, Deque, Dict, List, Optional

logger = logging.getLogger("crawler")


# "inline": this API process runs crawls (dev, single service). "worker": the API only creates queued rows and
# separate `python -m app.worker` processes claim them from the database (see docs/DEPLOY_COOLIFY.md).
CRAWL_RUNNER = (os.getenv("CRAWL_RUNNER") or "inline").strip().lower()


def _int_env(name: str, default: int) -> int:
    try:
        return max(1, int(os.getenv(name, str(default))))
    except ValueError:
        return default


@dataclass
class CrawlJob:
    crawl_id: int
    js: bool
    run: Callable[[], Awaitable[None]]


class CrawlQueue:
    """Interface every queue backend implements."""

    def enqueue(self, job: CrawlJob) -> None: ...
    def cancel(self, crawl_id: int) -> bool: ...
    def position(self, crawl_id: int) -> Optional[int]: ...
    def is_running(self, crawl_id: int) -> bool: ...
    async def shutdown(self) -> None: ...


class InProcessCrawlQueue(CrawlQueue):
    def __init__(self, slots: Optional[int] = None, js_slots: Optional[int] = None):
        self.slots = slots or _int_env("CRAWL_SLOTS", 3)
        self.js_slots = js_slots or _int_env("JS_CRAWL_SLOTS", 1)
        self._waiting: Dict[bool, Deque[CrawlJob]] = {False: deque(), True: deque()}
        self._running: Dict[int, asyncio.Task] = {}
        self._running_kind: Dict[int, bool] = {}

    def _capacity(self, js: bool) -> int:
        return self.js_slots if js else self.slots

    def _running_count(self, js: bool) -> int:
        return sum(1 for cid, kind in self._running_kind.items() if kind == js)

    def enqueue(self, job: CrawlJob) -> None:
        self._waiting[job.js].append(job)
        self._pump()

    def _pump(self) -> None:
        for js in (False, True):
            queue = self._waiting[js]
            while queue and self._running_count(js) < self._capacity(js):
                job = queue.popleft()
                task = asyncio.get_running_loop().create_task(self._run(job))
                self._running[job.crawl_id] = task
                self._running_kind[job.crawl_id] = job.js

    async def _run(self, job: CrawlJob) -> None:
        try:
            await job.run()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Crawl job %s crashed", job.crawl_id)
        finally:
            self._running.pop(job.crawl_id, None)
            self._running_kind.pop(job.crawl_id, None)
            try:
                self._pump()
            except RuntimeError:
                pass

    def cancel(self, crawl_id: int) -> bool:
        """Remove a waiting crawl; a running one is cancelled. True when something was removed."""
        for queue in self._waiting.values():
            for job in list(queue):
                if job.crawl_id == crawl_id:
                    queue.remove(job)
                    return True
        task = self._running.get(crawl_id)
        if task and not task.done():
            task.cancel()
            return True
        return False

    def position(self, crawl_id: int) -> Optional[int]:
        """1-based place among the crawls waiting for the same kind of slot; None when not waiting."""
        for queue in self._waiting.values():
            for i, job in enumerate(queue):
                if job.crawl_id == crawl_id:
                    return i + 1
        return None

    def is_running(self, crawl_id: int) -> bool:
        return crawl_id in self._running

    def waiting_ids(self) -> List[int]:
        return [j.crawl_id for q in self._waiting.values() for j in q]

    async def shutdown(self) -> None:
        for queue in self._waiting.values():
            queue.clear()
        for task in list(self._running.values()):
            task.cancel()


crawl_queue = InProcessCrawlQueue()
