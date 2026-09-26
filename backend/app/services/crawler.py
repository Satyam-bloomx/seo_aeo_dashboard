import sys
import asyncio
import re
from typing import Set, List
from urllib.parse import urlparse
import httpx
import time
import json
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession
from app.models.domain import Page, Link, Image, Crawl, IndexabilityStatus
from app.services.extractor import extract_seo_metrics, extract_links_and_images
from app.services.robots import robots_service
from sqlalchemy.future import select
from app.models.domain import Integration

try:
    from playwright.async_api import async_playwright, BrowserContext
    HAS_PLAYWRIGHT = True
except ImportError:
    HAS_PLAYWRIGHT = False

try:
    from axe_playwright_python.async_playwright import Axe
    HAS_AXE = True
except ImportError:
    HAS_AXE = False

try:
    from curl_cffi.requests import AsyncSession as CurlSession
    HAS_CURL_CFFI = True
except ImportError:
    HAS_CURL_CFFI = False


NON_PAGE_EXTENSIONS = (
    '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.bmp', '.tiff', '.avif',
    '.pdf', '.zip', '.rar', '.tar', '.gz', '.7z', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.mp4', '.mp3', '.avi', '.mov', '.wmv', '.wav', '.ogg', '.webm',
    '.css', '.js', '.woff', '.woff2', '.ttf', '.eot', '.map',
    '.xml', '.rss', '.atom', '.json', '.txt'
)

