"""
Single source of truth for audit scores.

Method (scoring version 2026.12): one published methodology, followed as written.
  * Issue classification follows Screaming Frog SEO Spider's Issues tab: every check is an Issue, a Warning or an
    Opportunity, with a High / Medium / Low priority (https://www.screamingfrog.co.uk/seo-spider/issues/).
    Checks Screaming Frog does not have use the closest equivalent and are marked as our classification.
  * An *error* is an Issue of High or Medium priority. Warnings, Opportunities and Low-priority Issues are listed
    with the share of URLs affected but never move the score.
  * Site Health is the Ahrefs Health Score: the share of crawled internal URLs with zero errors, rounded, with the
    Ahrefs bands (Weak 0-30, Fair 31-70, Good 71-90, Excellent 91-100)
    (https://help.ahrefs.com/en/articles/1424673-what-is-health-score-and-how-is-it-calculated-in-ahrefs-site-audit).
    It is linear: 10% of URLs with an error means 90.
  * Our extensions, stated in the explanation whenever they apply:
      - Site-wide errors that belong to no single URL (an invalid robots.txt, for example) cap the score at 70.
      - Failing Core Web Vitals on real users is an error on the measured page (Google uses Core Web Vitals in
        ranking; Screaming Frog has no Core Web Vitals issue).
      - A single-page audit has no site score (one URL can only score 0 or 100): it gets a page check instead.
        A whole-site crawl needs 10 URLs for a score, which is labelled provisional below 30.
  * not_evaluated never counts as a pass. Pages whose fetch failed for reasons that are not the site's fault are
    left out of every count.
  * AEO (an AI provider's review) and GEO readiness are separate scores, both scaled by AI access (robots.txt blocks
    on the AI search bots, noindex / nosnippet, content that needs JavaScript).
  * Integration data (Search Console, GA4) never feeds Site Health; each integration has its own panel.
"""
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional
from app.services.fetch_outcome import is_uncounted

SCORING_VERSION = "2026.12-1"
BANDS = [(91, "Excellent"), (71, "Good"), (31, "Fair"), (0, "Weak")]  # Ahrefs Health Score bands
MIN_URLS_FOR_SCORE = 10        # fewer crawled URLs: no site score (our threshold; no vendor publishes one)
PROVISIONAL_BELOW = 30         # 10-29 URLs: the score is shown as provisional
SITE_ERROR_CAP = 70            # an open site-wide error caps Site Health at 70 (our extension)
MIN_URLS_FOR_CONFIDENCE = PROVISIONAL_BELOW
FAILING_ID_CAP = 2000
WEIGHTS = {"critical": 5, "warning": 3, "notice": 1}  # display order of the Issues list only

CATEGORY_GROUPS = {
    "Indexability": ("Response_Codes", "Canonicals", "Directives", "Sitemaps", "Pagination"),
    "On-page": ("Page_Titles", "Meta_Description", "H1", "H2", "Images"),
    "Content": ("Content",),
    "Links": ("Links",),
    "Security": ("Security",),
    "Structured data": ("Structured_Data",),
    "Technical": ("Validation", "JavaScript", "PageSpeed"),
}
INTEGRATION_CATEGORIES = {"Search_Console", "PageSpeed", "Google_Analytics"}
CWV_RULE = "PageSpeed: Core Web Vitals Failing (Real Users)"


@dataclass(frozen=True)
class Rule:
    category: str
    name: str
    type: str       # Screaming Frog type: "Issue" | "Warning" | "Opportunity"
    priority: str   # "High" | "Medium" | "Low"
    scope: str      # "page" (local to one URL) or "site" (needs the whole crawl)
    applies: str    # "html200" | "internal" | "dedupe" | "integration"
    evaluate: Optional[Callable[[dict, dict], Optional[bool]]] = None  # (page, audit_data) -> fail?
    # Name of a site-level condition (see _site_conditions) that raises this rule to `escalated_to`.
    escalate_when: Optional[str] = None
    escalated_to: Optional[tuple] = None  # (type, priority)
    ours: bool = False  # classification is ours: Screaming Frog has no equivalent check

    @property
    def id(self) -> str:
        return f"{self.category.replace('_', ' ')}: {self.name}"


def is_error(type_: str, priority: str) -> bool:
    return type_ == "Issue" and priority in ("High", "Medium")


def severity_of(type_: str, priority: str) -> str:
    """Display severity for the Issues list: errors are critical, other Issues and Warnings are warnings."""
    if is_error(type_, priority):
        return "critical"
    return "notice" if type_ == "Opportunity" else "warning"


def _flag(category: str, key: str):
    def ev(_page: dict, ad: dict) -> Optional[bool]:
        value = (ad.get(category) or {}).get(key)
        return value if isinstance(value, bool) else None
    return ev


def _status_range(lo: int, hi: int):
    return lambda page, _ad: lo <= (page.get("status_code") or 0) < hi


