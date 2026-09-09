from bs4 import BeautifulSoup
from app.features.audits.scrapers.seo_scraper import parse_seo_tags, extract_image_alts, extract_schema, remove_hidden_elements
from app.features.audits.scrapers.aeo_scraper import analyze_readability

def run_fast_audit(url: str, html: str):
    """
    Runs a blazing fast, CPU-only audit on a single page using pre-fetched HTML.
    Skips Lighthouse, JS Rendering, and external APIs.
    """
    if not html:
        return {"url": url, "status": "failed", "error": "No HTML provided"}
        
    seo_tags = parse_seo_tags(html)
    images = extract_image_alts(html)
    schema = extract_schema(html, url)
    
    # Fast AEO checks
    soup = BeautifulSoup(html, "lxml")
    remove_hidden_elements(soup)
    
    # Remove script, style, and hidden elements to get clean text
    for invisible in soup(['script', 'style', 'noscript', 'header', 'footer', 'nav']):
        invisible.decompose()
        
    text = soup.get_text(separator=' ', strip=True)
    readability = analyze_readability(text)
    
    return {
        "url": url,
        "status": "success",
        "seo": {
            "on_page": seo_tags,
            "media": images,
            "schema_count": len(schema)
        },
        "aeo": {
            "readability": readability
        }
    }
