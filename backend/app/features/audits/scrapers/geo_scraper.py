import httpx
import urllib.robotparser
from urllib.parse import urlparse
from bs4 import BeautifulSoup
from playwright.async_api import async_playwright
import time

async def check_ai_bot_access(url: str):
    """Checks robots.txt specifically for AI bots (GPTBot, ClaudeBot, Google-Extended)."""
    parsed_url = urlparse(url)
    robots_url = f"{parsed_url.scheme}://{parsed_url.netloc}/robots.txt"
    
    rp = urllib.robotparser.RobotFileParser()
    rp.set_url(robots_url)
    
    try:
        rp.read()
        return {
            "GPTBot_allowed": rp.can_fetch("GPTBot", url),
            "ClaudeBot_allowed": rp.can_fetch("ClaudeBot", url),
            "Google-Extended_allowed": rp.can_fetch("Google-Extended", url)
        }
    except Exception:
        return {
            "GPTBot_allowed": "unknown",
            "ClaudeBot_allowed": "unknown",
            "Google-Extended_allowed": "unknown"
        }

async def check_ai_files(url: str):
    """Checks for the presence of llms.txt or AI-welcome files."""
    parsed_url = urlparse(url)
    llms_url = f"{parsed_url.scheme}://{parsed_url.netloc}/llms.txt"
    
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(llms_url)
            return {
                "has_llms_txt": response.status_code == 200,
                "llms_txt_url": llms_url if response.status_code == 200 else None
            }
    except Exception:
        return {"has_llms_txt": False, "llms_txt_url": None}

def analyze_semantic_architecture(html: str):
    """Verifies standard HTML5 semantic building blocks."""
    if not html:
        return {"has_semantic_blocks": False}
        
    soup = BeautifulSoup(html, "lxml")
    
    has_main = bool(soup.find('main'))
    has_header = bool(soup.find('header'))
    has_article = bool(soup.find('article'))
    
    return {
        "has_main": has_main,
        "has_header": has_header,
        "has_article": has_article,
        "is_semantic_compliant": has_main and has_header
    }

async def calculate_js_render_diff(url: str, raw_html: str):
    """Uses Playwright to render the page and compares visible text to raw HTML."""
    if not raw_html:
        return {"diff_percentage": 0, "status": "No raw HTML provided"}
        
    raw_soup = BeautifulSoup(raw_html, "lxml")
    for script in raw_soup(["script", "style"]):
        script.extract()
    raw_text_len = len(raw_soup.get_text(strip=True))
    
    render_time_ms = 0
    rendered_text_len = 0
    
    try:
        start_time = time.time()
        async with async_playwright() as p:
            # Using chromium for the render check
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page()
            await page.goto(url, wait_until="domcontentloaded", timeout=15000)
            
            # Extract text after JS has executed
            rendered_content = await page.content()
            rendered_soup = BeautifulSoup(rendered_content, "lxml")
            for script in rendered_soup(["script", "style"]):
                script.extract()
            rendered_text_len = len(rendered_soup.get_text(strip=True))
            
            await browser.close()
            
        render_time_ms = int((time.time() - start_time) * 1000)
    except Exception as e:
        return {"error": str(e), "diff_percentage": None}

    # Calculate difference
    # If rendered text is significantly larger, it means content is hidden behind JS
    diff_percentage = 0
    if rendered_text_len > 0:
        diff = rendered_text_len - raw_text_len
        diff_percentage = round((diff / rendered_text_len) * 100, 2)
        
    return {
        "raw_text_length": raw_text_len,
        "rendered_text_length": rendered_text_len,
        "js_dependency_percentage": diff_percentage,
        "render_time_ms": render_time_ms,
        "warning": diff_percentage > 20 # Warn if > 20% of text requires JS
    }

async def check_ai_meta_instructions(url: str, raw_html: str):
    """Checks for <meta name="robots" content="noai"> or <meta name="robots" content="noimageai">."""
    if not raw_html:
        return {"has_noai": False, "has_noimageai": False}
        
    soup = BeautifulSoup(raw_html, "lxml")
    has_noai = False
    has_noimageai = False
    
    robots_tags = soup.find_all('meta', attrs={'name': lambda x: x and x.lower() == 'robots'})
    for tag in robots_tags:
        content = tag.get('content', '').lower()
        if 'noai' in content:
            has_noai = True
        if 'noimageai' in content:
            has_noimageai = True
            
    return {
        "has_noai": has_noai,
        "has_noimageai": has_noimageai
    }

async def run_geo_audit(url: str, raw_html: str):
    """Orchestrates the GEO audit checks."""
    bot_access = await check_ai_bot_access(url)
    ai_files = await check_ai_files(url)
    semantic = analyze_semantic_architecture(raw_html)
    js_render = await calculate_js_render_diff(url, raw_html)
    ai_meta = await check_ai_meta_instructions(url, raw_html)
    
    return {
        "bot_access": bot_access,
        "ai_files": ai_files,
        "semantic_architecture": semantic,
        "js_render_analysis": js_render,
        "ai_meta_instructions": ai_meta
    }
