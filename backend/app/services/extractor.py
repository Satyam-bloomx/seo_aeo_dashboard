from bs4 import BeautifulSoup
import hashlib
import json
from typing import Dict, Any, List, Tuple
from urllib.parse import urljoin, urlparse, parse_qs
import re
import html

def calculate_pixel_width(text: str) -> int:
    if not text: return 0
    width = 0
    for char in text:
        if char.isupper() or char in "mwMW": width += 11
        elif char in "ijl1I": width += 4
        else: width += 8
    return width

def get_word_count(text: str) -> int:
    return len(text.split())

def flesch_reading_ease(text: str) -> float:
    words = len(text.split())
    sentences = max(len(re.split(r'[.!?]+', text)), 1)
    syllables = max(words * 1.5, 1) 
    if words == 0: return 100.0
    return 206.835 - 1.015 * (words / sentences) - 84.6 * (syllables / words)

def extract_seo_metrics(html_content: str, url: str) -> Dict[str, Any]:
    soup = BeautifulSoup(html_content, "html.parser")
    metrics: Dict[str, Any] = {}
    parsed_url = urlparse(url)
    
    # 5. URI
    path_parts = [p for p in parsed_url.path.split('/') if p]
    has_repetitive_path = len(path_parts) != len(set(path_parts))
    
    uri_data = {
        "Non ASCII Characters": not url.isascii(),
        "Underscores": "_" in parsed_url.path,
        "Uppercase": any(c.isupper() for c in parsed_url.path),
        "Multiple Slashes": "//" in parsed_url.path,
        "Repetitive Path": has_repetitive_path,
        "Contains Space": " " in url or "%20" in url,
        "Internal Search": bool(parsed_url.query and ("q=" in parsed_url.query or "s=" in parsed_url.query)),
        "Parameters": bool(parsed_url.query),
        "Broken Bookmark": False, 
        "GA Tracking Parameters": "utm_" in parsed_url.query,
        "Over 115 Characters": len(url) > 115
    }

    # 6. Page Titles
    titles = soup.find_all("title")
    title_text = titles[0].get_text(strip=True) if titles else ""
    t_len = len(title_text)
    px_width = calculate_pixel_width(title_text)
    
    title_data = {
        "Missing": len(titles) == 0,
        "Duplicate": False, 
        "Over 60 Characters": t_len > 60,
        "Below 30 Characters": t_len > 0 and t_len < 30,
        "Over 561 Pixels": px_width > 561,
        "Below 200 Pixels": px_width > 0 and px_width < 200,
        "Same as H1": False, 
        "Multiple": len(titles) > 1,
        "Outside <head>": any(t.find_parent("head") is None for t in titles)
    }
    metrics["title_1"] = title_text

    # 7. Meta Description
    meta_descs = soup.find_all("meta", attrs={"name": re.compile(r"^description$", re.I)})
    desc_text = (meta_descs[0].get("content") or "").strip() if meta_descs else ""
    d_len = len(desc_text)
    d_px_width = calculate_pixel_width(desc_text)
    
    desc_data = {
        "Missing": len(meta_descs) == 0,
        "Duplicate": False, 
        "Over 155 Characters": d_len > 155,
        "Below 70 Characters": d_len > 0 and d_len < 70,
        "Over 985 Pixels": d_px_width > 985,
        "Below 400 Pixels": d_px_width > 0 and d_px_width < 400,
        "Multiple": len(meta_descs) > 1,
        "Outside <head>": any(m.find_parent("head") is None for m in meta_descs)
    }

    # 8. Meta Keywords
    meta_kws = soup.find_all("meta", attrs={"name": re.compile(r"^keywords$", re.I)})
    kw_data = {
        "Missing": len(meta_kws) == 0,
        "Duplicate": False,
        "Multiple": len(meta_kws) > 1
    }

    # 9. H1
    h1s = soup.find_all("h1")
    h1_text = h1s[0].get_text(strip=True) if h1s else ""
    
    h1_data = {
        "Missing": len(h1s) == 0,
        "Duplicate": False, 
        "Over 70 Characters": len(h1_text) > 70,
        "Multiple": len(h1s) > 1,
        "Alt Text in H1": bool(h1s[0].find("img", alt=True)) if h1s else False,
        "Non-Sequential": False
    }
    title_data["Same as H1"] = (title_text == h1_text and len(title_text) > 0)
    
    # 10. H2
    h2s = soup.find_all("h2")
    h2_text = h2s[0].get_text(strip=True) if h2s else ""
    h2_data = {
        "Missing": len(h2s) == 0,
        "Duplicate": False,
        "Over 70 Characters": len(h2_text) > 70,
        "Multiple": len(h2s) > 1,
        "Non-Sequential": False
    }
    if h2s and not h1s:
        h1_data["Non-Sequential"] = True
        
    # 11. Content
    for script in soup(["script", "style", "noscript", "svg"]):
        script.extract()
    text = soup.get_text(separator=' ')
    clean_text = ' '.join(text.split())
    word_count = get_word_count(clean_text)
    reading_ease = flesch_reading_ease(clean_text)
    
    content_data = {
        "Exact Duplicates": False, 
        "Near Duplicates": False, 
        "Semantically Similar": False, 
        "Low Relevance Content": False,
        "Low Content Pages": word_count > 0 and word_count < 200,
        "Soft 404 Pages": "not found" in title_text.lower() or "404" in title_text,
        "Spelling Errors": False,
        "Grammar Errors": False,
        "Readability Difficult": reading_ease < 50 and reading_ease >= 30,
        "Readability Very Difficult": reading_ease < 30,
        "Lorem Ipsum Placeholder": "lorem ipsum" in clean_text.lower()
    }
    metrics["word_count"] = word_count
    metrics["content_hash"] = hashlib.md5(clean_text.encode("utf-8")).hexdigest()
    if title_text:
        metrics["title_hash"] = hashlib.md5(title_text.encode("utf-8")).hexdigest()
    else:
        metrics["title_hash"] = ""

    # 13. Canonicals
    canonicals = soup.find_all("link", rel="canonical")
    c_href = canonicals[0].get("href", "") if canonicals else ""
    canon_data = {
        "Contains Canonical": len(canonicals) > 0,
        "Self Referencing": c_href == url,
        "Canonicalised": c_href != "" and c_href != url,
        "Missing": len(canonicals) == 0,
        "Multiple": len(canonicals) > 1,
        "Multiple Conflicting": len(set([c.get("href") for c in canonicals])) > 1,
        "Non-Indexable Canonical": False, 
        "Canonical Is Relative": c_href != "" and not c_href.startswith("http"),
        "Unlinked": False,
        "Invalid Attribute In Annotation": False,
        "Contains Fragment URL": "#" in c_href,
        "Outside <head>": any(c.find_parent("head") is None for c in canonicals)
    }

    # 15. Directives
    robots_meta = soup.find_all("meta", attrs={"name": re.compile(r"^robots$", re.I)})
    directives_data = {
        "Index": True, "NoIndex": False, "Follow": True, "Nofollow": False,
        "None": False, "NoArchive": False, "NoSnippet": False, "Max-Snippet": False,
        "Max-Image-Preview": False, "Max-Video-Preview": False, "NoODP": False,
        "NoYDIR": False, "NoImageIndex": False, "NoTranslate": False,
        "Unavailable_After": False, "Refresh": False,
        "Outside <head>": any(r.find_parent("head") is None for r in robots_meta)
    }
    for r in robots_meta:
        content = (r.get("content") or "").lower()
        if "noindex" in content: directives_data["NoIndex"] = True; directives_data["Index"] = False
        if "nofollow" in content: directives_data["Nofollow"] = True; directives_data["Follow"] = False
        if "none" in content: directives_data["None"] = True; directives_data["NoIndex"] = True; directives_data["Nofollow"] = True
        if "noarchive" in content: directives_data["NoArchive"] = True
        if "nosnippet" in content: directives_data["NoSnippet"] = True
        if "noimageindex" in content: directives_data["NoImageIndex"] = True
        if "notranslate" in content: directives_data["NoTranslate"] = True

    # 30. Validation
    validation_data = {
        "Invalid HTML Elements in <head>": False, 
        "<body> Element Preceding <html>": False,
        "<head> Not First In <html> Element": False,
        "Missing <head> Tag": soup.find("head") is None,
        "Multiple <head> Tags": len(soup.find_all("head")) > 1,
        "Missing <body> Tag": soup.find("body") is None,
        "Multiple <body> Tags": len(soup.find_all("body")) > 1,
        "HTML Document Over 2MB": len(html_content) > 2000000,
        "Resource Over 2MB": False,
        "High Carbon Rating": False
    }
    
    # 17. JavaScript
    js_data = {
        "Pages with Blocked Resources": False,
        "Contains JavaScript Links": False,
        "Contains JavaScript Content": False,
        "NoIndex Only in Original HTML": False,
        "Nofollow Only in Original HTML": False,
        "Canonical Only in Rendered HTML": False,
        "Canonical Mismatch": False,
        "Page Title Only in Rendered HTML": False,
        "Page Title Updated by JavaScript": False,
        "Meta Description Only in Rendered HTML": False,
        "Meta Description Updated by JavaScript": False,
        "H1 Only in Rendered HTML": False,
        "H1 Updated by JavaScript": False,
        "Uses Old AJAX Crawling Scheme URLs": "#!" in url,
        "Uses Old AJAX Crawling Scheme Meta Fragment Tag": bool(soup.find("meta", attrs={"name": "fragment"})),
        "Pages with JavaScript Errors": False,
        "Pages with JavaScript Warnings": False,
        "Pages with Chrome Issues": False
    }

    metrics["audit_data"] = {
        "Internal": {},
        "External": {},
        "Security": {
            "HTTP URLs": url.startswith("http://"),
            "HTTPS URLs": url.startswith("https://")
        },
        "Response_Codes": {},
        "URI": uri_data,
        "Page_Titles": title_data,
        "Meta_Description": desc_data,
        "Meta_Keywords": kw_data,
        "H1": h1_data,
        "H2": h2_data,
        "Content": content_data,
        "Images": {}, 
        "Canonicals": canon_data,
        "Pagination": {},
        "Directives": directives_data,
        "Hreflang": {},
        "JavaScript": js_data,
        "Links": {},
        "AMP": {},
        "Structured_Data": {},
        "Sitemaps": {},
        "PageSpeed": {},
        "Mobile": {},
        "Accessibility": {},
        "Validation": validation_data,
        "Link_Metrics": {},
        "AI": {},
        "Analytics": {},
        "Search_Console": {},
        "Google_Analytics": {},
        "AEO_Audit": {},
        "GEO_Audit": {}
    }

    return metrics

