import textstat
from app.services.technology import detect_technology
from bs4 import BeautifulSoup
import hashlib
import json
from typing import Dict, Any, List, Optional, Tuple
from urllib.parse import urljoin, urlparse, parse_qs, parse_qsl, urlencode
import re
import html

# Arial advance widths (units per 1000 em) for printable ASCII, from the standard font metrics.
_ARIAL_WIDTHS = dict(zip(
    " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~",
    [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
     556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
     1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
     667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
     333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
     556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584],
))
TITLE_FONT_PX = 20  # Google desktop result title
DESCRIPTION_FONT_PX = 14  # Google desktop result snippet


def calculate_pixel_width(text: str, font_px: int = TITLE_FONT_PX) -> int:
    """Rendered width in Arial at font_px, the way SERP truncation is measured."""
    if not text:
        return 0
    units = 0
    for char in text:
        if char in _ARIAL_WIDTHS:
            units += _ARIAL_WIDTHS[char]
        elif ord(char) >= 0x2E80:  # CJK and other full-width scripts
            units += 1000
        else:
            units += 556
    return int(round(units * font_px / 1000))


def element_text(el) -> str:
    """Visible text of an element with whitespace collapsed.

    get_text(strip=True) glues words split across lines or <br> ("Services<br>for" -> "Servicesfor"),
    while inline markup inside a word must stay joined, so line breaks become spaces and runs collapse.
    """
    if el is None:
        return ""
    for br in el.find_all("br"):
        br.replace_with(" ")
    return " ".join(html.unescape(el.get_text()).split())

def get_word_count(text: str) -> int:
    return len(text.split())

def flesch_reading_ease(text: str) -> float:
    """Flesch Reading Ease using real per-word syllable counts (textstat)."""
    if not text or not text.strip():
        return 100.0
    return max(0.0, min(100.0, float(textstat.flesch_reading_ease(text))))

def normalize_url_for_canonical(u: str) -> str:
    if not u:
        return ""
    try:
        clean = u.split("#")[0].strip()
        parsed = urlparse(clean)
        scheme = (parsed.scheme or "https").lower()
        netloc = parsed.netloc.lower()
        if netloc.endswith(":80") and scheme == "http":
            netloc = netloc[:-3]
        elif netloc.endswith(":443") and scheme == "https":
            netloc = netloc[:-4]
        path = parsed.path or "/"
        path = re.sub(r'/{2,}', '/', path)
        if len(path) > 1 and path.endswith("/"):
            path = path[:-1]
        query = f"?{parsed.query}" if parsed.query else ""
        return f"{scheme}://{netloc}{path}{query}"
    except Exception:
        return u.strip().rstrip("/")


_VALID_HEAD_TAGS = frozenset({"title", "meta", "link", "script", "style", "base", "noscript", "template"})
_HEAD_OPEN_RE = re.compile(r"<head(?=[\s/>])[^>]*>", re.I)
_HEAD_CLOSE_RE = re.compile(r"</head\s*>", re.I)
_TAG_TOKEN_RE = re.compile(r"<(/?)([a-zA-Z][a-zA-Z0-9:-]*)(?=[\s/>])", re.I)


def has_premature_head_closure(raw_html: str) -> bool:
    """Detect non-head elements (e.g. <div>, <img>, <iframe>) placed inside raw <head> markup.
    Browsers and Googlebot implicitly close <head> on the first invalid element, causing any
    subsequent <title>, <meta name='robots'>, or <link rel='canonical'> to be ignored."""
    if not raw_html:
        return False
    # Strip comments, scripts, and styles so literal strings like '<div>' inside JS don't trigger false positives.
    masked = re.sub(r"<!--.*?-->", "", raw_html, flags=re.S)
    masked = re.sub(r"<(script|style|template)(?=[\s/>])[^>]*>.*?</\1\s*>", "", masked, flags=re.S | re.I)
    m_open = _HEAD_OPEN_RE.search(masked)
    if not m_open:
        return False
    m_close = _HEAD_CLOSE_RE.search(masked, m_open.end())
    if not m_close:
        return False
    head_inner = masked[m_open.end():m_close.start()]
    for m in _TAG_TOKEN_RE.finditer(head_inner):
        closing, tag = m.group(1), m.group(2).lower()
        if not closing and tag not in _VALID_HEAD_TAGS:
            return True
    return False


def extract_structured_data(soup) -> Dict[str, Any]:
    """JSON-LD types (including @graph members), invalid blocks, and microdata/RDFa presence, plus the facts GEO
    readiness reads from JSON-LD: publish/modify dates, an author, and Organization sameAs profile links."""
    types: List[str] = []
    blocks = invalid = 0
    facts = {"published": None, "modified": None, "author": False, "org_same_as": 0,
             "sku": None, "price": None, "group": None}
    org_types = ("Organization", "Corporation", "LocalBusiness", "NewsMediaOrganization", "OnlineBusiness", "Person")

    def collect(node):
        if isinstance(node, list):
            for n in node:
                collect(n)
        elif isinstance(node, dict):
            t = node.get("@type")
            names = [n.split("/")[-1] for n in (t if isinstance(t, list) else [t]) if isinstance(n, str) and n]
            types.extend(names)
            for key, slot in (("datePublished", "published"), ("dateModified", "modified")):
                if isinstance(node.get(key), str) and not facts[slot]:
                    facts[slot] = node[key][:40]
            if node.get("author"):
                facts["author"] = True
            # Product identity, used to tell variants of one product apart from duplicate pages.
            for key in ("sku", "gtin", "gtin13", "gtin12", "gtin8", "mpn"):
                if isinstance(node.get(key), (str, int)) and not facts["sku"]:
                    facts["sku"] = str(node[key])[:64]
            for key in ("productGroupID", "inProductGroupWithID"):
                if isinstance(node.get(key), (str, int)) and not facts["group"]:
                    facts["group"] = str(node[key])[:64]
            offers = node.get("offers")
            for offer in (offers if isinstance(offers, list) else [offers]):
                if isinstance(offer, dict) and offer.get("price") is not None and facts["price"] is None:
                    facts["price"] = str(offer["price"])[:32]
                if isinstance(offer, dict):
                    collect(offer)
            if any(n in org_types or n.endswith("Business") for n in names):
                same_as = node.get("sameAs")
                count = len(same_as) if isinstance(same_as, list) else (1 if isinstance(same_as, str) and same_as else 0)
                facts["org_same_as"] = max(facts["org_same_as"], count)
            if "@graph" in node:
                collect(node["@graph"])

    for tag in soup.find_all("script", attrs={"type": re.compile(r"application/ld\+json", re.I)}):
        blocks += 1
        raw = (tag.string or tag.get_text() or "").strip()
        try:
            collect(json.loads(raw))
        except (ValueError, TypeError):
            invalid += 1

    microdata = sorted({(el.get("itemtype") or "").rstrip("/").split("/")[-1]
                        for el in soup.find_all(attrs={"itemtype": True})} - {""})
    rdfa = bool(soup.find(attrs={"typeof": True}))
    all_types = sorted(set(types) | set(microdata))
    return {
        "Schema_Types": all_types,
        "Schema Present": bool(all_types),
        "Schema Count": len(all_types),
        "JSON_LD_Blocks": blocks,
        "Invalid JSON-LD": invalid > 0,
        "Microdata Present": bool(microdata),
        "RDFa Present": rdfa,
        "Missing Structured Data": not all_types,
        "Date_Published": facts["published"],
        "Date_Modified": facts["modified"],
        "Author_Present": facts["author"],
        "Org_SameAs_Count": facts["org_same_as"],
        "Product_SKU": facts["sku"],
        "Product_Price": facts["price"],
        "Product_Group_ID": facts["group"],
    }

