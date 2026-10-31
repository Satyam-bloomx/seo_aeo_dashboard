"""
Single source of truth for audit scores.

Method (see docs/DASHBOARD_IMPROVEMENT_PLAN.md, approved 27 Oct 2026):
  * Every check on every URL is pass / fail / not_evaluated. not_evaluated never counts as a pass
    and is excluded from both numerator and denominator.
  * Severity weights: critical 5, warning 3, notice 1 (our calibration; persisted as SCORING_VERSION).
  * Site Health = 50% URL pass rate (share of evaluated URLs with no failed critical check, the Ahrefs
    Health Score method) + 50% severity-weighted check pass rate (the Lighthouse category method).
  * Category scores and per-URL page scores use the weighted pass rate.
  * Single-page audits ("page" mode) exclude site-scope checks (duplicates, link graph, sitemaps).
  * Integration data never feeds Site Health; each integration gets its own score with minimum-data rules.
"""
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional
from app.services.fetch_outcome import is_uncounted

SCORING_VERSION = "2026.10-5"
WEIGHTS = {"critical": 5, "warning": 3, "notice": 1}
BANDS = [(91, "Excellent"), (71, "Good"), (31, "Fair"), (0, "Weak")]  # Ahrefs Health Score bands
MIN_URLS_FOR_CONFIDENCE = 5
FAILING_ID_CAP = 2000

CATEGORY_GROUPS = {
    "Indexability": ("Response_Codes", "Canonicals", "Directives", "Sitemaps", "Pagination"),
    "On-page": ("Page_Titles", "Meta_Description", "H1", "H2", "Images"),
    "Content": ("Content",),
    "Links": ("Links",),
    "Security": ("Security",),
    "Structured data": ("Structured_Data",),
    "Technical": ("Validation", "JavaScript"),
}
INTEGRATION_CATEGORIES = {"Search_Console", "PageSpeed", "Google_Analytics"}


@dataclass(frozen=True)
class Rule:
    category: str
    name: str
    severity: str
    scope: str  # "page" (local to one URL) or "site" (needs the whole crawl)
    applies: str  # "html200" | "internal" | "dedupe" | "integration"
    evaluate: Optional[Callable[[dict, dict], Optional[bool]]] = None  # (page, audit_data) -> fail?
    # Name of a site-level condition (see _site_conditions) that raises this rule to `escalated_severity`.
    escalate_when: Optional[str] = None
    escalated_severity: Optional[str] = None

    @property
    def id(self) -> str:
        return f"{self.category.replace('_', ' ')}: {self.name}"


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
    ps = ad.get("PageSpeed") or {}
    mobile = ps.get("mobile") or {}
    field = mobile.get("field_data") or {}
    if field.get("available"):
        verdict = cwv_verdict(field)["passed"]
        if verdict is not None:
            return not verdict
    metrics = mobile.get("metrics") or {}
    lcp_s, cls = _num(metrics.get("lcp")), _num(metrics.get("cls"))
    if lcp_s is None and cls is None:
        return None
    return bool((lcp_s or 0) > 2.5 or (cls or 0) > 0.1)


def _page_type(ad: dict) -> str:
    return (ad.get("Page_Type") or {}).get("Type") or ""


def _product_schema_missing(_page, ad) -> Optional[bool]:
    """Product pages only; judged on the page's own structured data."""
    if _page_type(ad) != "Product":
        return None
    types = set((ad.get("Structured_Data") or {}).get("Schema_Types") or [])
    return not (types & {"Product", "ProductGroup", "Offer", "AggregateOffer", "IndividualProduct"})


def _title_dup_not_pagination(_page, ad) -> Optional[bool]:
    """Duplicate title, except where pagination explains it (that has its own, lower-severity rule)."""
    value = (ad.get("Page_Titles") or {}).get("Duplicate")
    if not isinstance(value, bool):
        return None
    return value and not (ad.get("Pagination") or {}).get("Duplicate Title From Pagination")


def _page_flags(category, severity, names, applies="html200", scope="page"):
    return [Rule(category, n, severity, scope, applies, _flag(category, n)) for n in names]


