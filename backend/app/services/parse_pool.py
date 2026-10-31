"""HTML parsing off the event loop and off the GIL.

extract_page is CPU-bound (about 25-30 ms per page). Threads share one core's worth of Python, so a crawl is
capped near 35 pages/s however fast the network is. A small process pool lets parsing use several cores.
PARSE_WORKERS sets the pool size (default: cores - 1, at most 4); 0 uses threads only. Any pool failure
falls back to a thread so a crawl never fails because of the pool.
"""
import asyncio
import logging
import os
from concurrent.futures import ProcessPoolExecutor
from concurrent.futures.process import BrokenProcessPool
from typing import Optional

from app.services.extractor import extract_page

logger = logging.getLogger("crawler")
_pool: Optional[ProcessPoolExecutor] = None
_disabled = False


def configured_workers() -> int:
    raw = os.getenv("PARSE_WORKERS")
    if raw is not None and raw.strip() != "":
        try:
            return max(0, int(raw))
        except ValueError:
            pass
    return min(4, max(0, (os.cpu_count() or 2) - 1))


def _warm() -> None:
    import app.services.extractor  # noqa: F401  (import cost is paid once per worker, not on the first page)


def _get_pool() -> Optional[ProcessPoolExecutor]:
    global _pool, _disabled
    if _disabled:
        return None
    if _pool is None:
        n = configured_workers()
        if n <= 0:
            _disabled = True
            return None
        try:
            _pool = ProcessPoolExecutor(max_workers=n, initializer=_warm)
        except Exception as e:
            logger.warning("Parse process pool unavailable (%s); parsing in threads.", type(e).__name__)
            _disabled = True
            return None
    return _pool


async def parse_page(html: str, url: str, headers: Optional[dict] = None):
    """(metrics, links, images) for one page."""
    global _pool
    pool = _get_pool()
    if pool is not None:
        try:
            return await asyncio.get_running_loop().run_in_executor(pool, extract_page, html, url, headers)
        except (BrokenProcessPool, OSError, RuntimeError) as e:
            logger.warning("Parse process pool failed (%s); using threads for this page.", type(e).__name__)
            try:
                pool.shutdown(wait=False, cancel_futures=True)
            except Exception:
                pass
            _pool = None
    return await asyncio.to_thread(extract_page, html, url, headers)


def shutdown_pool() -> None:
    global _pool
    if _pool is not None:
        _pool.shutdown(wait=False, cancel_futures=True)
        _pool = None