def _header(headers: Dict[str, str], name: str) -> str:
    for k, v in (headers or {}).items():
        if str(k).lower() == name:
            return str(v)
    return ""


def _canonical_from_link_header(headers: Dict[str, str]) -> str:
    """Canonical URL from an HTTP `Link: <url>; rel="canonical"` header, or ""."""
    for part in re.split(r",(?=\s*<)", _header(headers, "link")):
        m = re.match(r"\s*<([^>]*)>\s*;(.*)$", part)
        if m and re.search(r"rel\s*=\s*\"?[^\";]*\bcanonical\b", m.group(2), re.I):
            return m.group(1).strip()
    return ""


def _refresh_redirect(soup, headers: Dict[str, str], url: str):
    """(absolute target, "Meta Refresh" | "HTTP Refresh") when the page redirects by refresh, else (None, None)."""
    def target(value: str):
        m = re.search(r"url\s*=\s*['\"]?([^'\";]+)", value or "", re.I)
        return urljoin(url, m.group(1).strip()) if m and m.group(1).strip() else None

    for meta in soup.find_all("meta", attrs={"http-equiv": re.compile(r"^refresh$", re.I)}):
        found = target(meta.get("content") or "")
        if found:
            return found, "Meta Refresh"
    found = target(_header(headers, "refresh"))
    if found:
        return found, "HTTP Refresh"
    return None, None


# ---------------------------------------------------------------- page type and pagination

_PAGE_PARAMS = ("page", "p", "paged", "pg", "pagenumber")
_LISTING_WORDS = {"blog", "blogs", "news", "articles", "posts", "category", "categories", "shop",
                  "collections", "catalogue", "catalog", "archive", "archives", "tag", "tags", "author", "page",
                  "product-category", "insights", "resources"}
_PRICE_TEXT = re.compile(r"(?:[$£€₹¥]|\b(?:rs\.?|inr|usd|eur|gbp)\s?)\s?\d[\d,]*(?:\.\d{1,2})?", re.I)
_CART_TEXT = re.compile(r"add\s+to\s+(?:cart|basket|bag|trolley)|buy\s+(?:it\s+)?now|add\s+to\s+order", re.I)
_PRODUCT_TABLE_KEYS = ("upc", "sku", "product type", "availability", "isbn", "mpn")
_PRODUCT_SCHEMA = {"Product", "ProductGroup", "Offer", "AggregateOffer", "IndividualProduct", "Vehicle"}
_LISTING_SCHEMA = {"CollectionPage", "ItemList", "OfferCatalog", "ProductCollection"}
_DOCS_ROOTS = {"docs", "doc", "documentation", "learn", "reference", "guide", "guides", "manual", "handbook",
               "api", "kb", "knowledge-base", "help", "support", "tutorials", "tutorial"}
_INFO_ROOTS = {"about", "about-us", "contact", "contact-us", "pricing", "plans", "privacy", "privacy-policy", "terms",
               "terms-of-service", "legal", "careers", "jobs", "team", "company", "enterprise", "education", "faq",
               "services", "service", "features", "partners", "press", "download", "downloads", "showcase", "hosting"}
_ARTICLE_SCHEMA = {"BlogPosting", "Article", "NewsArticle", "TechArticle", "ScholarlyArticle", "LiveBlogPosting"}
_PAGE_SEG = r"/page[/_-](\d{1,4})(?:\.\w+|/)?$"
_PAGE_FILE = r"/page[-_]?(\d{1,4})(?:\.\w+)?$"


def pagination_number(url: str):
    """Page number encoded in a URL (/page/N/, page-N.html, ?page=N, /blogs/N/), or None."""
    parsed = urlparse(url or "")
    path = parsed.path or "/"
    for key, vals in parse_qs(parsed.query).items():
        if key.lower() in _PAGE_PARAMS and vals and vals[0].isdigit():
            return int(vals[0])
    m = re.search(_PAGE_SEG, path, re.I) or re.search(_PAGE_FILE, path, re.I)
    if m:
        return int(m.group(1))
    m = re.search(r"^(.*)/(\d{1,4})/?$", path)
    if m:
        segs = [s.lower() for s in m.group(1).split("/") if s]
        # A bare /N/ counts only under a listing path (/blogs/2/, /category/shoes/3/), never /2024/ or /products/123.
        if segs and (segs[-1] in _LISTING_WORDS or any(s in _LISTING_WORDS for s in segs[:-1])) and len(segs) <= 4:
            return int(m.group(2))
    return None


def pagination_base(url: str) -> str:
    """URL with the page number removed, as a comparable key (the first page of the series)."""
    parsed = urlparse(url or "")
    path = parsed.path or "/"
    qs = [(k, v) for k, v in parse_qsl(parsed.query) if k.lower() not in _PAGE_PARAMS]
    if pagination_number(url) is not None:
        path = re.sub(_PAGE_SEG, "/", path, flags=re.I)
        path = re.sub(_PAGE_FILE, "/", path, flags=re.I)
        path = re.sub(r"/\d{1,4}/?$", "/", path)
    path = re.sub(r"/index\.(?:html?|php|aspx?)$", "/", path, flags=re.I)
    host = parsed.netloc.lower().removeprefix("www.")
    return f"{host}{path.rstrip('/').lower()}" + (("?" + urlencode(qs)) if qs else "")


def detect_pagination(url: str, soup, canonical: str) -> Dict[str, Any]:
    """Pagination facts for one page. `canonical` is the effective canonical URL ("" if none)."""
    number = pagination_number(url)
    has_prev = soup.find("link", attrs={"rel": re.compile(r"\bprev(ious)?\b", re.I)}) is not None
    has_next = soup.find("link", attrs={"rel": re.compile(r"\bnext\b", re.I)}) is not None
    paginated_page = bool((number and number > 1) or has_prev)
    canon_first = False
    if paginated_page and canonical:
        abs_canon = urljoin(url, canonical)
        canon_number = pagination_number(abs_canon)
        if (normalize_url_for_canonical(abs_canon) != normalize_url_for_canonical(url)
                and (canon_number is None or canon_number <= 1)
                and pagination_base(abs_canon) == pagination_base(url)):
            canon_first = True
    page_number = number if number is not None else (1 if has_next and not has_prev else None)
    return {
        "Paginated": bool(paginated_page or number or has_next),
        "Page Number": page_number,
        "Has Rel Prev": has_prev,
        "Has Rel Next": has_next,
        "Canonicalised To First Page": canon_first,
        "Duplicate Title From Pagination": False,  # set by the post-processor once all titles are known
    }


