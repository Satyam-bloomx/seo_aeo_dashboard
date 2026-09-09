import httpx
import asyncio
from bs4 import BeautifulSoup
import urllib.robotparser
from urllib.parse import urlparse
import extruct
import ssl
import socket
import time
import os
from dotenv import load_dotenv

load_dotenv()

async def fetch_pagespeed_data(url: str, strategy: str = "mobile"):
    """Fetches real-world Core Web Vitals and Lighthouse score from Google PageSpeed API."""
    api_key = os.getenv("PAGESPEED_API_KEY")
    if not api_key:
        return {"status": "skipped", "message": "PAGESPEED_API_KEY not configured"}

    api_url = f"https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url={url}&key={api_key}&strategy={strategy}&category=performance"
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(api_url)
            if response.status_code == 200:
                data = response.json()
                lighthouse_score = data.get("lighthouseResult", {}).get("categories", {}).get("performance", {}).get("score", 0) * 100
                audits = data.get("lighthouseResult", {}).get("audits", {})
                
                metrics = {
                    "lcp": audits.get("largest-contentful-paint", {}).get("displayValue", "N/A"),
                    "cls": audits.get("cumulative-layout-shift", {}).get("displayValue", "N/A"),
                    "fcp": audits.get("first-contentful-paint", {}).get("displayValue", "N/A"),
                    "tbt": audits.get("total-blocking-time", {}).get("displayValue", "N/A"),
                    "speedIndex": audits.get("speed-index", {}).get("displayValue", "N/A"),
                    "ttfb": audits.get("server-response-time", {}).get("displayValue", "N/A"),
                    "inp": audits.get("interaction-to-next-paint", {}).get("displayValue", audits.get("interactive", {}).get("displayValue", "N/A"))
                }
                
                opportunities = []
                for key, audit in audits.items():
                    details = audit.get("details", {})
                    if details.get("type") == "opportunity" and audit.get("score", 1) < 1:
                        opportunities.append({
                            "id": audit.get("id"),
                            "title": audit.get("title"),
                            "description": audit.get("description"),
                            "savingsMs": details.get("overallSavingsMs")
                        })
                
                return {
                    "status": "success",
                    "performance_score": int(lighthouse_score),
                    "metrics": metrics,
                    "opportunities": opportunities
                }
            else:
                return {"status": "error", "message": f"API returned {response.status_code}"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

async def fetch_page_data(url: str):
    """Fetches raw HTML, status code, and calculates TTFB with Playwright anti-bot fallback."""
    start_time = time.time()
    default_headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Upgrade-Insecure-Requests': '1'
    }
    try:
        async with httpx.AsyncClient(timeout=12.0, follow_redirects=True, headers=default_headers) as client:
            response = await client.get(url)
            if response.status_code not in [429, 403, 503]:
                ttfb = int((time.time() - start_time) * 1000)
                return {
                    "html": response.text,
                    "status_code": response.status_code,
                    "ttfb_ms": ttfb,
                    "final_url": str(response.url),
                    "headers": dict(response.headers),
                    "error": None
                }
    except Exception:
        pass

    # Cloudflare / Rate-limit fallback using Playwright
    try:
        from playwright.async_api import async_playwright
        async with async_playwright() as p:
            browser = await p.chromium.launch(
                headless=True,
                args=['--disable-blink-features=AutomationControlled', '--no-sandbox']
            )
            context = await browser.new_context(
                viewport={'width': 1920, 'height': 1080},
                user_agent=default_headers['User-Agent'],
                locale='en-US',
                extra_http_headers=default_headers
            )
            page = await context.new_page()
            pw_start = time.time()
            res = await page.goto(url, wait_until='domcontentloaded', timeout=30000)
            await page.wait_for_timeout(2000)
            ttfb = int((time.time() - pw_start) * 1000)
            html = await page.content()
            status_code = res.status if res else 200
            if status_code in [429, 403, 503] and len(html) > 1000 and "Just a moment..." not in html:
                status_code = 200
            headers = dict(res.headers) if res else {}
            final_url = page.url
            await browser.close()
            return {
                "html": html,
                "status_code": status_code,
                "ttfb_ms": ttfb,
                "final_url": final_url,
                "headers": headers,
                "error": None
            }
    except Exception as e:
        return {
            "html": "",
            "status_code": 500,
            "ttfb_ms": 0,
            "final_url": url,
            "headers": {},
            "error": str(e)
        }