def _num(v) -> Optional[float]:
    try:
        return float(str(v).replace(",", "").replace("%", "").replace("ms", "").replace("s", "").strip())
    except (TypeError, ValueError):
        return None


def gsc_index_state(gsc: dict) -> str:
    """Mirror of frontend/src/utils/gscStatus.js."""
    if not gsc or not gsc.get("Is_Live_GSC"):
        return "unknown"
    verdict = str(gsc.get("Google_Index_Status") or "").upper()
    coverage = str(gsc.get("Index_Coverage_State") or "").lower()
    if verdict == "FAIL" or "not indexed" in coverage or "excluded" in coverage:
        return "not_indexed"
    if verdict in ("PASS", "INDEXED") or " indexed" in f" {coverage}":
        return "indexed"
    return "unknown"


def _gsc_rule(fn):
    def ev(_page, ad):
        gsc = ad.get("Search_Console") or {}
        return fn(gsc) if gsc.get("Is_Live_GSC") else None
    return ev


def cwv_verdict(field: dict) -> dict:
    """Core Web Vitals assessment from field (CrUX) p75 values, the way Google does it: judged on the metrics
    that have data. Each *_good is True/False, or None when there is no data for that metric. `passed` is None
    (no verdict) without LCP, False if any measured metric is over its threshold, otherwise True."""
    lcp, inp, cls = field.get("lcp_p75_ms"), field.get("inp_p75_ms"), field.get("cls_p75")
    good = {
        "lcp_good": None if lcp is None else lcp <= 2500,
        "inp_good": None if inp is None else inp <= 200,
        "cls_good": None if cls is None else cls <= 0.1,
    }
    measured = [v for v in good.values() if v is not None]
    passed = None if good["lcp_good"] is None else all(measured)
    return {**good, "passed": passed}


def _cwv_failing(_page, ad) -> Optional[bool]:
    """Real-user (field) Core Web Vitals only: lab scores are diagnostics, not what Google ranks on."""
    field = (((ad.get("PageSpeed") or {}).get("mobile") or {}).get("field_data") or {})
    if not field.get("available"):
        return None
    verdict = cwv_verdict(field)["passed"]
    return None if verdict is None else not verdict


def _page_type(ad: dict) -> str:
    return (ad.get("Page_Type") or {}).get("Type") or ""


def _product_schema_missing(_page, ad) -> Optional[bool]:
    """Product pages only; judged on the page's own structured data."""
    if _page_type(ad) != "Product":
        return None
    types = set((ad.get("Structured_Data") or {}).get("Schema_Types") or [])
    return not (types & {"Product", "ProductGroup", "Offer", "AggregateOffer", "IndividualProduct"})


def _title_dup_not_pagination(_page, ad) -> Optional[bool]:
    """Duplicate title, except where pagination explains it (that has its own rule)."""
    value = (ad.get("Page_Titles") or {}).get("Duplicate")
    if not isinstance(value, bool):
        return None
    return value and not (ad.get("Pagination") or {}).get("Duplicate Title From Pagination")


def _r(category: str, name: str, type_: str, priority: str, *, scope: str = "page", applies: str = "html200",
       ev=None, key: Optional[str] = None, **kw) -> Rule:
    return Rule(category, name, type_, priority, scope, applies, ev or _flag(category, key or name), **kw)


I, W, O = "Issue", "Warning", "Opportunity"
H, M, L = "High", "Medium", "Low"
SECURITY_HEADERS = ("Missing HSTS Header", "Missing Content-Security-Policy Header", "Missing X-Content-Type-Options Header",
                    "Missing X-Frame-Options Header", "Missing Secure Referrer-Policy Header")