def _commerce_signals(soup) -> Dict[str, Any]:
    price_nodes = soup.find_all(class_=re.compile(r"price", re.I)) + soup.find_all(attrs={"itemprop": "price"})
    price_nodes = [n for n in price_nodes if _PRICE_TEXT.search(n.get_text(" ")) or n.get("content")]
    cart = any(_CART_TEXT.search(b.get_text(" ") or b.get("value") or "") for b in soup.find_all(["button", "input", "a"]))
    table = any(any(k in (th.get_text(" ") or "").strip().lower() for k in _PRODUCT_TABLE_KEYS)
                for th in soup.select("table th"))
    return {"prices": len(price_nodes), "cart": cart, "table": table}


def classify_page_type(url: str, soup, schema_types, pagination: Dict[str, Any]) -> Dict[str, Any]:
    """Best-effort page type with the signals that decided it (a heuristic, labelled as such in the UI)."""
    parsed = urlparse(url or "")
    path = re.sub(r"/index\.(?:html?|php|aspx?)$", "/", (parsed.path or "/").lower())
    segs = [s for s in path.split("/") if s]
    types = set(schema_types or [])
    signals: List[str] = []

    def done(kind: str):
        return {"Type": kind, "Signals": signals[:6]}

    page_no = pagination.get("Page Number")
    if (page_no and page_no > 1) or pagination.get("Has Rel Prev"):
        signals.append(f"Page number {page_no} in URL" if page_no else "rel=prev link present")
        return done("Pagination")
    if not segs and not parsed.query:
        signals.append("Root path /")
        return done("Home")

    cat_path = (any(s in ("category", "categories", "product-category", "c") for s in segs)
                or path.rstrip("/").endswith("/shop")
                or ("/collections/" in path and "/products/" not in path)
                or path.rstrip("/") in ("/collections", "/shop"))
    prod_path = any(s in ("product", "products", "p", "item", "items") for s in segs[:-1])
    if "/collections/" in path and "/products/" in path:
        prod_path = True
    if cat_path and prod_path and "/collections/" not in path:
        prod_path = False

    strong_product = types & (_PRODUCT_SCHEMA - {"Offer", "AggregateOffer"})
    if strong_product and not (cat_path and not prod_path):
        signals.append("Product/Offer structured data")
        return done("Product")
    if prod_path:
        signals.append("Product URL pattern")
        return done("Product")
    if cat_path:
        signals.append("Category URL pattern")
        if types & _LISTING_SCHEMA:
            signals.append("Collection/ItemList structured data")
        return done("Category")
    if types & _LISTING_SCHEMA:
        signals.append("Collection/ItemList structured data")
        return done("Category")

    commerce = _commerce_signals(soup)
    # A product details table (UPC, SKU, price excl./incl. tax...) marks a product page even though such
    # tables repeat the price several times; only without one do many prices mean a listing.
    if commerce["prices"] and commerce["table"]:
        signals.append("Price shown")
        signals.append("Product details table")
        return done("Product")
    if commerce["prices"] and commerce["cart"] and commerce["prices"] <= 3:
        signals.append("Price shown")
        signals.append("Add-to-cart button" if commerce["cart"] else "Product details table")
        return done("Product")
    if commerce["prices"] >= 4:
        signals.append(f"{commerce['prices']} prices listed on the page")
        return done("Category")

    first = segs[0] if segs else ""
    if "TechArticle" in types or (first in _DOCS_ROOTS and not types & (_ARTICLE_SCHEMA - {"TechArticle"})):
        signals.append("Documentation structured data" if "TechArticle" in types else f"Documentation path /{first}/")
        return done("Docs")

    og_type = soup.find("meta", attrs={"property": "og:type"})
    is_schema_article = bool(types & (_ARTICLE_SCHEMA - {"TechArticle"}))
    # SEO plugins mark most WordPress pages og:type=article, so it only means a post with a publish date.
    published = soup.find("meta", attrs={"property": "article:published_time"}) is not None
    is_article = is_schema_article or (published and og_type is not None and (og_type.get("content") or "").lower() == "article")
    blog_root = segs[0] if segs else ""
    in_blog = blog_root in ("blog", "blogs", "news", "articles", "insights", "resources", "posts")
    if is_article:
        signals.append("Article/BlogPosting structured data" if is_schema_article else "og:type article")
        return done("Blog Post")
    if any(s in ("author", "authors", "tag", "tags", "archive", "archives") for s in segs[:2]) or re.match(r"^/\d{4}(/\d{1,2}){0,2}/?$", path):
        signals.append("Author, tag or date archive URL")
        return done("Author/Archive")
    if in_blog:
        if len(segs) == 1 or (blog_root == "blogs" and len(segs) == 2 and segs[1] in ("news", "blog", "all")):
            signals.append(f"Listing path /{'/'.join(segs)}/")
            return done("Blog Index")
        signals.append(f"Article under /{blog_root}/")
        return done("Blog Post")
    if re.match(r"^/\d{4}/\d{1,2}/[^/]+", path):
        signals.append("Dated post URL")
        return done("Blog Post")
    if first in _INFO_ROOTS or (len(segs) == 1 and first.endswith(("-service", "-services"))):
        signals.append(f"Information page /{first}/")
        return done("Page")
    signals.append("No page-type signals matched")
    return done("Other")


# ---------------------------------------------------------------- GEO readiness facts
# Facts a reader (or an AI answer) can quote: percentages and figures with a scale ("50,000+ clients", "3 million").
# Prices and discounts ("₹1,299", "15% off") are shop data, not evidence, so they are excluded: a product grid
# would otherwise look like a research page.
STAT_RE = re.compile(
    r"(?<![\w.$€£₹])\d[\d,]*(?:\.\d+)?\s?(?:%|percent\b|per cent\b|million\b|billion\b|thousand\b|times\b|x\b|\+)"
    r"(?!\s*(?:off|discount|cashback)\b)", re.I)
PROMO_BEFORE = re.compile(r"(?:save|flat|upto|up to|extra|get|off|discount|sale)\W{0,3}(?:\w+\W{1,3}){0,1}$", re.I)