def remove_hidden_elements(soup):
    """Removes elements that are visually hidden from the user."""
    hidden_tags = []
    for tag in soup.find_all(True):
        # 1. Check inline styles
        style = tag.get('style', '').replace(' ', '').lower()
        if 'display:none' in style or 'visibility:hidden' in style:
            hidden_tags.append(tag)
            continue
            
        # 2. Check hidden inputs
        if tag.name == 'input' and tag.get('type') == 'hidden':
            hidden_tags.append(tag)
            continue
            
        # 3. Check CSS classes (Elementor, Bootstrap, Tailwind)
        classes = tag.get('class', [])
        if isinstance(classes, list):
            classes_str = ' '.join(classes).lower()
        else:
            classes_str = str(classes).lower()
            
        # Do not strip sr-only as it's meant for screen readers
        if any(c in classes_str for c in ['elementor-hidden', 'd-none', 'hide', 'hidden', 'invisible']):
            # Ensure we don't accidentally match safe classes like "overflow-hidden", exact matches or specific prefixes are better
            # We will strictly look for common hiding utility classes
            pass
            
        class_list = classes_str.split()
        if any(c in class_list for c in ['hidden', 'd-none', 'invisible', 'hide']):
            hidden_tags.append(tag)
        elif 'elementor-hidden' in classes_str:
            hidden_tags.append(tag)
            
    for tag in hidden_tags:
        try:
            tag.decompose()
        except:
            pass

def parse_seo_tags(html: str, url: str = None):
    """Extracts H1, title, meta descriptions, canonical links and granular metrics."""
    if not html:
        return {}
    
    soup = BeautifulSoup(html, "lxml")
    remove_hidden_elements(soup)
    
    # Title
    title_tags = soup.find_all('title')
    title_count = len(title_tags)
    title = title_tags[0].string.strip() if title_count > 0 and title_tags[0].string else None
    title_length = len(title) if title else 0
    
    # H1
    h1_tags = soup.find_all('h1')
    h1_count = len(h1_tags)
    h1_1 = h1_tags[0].get_text(strip=True) if h1_count > 0 else None
    h1_1_length = len(h1_1) if h1_1 else 0
    h1_2 = h1_tags[1].get_text(strip=True) if h1_count > 1 else None
    h1_2_length = len(h1_2) if h1_2 else 0
    
    # H2
    h2_tags_elements = soup.find_all('h2')
    h2_count = len(h2_tags_elements)
    h2_texts = [{"text": h2.get_text(strip=True), "length": len(h2.get_text(strip=True))} for h2 in h2_tags_elements]
    
    # H3
    h3_tags_elements = soup.find_all('h3')
    h3_count = len(h3_tags_elements)
    
    # Meta Description
    meta_desc_tags = soup.find_all('meta', attrs={'name': lambda x: x and x.lower() == 'description'})
    meta_desc_count = len(meta_desc_tags)
    meta_desc = meta_desc_tags[0].get('content', '').strip() if meta_desc_count > 0 else None
    meta_desc_length = len(meta_desc) if meta_desc else 0
        
    canonical = None
    canonical_tag = soup.find('link', attrs={'rel': 'canonical'})
    if canonical_tag:
        canonical = canonical_tag.get('href')
        
    # Meta Robots
    meta_robots = None
    robots_tag = soup.find('meta', attrs={'name': lambda x: x and x.lower() == 'robots'})
    if robots_tag:
        meta_robots = robots_tag.get('content', '').lower()
        
    # Indexability
    indexability = "Indexable"
    indexability_status = []
    
    if meta_robots and 'noindex' in meta_robots:
        indexability = "Non-Indexable"
        indexability_status.append("Noindex")
        
    if canonical and url:
        # Strip trailing slashes and common differences for comparison
        clean_url = url.split('#')[0].rstrip('/')
        clean_canonical = canonical.split('#')[0].rstrip('/')
        if clean_url != clean_canonical and not clean_url.endswith(clean_canonical):
            indexability = "Non-Indexable" if indexability == "Non-Indexable" else "Non-Indexable"
            indexability_status.append("Canonicalised")

    # Size Bytes
    size_bytes = len(html.encode('utf-8')) if html else 0
        
    # HTML Lang & Charset
    html_lang = None
    html_tag = soup.find('html')
    if html_tag:
        html_lang = html_tag.get('lang')
        
    meta_charset = None
    charset_tag = soup.find('meta', charset=True)
    if charset_tag:
        meta_charset = charset_tag.get('charset')
    else:
        content_type_tag = soup.find('meta', attrs={'http-equiv': lambda x: x and x.lower() == 'content-type'})
        if content_type_tag:
            content_type = content_type_tag.get('content', '')
            if 'charset=' in content_type.lower():
                meta_charset = content_type.lower().split('charset=')[-1]
                
    # Social Tags
    has_og_title = bool(soup.find('meta', property='og:title'))
    has_og_desc = bool(soup.find('meta', property='og:description'))
    has_twitter_card = bool(soup.find('meta', attrs={'name': 'twitter:card'}))
    
    # Favicon
    has_favicon = False
    for link in soup.find_all('link', rel=True):
        rels = [r.lower() for r in link.get('rel', [])]
        if 'icon' in rels or 'shortcut icon' in rels or 'apple-touch-icon' in rels:
            has_favicon = True
            break
            
    # Mobile Viewport
    has_viewport = False
    viewport_tag = soup.find('meta', attrs={'name': 'viewport'})
    if viewport_tag and 'width=device-width' in viewport_tag.get('content', '').lower():
        has_viewport = True
        
    # Content Freshness
    modified_time = None
    modified_tag = soup.find('meta', property='article:modified_time') or soup.find('meta', property='article:published_time')
    if modified_tag:
        modified_time = modified_tag.get('content')
        
    # Word & Paragraph Count
    paragraphs = soup.find_all('p')
    paragraph_count = len(paragraphs)
    
    lists_count = len(soup.find_all(['ul', 'ol']))
    tables_count = len(soup.find_all('table'))
    
    # Strip script, style, and boilerplate for word count
    for invisible in soup(["script", "style", "noscript", "header", "footer", "nav"]):
        invisible.extract()
    text = soup.get_text(separator=' ', strip=True)
    word_count = len(text.split())
        
    return {
        "title": title,
        "title_length": title_length,
        "title_count": title_count,
        "meta_description": meta_desc,
        "meta_description_length": meta_desc_length,
        "meta_description_count": meta_desc_count,
        "h1_count": h1_count,
        "h1_1": h1_1,
        "h1_1_length": h1_1_length,
        "h1_2": h1_2,
        "h1_2_length": h1_2_length,
        "h2_count": h2_count,
        "h2_texts": h2_texts,
        "h3_count": h3_count,
        "canonical_url": canonical,
        "meta_robots": meta_robots,
        "indexability": indexability,
        "indexability_status": ", ".join(indexability_status) if indexability_status else "Indexable",
        "size_bytes": size_bytes,
        "html_lang": html_lang,
        "meta_charset": meta_charset,
        "social_tags": {
            "has_og_title": has_og_title,
            "has_og_desc": has_og_desc,
            "has_twitter_card": has_twitter_card
        },
        "has_favicon": has_favicon,
        "has_viewport": has_viewport,
        "modified_time": modified_time,
        "word_count": word_count,
        "paragraph_count": paragraph_count,
        "lists_count": lists_count,
        "tables_count": tables_count
    }