# Type and priority as listed in Screaming Frog's Issues tab; `ours=True` where Screaming Frog has no such check.
RULES: List[Rule] = [
    # ---- Response codes (every internal URL)
    _r("Response_Codes", "Client Error (4xx)", I, H, applies="internal", ev=_status_range(400, 500)),
    _r("Response_Codes", "Server Error (5xx)", I, H, applies="internal", ev=_status_range(500, 600)),
    _r("Response_Codes", "Blocked or Failed (No Response)", I, H, applies="internal",
       ev=lambda p, _ad: (p.get("status_code") or 0) == 0),
    _r("Response_Codes", "Redirection (3xx)", W, L, applies="internal", ev=_status_range(300, 400)),
    _r("Response_Codes", "Redirect Chain (2+ Hops)", W, M, applies="internal"),
    _r("Response_Codes", "Temporary Redirect (302/307)", W, L, applies="internal"),
    _r("Response_Codes", "Redirection (Meta Refresh)", W, M),
    # ---- Page titles, meta descriptions, headings, images
    _r("Page_Titles", "Missing", I, H),
    _r("Page_Titles", "Multiple", I, H),
    _r("Page_Titles", "Outside <head>", I, H),
    _r("Page_Titles", "Over 60 Characters", O, M),
    _r("Page_Titles", "Below 30 Characters", O, M),
    _r("Page_Titles", "Same as H1", O, L),
    _r("Meta_Description", "Missing", O, L),
    _r("Meta_Description", "Multiple", I, M),
    _r("Meta_Description", "Outside <head>", I, M),
    _r("Meta_Description", "Over 155 Characters", O, L),
    _r("Meta_Description", "Below 70 Characters", O, L),
    _r("Meta_Description", "Placeholder or Copy of Title", O, L, ours=True),
    _r("H1", "Missing", I, M),
    _r("H1", "Multiple", W, M),
    _r("H1", "Over 70 Characters", O, L),
    _r("H1", "Non-Sequential", W, L),
    _r("H1", "Alt Text in H1", O, L),
    _r("H2", "Missing", W, L),
    _r("H2", "Over 70 Characters", O, L),
    _r("Images", "Missing Alt Attribute", I, L),
    _r("Images", "Missing Alt Text", I, L),
    _r("Images", "Alt Text Over 100 Characters", O, L),
    _r("Images", "Missing Size Attributes", O, L),
    # ---- Content
    _r("Content", "Soft 404 Pages", W, H),
    _r("Content", "Low Content Pages", O, M),
    # Nothing but a heading inside the menu and footer (judged on the content area).
    _r("Content", "Empty Main Content", W, H, ours=True),
    _r("Content", "Lorem Ipsum Placeholder", W, H),
    _r("Content", "Readability Difficult", O, L),
    _r("Content", "Readability Very Difficult", O, L),
    # ---- Canonicals, directives, pagination
    _r("Canonicals", "Multiple Conflicting", I, H),
    _r("Canonicals", "Multiple", W, M),
    _r("Canonicals", "Outside <head>", I, H),
    # Missing canonicals matter more once the crawl shows duplicate titles or content (see _site_conditions).
    _r("Canonicals", "Missing", W, L, escalate_when="has_duplicates", escalated_to=(W, M)),
    _r("Canonicals", "Canonical Is Relative", O, L),
    _r("Canonicals", "Unlinked", W, L),
    _r("Directives", "Outside <head>", W, M),
    # Noindex is often intentional: a Warning to check, never an error.
    _r("Directives", "Noindex", W, H, key="NoIndex"),
    _r("Pagination", "Paginated Page Canonicalised To First Page", W, M, key="Canonicalised To First Page"),
    _r("Pagination", "Duplicate Title From Pagination", O, L),
    # ---- Structured data, validation, JavaScript
    _r("Structured_Data", "Product Pages Missing Product Schema", W, M, ev=_product_schema_missing, ours=True),
    _r("Structured_Data", "Invalid JSON-LD", I, M),
    _r("Structured_Data", "Missing Structured Data", O, L),
    *[_r("Validation", n, I, M) for n in ("Missing <head> Tag", "Multiple <head> Tags", "Missing <body> Tag",
                                           "Multiple <body> Tags")],
    _r("Validation", "HTML Document Over 2MB", I, H),
    _r("Validation", "HTML Over 500KB", O, M, ours=True),            # SF PageSpeed: enormous payloads, Medium
    _r("Validation", "DOM Over 1,400 Elements", O, L, ours=True),     # SF PageSpeed: optimise DOM size, Low
    _r("JavaScript", "Uses Old AJAX Crawling Scheme URLs", W, L),
    # ---- Security
    _r("Security", "HTTP URLs", I, H),
    _r("Security", "Mixed Content", I, H),
    _r("Security", "Unsafe Cross-Origin Links", W, L),
    *[_r("Security", n, W, L) for n in SECURITY_HEADERS],
    _r("Security", "Protocol-Relative Resource Links", W, L),
    # ---- Site-scope checks (need the whole crawl)
    _r("Page_Titles", "Duplicate", O, M, scope="site", applies="dedupe", ev=_title_dup_not_pagination),
    _r("Meta_Description", "Duplicate", O, L, scope="site", applies="dedupe"),
    _r("H1", "Duplicate", O, L, scope="site", applies="dedupe"),
    _r("Content", "Exact Duplicates", I, H, scope="site", applies="dedupe"),
    _r("Content", "Near Duplicates", W, M, scope="site", applies="dedupe"),
    # Classified duplicates (app/services/duplicates.py): templated pages with little of their own text, and variants
    # of one product (different weights or sizes) that are fine as separate pages.
    _r("Content", "Thin Templated Pages", W, M, scope="site", applies="dedupe", ours=True),
    _r("Content", "Product Variants", O, L, scope="site", applies="dedupe", ours=True),
    _r("Canonicals", "Non-Indexable Canonical", I, H, scope="site"),
    _r("Links", "Internal Links To Broken Pages", I, H, scope="site"),
    _r("Links", "Non-Indexable Page Inlinks Only", W, H, scope="site"),
    _r("Links", "Internal Links To Redirects", W, L, scope="site"),
    _r("Links", "Pages With High Crawl Depth", O, M, scope="site"),
    _r("Links", "Pages With High Internal Outlinks", W, L, scope="site"),
    _r("Sitemaps", "Non-Indexable URLs in Sitemap", I, M, scope="site"),
    _r("Sitemaps", "URLs Not In Sitemap", I, M, scope="site"),
    # ---- Core Web Vitals on real users: an error on the measured page (our classification)
    _r("PageSpeed", "Core Web Vitals Failing (Real Users)", I, H, applies="integration", ev=_cwv_failing, ours=True),
    # ---- Search Console / GA4 findings: listed, never part of Site Health
    _r("Search_Console", "Excluded from Google Index", I, H, applies="integration",
       ev=_gsc_rule(lambda g: gsc_index_state(g) == "not_indexed" if gsc_index_state(g) != "unknown" else None)),
    _r("Search_Console", "Canonical Mismatch (Google Chose Different Canonical)", W, M, applies="integration",
       ev=_gsc_rule(lambda g: g.get("Canonical_Mismatch") if g.get("Google_Selected_Canonical") else None)),
    _r("Search_Console", "High Impressions with Low CTR (< 1.5%)", O, L, applies="integration",
       ev=_gsc_rule(lambda g: (g.get("CTR_Num") or 0) < 1.5 if (g.get("Impressions_Num") or 0) >= 100 else None)),
    _r("Search_Console", "Striking Distance Opportunity (Position 11–20)", O, L, applies="integration",
       ev=_gsc_rule(lambda g: 10.5 <= g["Position_Num"] <= 20.4 if isinstance(g.get("Position_Num"), (int, float)) else None)),
    _r("Google_Analytics", "Critical Revenue Risk (Broken High-Traffic Page)", I, H, applies="integration",
       ev=lambda p, ad: bool(str((ad.get("Google_Analytics") or {}).get("Revenue_At_Risk") or "").startswith("High"))
       if (ad.get("Google_Analytics") or {}).get("Sessions_Num") is not None else None),
]