def count_statistics(text: str) -> int:
    """Quotable figures, minus promotions: "Save 20%", "Flat 30%" and "Up to 50%" are offers, not evidence."""
    return sum(1 for m in STAT_RE.finditer(text) if not PROMO_BEFORE.search(text[max(0, m.start() - 20):m.start()]))


# Links that are not citations of a source: app stores, shop platforms, payment and maps.
NON_SOURCE_HOSTS = ("apps.apple.com", "itunes.apple.com", "play.google.com", "apps.shopify.com", "shopify.com",
                    "maps.google.com", "goo.gl", "razorpay.com", "paypal.com", "stripe.com", "paytm.com")
# A citation is a text link inside prose, not a badge, button or menu.
PROSE_TAGS = ("p", "li", "td", "blockquote", "figcaption", "cite", "dd")
QUOTE_RE = re.compile(r"[“\"]([^”\"]{40,400})[”\"]")
QUESTION_START = re.compile(r"^(what|how|why|when|where|who|which|can|does|do|is|are|should|will)\b", re.I)
APP_ROOT_IDS = ("root", "app", "__next", "__nuxt", "svelte", "q-app")
# Share buttons and profile links are not citations of a source.
SOCIAL_HOSTS = ("facebook.com", "twitter.com", "x.com", "linkedin.com", "instagram.com", "pinterest.com",
                "whatsapp.com", "t.me", "reddit.com", "tiktok.com", "youtube.com", "wa.me", "threads.net")


def _meta_content(soup, **attrs) -> Optional[str]:
    tag = soup.find("meta", attrs=attrs)
    value = (tag.get("content") or "").strip() if tag else ""
    return value[:40] or None


MAIN_IDS = ("MainContent", "main-content", "maincontent", "main", "content", "primary", "page-content")


def content_region(soup):
    """The page's main content: <main>, role=main, a common main-content container (#MainContent on Shopify,
    #content / #primary on WordPress), a single <article>, else the body. Listing pages carry many <article> tiles
    (one per product or post), and the first tile is not the page's content."""
    region = soup.find("main") or soup.find(attrs={"role": "main"})
    if region is None:
        region = next((el for el in (soup.find(id=i) for i in MAIN_IDS) if el is not None), None)
    if region is None:
        articles = soup.find_all("article")
        region = articles[0] if len(articles) == 1 else None
    return region or soup.body or soup


def geo_facts(soup, base_domain: str, structured: Dict[str, Any], script_count: int,
              noscript_needs_js: bool, nosnippet: bool, inline_script_bytes: int = 0) -> Dict[str, Any]:
    """Per-page signals for GEO readiness (how retrievable and quotable a page is for AI answer engines).
    Call after <script>/<style> are stripped. Scored in app/services/geo_readiness.py."""
    region = content_region(soup)
    text = " ".join(region.get_text(" ").split())
    words = get_word_count(text)

    cited = set()
    for a in region.find_all("a", href=True):
        if a.find_parent(["nav", "header", "footer"]):
            continue
        href = (a.get("href") or "").strip()
        if not href.lower().startswith(("http://", "https://")):
            continue
        host = urlparse(href).netloc.lower()
        host = host[4:] if host.startswith("www.") else host
        if not host or host == base_domain or host.endswith("." + base_domain):
            continue
        if any(host == s or host.endswith("." + s) for s in SOCIAL_HOSTS + NON_SOURCE_HOSTS):
            continue
        if get_word_count(element_text(a)) == 0 or not a.find_parent(PROSE_TAGS):
            continue  # image badges and buttons are not citations
        cited.add(host)

    headings = [element_text(h) for h in region.find_all(["h2", "h3"])]
    first_para = next((element_text(p) for p in region.find_all("p") if get_word_count(element_text(p)) >= 8), "")
    lists = sum(1 for lst in region.find_all(["ul", "ol"])
                if not lst.find_parent(["nav", "header", "footer"]) and len(lst.find_all("li", recursive=False)) >= 3)

    time_tag = soup.find("time", attrs={"datetime": True})
    published = (structured.get("Date_Published") or _meta_content(soup, property="article:published_time")
                 or ((time_tag.get("datetime") or "")[:40] if time_tag else None))
    modified = (structured.get("Date_Modified") or _meta_content(soup, property="article:modified_time")
                or _meta_content(soup, property="og:updated_time"))
    author = bool(structured.get("Author_Present")
                  or soup.find("meta", attrs={"name": re.compile(r"^author$", re.I)})
                  or soup.find("a", rel=lambda r: bool(r) and "author" in r)
                  or soup.find(attrs={"itemprop": "author"})
                  or soup.find(attrs={"class": re.compile(r"\b(author|byline)\b", re.I)}))

    # Content that only exists after JavaScript runs is invisible to AI crawlers that do not render it.
    # Without a rendered copy to compare against, judge it from the served HTML: almost no text, plus an empty app
    # root, a "please enable JavaScript" notice, or a large inline script that builds the content.
    empty_root = any((el := soup.find(id=i)) is not None and get_word_count(element_text(el)) < 20 for i in APP_ROOT_IDS)
    js_shell = words < 50 and script_count > 0 and (empty_root or noscript_needs_js or inline_script_bytes >= 2000)

    return {
        "Words": words,
        "Statistics": count_statistics(text),
        "Quotations": len(region.find_all(["blockquote", "q"])) + len(QUOTE_RE.findall(text)),
        "Cited_Domains": len(cited),
        "Question_Headings": sum(1 for h in headings if h.endswith("?") or QUESTION_START.match(h)),
        "Answer_First": 8 <= get_word_count(first_para) <= 80,
        "Lists": lists,
        "Tables": len(region.find_all("table")),
        "Date_Published": published,
        "Date_Modified": modified,
        "Author": author,
        "Org_SameAs_Count": structured.get("Org_SameAs_Count") or 0,
        "NoSnippet": nosnippet,
        "JS_Dependent": js_shell,
        "JS_Check": "heuristic",  # the JS-rendering crawler replaces this with a raw vs rendered comparison
    }


BOILERPLATE_TAGS = ("nav", "header", "footer", "aside")
# Themes often build menus from <div>s: recognise them by class or id, as Screaming Frog's content-area settings do.
BOILERPLATE_ATTR = re.compile(
    r"(?:^|[\s_-])(?:nav|navbar|navigation|menu|megamenu|header|footer|drawer|breadcrumbs?|sidebar|cookie|"
    r"announcement|newsletter|skip-link)(?:$|[\s_-])", re.I)


def _is_boilerplate(tag) -> bool:
    # A wrapper that holds the page's heading or main/article is the content, whatever its class says
    # (e.g. <div class="layout-sidebar"> around a whole WordPress page).
    if tag.find(["h1", "main", "article"]) is not None:
        return False
    if tag.name in BOILERPLATE_TAGS or tag.get("role") in ("navigation", "banner", "contentinfo"):
        return True
    marker = " ".join(tag.get("class") or []) + " " + (tag.get("id") or "")
    return bool(marker.strip()) and bool(BOILERPLATE_ATTR.search(marker))


