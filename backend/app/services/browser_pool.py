"""One shared Chromium per process with a fixed pool of tabs for every JavaScript crawl.

Launching a browser per crawl costs seconds and a few hundred MB each; with several users crawling that adds up
to memory exhaustion. Here a single browser is started on first use, each crawl gets its own isolated context
(own user-agent and SSRF route guard), and a semaphore bounds how many tabs are open across all crawls
(JS_TABS, default 4). A crashed browser is replaced on the next request.
"""
import asyncio
import logging
import os
from contextlib import asynccontextmanager
from typing import Optional

logger = logging.getLogger("crawler")

try:
    from playwright.async_api import async_playwright
    HAS_PLAYWRIGHT = True
except ImportError:  # pragma: no cover
    HAS_PLAYWRIGHT = False


def js_tab_limit() -> int:
    try:
        return max(1, int(os.getenv("JS_TABS", "4")))
    except ValueError:
        return 4


class BrowserPool:
    def __init__(self, tabs: Optional[int] = None):
        self.tabs = tabs or js_tab_limit()
        self._pw = None
        self._browser = None
        self._lock: Optional[asyncio.Lock] = None
        self._tab_slots: Optional[asyncio.Semaphore] = None
        self._loop = None

    def _init_async(self):
        # created lazily so the objects belong to the running event loop (a new loop means a fresh pool)
        loop = asyncio.get_running_loop()
        if self._lock is None or self._loop is not loop:
            self._loop = loop
            self._browser = self._pw = None
            self._lock = asyncio.Lock()
            self._tab_slots = asyncio.Semaphore(self.tabs)

    async def browser(self):
        """The shared browser, (re)launched if it is missing or has crashed."""
        self._init_async()
        async with self._lock:
            if self._browser is not None and not self._browser.is_connected():
                logger.warning("Shared Chromium disconnected; relaunching.")
                await self._close_locked()
            if self._browser is None:
                self._pw = await async_playwright().start()
                try:
                    self._browser = await self._pw.chromium.launch(headless=True)
                except Exception:
                    await self._close_locked()
                    raise
            return self._browser

    async def new_context(self, user_agent: str, route_guard=None):
        browser = await self.browser()
        context = await browser.new_context(viewport={"width": 1920, "height": 1080}, user_agent=user_agent, locale="en-US")
        if route_guard is not None:
            await context.route("**/*", route_guard)
        return context

    @asynccontextmanager
    async def tab(self, context):
        """A page in `context`, holding one of the fixed tab slots for as long as it is open."""
        self._init_async()
        async with self._tab_slots:
            page = await context.new_page()
            try:
                yield page
            finally:
                try:
                    await page.close()
                except Exception:
                    pass

    async def _close_locked(self):
        browser, pw, self._browser, self._pw = self._browser, self._pw, None, None
        try:
            if browser is not None:
                await browser.close()
        except Exception:
            pass
        try:
            if pw is not None:
                await pw.stop()
        except Exception:
            pass

    async def close(self):
        self._init_async()
        async with self._lock:
            await self._close_locked()


browser_pool = BrowserPool()