def counts_toward_health(rule: Rule) -> bool:
    """Crawl checks and real-user Core Web Vitals count; Search Console and GA4 findings are listed only."""
    return rule.category not in INTEGRATION_CATEGORIES or rule.id == CWV_RULE


def uncounted_kind(audit_data: Optional[dict]) -> Optional[str]:
    """"ours" / "blocked" / "unknown" for a page whose fetch problem is not the site's fault, else None."""
    if not is_uncounted(audit_data):
        return None
    fetch = (audit_data or {}).get("Fetch") or {}
    if fetch.get("outcome") == "blocked":
        return "blocked"
    if fetch.get("side") == "ours" or fetch.get("outcome") == "crawler_error":
        return "ours"
    return "unknown"


def not_counted_detail(counts: Dict[str, int]) -> str:
    parts = []
    if counts.get("ours"):
        parts.append(f"{counts['ours']} page{'s' if counts['ours'] != 1 else ''} could not be checked because of a problem on our side")
    if counts.get("blocked"):
        parts.append(f"{counts['blocked']} page{'s were' if counts['blocked'] != 1 else ' was'} blocked by the site's bot protection or rate limits")
    if counts.get("unknown"):
        parts.append(f"{counts['unknown']} page{'s' if counts['unknown'] != 1 else ''} could not be reached on any attempt, so nothing can be said about them")
    return "; ".join(parts) + "; not counted in the score."


def _is_external(page: dict, ad: dict) -> bool:
    # The extractor creates an empty "External" bucket on every page; only external link-check rows fill it.
    return page.get("indexability_status") == "External" or bool(ad.get("External"))


def _is_html_200(page: dict) -> bool:
    return page.get("status_code") == 200 and "html" in str(page.get("content_type") or "text/html").lower()


def _is_dedupe_eligible(page: dict, ad: dict) -> bool:
    if not _is_html_200(page):
        return False
    indexable = (ad.get("Indexability") or {}).get("Indexable")
    canonicalised = (ad.get("Canonicals") or {}).get("Canonicalised") is True
    return indexable is not False and str(page.get("indexability")) not in ("Non-Indexable", "IndexabilityStatus.NON_INDEXABLE") and not canonicalised


def _site_conditions(internal: List[dict], site_mode: bool) -> Dict[str, bool]:
    """Whole-crawl facts that can raise a rule's classification."""
    def dup(p):
        ad = p.get("audit_data") or {}
        return bool(_is_dedupe_eligible(p, ad) and (
            (ad.get("Page_Titles") or {}).get("Duplicate") is True
            or (ad.get("Content") or {}).get("Exact Duplicates") is True))
    return {"has_duplicates": site_mode and any(dup(p) for p in internal)}


def effective_class(rule: Rule, conditions: Dict[str, bool]) -> tuple:
    if rule.escalate_when and conditions.get(rule.escalate_when) and rule.escalated_to:
        return rule.escalated_to
    return rule.type, rule.priority