def main_content_text(soup) -> str:
    """Text of the page's content area: the main region minus navigation, header, footer, menus and sidebars
    (Screaming Frog's default content area excludes nav and footer). Text is collected from text nodes so the
    soup itself is left untouched for the checks that run afterwards."""
    region = content_region(soup)
    parts = []
    for node in region.find_all(string=True):
        parent, skip = node.parent, False
        while parent is not None and parent is not region:
            if _is_boilerplate(parent):
                skip = True
                break
            parent = parent.parent
        if not skip:
            parts.append(str(node))
    return " ".join(" ".join(parts).split())


def main_content_words(soup) -> int:
    """Words in the content area. A page whose only text is the menu has ~0 here, even though its whole-page word
    count can be several hundred."""
    return get_word_count(main_content_text(soup))


# ---------------------------------------------------------------- duplicate fingerprints
# MinHash over word 5-shingles of the content area (the method Screaming Frog uses for near duplicates). 64 hash
# functions estimate Jaccard similarity to about +/-0.06, enough to separate 97%-identical templates from real pages.
MINHASH_PERMS = 64
_MH_PRIME = (1 << 61) - 1
_MH_COEFFS = [((i * 0x9E3779B97F4A7C15 + 0x632BE59BD9B4E019) % _MH_PRIME or 1,
               (i * 0xC2B2AE3D27D4EB4F + 0x165667B19E3779F9) % _MH_PRIME) for i in range(1, MINHASH_PERMS + 1)]
UNIT_WORDS = r"carats?|cts?|ratti|grams?|g|kg|mg|mm|cm|ml|l|inch(?:es)?|in|oz|lbs?|pcs?|pieces?|pack|size|xs|s|m|l|xl|xxl"


def minhash_signature(text: str, k: int = 5) -> Optional[List[int]]:
    words = re.findall(r"\w+", text.lower())
    if len(words) < k:
        return None
    shingles = {hash_shingle(" ".join(words[i:i + k])) for i in range(len(words) - k + 1)}
    return [min((a * s + b) % _MH_PRIME for s in shingles) & 0xFFFFFFFF for a, b in _MH_COEFFS]


def hash_shingle(shingle: str) -> int:
    return int.from_bytes(hashlib.blake2b(shingle.encode("utf-8"), digest_size=8).digest(), "big")


def product_name_key(name: str) -> str:
    """A product name with numbers and units removed: '8.29 Carats Natural Ruby' and 'Natural Ruby 12.36 Carats'
    both become 'natural ruby', so per-size or per-weight listings can be recognised as variants of one product."""
    s = re.sub(r"\d+(?:[.,]\d+)?", " ", (name or "").lower())
    s = re.sub(rf"\b(?:{UNIT_WORDS})\b", " ", s)
    s = re.sub(r"[^a-zऀ-ॿ ]+", " ", s)
    return " ".join(s.split())


def main_text_words(html_content: str) -> int:
    """Words in the main content region of a raw HTML document (for the raw vs rendered comparison)."""
    soup = _parse_html(html_content)
    for tag in soup(["script", "style", "noscript", "svg"]):
        tag.extract()
    return get_word_count(" ".join(content_region(soup).get_text(" ").split()))