RULES: List[Rule] = [
    # Response codes (every internal URL)
    Rule("Response_Codes", "Client Error (4xx)", "critical", "page", "internal", _status_range(400, 500)),
    Rule("Response_Codes", "Server Error (5xx)", "critical", "page", "internal", _status_range(500, 600)),
    Rule("Response_Codes", "Blocked or Failed (No Response)", "warning", "page", "internal",
         lambda p, _ad: (p.get("status_code") or 0) == 0),
    Rule("Response_Codes", "Redirection (3xx)", "notice", "page", "internal", _status_range(300, 400)),
    *_page_flags("Response_Codes", "warning", ["Redirect Chain (2+ Hops)"], applies="internal"),
    *_page_flags("Response_Codes", "notice", ["Temporary Redirect (302/307)"], applies="internal"),
    # Meta refresh / HTTP Refresh redirects answer 200, so they are judged on HTML pages.
    *_page_flags("Response_Codes", "warning", ["Redirection (Meta Refresh)"]),
    # On-page (200 HTML pages)
    *_page_flags("Page_Titles", "critical", ["Missing"]),
    *_page_flags("Page_Titles", "warning", ["Multiple", "Outside <head>"]),
    *_page_flags("Page_Titles", "notice", ["Over 60 Characters", "Below 30 Characters", "Same as H1"]),
    *_page_flags("Meta_Description", "warning", ["Missing", "Multiple", "Outside <head>"]),
    *_page_flags("Meta_Description", "notice", ["Over 155 Characters", "Below 70 Characters"]),
    *_page_flags("H1", "warning", ["Missing"]),
    *_page_flags("H1", "notice", ["Over 70 Characters", "Multiple", "Non-Sequential", "Alt Text in H1"]),
    *_page_flags("H2", "notice", ["Missing", "Over 70 Characters"]),
    # No alt attribute at all is an accessibility failure; alt="" is correct for decorative images, so it is a notice.
    *_page_flags("Images", "warning", ["Missing Alt Attribute"]),
    *_page_flags("Images", "notice", ["Missing Alt Text", "Alt Text Over 100 Characters", "Missing Size Attributes"]),
    *_page_flags("Content", "critical", ["Soft 404 Pages"]),
    *_page_flags("Content", "warning", ["Low Content Pages", "Lorem Ipsum Placeholder"]),
    *_page_flags("Content", "notice", ["Readability Difficult", "Readability Very Difficult"]),
    *_page_flags("Canonicals", "critical", ["Multiple Conflicting"]),
    *_page_flags("Canonicals", "warning", ["Multiple", "Outside <head>"]),
    # Missing canonicals matter more once the crawl shows duplicate titles or content (see _site_conditions).
    Rule("Canonicals", "Missing", "notice", "page", "html200", _flag("Canonicals", "Missing"),
         escalate_when="has_duplicates", escalated_severity="warning"),
    *_page_flags("Canonicals", "notice", ["Canonical Is Relative", "Unlinked"]),
    *_page_flags("Directives", "warning", ["Outside <head>"]),
    # Informational: noindex is often intentional, but it should be visible in the Issues list.
    Rule("Directives", "Noindex", "notice", "page", "html200", _flag("Directives", "NoIndex")),
    # Pagination (Page_Type / Pagination blocks are set by the extractor and post-processor)
    Rule("Pagination", "Paginated Page Canonicalised To First Page", "warning", "page", "html200",
         _flag("Pagination", "Canonicalised To First Page")),
    *_page_flags("Pagination", "notice", ["Duplicate Title From Pagination"]),
    Rule("Structured_Data", "Product Pages Missing Product Schema", "warning", "page", "html200", _product_schema_missing),
    *_page_flags("Validation", "warning", ["Missing <head> Tag", "Multiple <head> Tags", "Missing <body> Tag",
                                            "Multiple <body> Tags", "HTML Document Over 2MB"]),
    *_page_flags("JavaScript", "notice", ["Uses Old AJAX Crawling Scheme URLs"]),
    *_page_flags("Security", "critical", ["HTTP URLs"]),
    *_page_flags("Security", "warning", ["Mixed Content", "Unsafe Cross-Origin Links"]),
    *_page_flags("Security", "notice", ["Missing HSTS Header", "Missing Content-Security-Policy Header",
                                         "Missing X-Content-Type-Options Header", "Missing X-Frame-Options Header",
                                         "Missing Secure Referrer-Policy Header", "Protocol-Relative Resource Links"]),
    *_page_flags("Structured_Data", "warning", ["Invalid JSON-LD"]),
    *_page_flags("Structured_Data", "notice", ["Missing Structured Data"]),
    # Site-scope checks (need the whole crawl)
    Rule("Page_Titles", "Duplicate", "warning", "site", "dedupe", _title_dup_not_pagination),
    *_page_flags("Meta_Description", "warning", ["Duplicate"], applies="dedupe", scope="site"),
    *_page_flags("H1", "notice", ["Duplicate"], applies="dedupe", scope="site"),
    *_page_flags("Content", "warning", ["Exact Duplicates"], applies="dedupe", scope="site"),
    *_page_flags("Content", "notice", ["Near Duplicates"], applies="dedupe", scope="site"),
    *_page_flags("Canonicals", "warning", ["Non-Indexable Canonical"], scope="site"),
    *_page_flags("Links", "critical", ["Internal Links To Broken Pages"], scope="site"),
    *_page_flags("Links", "warning", ["Non-Indexable Page Inlinks Only"], scope="site"),
    *_page_flags("Links", "notice", ["Internal Links To Redirects", "Pages With High Crawl Depth",
                                      "Pages With High Internal Outlinks"], scope="site"),
    *_page_flags("Sitemaps", "warning", ["Non-Indexable URLs in Sitemap"], scope="site"),
    *_page_flags("Sitemaps", "notice", ["URLs Not In Sitemap"], scope="site"),
    # Integration findings: listed as issues, never part of Site Health
    Rule("Search_Console", "Excluded from Google Index", "critical", "page", "integration",
         _gsc_rule(lambda g: gsc_index_state(g) == "not_indexed" if gsc_index_state(g) != "unknown" else None)),
    Rule("Search_Console", "Canonical Mismatch (Google Chose Different Canonical)", "warning", "page", "integration",
         _gsc_rule(lambda g: g.get("Canonical_Mismatch") if g.get("Google_Selected_Canonical") else None)),
    Rule("Search_Console", "High Impressions with Low CTR (< 1.5%)", "notice", "page", "integration",
         _gsc_rule(lambda g: (g.get("CTR_Num") or 0) < 1.5 if (g.get("Impressions_Num") or 0) >= 100 else None)),
    Rule("Search_Console", "Striking Distance Opportunity (Position 11–20)", "notice", "page", "integration",
         _gsc_rule(lambda g: 10.5 <= g["Position_Num"] <= 20.4 if isinstance(g.get("Position_Num"), (int, float)) else None)),
    Rule("PageSpeed", "Core Web Vitals Failing (LCP > 2.5s or CLS > 0.1)", "warning", "page", "integration", _cwv_failing),
    Rule("Google_Analytics", "Critical Revenue Risk (Broken High-Traffic Page)", "critical", "page", "integration",
         lambda p, ad: bool(str((ad.get("Google_Analytics") or {}).get("Revenue_At_Risk") or "").startswith("High"))
         if (ad.get("Google_Analytics") or {}).get("Sessions_Num") is not None else None),
]

