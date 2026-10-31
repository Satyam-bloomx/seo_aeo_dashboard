"""Adaptive politeness for one crawl: start fast, slow down when the site pushes back, speed up again gradually.

A request takes a slot (`acquire`) and releases it when done. When a site answers 429/503 or a bot challenge, or
times out, `on_throttle` halves the number of slots, adds a delay between requests and honours Retry-After (capped).
After a run of successes the delay is shed first and then the slot count creeps back up to the ceiling.
The user's own delay setting is always the minimum spacing between requests.
"""
import asyncio
import time
from collections import deque
from typing import Callable, Deque, Dict

SUCCESS_STREAK = 20          # successes needed for one step back towards full speed
MAX_EXTRA_DELAY = 5.0        # seconds added between requests while a site is struggling
MAX_PAUSE = 30.0             # longest honoured Retry-After
THROTTLE_COOLDOWN = 2.0      # a burst of 429s counts as one slowdown


class AdaptiveLimiter:
    def __init__(self, start: int, ceiling: int, min_delay: float = 0.0, floor: int = 1,
                 clock: Callable[[], float] = time.monotonic):
        self.ceiling = max(1, ceiling)
        self.limit = min(max(floor, start), self.ceiling)
        self.floor = floor
        self.min_delay = max(0.0, min_delay)       # the user's explicit delay: never undercut
        self.extra_delay = 0.0
        self._clock = clock
        self._active = 0
        self._waiters: Deque[asyncio.Future] = deque()
        self._next_start = 0.0
        self._pause_until = 0.0
        self._successes = 0
        self._last_throttle = -1e9
        self.throttle_events = 0
        self.lowest_limit = self.limit

    # -- slots
    async def acquire(self, delay: float = 0.0) -> None:
        """Wait for a free slot, then for the request's turn (spacing = max(user delay, robots delay) + adaptive delay)."""
        while self._active >= self.limit:
            fut = asyncio.get_running_loop().create_future()
            self._waiters.append(fut)
            try:
                await fut
            except asyncio.CancelledError:
                if fut in self._waiters:
                    self._waiters.remove(fut)
                raise
        self._active += 1
        spacing = max(delay, self.min_delay) + self.extra_delay
        now = self._clock()
        start = max(now, self._next_start, self._pause_until)
        self._next_start = start + spacing
        if start > now:
            try:
                await asyncio.sleep(start - now)
            except BaseException:
                self.release()
                raise

    def release(self) -> None:
        self._active = max(0, self._active - 1)
        self._wake()

    def _wake(self) -> None:
        room = self.limit - self._active
        while room > 0 and self._waiters:
            fut = self._waiters.popleft()
            if not fut.done():
                fut.set_result(None)
                room -= 1

    # -- feedback
    def on_success(self) -> None:
        self._successes += 1
        if self._successes < SUCCESS_STREAK:
            return
        self._successes = 0
        if self.extra_delay > 0:
            self.extra_delay = 0.0 if self.extra_delay <= 0.25 else self.extra_delay / 2
        elif self.limit < self.ceiling:
            self.limit += 1
            self._wake()

    def on_throttle(self, retry_after: float = 0.0) -> None:
        now = self._clock()
        if retry_after and retry_after > 0:
            self._pause_until = max(self._pause_until, now + min(retry_after, MAX_PAUSE))
        self._successes = 0
        if now - self._last_throttle < THROTTLE_COOLDOWN:
            return
        self._last_throttle = now
        self.throttle_events += 1
        self.limit = max(self.floor, self.limit // 2)
        self.lowest_limit = min(self.lowest_limit, self.limit)
        self.extra_delay = min(MAX_EXTRA_DELAY, max(0.5, self.extra_delay * 2))

    def start_retry_pass(self, max_pause: float = 10.0) -> None:
        """A retry pass handles a few already-failed URLs at reduced concurrency: drop the delay built up during
        the main pass and shorten any long Retry-After pause, so retries don't wait minutes for nothing."""
        self.extra_delay = 0.0
        now = self._clock()
        self._pause_until = min(self._pause_until, now + max_pause)
        self._next_start = min(self._next_start, now)

    def cap(self, n: int) -> None:
        """Hard-cap concurrency (retry passes run with reduced concurrency) and stop ramping above it."""
        self.ceiling = max(1, min(self.ceiling, n))
        self.limit = min(self.limit, self.ceiling)

    def snapshot(self) -> Dict[str, float]:
        return {"slowdowns": self.throttle_events, "lowest_concurrency": self.lowest_limit,
                "final_concurrency": self.limit, "extra_delay_seconds": round(self.extra_delay, 2)}