def extract_links_and_images(html_content: str, base_url: str) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    soup = BeautifulSoup(html_content, "html.parser")
    links = []
    images = []
    
    base_domain = urlparse(base_url).netloc
    if base_domain.startswith("www."): base_domain = base_domain[4:]
    
    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        if href.startswith(("javascript:", "mailto:", "tel:")): continue
            
        full_url = urljoin(base_url, href)
        full_url = full_url.split("#")[0]
        
        dest_domain = urlparse(full_url).netloc
        if dest_domain.startswith("www."): dest_domain = dest_domain[4:]
        is_internal = (dest_domain == base_domain)
        is_nofollow = "nofollow" in a.get("rel", [])
        
        links.append({
            "destination_url": full_url,
            "anchor_text": a.get_text(strip=True)[:500],
            "is_follow": not is_nofollow,
            "link_type": "A",
            "is_internal": is_internal
        })
        
    for img in soup.find_all("img", src=True):
        src = img["src"].strip()
        full_url = urljoin(base_url, src)
        alt_text = img.get("alt")
        
        images.append({
            "url": full_url,
            "alt_text": alt_text or "",
            "Missing_Alt_Text": alt_text == "",
            "Missing_Alt_Attribute": alt_text is None,
            "Alt_Text_Over_100_Characters": len(alt_text) > 100 if alt_text else False,
            "Missing_Size_Attributes": not img.get("width") or not img.get("height"),
            "size_bytes": 0 
        })
        
    return links, images