def evaluate_rule(rule: Rule, page: dict) -> Optional[bool]:
    """True = fail, False = pass, None = not evaluated for this URL."""
    ad = page.get("audit_data") or {}
    if rule.applies == "html200" and not _is_html_200(page):
        return None
    if rule.applies == "dedupe" and not _is_dedupe_eligible(page, ad):
        return None
    return rule.evaluate(page, ad)


def _band(score: Optional[int]) -> Optional[str]:
    if score is None:
        return None
    return next(label for floor, label in BANDS if score >= floor)


def _apportion(total: int, weights: List[float]) -> List[int]:
    """Split an integer into whole parts proportional to weights (largest remainder), summing exactly to total."""
    s = sum(weights)
    if total <= 0 or s <= 0:
        return [0] * len(weights)
    raw = [total * w / s for w in weights]
    parts = [int(r) for r in raw]
    for i in sorted(range(len(weights)), key=lambda i: raw[i] - parts[i], reverse=True)[: total - sum(parts)]:
        parts[i] += 1
    return parts


def _apply_ai_access_to_aeo(integrations: Dict[str, Any], geo: Dict[str, Any]) -> None:
    """The AEO score is an AI provider's review of how quotable the content is. Content that answer engines are not
    allowed to fetch or quote cannot be used, so the review is scaled by the same access gates as GEO readiness."""
    ar = integrations.get("answer_readiness") or {}
    if ar.get("status") != "ok" or geo.get("status") != "ok":
        return
    multiplier = geo.get("access_multiplier", 1.0)
    failing = [g for g in geo.get("components") or [] if g.get("kind") == "gate" and g.get("multiplier", 1) < 1]
    ar["ai_review_score"] = ar["score"]
    ar["access_multiplier"] = multiplier
    ar["score"] = round(ar["score"] * multiplier)
    ar["access_note"] = " ".join(g["detail"] for g in failing) or None


def _explain(score_before_cap: int, url_errors: Dict[Any, List[str]], n_urls: int, by_id: Dict[str, Rule]) -> List[Dict[str, Any]]:
    """Why Site Health is below 100: the points lost (100 - score) split across error checks by the URLs they fail.
    A URL failing two checks shares its weight between them, so the rows sum exactly to the score - 100."""
    weight: Dict[str, float] = {}
    urls: Dict[str, int] = {}
    for rule_ids in url_errors.values():
        for rid in rule_ids:
            weight[rid] = weight.get(rid, 0.0) + 1 / len(rule_ids)
            urls[rid] = urls.get(rid, 0) + 1
    ids = sorted(weight, key=lambda r: -weight[r])
    rows = []
    for rid, pts in zip(ids, _apportion(100 - score_before_cap, [weight[r] for r in ids])):
        rule = by_id[rid]
        rows.append({"label": rid, "impact": -pts,
                     "detail": f"{urls[rid]} of {n_urls} URLs ({urls[rid] / n_urls:.0%}). "
                               f"{rule.type}, {rule.priority.lower()} priority{' (our classification)' if rule.ours else ''}: "
                               "each URL with an error counts against the score."})
    return [r for r in rows if r["impact"]] + [r for r in rows if not r["impact"]]