def check_robots_txt(url: str):
    """Parses robots.txt rules for traditional search engines."""
    parsed_url = urlparse(url)
    robots_url = f"{parsed_url.scheme}://{parsed_url.netloc}/robots.txt"
    
    rp = urllib.robotparser.RobotFileParser()
    rp.set_url(robots_url)
    try:
        rp.read()
        can_fetch_google = rp.can_fetch("Googlebot", url)
        return {"robots_url": robots_url, "googlebot_allowed": can_fetch_google}
    except Exception:
        return {"robots_url": robots_url, "googlebot_allowed": "unknown"}

def extract_schema(html: str, url: str):
    """Uses extruct to extract structured data (JSON-LD)."""
    if not html:
        return {}
    try:
        data = extruct.extract(html, base_url=url, syntaxes=['json-ld'])
        return data.get('json-ld', [])
    except Exception:
        return []

def check_ssl(url: str):
    """Verifies if the URL is served over HTTPS and the certificate is valid."""
    parsed_url = urlparse(url)
    if parsed_url.scheme != 'https':
        return {"is_https": False, "valid_cert": False}
        
    hostname = parsed_url.hostname
    port = parsed_url.port or 443
    context = ssl.create_default_context()
    try:
        with socket.create_connection((hostname, port), timeout=5) as sock:
            with context.wrap_socket(sock, server_hostname=hostname) as ssock:
                return {"is_https": True, "valid_cert": True}
    except Exception:
        return {"is_https": True, "valid_cert": False}