PRIORITY = {"critical": "High", "warning": "Medium", "notice": "Low"}
TYPE = {"critical": "Issue", "warning": "Warning", "notice": "Opportunity"}


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
    """Whole-crawl facts that can raise a rule's severity."""
    def dup(p):
        ad = p.get("audit_data") or {}
        return bool(_is_dedupe_eligible(p, ad) and (
            (ad.get("Page_Titles") or {}).get("Duplicate") is True
            or (ad.get("Content") or {}).get("Exact Duplicates") is True))
    return {"has_duplicates": site_mode and any(dup(p) for p in internal)}


def effective_severity(rule: Rule, conditions: Dict[str, bool]) -> str:
    return rule.escalated_severity if rule.escalate_when and conditions.get(rule.escalate_when) else rule.severity


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


def _weighted(cells: List[tuple]) -> Optional[int]:
    """cells: [(severity, failed_bool)] -> weighted pass rate 0-100 or None."""
    total = sum(WEIGHTS[s] for s, _ in cells)
    if not total:
        return None
    return round(100 * sum(WEIGHTS[s] for s, failed in cells if not failed) / total)


# Headline score penalties beyond the check pass rates. Capped so one signal cannot erase the score,
# and always whole points so the explanation adds up exactly.
ERROR_PTS_PER_PERCENT, ERROR_PENALTY_CAP = 2, 20   # 2 points per 1% of internal URLs that fail to load
CWV_PENALTY_BASE, CWV_PENALTY_PER_METRIC, CWV_PENALTY_CAP = 4, 2, 10
LAB_GOOD_SCORE, LAB_POINTS_DIVISOR = 90, 6
# A warning/critical check failing on nearly every page is a site-level problem (a template issue), which the
# per-check averages understate: e.g. no H1 or no Product schema on any product page.
SITEWIDE_SHARE, SITEWIDE_MIN_PAGES = 0.8, 5
SITEWIDE_POINTS = {"critical": 6, "warning": 3}
SITEWIDE_PENALTY_CAP = 15


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