def compute_scores(pages: List[dict], mode: str = "site", integration_data: Optional[dict] = None,
                   site_facts: Optional[dict] = None) -> Dict[str, Any]:
    """pages: dicts with id, url, status_code, content_type, indexability, indexability_status, audit_data.
    site_facts: crawl-level facts: {"ai_crawlers": ..., "site_issues": [{"id", "label", "type", "priority",
    "detail"}]} (issues that belong to the whole site rather than one URL, e.g. an invalid robots.txt)."""
    from app.services.geo_readiness import compute_geo_readiness
    site_mode = mode != "page"
    site_facts = site_facts or {}
    internal_all = [p for p in pages if not _is_external(p, p.get("audit_data") or {})]
    not_counted = {"ours": 0, "unknown": 0, "blocked": 0}
    internal = []
    for p in internal_all:
        kind = uncounted_kind(p.get("audit_data"))
        if kind:
            not_counted[kind] += 1
        else:
            internal.append(p)
    active_rules = [r for r in RULES if site_mode or r.scope == "page"]
    by_id = {r.id: r for r in RULES}
    conditions = _site_conditions(internal, site_mode)
    cls_of = {r.id: effective_class(r, conditions) for r in RULES}
    err_of = {rid: is_error(*c) and counts_toward_health(by_id[rid]) for rid, c in cls_of.items()}

    per_rule = {r.id: {"failing": [], "evaluated": 0} for r in active_rules}
    url_errors: Dict[Any, List[str]] = {}
    page_checks: Dict[str, Dict[str, int]] = {}
    for page in internal:
        pid = page.get("id")
        url_errors[pid] = []
        tally = {"errors": 0, "warnings": 0, "opportunities": 0}
        for rule in active_rules:
            result = evaluate_rule(rule, page)
            if result is None:
                continue
            per_rule[rule.id]["evaluated"] += 1
            if not result:
                continue
            per_rule[rule.id]["failing"].append(pid)
            t, pr = cls_of[rule.id]
            if err_of[rule.id]:
                url_errors[pid].append(rule.id)
                tally["errors"] += 1
            elif t == "Opportunity":
                tally["opportunities"] += 1
            else:
                tally["warnings"] += 1
        page_checks[str(pid)] = tally

    n_urls = len(internal)
    failing_urls = {pid: ids for pid, ids in url_errors.items() if ids}
    site_issues = [i for i in site_facts.get("site_issues") or [] if isinstance(i, dict)]
    site_errors = [i for i in site_issues if is_error(i.get("type", ""), i.get("priority", ""))]

    # ---- Site Health (whole-site crawls with enough URLs)
    score = base = None
    reason = None
    explanation: List[Dict[str, Any]] = []
    if not site_mode:
        reason = "Single-page audit: one URL can only score 0 or 100, so it gets a page check instead. Run a whole-site audit for Site Health."
    elif n_urls < MIN_URLS_FOR_SCORE:
        reason = f"Only {n_urls} URL{'s' if n_urls != 1 else ''} could be checked; Site Health needs at least {MIN_URLS_FOR_SCORE}."
    else:
        base = round(100 * (n_urls - len(failing_urls)) / n_urls)
        score = base
        explanation = _explain(base, failing_urls, n_urls, by_id)
        if site_errors and score > SITE_ERROR_CAP:
            explanation.insert(0, {"label": "Site-wide error: score capped at 70", "impact": SITE_ERROR_CAP - score,
                                   "detail": "; ".join(f"{i.get('label')}: {i.get('detail')}" for i in site_errors)
                                             + f" This affects the whole site, so Site Health is capped at {SITE_ERROR_CAP} until fixed."})
            score = SITE_ERROR_CAP
    if any(not_counted.values()):
        explanation.append({"label": "Pages not counted", "impact": 0, "detail": not_counted_detail(not_counted)})

    # ---- Per-check results
    rules_out = []
    for rule in RULES:
        t, pr = cls_of[rule.id]
        common = {"id": rule.id, "category": rule.category, "rule": rule.name, "scope": rule.scope,
                  "type": t, "priority": pr, "severity": severity_of(t, pr), "is_error": err_of[rule.id],
                  "escalated": (t, pr) != (rule.type, rule.priority), "ours": rule.ours,
                  "integration": not counts_toward_health(rule)}
        if rule.id not in per_rule:
            rules_out.append({**common, "status": "not_evaluated", "reason": "site_only", "failing_count": 0,
                              "evaluated_count": 0, "failing_page_ids": []})
            continue
        stats = per_rule[rule.id]
        status = "not_evaluated" if stats["evaluated"] == 0 else ("fail" if stats["failing"] else "pass")
        rules_out.append({**common, "status": status, "reason": None if stats["evaluated"] else "no_data",
                          "failing_count": len(stats["failing"]), "evaluated_count": stats["evaluated"],
                          "failing_page_ids": stats["failing"][:FAILING_ID_CAP]})

    def failing_of(kind: str) -> List[dict]:
        out = []
        for r in rules_out:
            if r["status"] != "fail" or r["integration"]:
                continue
            k = "errors" if r["is_error"] else ("opportunities" if r["type"] == "Opportunity" else "warnings")
            if k == kind:
                out.append(r)
        return out

    def site_kind(i: dict) -> str:
        if is_error(i.get("type", ""), i.get("priority", "")):
            return "errors"
        return "opportunities" if i.get("type") == "Opportunity" else "warnings"

    issues = {k: {"checks": len(failing_of(k)) + sum(1 for i in site_issues if site_kind(i) == k),
                  "urls": len({pid for r in failing_of(k) for pid in r["failing_page_ids"]})}
              for k in ("errors", "warnings", "opportunities")}
    issues["site"] = site_issues

    def category_score(cats) -> Dict[str, Any]:
        """Diagnostic breakdown: share of the URLs these checks evaluated that have no error from them."""
        rules = [r for r in active_rules if r.category in cats and per_rule[r.id]["evaluated"]]
        evaluated_urls, error_urls = set(), set()
        for page in internal:
            pid = page.get("id")
            if any(evaluate_rule(r, page) is not None for r in rules if err_of[r.id]):
                evaluated_urls.add(pid)
        for r in rules:
            if err_of[r.id]:
                error_urls.update(per_rule[r.id]["failing"])
        cat_score = round(100 * (1 - len(error_urls) / len(evaluated_urls))) if evaluated_urls else None
        return {"score": cat_score, "band": _band(cat_score), "urls_evaluated": len(evaluated_urls),
                "urls_with_errors": len(error_urls),
                "checks_failed": sum(1 for r in rules if per_rule[r.id]["failing"]), "checks_evaluated": len(rules)}

    geo = compute_geo_readiness(internal, site_mode, site_facts.get("ai_crawlers"))
    integrations_out = integration_scores(internal, integration_data or {})
    _apply_ai_access_to_aeo(integrations_out, geo)
    page_check = None
    if not site_mode and internal:
        only = page_checks.get(str(internal[0].get("id"))) or {}
        page_check = {**only, "error_checks": url_errors.get(internal[0].get("id")) or [],
                      "passed": not url_errors.get(internal[0].get("id")) and not site_errors,
                      "site_issues": site_issues}  # robots.txt and similar apply to this page too

    return {
        "scoring_version": SCORING_VERSION,
        "method": "Ahrefs Health Score (share of URLs with zero errors) with Screaming Frog issue classification",
        "not_counted": not_counted,
        "mode": "site" if site_mode else "page",
        "urls_evaluated": n_urls,
        "site_health": {
            "score": score,
            "base_score": base,  # before the site-wide error cap
            "band": _band(score),
            "reason": reason,  # why there is no score, when there is none
            "provisional": score is not None and n_urls < PROVISIONAL_BELOW,
            "url_pass_rate": base,
            "urls_total": n_urls,
            "urls_with_errors": len(failing_urls),
            "urls_with_critical_errors": len(failing_urls),
            "urls_evaluated_for_critical": n_urls,
            "urls_with": {"critical": issues["errors"]["urls"], "warning": issues["warnings"]["urls"],
                          "notice": issues["opportunities"]["urls"]},
            "site_errors": site_errors,
            "capped": bool(score is not None and base is not None and score < base),
            "checks_evaluated": sum(1 for r in active_rules if per_rule[r.id]["evaluated"] and counts_toward_health(r)),
            "checks_total": sum(1 for r in active_rules if counts_toward_health(r)),
            "low_confidence": site_mode and n_urls < PROVISIONAL_BELOW,
        },
        "page_check": page_check,
        "issues": issues,
        "categories": {group: category_score(cats) for group, cats in CATEGORY_GROUPS.items()},
        "page_checks": page_checks,
        "rules": rules_out,
        "integrations": integrations_out,
        "score_explanation": explanation,
        "geo_readiness": geo,
    }