class CrawlerService:
    def __init__(self, crawl_id: int, seed_url: str, db_session: AsyncSession, max_depth: int = 100, max_concurrent: int = 5, js_rendering: bool = False, max_pages: int = 500, stealth_delay: float = 0.0, ignore_url_params: bool = False, check_external_links: bool = False, exclude_paths: str = "", ignore_robots: bool = False, user_agent: str = "SEO-Spider-Bot", crawl_author_archives: bool = False):
        self.crawl_id = crawl_id
        self.ignore_url_params = ignore_url_params
        # Canonicalize and normalize seed URL immediately (RFC 3986)
        self.seed_url = self._clean_crawl_url(seed_url)
        self.db = db_session
        self.max_depth = max_depth
        self.js_rendering = js_rendering
        self.max_pages = max_pages
        self.stealth_delay = stealth_delay
        self.check_external_links = check_external_links
        self.crawl_author_archives = crawl_author_archives
        
        # Parse exclude paths into a list of strings
        self.exclude_paths_list = [p.strip() for p in exclude_paths.split('\n') if p.strip()]
        
        self.ignore_robots = ignore_robots
        self.user_agent = user_agent
        
        if self.js_rendering and not HAS_PLAYWRIGHT:
            print("Playwright not installed. Falling back to HTTPX/curl_cffi.")
            self.js_rendering = False
            
        self.max_concurrent = min(max(max_concurrent, 1), 10)
            
        self.visited_urls: Set[str] = set()
        self.queue: asyncio.Queue = asyncio.Queue()
        self.db_lock = asyncio.Lock()
        self.request_lock = asyncio.Lock()
        self.last_request_time = 0.0
        
        parsed_seed = urlparse(self.seed_url)
        self.allowed_domain = parsed_seed.netloc.lower()
        
    def _get_url_variants(self, url: str) -> List[str]:
        """
        Returns equivalent URL variants with and without trailing slash.
        Used for RFC 3986 canonical deduplication so links are NEVER doubled.
        """
        try:
            url_clean = url.split("#")[0].strip()
            parsed = urlparse(url_clean)
            scheme = (parsed.scheme or "https").lower()
            netloc = parsed.netloc.lower()
            if netloc.endswith(":80") and scheme == "http":
                netloc = netloc[:-3]
            elif netloc.endswith(":443") and scheme == "https":
                netloc = netloc[:-4]

            path = parsed.path or "/"
            path = re.sub(r'/{2,}', '/', path)
            query_part = f"?{parsed.query}" if parsed.query else ""
            
            # Root path (e.g. https://example.com/ and https://example.com)
            if not path or path == "/":
                return [
                    f"{scheme}://{netloc}/{query_part}",
                    f"{scheme}://{netloc}{query_part}"
                ]
            
            # Subpaths (e.g. https://example.com/about/ and https://example.com/about)
            if path.endswith("/"):
                alt_path = path.rstrip("/")
                return [
                    f"{scheme}://{netloc}{path}{query_part}",
                    f"{scheme}://{netloc}{alt_path}{query_part}"
                ]
            else:
                alt_path = path + "/"
                return [
                    f"{scheme}://{netloc}{path}{query_part}",
                    f"{scheme}://{netloc}{alt_path}{query_part}"
                ]
        except Exception:
            return [url]

    async def run(self):
        for variant in self._get_url_variants(self.seed_url):
            self.visited_urls.add(variant)
        self.queue.put_nowait((self.seed_url, 0))
        
        self.active_integrations = []
        async with self.db_lock:
            crawl = await self.db.get(Crawl, self.crawl_id)
            if crawl:
                res = await self.db.execute(select(Integration).where(Integration.project_id == crawl.project_id, Integration.connected == True))
                self.active_integrations = [i.integration_type for i in res.scalars().all()]
        
        if self.js_rendering:
            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True)
                context = await browser.new_context(
                    viewport={'width': 1920, 'height': 1080},
                    user_agent=self.user_agent,
                    locale='en-US'
                )
                
                workers = [
                    asyncio.create_task(self._playwright_worker(context, i))
                    for i in range(self.max_concurrent)
                ]
                await self.queue.join()
                for w in workers:
                    w.cancel()
                await browser.close()
        elif HAS_CURL_CFFI:
            curl_headers = {"User-Agent": self.user_agent} if self.user_agent else None
            async with CurlSession(impersonate="chrome124", verify=False, timeout=30, headers=curl_headers) as client:
                workers = [
                    asyncio.create_task(self._curl_worker(client, i))
                    for i in range(self.max_concurrent)
                ]
                await self.queue.join()
                for w in workers:
                    w.cancel()
        else:
            limits = httpx.Limits(max_keepalive_connections=20, max_connections=40)
            default_headers = {
                'User-Agent': self.user_agent,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'DNT': '1',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
                'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
                'Sec-Ch-Ua-Mobile': '?0',
                'Sec-Ch-Ua-Platform': '"Windows"'
            }
            async with httpx.AsyncClient(http2=True, verify=False, timeout=30.0, limits=limits, headers=default_headers) as client:
                workers = [
                    asyncio.create_task(self._httpx_worker(client, i))
                    for i in range(self.max_concurrent)
                ]
                
                await self.queue.join()
                
                for w in workers:
                    w.cancel()
            
        try:
            from app.services.post_processor import PostProcessor
            processor = PostProcessor(self.crawl_id, self.db)
            await processor.run()
        except Exception as e:
            print(f"PostProcessor warning for crawl {self.crawl_id}: {e}")
        
        try:
            from app.services.enrichment_service import EnrichmentService
            enricher = EnrichmentService(self.crawl_id, self.db)
            await enricher.run()
        except Exception as e:
            print(f"EnrichmentService warning for crawl {self.crawl_id}: {e}")
        
        # Update crawl status
        async with self.db_lock:
            try:
                crawl = await self.db.get(Crawl, self.crawl_id)
                if crawl:
                    crawl.status = "completed"
                    crawl.completed_at = datetime.utcnow()
                    await self.db.commit()
            except Exception as e:
                await self.db.rollback()
                print(f"Failed to update completed crawl status: {e}")

    async def _curl_worker(self, client, worker_id: int):
        while True:
            item_fetched = False
            try:
                url, current_depth = await self.queue.get()
                item_fetched = True
                
                if current_depth > self.max_depth:
                    continue
                
                is_allowed = True
                if not getattr(self, 'ignore_robots', False):
                    is_allowed = await robots_service.is_allowed(url, getattr(self, 'user_agent', 'SEO-Spider-Bot'))
                if not is_allowed:
                    await self._save_error_page(url, current_depth, status_code=0, error_reason="Blocked by robots.txt")
                    continue
                
                delay = 0.0
                if not getattr(self, 'ignore_robots', False):
                    delay = await robots_service.get_crawl_delay(url, getattr(self, 'user_agent', 'SEO-Spider-Bot'))
                
                stealth_delay = getattr(self, 'stealth_delay', 0.0)
                actual_delay = max(delay, stealth_delay)
                if actual_delay > 0:
                    await asyncio.sleep(actual_delay)

                start_time = time.time()
                response = None
                
                for attempt in range(5):
                    try:
                        response = await client.get(url, allow_redirects=True)
                        if response.status_code == 429:
                            retry_after = response.headers.get("Retry-After")
                            sleep_time = int(retry_after) if retry_after and retry_after.isdigit() else 3 * (attempt + 1)
                            await asyncio.sleep(sleep_time)
                            continue
                        break
                    except Exception as e:
                        if attempt == 4:
                            await self._save_error_page(url, current_depth, status_code=0, error_reason=str(e))
                            break
                        await asyncio.sleep(2)
                
                if not response:
                    continue

                clean_req = self._clean_crawl_url(url)
                response_time_ms = int((time.time() - start_time) * 1000)
                status_code = response.status_code
                content_type = response.headers.get("content-type", "")
                final_url = str(response.url)
                clean_final = self._clean_crawl_url(final_url)
                
                # Check for 3xx redirect - only treat as redirect if the clean normalized target is genuinely different
                has_redirect = (clean_final != clean_req)
                if has_redirect:
                    await self._save_redirect_page(clean_req, current_depth, 301, clean_final)
                    parsed_final = urlparse(clean_final)
                    if parsed_final.netloc == self.allowed_domain:
                        variants = self._get_url_variants(clean_final)
                        if not any(v in self.visited_urls for v in variants):
                            if len(self.visited_urls) < self.max_pages:
                                for v in variants:
                                    self.visited_urls.add(v)
                                if "text/html" in content_type.lower() and status_code < 400:
                                    html_content = response.text
                                    await self._process_page_data(clean_final, current_depth, html_content, status_code, content_type, response_time_ms)
                                elif status_code >= 400:
                                    await self._save_error_page(clean_final, current_depth, status_code=status_code, error_reason="Client/Server Error")
                    continue

                if status_code >= 400:
                    await self._save_error_page(clean_req, current_depth, status_code=status_code, error_reason="Client/Server Error")
                    continue
                
                if "text/html" not in content_type.lower():
                    await self._save_error_page(clean_req, current_depth, status_code=status_code, error_reason="Non-HTML Asset")
                    continue
                
                html_content = response.text
                await self._process_page_data(clean_req, current_depth, html_content, status_code, content_type, response_time_ms)

            except asyncio.CancelledError:
                break
            except Exception as e:
                print(f"Curl Worker Error: {e}")
            finally:
                if item_fetched:
                    self.queue.task_done()

    async def _httpx_worker(self, client: httpx.AsyncClient, worker_id: int):
        while True:
            item_fetched = False
            try:
                url, current_depth = await self.queue.get()
                item_fetched = True
                
                if current_depth > self.max_depth:
                    continue
                
                is_allowed = True
                if not getattr(self, 'ignore_robots', False):
                    is_allowed = await robots_service.is_allowed(url, getattr(self, 'user_agent', 'SEO-Spider-Bot'))
                if not is_allowed:
                    await self._save_error_page(url, current_depth, status_code=0, error_reason="Blocked by robots.txt")
                    continue
                
                delay = 0.0
                if not getattr(self, 'ignore_robots', False):
                    delay = await robots_service.get_crawl_delay(url, getattr(self, 'user_agent', 'SEO-Spider-Bot'))
                
                stealth_delay = getattr(self, 'stealth_delay', 0.0)
                actual_delay = max(delay, stealth_delay)
                if actual_delay > 0:
                    await asyncio.sleep(actual_delay)

                start_time = time.time()
                response = None
                
                for attempt in range(5):
                    try:
                        response = await client.get(url, follow_redirects=True)
                        if response.status_code == 429:
                            retry_after = response.headers.get("Retry-After")
                            sleep_time = int(retry_after) if retry_after and retry_after.isdigit() else 3 * (attempt + 1)
                            await asyncio.sleep(sleep_time)
                            continue
                        break
                    except Exception:
                        await asyncio.sleep(2)
                
                if not response or response.status_code in [429, 403, 503]:
                    # Cloudflare / anti-bot bypass using Playwright
                    pw_data = await self._fetch_with_playwright_single(url)
                    if pw_data and pw_data.get("status_code", 0) < 400:
                        pw_final = pw_data.get("final_url", url)
                        if pw_final != url:
                            await self._save_redirect_page(url, current_depth, 301, pw_final)
                            clean_pw_final = self._clean_crawl_url(pw_final)
                            if urlparse(clean_pw_final).netloc == self.allowed_domain:
                                if clean_pw_final not in self.visited_urls and len(self.visited_urls) < self.max_pages:
                                    self.visited_urls.add(clean_pw_final)
                                    await self._process_page_data(
                                        clean_pw_final, 
                                        current_depth, 
                                        pw_data["html_content"], 
                                        pw_data["status_code"], 
                                        pw_data["content_type"], 
                                        pw_data["response_time_ms"]
                                    )
                            continue
                        else:
                            await self._process_page_data(
                                url, 
                                current_depth, 
                                pw_data["html_content"], 
                                pw_data["status_code"], 
                                pw_data["content_type"], 
                                pw_data["response_time_ms"]
                            )
                            continue
                    else:
                        st = pw_data["status_code"] if pw_data else (response.status_code if response else 0)
                        await self._save_error_page(url, current_depth, status_code=st, error_reason="Blocked or Rate Limited")
                        continue

                clean_req = self._clean_crawl_url(url)
                response_time_ms = int((time.time() - start_time) * 1000)
                status_code = response.status_code
                content_type = response.headers.get("content-type", "")
                final_url = str(response.url)
                clean_final = self._clean_crawl_url(final_url)
                
                # Check for 3xx redirect hops in response history - only if clean_final is different from clean_req
                has_redirect = (len(response.history) > 0 and clean_final != clean_req) or (clean_final != clean_req)
                if has_redirect:
                    first_hop_status = response.history[0].status_code if response.history else 301
                    await self._save_redirect_page(clean_req, current_depth, first_hop_status, clean_final)
                    
                    parsed_final = urlparse(clean_final)
                    if parsed_final.netloc == self.allowed_domain:
                        variants = self._get_url_variants(clean_final)
                        if not any(v in self.visited_urls for v in variants):
                            if len(self.visited_urls) < self.max_pages:
                                for v in variants:
                                    self.visited_urls.add(v)
                                if "text/html" in content_type.lower() and status_code < 400:
                                    html_content = response.text
                                    await self._process_page_data(clean_final, current_depth, html_content, status_code, content_type, response_time_ms)
                                elif status_code >= 400:
                                    await self._save_error_page(clean_final, current_depth, status_code=status_code, error_reason="Client/Server Error")
                    continue
                
                if status_code >= 400:
                    await self._save_error_page(clean_req, current_depth, status_code=status_code, error_reason="Client/Server Error")
                    continue
                
                if "text/html" not in content_type.lower():
                    await self._save_error_page(clean_req, current_depth, status_code=status_code, error_reason="Non-HTML Asset")
                    continue
                
                html_content = response.text
                await self._process_page_data(clean_req, current_depth, html_content, status_code, content_type, response_time_ms)

            except asyncio.CancelledError:
                break
            except Exception as e:
                print(f"HTTPX Worker Error: {e}")
            finally:
                if item_fetched:
                    self.queue.task_done()

    async def _fetch_with_playwright_single(self, url: str):
        if not HAS_PLAYWRIGHT:
            return None
        try:
            async with async_playwright() as p:
                browser = await p.chromium.launch(
                    headless=True,
                    args=['--disable-blink-features=AutomationControlled', '--no-sandbox']
                )
                context = await browser.new_context(
                    viewport={'width': 1920, 'height': 1080},
                    user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                    locale='en-US',
                    extra_http_headers={
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                        'Accept-Language': 'en-US,en;q=0.9',
                        'Upgrade-Insecure-Requests': '1'
                    }
                )
                page = await context.new_page()
                start_time = time.time()
                res = await page.goto(url, wait_until='domcontentloaded', timeout=30000)
                await page.wait_for_timeout(2000)
                response_time_ms = int((time.time() - start_time) * 1000)
                html_content = await page.content()
                
                status_code = res.status if res else 200
                if status_code in [429, 403, 503] and len(html_content) > 1000 and "Just a moment..." not in html_content:
                    status_code = 200
                    
                content_type = res.headers.get("content-type", "text/html") if res else "text/html"
                final_url = page.url
                await browser.close()
                return {
                    "status_code": status_code,
                    "content_type": content_type,
                    "html_content": html_content,
                    "response_time_ms": response_time_ms,
                    "final_url": final_url
                }
        except Exception as e:
            print(f"Playwright single fetch fallback error for {url}: {e}")
        return None

    async def _playwright_worker(self, context, worker_id: int):
        axe = Axe() if HAS_AXE else None
        while True:
            item_fetched = False
            try:
                url, current_depth = await self.queue.get()
                item_fetched = True
                
                if current_depth > self.max_depth:
                    continue
                
                is_allowed = True
                if not getattr(self, 'ignore_robots', False):
                    is_allowed = await robots_service.is_allowed(url, getattr(self, 'user_agent', 'SEO-Spider-Bot'))
                if not is_allowed:
                    await self._save_error_page(url, current_depth, status_code=0, error_reason="Blocked by robots.txt")
                    continue
                
                delay = 0.0
                if not getattr(self, 'ignore_robots', False):
                    delay = await robots_service.get_crawl_delay(url, getattr(self, 'user_agent', 'SEO-Spider-Bot'))
                
                stealth_delay = getattr(self, 'stealth_delay', 0.0)
                actual_delay = max(delay, stealth_delay)
                if actual_delay > 0:
                    await asyncio.sleep(actual_delay)

                page = await context.new_page()
                
                # Setup JS Error Tracking
                js_errors = []
                page.on("pageerror", lambda err: js_errors.append(err.message))
                
                start_time = time.time()
                try:
                    response = await page.goto(url, wait_until="networkidle", timeout=30000)
                except Exception as e:
                    await self._save_error_page(url, current_depth, status_code=0, error_reason=f"Playwright Nav Error: {e}")
                    await page.close()
                    continue
                    
                response_time_ms = int((time.time() - start_time) * 1000)
                
                if not response:
                    await self._save_error_page(url, current_depth, status_code=0, error_reason="No response object")
                    await page.close()
                    continue

                status_code = response.status
                content_type = response.headers.get("content-type", "")
                
                if status_code >= 400:
                    await self._save_error_page(url, current_depth, status_code=status_code, error_reason="Client/Server Error")
                    await page.close()
                    continue

                if "text/html" not in content_type.lower():
                    await self._save_error_page(url, current_depth, status_code=status_code, error_reason="Non-HTML Asset")
                    await page.close()
                    continue
                
                # Check for 3xx redirect in Playwright before closing page
                clean_req = self._clean_crawl_url(url)
                final_url = page.url
                clean_final = self._clean_crawl_url(final_url)
                has_redirect = (clean_final != clean_req)
                if has_redirect:
                    await self._save_redirect_page(clean_req, current_depth, 301, clean_final)
                    await page.close()
                    parsed_final = urlparse(clean_final)
                    if parsed_final.netloc == self.allowed_domain:
                        variants = self._get_url_variants(clean_final)
                        if not any(v in self.visited_urls for v in variants):
                            if len(self.visited_urls) < self.max_pages:
                                for v in variants:
                                    self.visited_urls.add(v)
                                if "text/html" in content_type.lower() and status_code < 400:
                                    html_content = await page.content() if not page.is_closed() else ""
                                    if html_content:
                                        metrics = extract_seo_metrics(html_content, clean_final)
                                        await self._process_page_data(clean_final, current_depth, html_content, status_code, content_type, response_time_ms, metrics)
                    continue

                # Fetch rendered HTML
                html_content = await page.content()
                
                # Run Accessibility Audit using Axe-Core
                try:
                    axe_results = await axe.run(page)
                    violations = axe_results.get("violations", [])
                except Exception as e:
                    print(f"Axe error: {e}")
                    violations = []
                
                await page.close()
                
                # Process metrics
                metrics = extract_seo_metrics(html_content, url)
                
                # Add JS rendering specifics
                metrics["audit_data"]["JavaScript"]["Pages with JavaScript Errors"] = len(js_errors) > 0
                metrics["audit_data"]["JavaScript"]["Contains JavaScript Content"] = True # Confirmed by PW
                
                # Map Axe-Core violations to 32 params (Accessibility)
                accessibility = metrics["audit_data"]["Accessibility"]
                accessibility["Total Violations"] = len(violations)
                accessibility["Needs Improvement"] = len(violations) > 0
                
                for v in violations:
                    # Simple mapping by axe ID
                    vid = v["id"]
                    if vid == "color-contrast": accessibility["Text Requires Higher Color Contrast to Background"] = True
                    if vid == "image-alt": accessibility["Alt Text Should Not Be Repeated As Text"] = True # Rough mapping
                    if vid == "label": accessibility["Form Elements Should Have Visible Label"] = True
                    if vid == "html-has-lang": accessibility["Lang Attribute Requires Valid Value"] = True
                    if "aria" in vid: accessibility["Required ARIA Attributes Must Be Provided"] = True
                
                await self._process_page_data(url, current_depth, html_content, status_code, content_type, response_time_ms, metrics)

            except asyncio.CancelledError:
                break
            except Exception as e:
                print(f"Playwright Worker Error: {e}")
            finally:
                if item_fetched:
                    self.queue.task_done()

    def _clean_crawl_url(self, dest: str) -> str:
        try:
            url_clean = dest.split("#")[0].strip()
            parsed = urlparse(url_clean)
            scheme = (parsed.scheme or "https").lower()
            netloc = parsed.netloc.lower()
            if netloc.endswith(":80") and scheme == "http":
                netloc = netloc[:-3]
            elif netloc.endswith(":443") and scheme == "https":
                netloc = netloc[:-4]

            path = parsed.path or "/"
            # Collapse double or multiple slashes in path (e.g. //service -> /service)
            path = re.sub(r'/{2,}', '/', path)
            if not path:
                path = "/"

            if getattr(self, 'ignore_url_params', False):
                return f"{scheme}://{netloc}{path}"

            if parsed.query:
                from urllib.parse import parse_qsl, urlencode
                tracking_prefixes = ('utm_', 'fbclid', 'gclid', 'msclkid', 'mc_cid', 'mc_eid', '_ga')
                clean_queries = [(k, v) for k, v in parse_qsl(parsed.query, keep_blank_values=True)
                                 if not any(k.lower().startswith(p) for p in tracking_prefixes)]
                new_query = urlencode(clean_queries)
                return f"{scheme}://{netloc}{path}" + (f"?{new_query}" if new_query else "")
            return f"{scheme}://{netloc}{path}"
        except Exception:
            return dest

    async def _process_page_data(self, url, current_depth, html_content, status_code, content_type, response_time_ms, pre_metrics=None):
        if pre_metrics:
            metrics = pre_metrics
        else:
            metrics = extract_seo_metrics(html_content, url)
            
        links, images = extract_links_and_images(html_content, url)
        
        missing_alt_text_count = sum(1 for i in images if i.get("Missing_Alt_Text"))
        missing_alt_attr_count = sum(1 for i in images if i.get("Missing_Alt_Attribute"))
        alt_text_over_100_count = sum(1 for i in images if i.get("Alt_Text_Over_100_Characters"))
        missing_size_attrs_count = sum(1 for i in images if i.get("Missing_Size_Attributes"))
        
        metrics["audit_data"]["Images"] = {
            "Total Images": len(images),
            "Missing Alt Text": missing_alt_text_count > 0,
            "Missing Alt Attribute": missing_alt_attr_count > 0,
            "Alt Text Over 100 Characters": alt_text_over_100_count > 0,
            "Missing Size Attributes": missing_size_attrs_count > 0
        }
        
        if hasattr(self, 'active_integrations'):
            if "pagespeed" in self.active_integrations:
                if current_depth == 0:
                    try:
                        from app.features.audits.scrapers.seo_scraper import fetch_pagespeed_data
                        mobile_ps, desktop_ps = await asyncio.gather(
                            fetch_pagespeed_data(url, "mobile"),
                            fetch_pagespeed_data(url, "desktop")
                        )
                        metrics["audit_data"].setdefault("seo_audit", {})
                        metrics["audit_data"]["seo_audit"]["pagespeed"] = {
                            "mobile": mobile_ps,
                            "desktop": desktop_ps
                        }
                    except Exception as e:
                        print(f"PageSpeed gather warning: {e}")
                else:
                    metrics["audit_data"].setdefault("seo_audit", {})
                    metrics["audit_data"]["seo_audit"]["pagespeed"] = {}
        
        page_columns = {c.name for c in Page.__table__.columns}
        page_kwargs = {
            "crawl_id": self.crawl_id,
            "url": url,
            "content_type": content_type,
            "status_code": status_code,
            "response_time_ms": response_time_ms,
            "crawl_depth": current_depth,
            "folder_depth": urlparse(url).path.count("/")
        }
        for k, v in metrics.items():
            if k in page_columns:
                page_kwargs[k] = v
                
        db_page = Page(**page_kwargs)
        
        db_links = []
        for link in links:
            dest_url = link["destination_url"]
            db_links.append(Link(
                crawl_id=self.crawl_id,
                source_page_id=0, # will be populated below
                destination_url=dest_url,
                anchor_text=link["anchor_text"],
                is_follow=link["is_follow"],
                link_type=link["link_type"],
                is_internal=link["is_internal"]
            ))
            
            if link["is_internal"] and current_depth < self.max_depth:
                dest = self._clean_crawl_url(dest_url)
                path_lower = urlparse(dest).path.lower()
                
                # Skip non-HTML binary asset files from being queued as crawlable pages
                if path_lower.endswith(NON_PAGE_EXTENSIONS):
                    continue

                # Skip author archives if disabled in settings (Screaming Frog standard: disabled by default)
                if not getattr(self, 'crawl_author_archives', False) and ('/author/' in path_lower or path_lower.startswith('/author')):
                    continue
                    
                # Check Exclude Paths
                is_excluded = False
                for exclude_path in getattr(self, 'exclude_paths_list', []):
                    if exclude_path in dest:
                        is_excluded = True
                        break
                        
                variants = self._get_url_variants(dest)
                already_visited = any(v in self.visited_urls for v in variants)
                if not is_excluded and not already_visited:
                    if len(self.visited_urls) < self.max_pages:
                        for v in variants:
                            self.visited_urls.add(v)
                        self.queue.put_nowait((dest, current_depth + 1))
            elif not link["is_internal"] and getattr(self, 'check_external_links', False):
                clean_ext = self._clean_crawl_url(dest_url)
                ext_variants = self._get_url_variants(clean_ext)
                if not any(v in self.visited_urls for v in ext_variants) and len(self.visited_urls) < self.max_pages:
                    for v in ext_variants:
                        self.visited_urls.add(v)
                    asyncio.create_task(self._check_external_link(clean_ext, current_depth + 1))

        # Record Canonical tag as a link if present and different from self
        canon_dest = metrics.get("canonical_link_element_1")
        if canon_dest:
            clean_canon = self._clean_crawl_url(canon_dest)
            clean_curr = self._clean_crawl_url(url)
            if clean_canon != clean_curr:
                db_links.append(Link(
                    crawl_id=self.crawl_id,
                    source_page_id=0, # will be populated below
                    destination_url=canon_dest,
                    anchor_text="Canonical Tag",
                    is_follow=True,
                    link_type="CANONICAL",
                    is_internal=(urlparse(canon_dest).netloc.lower().replace("www.", "") == self.allowed_domain.replace("www.", ""))
                ))
                
        db_images = []
        for img in images:
            db_images.append(Image(
                crawl_id=self.crawl_id,
                page_id=0, # will be populated below
                url=img["url"],
                alt_text=img["alt_text"],
                size_bytes=img["size_bytes"]
            ))
            
        async with self.db_lock:
            try:
                self.db.add(db_page)
                await self.db.flush()
                for l in db_links:
                    l.source_page_id = db_page.id
                for i in db_images:
                    i.page_id = db_page.id
                if db_links:
                    self.db.add_all(db_links)
                if db_images:
                    self.db.add_all(db_images)
                await self.db.commit()
            except Exception as e:
                print(f"Error saving page {url} to DB: {e}")
                await self.db.rollback()

    async def _save_redirect_page(self, url: str, depth: int, status_code: int, redirect_url: str):
        status_name = "Moved Permanently" if status_code == 301 else ("Found" if status_code == 302 else ("Temporary Redirect" if status_code == 307 else "Permanent Redirect"))
        audit_data = {
            "Response_Codes": {
                "3xx": True,
                "Redirection (3xx)": True,
                "Redirection_3xx": True,
                "Status Code": status_code,
                "Redirect URL": redirect_url
            },
            "Indexability": {
                "Indexable": False,
                "Non-Indexable Reason": f"Redirect ({status_code})"
            }
        }
        page = Page(
            crawl_id=self.crawl_id,
            url=url,
            status_code=status_code,
            status_name=status_name,
            indexability=IndexabilityStatus.NON_INDEXABLE,
            indexability_status=f"Redirect ({status_code})",
            crawl_depth=depth,
            folder_depth=urlparse(url).path.count("/"),
            audit_data=audit_data
        )
        async with self.db_lock:
            try:
                self.db.add(page)
                await self.db.flush()
                # Create a redirect Link row so inlinks for redirect_url are accurately tracked
                redirect_link = Link(
                    crawl_id=self.crawl_id,
                    source_page_id=page.id,
                    destination_url=redirect_url,
                    anchor_text=f"{status_code} Redirect",
                    is_follow=True,
                    link_type="REDIRECT",
                    is_internal=(urlparse(redirect_url).netloc.lower().replace("www.", "") == self.allowed_domain.replace("www.", ""))
                )
                self.db.add(redirect_link)
                await self.db.commit()
            except Exception as e:
                print(f"Error saving redirect page {url} to DB: {e}")
                await self.db.rollback()

    async def _save_error_page(self, url: str, depth: int, status_code: int, error_reason: str):
        resp_codes = {}
        if 400 <= status_code < 500:
            resp_codes = {
                "4xx": True,
                "Client Error (4xx)": True,
                "Client_Error_4xx": True,
                "Status Code": status_code,
                "Error": error_reason or "Client Error (4xx)"
            }
        elif status_code >= 500:
            resp_codes = {
                "5xx": True,
                "Server Error (5xx)": True,
                "Server_Error_5xx": True,
                "Status Code": status_code,
                "Error": error_reason or "Server Error (5xx)"
            }
        elif status_code == 0:
            resp_codes = {
                "Blocked": True,
                "Status Code": 0,
                "Error": error_reason or "Blocked by robots.txt"
            }

        audit_data = {
            "Response_Codes": resp_codes,
            "Indexability": {
                "Indexable": False,
                "Non-Indexable Reason": error_reason or f"Error ({status_code})"
            }
        }
        page = Page(
            crawl_id=self.crawl_id,
            url=url,
            status_code=status_code,
            indexability=IndexabilityStatus.NON_INDEXABLE,
            indexability_status=error_reason,
            crawl_depth=depth,
            folder_depth=urlparse(url).path.count("/"),
            audit_data=audit_data
        )
        async with self.db_lock:
            try:
                self.db.add(page)
                await self.db.commit()
            except Exception as e:
                print(f"Error saving error page {url} to DB: {e}")
                await self.db.rollback()

    async def _check_external_link(self, ext_url: str, depth: int):
        """Checks external outbound links for broken/404 status without crawling recursively."""
        try:
            headers = {'User-Agent': self.user_agent}
            async with httpx.AsyncClient(verify=False, timeout=8.0, headers=headers) as client:
                try:
                    resp = await client.head(ext_url, follow_redirects=True)
                    if resp.status_code == 405: # Method Not Allowed for HEAD
                        resp = await client.get(ext_url, follow_redirects=True)
                except Exception:
                    resp = await client.get(ext_url, follow_redirects=True)
                    
                status_code = resp.status_code
                content_type = resp.headers.get("content-type", "")
                status_name = "OK" if status_code == 200 else ("Not Found" if status_code == 404 else f"HTTP {status_code}")
                
                page_data = {
                    "crawl_id": self.crawl_id,
                    "url": ext_url,
                    "content_type": content_type,
                    "status_code": status_code,
                    "status_name": status_name,
                    "indexability": IndexabilityStatus.NON_INDEXABLE,
                    "indexability_status": "External",
                    "crawl_depth": depth,
                    "folder_depth": urlparse(ext_url).path.count("/"),
                    "audit_data": {
                        "External": {"Status Code": status_code, "Content Type": content_type},
                        "Response_Codes": {
                            "Status Code": status_code,
                            "2xx": 200 <= status_code < 300,
                            "4xx": 400 <= status_code < 500,
                            "5xx": status_code >= 500
                        },
                        "Indexability": {
                            "Indexable": False,
                            "Non-Indexable Reason": "External"
                        }
                    }
                }
                async with self.db_lock:
                    try:
                        self.db.add(Page(**page_data))
                        await self.db.commit()
                    except Exception as e:
                        await self.db.rollback()
                        print(f"Error saving external link check for {ext_url}: {e}")
        except Exception as e:
            page_data = {
                "crawl_id": self.crawl_id,
                "url": ext_url,
                "status_code": 0,
                "status_name": "Connection Error",
                "indexability": IndexabilityStatus.NON_INDEXABLE,
                "indexability_status": "External Error",
                "crawl_depth": depth,
                "folder_depth": urlparse(ext_url).path.count("/"),
                "audit_data": {
                    "External": {"Status Code": 0, "Error": str(e)},
                    "Response_Codes": {"Status Code": 0, "Blocked": True, "Error": str(e)},
                    "Indexability": {"Indexable": False, "Non-Indexable Reason": "External Error"}
                }
            }
            async with self.db_lock:
                try:
                    self.db.add(Page(**page_data))
                    await self.db.commit()
                except Exception:
                    await self.db.rollback()

