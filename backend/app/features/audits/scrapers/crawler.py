import httpx
import asyncio
from bs4 import BeautifulSoup
from urllib.parse import urlparse, urljoin
import xml.etree.ElementTree as ET

async def fetch_url(client: httpx.AsyncClient, url: str):
    """Fetches a URL and returns its status code and html."""
    try:
        response = await client.get(url)
        return response.status_code, response.text
    except Exception:
        return None, ""

IGNORED_EXTS = (
    '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico',
    '.pdf', '.doc', '.docx', '.xls', '.xlsx',
    '.css', '.js', '.json', '.xml', '.csv', '.txt',
    '.zip', '.tar', '.gz', '.mp3', '.mp4'
)

def is_valid_link(a_tag, parsed, current_domain):
    if parsed.netloc != current_domain:
        return False
    if parsed.path.lower().endswith(IGNORED_EXTS):
        return False
        
    # Check if it has visible text or an image
    has_text = bool(a_tag.get_text(strip=True))
    has_img = bool(a_tag.find('img'))
    if not has_text and not has_img:
        return False
        
    # Basic check for inline display: none
    parent = a_tag
    while parent and parent.name != '[document]':
        style = parent.get('style', '')
        if style and 'display:none' in style.replace(' ', '').lower():
            return False
        parent = parent.parent
        
    return True

def extract_links(html: str, base_url: str, current_domain: str):
    """Extracts all internal links from the HTML."""
    soup = BeautifulSoup(html, "lxml")
    links = set()
    for a_tag in soup.find_all('a', href=True):
        href = a_tag.get('href', '')
        full_url = urljoin(base_url, href)
        parsed = urlparse(full_url)
        
        if is_valid_link(a_tag, parsed, current_domain):
            clean_url = f"{parsed.scheme}://{parsed.netloc}{parsed.path}"
            links.add(clean_url)
    return links

def extract_main_pages(html: str, base_url: str, current_domain: str, max_pages: int = 5):
    """Extracts up to max_pages from <nav> or <header> to be used as main pages."""
    soup = BeautifulSoup(html, "lxml")
    main_links = set()
    nav_elements = soup.find_all(['nav', 'header'])
    
    for nav in nav_elements:
        for a_tag in nav.find_all('a', href=True):
            href = a_tag.get('href', '')
            full_url = urljoin(base_url, href)
            parsed = urlparse(full_url)
            
            if is_valid_link(a_tag, parsed, current_domain):
                clean_url = f"{parsed.scheme}://{parsed.netloc}{parsed.path}"
                main_links.add(clean_url)
            if len(main_links) >= max_pages:
                return list(main_links)
    return list(main_links)

async def fetch_sitemap_urls(client: httpx.AsyncClient, domain: str):
    """Attempts to fetch standard sitemap locations and extract URLs."""
    sitemap_urls = set()
    sitemap_locations = [
        f"https://{domain}/sitemap.xml",
        f"http://{domain}/sitemap.xml"
    ]
    
    for loc in sitemap_locations:
        status, content = await fetch_url(client, loc)
        if status == 200 and content:
            try:
                root = ET.fromstring(content)
                # Parse standard sitemap XML
                for url_elem in root.findall('.//{http://www.sitemaps.org/schemas/sitemap/0.9}loc'):
                    if url_elem.text:
                        sitemap_urls.add(url_elem.text.strip())
            except Exception:
                pass
            
            if sitemap_urls:
                break # Found a valid sitemap
                
    return sitemap_urls

from app.features.audits.scrapers.fast_scraper import run_fast_audit

async def run_crawler(start_url: str, max_pages: int = 50, max_depth: int = 3):
    """
    Crawls the website using Breadth-First Search (BFS).
    Returns a dictionary with crawler statistics including orphan pages and fast audits.
    """
    parsed_start = urlparse(start_url)
    domain = parsed_start.netloc
    
    visited = set()
    url_depths = {}
    queue = [(start_url, 0)] # (url, depth)
    broken_links = []
    fast_audits = []
    
    # Simple semaphore to limit concurrent requests
    semaphore = asyncio.Semaphore(5)
    
    async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
        # First, try to fetch the sitemap
        sitemap_urls = await fetch_sitemap_urls(client, domain)
        
        while queue and len(visited) < max_pages:
            current_url, depth = queue.pop(0)
            
            if current_url in visited or depth > max_depth:
                continue
                
            visited.add(current_url)
            url_depths[current_url] = depth
            
            async with semaphore:
                status, html = await fetch_url(client, current_url)
                
            if status is None or status >= 400:
                broken_links.append({"url": current_url, "status": status})
                continue
                
            if html:
                # RUN FAST AUDIT FOR THE HYBRID CRAWL
                fast_audits.append(run_fast_audit(current_url, html))
                
                new_links = extract_links(html, current_url, domain)
                for link in new_links:
                    if link not in visited:
                        queue.append((link, depth + 1))
                        
    # Detect Orphan Pages
    orphan_pages = []
    if sitemap_urls:
        orphan_pages = list(sitemap_urls - visited)
                        
    return {
        "pages_crawled": len(visited),
        "broken_internal_links": len(broken_links),
        "max_depth_reached": depth if 'depth' in locals() else 0,
        "broken_details": broken_links,
        "sitemap_found": len(sitemap_urls) > 0,
        "sitemap_url_count": len(sitemap_urls),
        "orphan_pages": orphan_pages,
        "url_depths": url_depths,
        "fast_audits": fast_audits
    }