def extract_image_alts(html: str):
    """Calculates the percentage of images that have alt text."""
    if not html:
        return {"total_images": 0, "images_with_alt": 0, "alt_coverage_percentage": 0, "images_missing_alt": []}
        
    soup = BeautifulSoup(html, "lxml")
    remove_hidden_elements(soup)
    images = soup.find_all('img')
    total_images = len(images)
    
    if total_images == 0:
        return {"total_images": 0, "images_with_alt": 0, "alt_coverage_percentage": 100, "images_missing_alt": []}
        
    images_with_alt = sum(1 for img in images if img.get('alt') and str(img.get('alt')).strip() != "")
    coverage = round((images_with_alt / total_images) * 100, 2)
    
    images_missing_alt = [img.get('src', 'unknown src') for img in images if not img.get('alt') or str(img.get('alt')).strip() == ""]
    
    # Check for modern formats (WebP/AVIF)
    modern_images_count = 0
    for img in images:
        src = str(img.get('src', '')).lower()
        if src.endswith('.webp') or src.endswith('.avif'):
            modern_images_count += 1
        elif img.parent and img.parent.name == 'picture':
            sources = img.parent.find_all('source')
            if any('image/webp' in source.get('type', '') or 'image/avif' in source.get('type', '') for source in sources):
                modern_images_count += 1
                
    modern_format_percentage = round((modern_images_count / total_images) * 100, 2)
    
    # Check for lazy loading
    lazy_images_count = sum(1 for img in images if img.get('loading') == 'lazy')
    lazy_loading_percentage = round((lazy_images_count / total_images) * 100, 2) if total_images > 0 else 100
    
    return {
        "total_images": total_images,
        "images_with_alt": images_with_alt,
        "alt_coverage_percentage": coverage,
        "images_missing_alt": images_missing_alt,
        "modern_images_count": modern_images_count,
        "modern_format_percentage": modern_format_percentage,
        "lazy_loading_percentage": lazy_loading_percentage
    }

def check_accessibility(html: str):
    """Checks basic accessibility (a11y) like readable buttons and links."""
    if not html:
        return {"a11y_score": 100, "issues": []}
        
    soup = BeautifulSoup(html, "lxml")
    remove_hidden_elements(soup)
    
    elements = soup.find_all(['a', 'button'])
    total_elements = len(elements)
    
    if total_elements == 0:
        return {"a11y_score": 100, "issues": []}
        
    issues = []
    accessible_count = 0
    
    for el in elements:
        text = el.get_text(strip=True)
        aria_label = el.get('aria-label', '').strip()
        
        if text or aria_label:
            accessible_count += 1
        else:
            tag_str = str(el)[:100] + '...' if len(str(el)) > 100 else str(el)
            issues.append(f"Missing text/aria-label: {tag_str}")
            
    a11y_score = round((accessible_count / total_elements) * 100, 2)
    return {
        "a11y_score": a11y_score,
        "issues": issues
    }

async def run_seo_audit(url: str):
    """Orchestrates the SEO audit checks."""
    page_data = await fetch_page_data(url)
    html = page_data.get("html", "")
    headers = page_data.get("headers", {})
    
    tags = parse_seo_tags(html, url)
    robots = check_robots_txt(url)
    schema = extract_schema(html, url)
    ssl_status = check_ssl(url)
    images = extract_image_alts(html)
    a11y = check_accessibility(html)
    mobile_ps_task = fetch_pagespeed_data(url, "mobile")
    desktop_ps_task = fetch_pagespeed_data(url, "desktop")
    mobile_ps, desktop_ps = await asyncio.gather(mobile_ps_task, desktop_ps_task)
    pagespeed = {
        "mobile": mobile_ps,
        "desktop": desktop_ps
    }
    
    parsed_url = urlparse(url)
    slug = parsed_url.path.strip('/')
    slug_quality = {
        "length": len(slug),
        "has_uppercase": any(c.isupper() for c in slug),
        "has_underscores": "_" in slug,
        "has_spaces": " " in slug or "%20" in slug
    }

    content_encoding = headers.get("content-encoding", "").lower()
    is_compressed = "gzip" in content_encoding or "br" in content_encoding

    return {
        "fetch_metrics": {
            "status_code": page_data.get("status_code"),
            "ttfb_ms": page_data.get("ttfb_ms"),
            "is_compressed": is_compressed,
            "content_encoding": content_encoding,
            "error": page_data.get("error")
        },
        "on_page": tags,
        "robots": robots,
        "schema_count": len(schema),
        "schema_types": [s.get('@type') for s in schema if isinstance(s, dict)],
        "security": ssl_status,
        "media": images,
        "a11y": a11y,
        "pagespeed": pagespeed,
        "slug_quality": slug_quality
    }