# ---------------------------------------------------------------- integration scores

# Organic CTR by position used as a benchmark assumption (desktop, AWR-style curve); configurable.
CTR_CURVE = {1: 0.276, 2: 0.158, 3: 0.110, 4: 0.084, 5: 0.063, 6: 0.049, 7: 0.039, 8: 0.033, 9: 0.027, 10: 0.024}


def _expected_ctr(position: float) -> float:
    p = max(1, round(position))
    return CTR_CURVE.get(p, 0.010 if p <= 20 else 0.004)


def integration_scores(pages: List[dict], integration_data: dict) -> Dict[str, Any]:
    out: Dict[str, Any] = {}

    # PageSpeed / Core Web Vitals: field verdict (Google thresholds) and lab score kept separate.
    ps_pages = [(p.get("audit_data") or {}).get("PageSpeed") for p in pages]
    ps_pages = [ps for ps in ps_pages if isinstance(ps, dict) and (ps.get("mobile") or ps.get("desktop"))]
    if ps_pages:
        lab_mobile = [ps["mobile"]["performance_score"] for ps in ps_pages
                      if ps.get("mobile") and isinstance(ps["mobile"].get("performance_score"), int)]
        lab_desktop = [ps["desktop"]["performance_score"] for ps in ps_pages
                       if ps.get("desktop") and isinstance(ps["desktop"].get("performance_score"), int)]
        field = next(((ps.get("mobile") or {}).get("field_data") for ps in ps_pages
                      if ((ps.get("mobile") or {}).get("field_data") or {}).get("available")), None)
        cwv = None
        if field:
            # *_good: True/False, or None when that metric has no field data; passed None = no verdict (no LCP).
            cwv = {
                "scope": field.get("scope"),
                "lcp_ms": field.get("lcp_p75_ms"), "inp_ms": field.get("inp_p75_ms"), "cls": field.get("cls_p75"),
                **cwv_verdict(field),
            }
        out["pagespeed"] = {
            "status": "ok",
            "measured_pages": len(ps_pages),
            "lab_score_mobile": round(sum(lab_mobile) / len(lab_mobile)) if lab_mobile else None,
            "lab_score_desktop": round(sum(lab_desktop) / len(lab_desktop)) if lab_desktop else None,
            "core_web_vitals": cwv,
            "reason": None if cwv else "No real-user (CrUX) field data for these URLs; lab scores only.",
        }
    else:
        out["pagespeed"] = {"status": "no_data", "reason": "Connect a PageSpeed Insights key and re-run the audit."}

    # Search Console: per-URL data from the crawl plus property-wide totals from the last sync
    gsc_pages = [(p.get("audit_data") or {}).get("Search_Console") or {} for p in pages]
    live = [g for g in gsc_pages if g.get("Is_Live_GSC")]
    gsc_site = integration_data.get("search_console") or {}
    site_summary = gsc_site.get("summary") or {}
    has_site = bool(gsc_site.get("is_live_data") and site_summary)
    if live or has_site:
        inspected = [g for g in live if str(g.get("Google_Index_Status") or "").upper() in ("PASS", "FAIL", "NEUTRAL", "PARTIAL")]
        indexed = [g for g in inspected if gsc_index_state(g) == "indexed"]
        rows = [g for g in live if (g.get("Impressions_Num") or 0) >= 100 and isinstance(g.get("Position_Num"), (int, float))]
        expected = sum(g["Impressions_Num"] * _expected_ctr(g["Position_Num"]) for g in rows)
        actual = sum(g.get("Clicks_Num") or 0 for g in rows)
        out["search_console"] = {
            "status": "ok",
            "property": gsc_site.get("property"),
            "property_totals": {
                "clicks": site_summary.get("total_clicks"),
                "impressions": site_summary.get("total_impressions"),
                "avg_ctr": site_summary.get("average_ctr"),
                "avg_position": site_summary.get("average_position"),
                "queries": site_summary.get("total_queries_indexed"),
            } if has_site else None,
            "crawled_url_clicks": sum(g.get("Clicks_Num") or 0 for g in live),
            "crawled_url_impressions": sum(g.get("Impressions_Num") or 0 for g in live),
            "inspected_urls": len(inspected),
            "indexed_pct": round(100 * len(indexed) / len(inspected)) if len(inspected) >= 20 else None,
            "indexed_reason": None if len(inspected) >= 20 else f"Needs 20 inspected URLs (have {len(inspected)}).",
            "ctr_vs_benchmark": round(actual / expected, 2) if rows and expected else None,
            "ctr_rows": len(rows),
            "ctr_reason": None if rows else "Needs pages with at least 100 impressions.",
        }
    else:
        out["search_console"] = {"status": "no_data", "reason": "Search Console not connected or no data for this crawl."}

    # GA4 (site-level synced data, last 30 days)
    ga = integration_data.get("google_analytics") or {}
    summary = ga.get("summary") or {}
    total = summary.get("total_sessions")
    organic = summary.get("organic_sessions_30d")
    if ga.get("is_live_data") and isinstance(total, (int, float)):
        enough = total >= 100
        out["google_analytics"] = {
            "status": "ok" if enough else "insufficient",
            "sessions_30d": total,
            "organic_sessions_30d": organic,
            "organic_share_pct": round(100 * organic / total) if enough and isinstance(organic, (int, float)) and total else None,
            "engagement_rate": summary.get("engagement_rate"),
            "avg_engagement_time": summary.get("average_engagement_time"),
            "property": ga.get("property_name"),
            "reason": None if enough else f"Needs at least 100 sessions in 30 days (has {total}).",
        }
    else:
        out["google_analytics"] = {"status": "no_data", "reason": "GA4 not connected or no synced data."}

    # SERP visibility comes from the Keywords & AI answers checks (kept outside the crawl); the summary endpoint
    # fills it in at read time so a new check shows without re-scoring the crawl.
    out["serp"] = {"status": "no_data", "tracked_keywords": 0,
                   "reason": "Add keywords and questions in Keywords & AI answers."}

    # AI answer engines: a single branded probe is not a visibility measurement
    aeo = next(((p.get("audit_data") or {}).get("AEO_Audit") for p in pages
                if ((p.get("audit_data") or {}).get("AEO_Audit") or {}).get("Perplexity_Citations") is not None), None)
    out["ai_visibility"] = (
        {"status": "insufficient", "prompts_run": 1, "cited": aeo.get("Perplexity_Citation_Win"),
         "reason": "Mention/citation rates need at least 20 non-branded prompts × 3 runs per engine."}
        if aeo else {"status": "no_data", "reason": "No AI answer-engine probes were run."}
    )

    # Answer readiness: share of the 4 named criteria met on pages an AI provider actually assessed.
    assessed = []
    for p in pages:
        crit = ((p.get("audit_data") or {}).get("AEO_Audit") or {}).get("AEO_Criteria")
        if isinstance(crit, dict) and crit:
            assessed.append(100 * sum(1 for v in crit.values() if v is True) / len(crit))
    out["answer_readiness"] = (
        {"status": "ok", "score": round(sum(assessed) / len(assessed)), "pages_assessed": len(assessed)}
        if assessed else {"status": "no_data", "reason": "Connect an AI provider (Gemini, OpenAI or Claude) and re-run the audit."}
    )

    gbp = integration_data.get("google_business") or {}
    out["google_business"] = (
        {"status": "ok" if gbp.get("match_confidence") == "confirmed" else "unconfirmed",
         "rating": gbp.get("rating"), "reviews": gbp.get("total_reviews"),
         "reason": None if gbp.get("match_confidence") == "confirmed" else "Confirm the matched business before scoring."}
        if gbp.get("place_id") else {"status": "no_data", "reason": "No Business Profile match."}
    )
    return out