def headline_score(base: Optional[int], url_pass: Optional[int], weighted: Optional[int], all_cells: List[tuple],
                   internal: List[dict], integrations: Dict[str, Any], site_mode: bool, critical_urls: tuple,
                   sitewide: Optional[List[tuple]] = None):
    """Headline Site Health: the check-based score minus capped penalties for failed Core Web Vitals / poor lab
    speed and for internal URLs that return errors. Returns (score, explanation) where explanation is an ordered
    list of {"label", "impact", "detail"}; impacts (negative = lowered the score) sum to score - 100."""
    if base is None:
        return None, []
    items: List[Dict[str, Any]] = []
    gap = 100 - base
    has_both = url_pass is not None and weighted is not None
    share = 0.5 if has_both else 1.0
    failed_w = {s: sum(WEIGHTS[s] for sv, f in all_cells if f and sv == s) for s in WEIGHTS}
    parts_spec = []
    if url_pass is not None:
        n_fail, n_eval = critical_urls
        parts_spec.append(("URLs with critical errors", share * (100 - url_pass),
                           f"{n_fail} of {n_eval} URLs have at least one critical issue (half of the check-based score)."))
    if weighted is not None:
        tot = sum(failed_w.values()) or 1
        names = {"critical": "Critical checks failing", "warning": "Warning checks failing", "notice": "Notice checks failing"}
        for sev in ("critical", "warning", "notice"):
            if failed_w[sev]:
                parts_spec.append((names[sev], share * (100 - weighted) * failed_w[sev] / tot,
                                   f"{sev.capitalize()} checks carry weight {WEIGHTS[sev]}; their failures make up the other half "
                                   f"of the check-based score ({weighted}% of weighted checks pass)."))
    for (label, _w, detail), pts in zip(parts_spec, _apportion(gap, [w for _l, w, _d in parts_spec])):
        if pts:
            items.append({"label": label, "impact": -pts, "detail": detail})

    penalties: List[Dict[str, Any]] = []
    if site_mode and internal:
        errors = sum(1 for p in internal if (p.get("status_code") or 0) == 0 or (p.get("status_code") or 0) >= 400)
        if errors:
            pct = 100 * errors / len(internal)
            pts = min(ERROR_PENALTY_CAP, max(1, round(pct * ERROR_PTS_PER_PERCENT)))
            penalties.append({"label": "Pages returning errors", "impact": -pts,
                              "detail": f"{errors} of {len(internal)} internal URLs ({pct:.1f}%) returned 4xx/5xx or no response: "
                                        f"{ERROR_PTS_PER_PERCENT} points per 1%, capped at {ERROR_PENALTY_CAP}."})
    if site_mode and sitewide:
        pts = min(SITEWIDE_PENALTY_CAP, sum(SITEWIDE_POINTS[sev] for _name, sev, _f, _e in sitewide))
        names = ", ".join(f"{name} ({f} of {e} pages)" for name, _sev, f, e in sitewide[:4])
        more = f" and {len(sitewide) - 4} more" if len(sitewide) > 4 else ""
        penalties.append({"label": "Problems on almost every page", "impact": -pts,
                          "detail": f"{names}{more}: a check failing on {int(SITEWIDE_SHARE * 100)}%+ of pages is a template "
                                    f"problem; {SITEWIDE_POINTS['warning']} points per warning, {SITEWIDE_POINTS['critical']} per "
                                    f"critical, capped at {SITEWIDE_PENALTY_CAP}."})
    ps = integrations.get("pagespeed") or {}
    if ps.get("status") == "ok":
        cwv, lab = ps.get("core_web_vitals"), ps.get("lab_score_mobile")
        if cwv and cwv.get("passed") is not None:
            bad = [n for n, k in (("LCP", "lcp_good"), ("INP", "inp_good"), ("CLS", "cls_good")) if cwv.get(k) is False]
            if cwv["passed"]:
                penalties.append({"label": "Core Web Vitals", "impact": 0, "detail": "Passed on real-user (field) data; no penalty."})
            else:
                pts = min(CWV_PENALTY_CAP, CWV_PENALTY_BASE + CWV_PENALTY_PER_METRIC * len(bad))
                penalties.append({"label": "Core Web Vitals failed", "impact": -pts,
                                  "detail": f"Real-user (field) data fails on {', '.join(bad)}: {CWV_PENALTY_BASE} points plus "
                                            f"{CWV_PENALTY_PER_METRIC} per failing metric, capped at {CWV_PENALTY_CAP}."})
        elif isinstance(lab, int):
            pts = 0 if lab >= LAB_GOOD_SCORE else min(CWV_PENALTY_CAP, max(1, round((LAB_GOOD_SCORE - lab) / LAB_POINTS_DIVISOR)))
            penalties.append({"label": "Page speed (lab test)" if pts else "Page speed", "impact": -pts,
                              "detail": (f"No real-user data; the lab performance score is {lab}/100 (below {LAB_GOOD_SCORE} costs 1 point per "
                                         f"{LAB_POINTS_DIVISOR}, capped at {CWV_PENALTY_CAP})." if pts else
                                         f"No real-user data; lab performance score is {lab}/100, no penalty.")})
    remaining = base
    for pen in penalties:  # never push the score below 0
        pen["impact"] = -min(-pen["impact"], remaining)
        remaining += pen["impact"]
    items.extend(penalties)
    items.sort(key=lambda i: i["impact"])  # biggest deductions first; zero-impact notes last (stable)
    return base + sum(p["impact"] for p in penalties), items


