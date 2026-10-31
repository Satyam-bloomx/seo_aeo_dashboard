"""Per-user rate limits for expensive endpoints (crawls, paid AI calls, third-party syncs).

Sliding-window counters kept in process memory: correct for a single API instance. When the API runs
as several instances, move the counters to Redis (same interface) so limits are shared.
"""
import os
import time
from collections import defaultdict, deque
from typing import Deque, Dict, Tuple

from fastapi import Depends, HTTPException

from app.core.auth import UserSession, get_current_user

# bucket -> (max requests, window seconds); overridable via env, e.g. RATE_LIMIT_AI=60/3600
DEFAULT_LIMITS: Dict[str, Tuple[int, int]] = {
    "crawl": (30, 3600),
    "ai": (60, 3600),
    "integration_sync": (60, 3600),
    # Each keyword check is ~20-80 paid SerpAPI searches.
    "serp": (10, 3600),
}

_hits: Dict[Tuple[str, str], Deque[float]] = defaultdict(deque)


def _limit_for(bucket: str) -> Tuple[int, int]:
    raw = os.getenv(f"RATE_LIMIT_{bucket.upper()}", "")
    try:
        count, window = raw.split("/")
        return int(count), int(window)
    except ValueError:
        return DEFAULT_LIMITS[bucket]


def rate_limit(bucket: str):
    """FastAPI dependency: allow at most N calls per window per user for this bucket."""
    def dependency(user: UserSession = Depends(get_current_user)) -> UserSession:
        max_calls, window = _limit_for(bucket)
        now = time.monotonic()
        q = _hits[(bucket, user.id)]
        while q and now - q[0] > window:
            q.popleft()
        if len(q) >= max_calls:
            retry_after = int(window - (now - q[0])) + 1
            raise HTTPException(
                status_code=429,
                detail=f"Too many requests. Please try again in {max(1, retry_after // 60)} minute(s).",
                headers={"Retry-After": str(retry_after)},
            )
        q.append(now)
        return user
    return dependency


def reset_rate_limits() -> None:
    """Test helper."""
    _hits.clear()
