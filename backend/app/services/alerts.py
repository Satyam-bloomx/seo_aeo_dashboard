"""Developer alerts: one grouped alert per crawl (dead-lettered URLs, tripped circuit breaker, failed crawl).

Always logged with the "[CRAWL-ALERT]" prefix; also POSTed to ALERT_WEBHOOK_URL when set, as the
Slack/Discord-compatible JSON {"text": ...} body. The POST is fire-and-forget with a short timeout and no retries.
"""
import asyncio
import logging
import os
from collections import OrderedDict
from typing import Iterable, Optional

import httpx

logger = logging.getLogger("crawler")
WEBHOOK_TIMEOUT_SECONDS = 5.0
_alerted: "OrderedDict[int, bool]" = OrderedDict()
_ALERTED_MAX = 2000
_tasks: set = set()


def _webhook_url() -> str:
    return (os.getenv("ALERT_WEBHOOK_URL") or "").strip().strip('"\'')


async def _post(url: str, text: str) -> None:
    try:
        async with httpx.AsyncClient(timeout=WEBHOOK_TIMEOUT_SECONDS) as client:
            await client.post(url, json={"text": text, "content": text})  # "content" is the Discord spelling
    except Exception as e:
        logger.warning("[CRAWL-ALERT] webhook delivery failed (%s)", type(e).__name__)


def send_crawl_alert(crawl_id: int, seed_url: str, lines: Iterable[str], error: bool = False) -> bool:
    """Send at most one alert per crawl. Returns False when nothing was sent (no lines, or already alerted)."""
    lines = [str(l) for l in lines if l]
    if not lines or crawl_id in _alerted:
        return False
    _alerted[crawl_id] = True
    while len(_alerted) > _ALERTED_MAX:
        _alerted.popitem(last=False)
    text = f"[CRAWL-ALERT] crawl {crawl_id} ({seed_url}): " + "; ".join(lines)
    (logger.error if error else logger.warning)(text)
    url = _webhook_url()
    if url:
        try:
            task = asyncio.get_running_loop().create_task(_post(url, text))
            _tasks.add(task)
            task.add_done_callback(_tasks.discard)
        except RuntimeError:
            pass
    return True


def reset_alerts_for_tests() -> None:
    _alerted.clear()