def compute_scores(pages: List[dict], mode: str = "site", integration_data: Optional[dict] = None) -> Dict[str, Any]:
    """pages: dicts with id, url, status_code, content_type, indexability, indexability_status, audit_data."""
    site_mode = mode != "page"
    internal_all = [p for p in pages if not _is_external(p, p.get("audit_data") or {})]
    # Pages whose fetch failed for a reason that is not the site's fault (our side, bot protection, unreachable on
    # every attempt) stay out of every rule and denominator, so they are never reported as broken pages.
    not_counted = {"ours": 0, "unknown": 0, "blocked": 0}
    internal = []
    for p in internal_all:
        kind = uncounted_kind(p.get("audit_data"))
        if kind:
            not_counted[kind] += 1
        else:
            internal.append(p)
    active_rules = [r for r in RULES if site_mode or r.scope == "page"]
    conditions = _site_conditions(internal, site_mode)
    sev_of = {r.id: effective_severity(r, conditions) for r in RULES}

    per_rule = {r.id: {"failing": [], "evaluated": 0} for r in active_rules}
    page_cells: Dict[Any, List[tuple]] = {}
    category_cells: Dict[str, List[tuple]] = {g: [] for g in CATEGORY_GROUPS}
    cat_to_group = {c: g for g, cats in CATEGORY_GROUPS.items() for c in cats}
    all_cells: List[tuple] = []
    urls_with_critical_eval, urls_with_critical_fail = set(), set()
    severity_urls = {"critical": set(), "warning": set(), "notice": set()}

    for page in internal:
        pid = page.get("id")
        cells = page_cells.setdefault(pid, [])
        for rule in active_rules:
            result = evaluate_rule(rule, page)
            if result is None:
                continue
            per_rule[rule.id]["evaluated"] += 1
            if result:
                per_rule[rule.id]["failing"].append(pid)
                severity_urls[sev_of[rule.id]].add(pid)
            if rule.category in INTEGRATION_CATEGORIES:
                continue
            cell = (sev_of[rule.id], bool(result))
            cells.append(cell)
            all_cells.append(cell)
            category_cells[cat_to_group[rule.category]].append(cell)
            if sev_of[rule.id] == "critical":
                urls_with_critical_eval.add(pid)
                if result:
                    urls_with_critical_fail.add(pid)

    url_pass_rate = (
        round(100 * (1 - len(urls_with_critical_fail) / len(urls_with_critical_eval)))
        if urls_with_critical_eval else None
    )
    weighted = _weighted(all_cells)
    parts = [v for v in (url_pass_rate, weighted) if v is not None]
    base_health = round(sum(parts) / len(parts)) if parts else None
    integrations_out = integration_scores(internal, integration_data or {})
    sitewide = sorted(
        ((r.name, sev_of[r.id], len(per_rule[r.id]["failing"]), per_rule[r.id]["evaluated"]) for r in active_rules
         if r.category not in INTEGRATION_CATEGORIES and sev_of[r.id] in SITEWIDE_POINTS
         and per_rule[r.id]["evaluated"] >= SITEWIDE_MIN_PAGES
         and len(per_rule[r.id]["failing"]) >= SITEWIDE_SHARE * per_rule[r.id]["evaluated"]),
        key=lambda t: (-SITEWIDE_POINTS[t[1]], -t[2]))
    health, score_explanation = headline_score(
        base_health, url_pass_rate, weighted, all_cells, internal, integrations_out, site_mode,
        (len(urls_with_critical_fail), len(urls_with_critical_eval)), sitewide)

    evaluated_rules = [r for r in active_rules if per_rule[r.id]["evaluated"] > 0 and r.category not in INTEGRATION_CATEGORIES]
    rules_out = []
    for rule in RULES:
        if rule.id not in per_rule:
            rules_out.append({"id": rule.id, "category": rule.category, "rule": rule.name, "severity": rule.severity,
                              "priority": PRIORITY[rule.severity], "type": TYPE[rule.severity], "scope": rule.scope,
                              "integration": rule.category in INTEGRATION_CATEGORIES,
                              "status": "not_evaluated", "reason": "site_only", "failing_count": 0,
                              "evaluated_count": 0, "failing_page_ids": []})
            continue
        stats = per_rule[rule.id]
        sev = sev_of[rule.id]
        status = "not_evaluated" if stats["evaluated"] == 0 else ("fail" if stats["failing"] else "pass")
        rules_out.append({
            "id": rule.id, "category": rule.category, "rule": rule.name, "severity": sev,
            "priority": PRIORITY[sev], "type": TYPE[sev], "scope": rule.scope,
            "escalated": sev != rule.severity,
            "integration": rule.category in INTEGRATION_CATEGORIES,
            "status": status, "reason": None if stats["evaluated"] else "no_data",
            "failing_count": len(stats["failing"]), "evaluated_count": stats["evaluated"],
            "failing_page_ids": stats["failing"][:FAILING_ID_CAP],
        })

    if any(not_counted.values()):
        score_explanation = [*score_explanation, {
            "label": "Pages not counted", "impact": 0, "detail": not_counted_detail(not_counted)}]

    result = {
        "scoring_version": SCORING_VERSION,
        "not_counted": not_counted,
        "mode": "site" if site_mode else "page",
        "weights": WEIGHTS,
        "urls_evaluated": len(internal),
        "site_health": {
            "score": health,  # the headline: check-based score minus the capped penalties in score_explanation
            "base_score": base_health,
            "band": _band(health),
            "url_pass_rate": url_pass_rate,
            "weighted_pass_rate": weighted,
            "urls_with_critical_errors": len(urls_with_critical_fail),
            "urls_evaluated_for_critical": len(urls_with_critical_eval),
            "urls_with": {k: len(v) for k, v in severity_urls.items()},
            "checks_evaluated": len(evaluated_rules),
            "checks_total": len([r for r in active_rules if r.category not in INTEGRATION_CATEGORIES]),
            "low_confidence": len(urls_with_critical_eval) < MIN_URLS_FOR_CONFIDENCE and site_mode,
        },
        "categories": {
            group: {"score": _weighted(cells), "band": _band(_weighted(cells)),
                    "checks_failed": sum(1 for _, f in cells if f), "checks_evaluated": len(cells)}
            for group, cells in category_cells.items()
        },
        "page_scores": {str(pid): _weighted(cells) for pid, cells in page_cells.items()},
        "rules": rules_out,
        "integrations": integrations_out,
        "score_explanation": score_explanation,
    }
    if not site_mode:
        only = internal[0] if internal else None
        result["page_score"] = result["page_scores"].get(str(only.get("id"))) if only else None
    return result


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