def extract_seo_metrics(html_content: str, url: str, headers: Dict[str, str] = None, soup=None) -> Dict[str, Any]:
    if soup is None:
        soup = _parse_html(html_content)
    metrics: Dict[str, Any] = {}
    parsed_url = urlparse(url)
    base_domain = parsed_url.netloc.lower()
    if base_domain.startswith("www."):
        base_domain = base_domain[4:]
    
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
    titles = [t for t in soup.find_all("title") if t.find_parent("svg") is None]
    title_text = element_text(titles[0]) if titles else ""
    t_len = len(title_text)
    px_width = calculate_pixel_width(title_text, TITLE_FONT_PX)
    
    title_data = {
        "Missing": len(titles) == 0 or not bool(title_text),
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
    metrics["title_1_length"] = t_len
    metrics["title_1_pixel_width"] = px_width

    # 7. Meta Description (supports name="description", property="description", og:description, twitter:description)
    meta_descs = soup.find_all("meta", attrs={"name": re.compile(r"^description$", re.I)})
    if not meta_descs:
        meta_descs = soup.find_all("meta", attrs={"property": re.compile(r"^description$", re.I)})
    
    desc_text = ""
    for m in meta_descs:
        c = (m.get("content") or m.get("value") or "").strip()
        if c:
            desc_text = html.unescape(c)
            break

    desc_text = ' '.join(desc_text.split()) if desc_text else ""
    d_len = len(desc_text)
    d_px_width = calculate_pixel_width(desc_text, DESCRIPTION_FONT_PX)
    
    # A template default such as "- Brand Name" or a copy of the title is a description in name only.
    desc_placeholder = bool(desc_text) and bool(
        re.match(r"^[\s\-–—|:•·]+", desc_text) or desc_text.strip().lower() == title_text.strip().lower())
    desc_data = {
        "Missing": not bool(desc_text),
        "Placeholder or Copy of Title": desc_placeholder,
        "Duplicate": False, 
        "Over 155 Characters": d_len > 155,
        "Below 70 Characters": d_len > 0 and d_len < 70,
        "Over 985 Pixels": d_px_width > 985,
        "Below 400 Pixels": d_px_width > 0 and d_px_width < 400,
        "Multiple": len(meta_descs) > 1,
        "Outside <head>": any(m.find_parent("head") is None for m in meta_descs)
    }
    metrics["meta_desc_1"] = desc_text
    metrics["meta_desc_1_length"] = d_len
    metrics["meta_desc_1_pixel_width"] = d_px_width

    # 8. Meta Keywords
    meta_kws = soup.find_all("meta", attrs={"name": re.compile(r"^keywords$", re.I)})
    kw_text = html.unescape((meta_kws[0].get("content") or meta_kws[0].get("value") or "").strip()) if meta_kws else ""
    kw_data = {
        "Missing": len(meta_kws) == 0 or not bool(kw_text),
        "Duplicate": False, 
        "Multiple": len(meta_kws) > 1
    }
    metrics["meta_keyword_1"] = kw_text
    metrics["meta_keyword_1_length"] = len(kw_text)

    # 9. H1
    h1s = soup.find_all("h1")
    h1_text = element_text(h1s[0]) if h1s else ""
    h1_2_text = element_text(h1s[1]) if len(h1s) > 1 else ""
    
    h1_data = {
        "Missing": len(h1s) == 0 or not bool(h1_text),
        "Duplicate": False, 
        "Over 70 Characters": len(h1_text) > 70,
        "Multiple": len(h1s) > 1,
        "Alt Text in H1": bool(h1s[0].find("img", alt=True)) if h1s else False,
        "Non-Sequential": False
    }
    title_data["Same as H1"] = (title_text == h1_text and len(title_text) > 0)
    metrics["h1_1"] = h1_text
    metrics["h1_1_length"] = len(h1_text)
    metrics["h1_2"] = h1_2_text
    metrics["h1_2_length"] = len(h1_2_text)
    
    # 10. H2
    h2s = soup.find_all("h2")
    h2_text = element_text(h2s[0]) if h2s else ""
    h2_2_text = element_text(h2s[1]) if len(h2s) > 1 else ""
    h2_data = {
        "Missing": len(h2s) == 0 or not bool(h2_text),
        "Duplicate": False, 
        "Over 70 Characters": len(h2_text) > 70,
        "Multiple": len(h2s) > 1,
        "Non-Sequential": False
    }
    if h2s and not h1s:
        h1_data["Non-Sequential"] = True
    metrics["h2_1"] = h2_text
    metrics["h2_1_length"] = len(h2_text)
    metrics["h2_2"] = h2_2_text
    metrics["h2_2_length"] = len(h2_2_text)
        
    # Structured data must be read before <script> tags are stripped below.
    structured_data = extract_structured_data(soup)
    technology = detect_technology(html_content)
    # Heading outline (h1-h3, document order) for AI grounding and heading-structure checks.
    heading_outline = [
        {"level": int(h.name[1]), "text": " ".join(h.get_text(" ").split())[:120]}
        for h in soup.find_all(["h1", "h2", "h3"])[:25]
    ]

    # 11. Content
    # Script sources are captured before scripts are stripped so the mixed-content check still sees them.
    script_srcs = [(t.get("src") or "").strip().lower() for t in soup.find_all("script", src=True)]
    script_count = len(soup.find_all("script"))
    dom_nodes = len(soup.body.find_all(True)) if soup.body else 0  # Lighthouse DOM size counts body elements
    inline_script_bytes = sum(len(t.string or "") for t in soup.find_all("script", src=False)
                              if "json" not in (t.get("type") or "").lower())  # JSON-LD and data blocks are not code
    noscript_needs_js = any("javascript" in n.get_text(" ").lower() for n in soup.find_all("noscript"))
    for script in soup(["script", "style", "noscript", "svg"]):
        script.extract()
    text = soup.get_text(separator=' ')
    clean_text = ' '.join(text.split())
    # Opening copy of the main content region (skips header/nav), used to judge answer-readiness.
    main_region = soup.find("main") or soup.find("article") or soup.find(attrs={"role": "main"})
    intro_source = " ".join(main_region.get_text(" ").split()) if main_region else clean_text
    intro_text = intro_source[:600]
    word_count = get_word_count(clean_text)
    main_text = main_content_text(soup)
    main_words = get_word_count(main_text)
    reading_ease = flesch_reading_ease(clean_text)

    content_data = {
        "Exact Duplicates": False, 
        "Near Duplicates": False, 
        "Semantically Similar": False, 
        "Low Relevance Content": False,
        # Judged on the content area, not the whole page: menus and footers can add hundreds of words.
        # 200 words is Screaming Frog's default; under 50 the page is effectively empty.
        "Low Content Pages": main_words < 200,
        "Empty Main Content": main_words < 50,
        "Main Content Words": main_words,
        # Duplicate fingerprints of the content area (menus and footers excluded), read by the post-processor.
        # Only substantial text is compared: two pages that just say "Login" are not duplicate content.
        "Main_Text_Hash": hashlib.md5(main_text.lower().encode("utf-8")).hexdigest() if main_words >= 30 else None,
        "MinHash": minhash_signature(main_text) if main_words >= 30 else None,
        "Name_Key": product_name_key(h1_text or title_text),
        "Soft 404 Pages": "not found" in title_text.lower() or "404" in title_text,
        "Spelling Errors": False,
        "Grammar Errors": False,
        "Readability Difficult": reading_ease < 50 and reading_ease >= 30,
        "Readability Very Difficult": reading_ease < 30,
        "Lorem Ipsum Placeholder": "lorem ipsum" in clean_text.lower()
    }
    metrics["word_count"] = word_count
    html_bytes = len(html_content.encode("utf-8", errors="ignore"))
    metrics["size_bytes"] = html_bytes
    metrics["text_to_html_ratio"] = (round(len(clean_text.encode("utf-8", errors="ignore")) * 100 / html_bytes, 1)
                                     if html_bytes else None)
    metrics["content_hash"] = hashlib.md5(clean_text.encode("utf-8")).hexdigest()
    if title_text:
        metrics["title_hash"] = hashlib.md5(title_text.encode("utf-8")).hexdigest()
    else:
        metrics["title_hash"] = ""

    # 13. Canonicals
    canonicals = soup.find_all("link", attrs={"rel": re.compile(r"^canonical$", re.I)})
    raw_canonical = (canonicals[0].get("href", "") or "").strip() if canonicals else ""
    header_canonical = _canonical_from_link_header(headers)
    # Google accepts a canonical from either place; the HTML one is used when both exist.
    c_href = raw_canonical or header_canonical
    if c_href and not c_href.startswith(("http://", "https://", "//")):
        c_href = urljoin(url, c_href)
    elif c_href.startswith("//"):
        c_href = ("https:" if url.startswith("https:") else "http:") + c_href

    norm_url = normalize_url_for_canonical(url)
    norm_canon = normalize_url_for_canonical(c_href) if c_href else ""

    is_self_canon = bool(c_href and norm_canon == norm_url)
    is_canonicalised = bool(c_href and norm_canon != norm_url)

    has_any_canonical = bool(canonicals) or bool(header_canonical)
    canonical_targets = {normalize_url_for_canonical(urljoin(url, (c.get("href") or "").strip())) for c in canonicals}
    if header_canonical:
        canonical_targets.add(normalize_url_for_canonical(urljoin(url, header_canonical)))
    canon_data = {
        "Contains Canonical": has_any_canonical,
        "Self Referencing": is_self_canon,
        "Canonicalised": is_canonicalised,
        "Missing": not has_any_canonical,
        "Multiple": len(canonicals) + (1 if header_canonical else 0) > 1,
        "Multiple Conflicting": len(canonical_targets) > 1,
        "Canonical In HTTP Header": bool(header_canonical),
        "Non-Indexable Canonical": False,
        "Canonical Is Relative": bool(raw_canonical) and not raw_canonical.lower().startswith(("http://", "https://")),
        "Unlinked": False,
        "Invalid Attribute In Annotation": False,
        "Contains Fragment URL": "#" in c_href,
        "Outside <head>": any(c.find_parent("head") is None for c in canonicals)
    }
    metrics["canonical_link_element_1"] = c_href

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
        if "nosnippet" in content or "max-snippet:0" in content.replace(" ", ""): directives_data["NoSnippet"] = True
        if "noimageindex" in content: directives_data["NoImageIndex"] = True
        if "notranslate" in content: directives_data["NoTranslate"] = True

    # X-Robots-Tag HTTP header carries the same directives as meta robots (Google honours both).
    x_robots = ""
    for hk, hv in (headers or {}).items():
        if str(hk).lower() == "x-robots-tag":
            # Directives scoped to another bot ("otherbot: noindex") do not apply to the generic crawl.
            scoped = str(hv).split(":", 1)
            if len(scoped) == 2 and scoped[0].strip().lower() not in ("googlebot", "all") and " " not in scoped[0].strip():
                continue
            x_robots += f"{hv},"
    x_robots = x_robots.lower()
    if x_robots:
        if "noindex" in x_robots or "none" in x_robots:
            directives_data["NoIndex"] = True; directives_data["Index"] = False
        if "nofollow" in x_robots or "none" in x_robots:
            directives_data["Nofollow"] = True; directives_data["Follow"] = False
        if "nosnippet" in x_robots or "max-snippet:0" in x_robots.replace(" ", ""):
            directives_data["NoSnippet"] = True
    directives_data["X-Robots-Tag"] = x_robots.rstrip(",") or None
    metrics["x_robots_tag_1"] = x_robots.rstrip(",") or None

    refresh_target, refresh_type = _refresh_redirect(soup, headers, url)
    directives_data["Refresh"] = bool(refresh_target)
    metrics["refresh_redirect_url"] = refresh_target

    metrics["meta_robots_1"] = ", ".join([r.get("content", "") for r in robots_meta if r.get("content")])
    metrics["dir_index"] = directives_data["Index"]
    metrics["dir_noindex"] = directives_data["NoIndex"]
    metrics["dir_follow"] = directives_data["Follow"]
    metrics["dir_nofollow"] = directives_data["Nofollow"]
    metrics["dir_noarchive"] = directives_data["NoArchive"]
    metrics["dir_nosnippet"] = directives_data["NoSnippet"]

    # Screaming Frog Standard: Determine Page Indexability & Non-Indexable Reason
    has_noindex = directives_data["NoIndex"] or directives_data["None"]
    if refresh_target:
        page_indexability = "Non-Indexable"
        page_indexability_reason = f"Redirect ({refresh_type})"
    elif has_noindex:
        page_indexability = "Non-Indexable"
        page_indexability_reason = "Noindex"
    elif is_canonicalised:
        page_indexability = "Non-Indexable"
        page_indexability_reason = "Canonicalised"
    else:
        page_indexability = "Indexable"
        page_indexability_reason = "Indexable"

    metrics["indexability"] = page_indexability
    metrics["indexability_status"] = page_indexability_reason

    # 30. Validation
    premature_head = has_premature_head_closure(html_content)
    html_tag = soup.find("html")
    html_lang = (html_tag.get("lang") or "").strip() if html_tag else ""
    has_viewport = soup.find("meta", attrs={"name": re.compile(r"^viewport$", re.I)}) is not None
    has_og = soup.find("meta", attrs={"property": re.compile(r"^og:", re.I)}) is not None
    has_twitter = soup.find("meta", attrs={"name": re.compile(r"^twitter:", re.I)}) is not None
    validation_data = {
        "Invalid HTML Elements in <head>": premature_head,
        "Premature <head> Closure": premature_head,
        "Missing Viewport Meta Tag": not has_viewport,
        "Missing HTML Lang Attribute": not bool(html_lang),
        "Missing OpenGraph Tags": not has_og,
        "Missing Twitter Card Tags": not has_twitter,
        "<body> Element Preceding <html>": False,
        "<head> Not First In <html> Element": False,
        "Missing <head> Tag": soup.find("head") is None,
        "Multiple <head> Tags": len(soup.find_all("head")) > 1,
        "Missing <body> Tag": soup.find("body") is None,
        "Multiple <body> Tags": len(soup.find_all("body")) > 1,
        # Googlebot fetches only the first 2 MB of an HTML file (developers.google.com/search/docs/crawling-indexing/googlebot).
        "HTML Document Over 2MB": len(html_content.encode("utf-8", errors="ignore")) > 2 * 1024 * 1024,
        "HTML Over 500KB": len(html_content.encode("utf-8", errors="ignore")) > 500 * 1024,
        # Lighthouse warns above ~800 body elements and errors above ~1,400.
        "DOM Over 1,400 Elements": dom_nodes > 1400,
        "DOM Elements": dom_nodes,
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

    # 3. Security (Screaming Frog Security Suite)
    headers_lower = {str(k).lower(): str(v) for k, v in (headers or {}).items()}
    is_https = url.startswith("https://")

    # Mixed Content: On HTTPS, resources loaded via insecure HTTP
    has_mixed_content = False
    has_protocol_relative = False
    if is_https:
        res_tags = soup.find_all(['img', 'iframe', 'audio', 'video', 'source'], src=True)
        for s in [(t.get("src") or "").strip().lower() for t in res_tags] + script_srcs:
            if s.startswith("http://"):
                has_mixed_content = True
            elif s.startswith("//"):
                has_protocol_relative = True
        # Only <link> elements that load a resource count (canonical/alternate/dns-prefetch do not).
        loading_rels = {"stylesheet", "preload", "modulepreload", "icon", "shortcut", "apple-touch-icon", "manifest", "prefetch"}
        link_tags = [t for t in soup.find_all('link', href=True)
                     if loading_rels & {r.lower() for r in (t.get("rel") or [])}]
        for t in link_tags:
            h = (t.get("href") or "").strip().lower()
            if h.startswith("http://"):
                has_mixed_content = True
            elif h.startswith("//"):
                has_protocol_relative = True

    # Unsafe Cross-Origin Links (target="_blank" without rel="noopener" or rel="noreferrer")
    has_unsafe_blank = False
    for a in soup.find_all("a", target="_blank", href=True):
        href = a.get("href", "").strip().lower()
        if href.startswith(("http://", "https://")):
            dest_host = urlparse(href).netloc.lower()
            if dest_host.startswith("www."):
                dest_host = dest_host[4:]
            if dest_host and dest_host != base_domain:
                rel = [r.lower() for r in a.get("rel", [])]
                if not ("noopener" in rel or "noreferrer" in rel):
                    has_unsafe_blank = True
                    break

    # Security Headers Inspection
    hsts_val = headers_lower.get("strict-transport-security", "")
    csp_val = headers_lower.get("content-security-policy", "")
    csp_meta = soup.find("meta", attrs={"http-equiv": re.compile(r"^content-security-policy$", re.I)})
    csp_all = f"{csp_val} {(csp_meta.get('content') or '') if csp_meta else ''}".lower()
    mixed_upgraded = has_mixed_content and "upgrade-insecure-requests" in csp_all
    xcto_val = headers_lower.get("x-content-type-options", "").lower()
    xfo_val = headers_lower.get("x-frame-options", "").lower()
    ref_val = headers_lower.get("referrer-policy", "").lower()
    ref_meta = soup.find("meta", attrs={"name": re.compile(r"^referrer$", re.I)})
    ref_content = (ref_meta.get("content", "") if ref_meta else "").strip().lower()
    effective_ref = ref_val or ref_content

    missing_hsts = is_https and (not bool(hsts_val)) if headers is not None else None  # headers not captured: not evaluated
    missing_csp = (not bool(csp_val or csp_meta)) if headers is not None else None  # headers not captured: not evaluated
    missing_xcto = ("nosniff" not in xcto_val) if headers is not None else None  # headers not captured: not evaluated
    missing_xfo = (not bool(xfo_val or ("frame-ancestors" in (csp_val or "").lower()))) if headers is not None else None  # headers not captured: not evaluated
    missing_ref = ((not bool(effective_ref)) or (effective_ref in ("unsafe-url", "no-referrer-when-downgrade"))) if headers is not None else None  # headers not captured: not evaluated

    security_data = {
        "HTTP URLs": url.startswith("http://"),
        "HTTPS URLs": is_https,
        "Mixed Content": has_mixed_content and not mixed_upgraded,
        "Insecure References Upgraded by CSP": mixed_upgraded,
        "Missing HSTS Header": missing_hsts,
        "Missing Content-Security-Policy Header": missing_csp,
        "Missing X-Content-Type-Options Header": missing_xcto,
        "Missing X-Frame-Options Header": missing_xfo,
        "Missing Secure Referrer-Policy Header": missing_ref,
        "Unsafe Cross-Origin Links": has_unsafe_blank,
        "Protocol-Relative Resource Links": has_protocol_relative
    }

    pagination_data = detect_pagination(url, soup, c_href)
    page_type_data = classify_page_type(url, soup, structured_data.get("Schema_Types"), pagination_data)

    metrics["audit_data"] = {
        "Internal": {},
        "Indexability": {
            "Indexable": page_indexability == "Indexable",
            "Non-Indexable Reason": page_indexability_reason if page_indexability != "Indexable" else ""
        },
        "External": {},
        "Security": security_data,
        "Response_Codes": {
            "Redirection (Meta Refresh)": True,
            "Redirect URL": refresh_target,
            "Redirect Type": refresh_type,
        } if refresh_target else {},
        "URI": uri_data,
        "Page_Titles": title_data,
        "Meta_Description": desc_data,
        "Meta_Keywords": kw_data,
        "H1": h1_data,
        "H2": h2_data,
        "Content": content_data,
        "Images": {}, 
        "Canonicals": canon_data,
        "Pagination": pagination_data,
        "Page_Type": page_type_data,
        "Directives": directives_data,
        "Hreflang": {},
        "JavaScript": js_data,
        "Links": {},
        "AMP": {},
        "Structured_Data": structured_data,
        "Technology": technology,
        "Content_Outline": {"Headings": heading_outline, "Intro_Text": intro_text},
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
        "GEO_Audit": {},
        "GEO": geo_facts(soup, base_domain, structured_data, script_count, noscript_needs_js,
                         directives_data["NoSnippet"], inline_script_bytes),
    }

    return metrics

# Mega-menus, footers and store category pages routinely carry several hundred links; a low cap silently
# drops pages from the crawl. The crawler reports pages that hit this limit.
MAX_LINKS_PER_PAGE = 5000
MAX_IMAGES_PER_PAGE = 150


def extract_links_and_images(html_content: str, base_url: str, soup=None) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    if soup is None:
        soup = BeautifulSoup(html_content, "html.parser")
    links = []
    images = []
    seen_links = set()
    seen_images = set()
    
    base_domain = urlparse(base_url).netloc.lower()
    if base_domain.startswith("www."): base_domain = base_domain[4:]
    
    ignored_schemes = ("javascript:", "mailto:", "tel:", "whatsapp:", "sms:", "callto:", "viber:", "data:", "skype:", "market:")
    

    for a in soup.find_all("a", href=True):
        if len(links) >= MAX_LINKS_PER_PAGE:
            break
        href = (a.get("href") or "").strip()
        if not href or href == "#" or href.lower().startswith(ignored_schemes):
            continue
            
        try:
            full_url = urljoin(base_url, href)
            full_url = full_url.split("#")[0].strip()
            
            parsed = urlparse(full_url)
            if parsed.scheme not in ("http", "https") or not parsed.netloc:
                continue
                
            dest_domain = parsed.netloc.lower()
            if dest_domain.startswith("www."): dest_domain = dest_domain[4:]
            is_internal = (dest_domain == base_domain)
            is_nofollow = "nofollow" in a.get("rel", [])
            anchor = a.get_text(strip=True)[:500] or None
            
            # Deduplicate identical outlinks from the same page
            link_dedup_key = (full_url, anchor or "", not is_nofollow, "A")
            if link_dedup_key in seen_links:
                continue
            seen_links.add(link_dedup_key)

            links.append({
                "destination_url": full_url,
                "anchor_text": anchor,
                "is_follow": not is_nofollow,
                "link_type": "A",
                "is_internal": is_internal
            })
        except Exception:
            continue
        
    for img in soup.find_all("img", src=True):
        if len(images) >= MAX_IMAGES_PER_PAGE:
            break
        src = (img.get("src") or "").strip()
        if not src or src.startswith("data:"):
            continue
        try:
            full_url = urljoin(base_url, src)
            
            # Deduplicate identical image URLs on the same page
            if full_url in seen_images:
                continue
            seen_images.add(full_url)

            raw_alt = img.get("alt")
            clean_alt = raw_alt.strip() if raw_alt else None
            
            images.append({
                "url": full_url,
                "alt_text": clean_alt,
                "Missing_Alt_Text": clean_alt is None or clean_alt == "",
                "Missing_Alt_Attribute": raw_alt is None,
                "Alt_Text_Over_100_Characters": len(clean_alt) > 100 if clean_alt else False,
                "Missing_Size_Attributes": not img.get("width") or not img.get("height"),
                "size_bytes": None  # Stored as NULL instead of misleading 0
            })
        except Exception:
            continue
        
    return links, images


def _parse_html(html_content: str):
    try:
        return BeautifulSoup(html_content, "lxml")
    except Exception:
        return BeautifulSoup(html_content, "html.parser")


def extract_page(html_content: str, url: str, headers: Dict[str, str] = None):
    """Parse once: links/images are read first because the SEO pass strips script/style/svg nodes.
    CPU-bound; callers run it in a worker thread so the event loop stays responsive."""
    soup = _parse_html(html_content)
    links, images = extract_links_and_images(html_content, url, soup=soup)
    metrics = extract_seo_metrics(html_content, url, headers=headers, soup=soup)
    return metrics, links, images
