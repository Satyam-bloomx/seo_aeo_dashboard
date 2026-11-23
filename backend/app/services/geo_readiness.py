"""GEO readiness: how ready a site is to be retrieved and quoted by AI answer engines (ChatGPT search, Perplexity,
Claude, Google AI Overviews / AI Mode). Computed from the crawl alone; no paid APIs.

This is readiness, not a prediction of citations: the strongest known predictor of AI visibility is how often the
brand is mentioned elsewhere on the web (Ahrefs, 75K brands, r = 0.66), which a crawl cannot see.

Score = content score (0-100) x access multiplier (0-1).

Access gates multiply, so being reachable earns nothing by itself (almost every site is), but failing a gate drags
the whole score down, because an engine that cannot fetch or read a page cannot cite it:
  * AI search bots allowed by robots.txt (Googlebot, OAI-SearchBot, Claude-SearchBot, PerplexityBot; each operator's
    documentation): multiplier = share allowed. Blocking training-only bots (GPTBot, ClaudeBot, Google-Extended) is a
    policy choice and never scored.
  * Pages indexable with snippets allowed (no noindex / nosnippet / max-snippet:0): multiplier = share eligible.
  * Content in the raw HTML: GPTBot / ClaudeBot do not execute JavaScript (Vercel/MERJ crawler log study, Dec 2024);
    a JS-only page keeps 25% because Googlebot renders it.

Content score, weighted by strength of evidence (points rescaled over what could be measured):
  20  Quotable evidence  statistics, quotations and cited sources raised visibility ~30-40% in the GEO paper
                         (Aggarwal et al., KDD 2024); readability helped ~15-30%. Prices, discounts and app-store
                         badges are not evidence.
  10  Freshness          AI assistants cite pages ~26% fresher than organic results (Ahrefs, 17M citations).
   8  Answer structure   question headings, an answer-first paragraph, lists/tables (weak, correlational evidence).
   7  Entity and trust   Organization sameAs profiles, author bylines, About and Contact pages.
   5  Structured data    present and valid (no measured citation lift; kept for entity clarity and classic SEO).
   0  llms.txt           reported only: no AI engine has confirmed using it (Ahrefs: 97% of files got no AI requests).
"""
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
import re

SEARCH_BOTS = ("Googlebot", "OAI-SearchBot", "Claude-SearchBot", "PerplexityBot")
JS_ONLY_LOSS = 0.75  # a JS-only page is invisible to 3 of the 4 AI search crawlers; Googlebot renders it
FRESH_DAYS = 365
MIN_CONTENT_WORDS = 150
NON_ARTICLE_TYPES = {"Home", "Category", "Pagination", "Blog Index", "Product"}  # pages that rarely carry a date
ABOUT_RE = re.compile(r"/(about|about-us|company|who-we-are|our-story)(/|$|\.)", re.I)
CONTACT_RE = re.compile(r"/(contact|contact-us|get-in-touch)(/|$|\.)", re.I)
BANDS = [(91, "Excellent"), (71, "Good"), (31, "Fair"), (0, "Weak")]


def _geo(page: dict) -> dict:
    return (page.get("audit_data") or {}).get("GEO") or {}


def _is_html_200(page: dict) -> bool:
    return page.get("status_code") == 200 and "html" in str(page.get("content_type") or "text/html").lower()


def _parse_date(value: Optional[str]) -> Optional[datetime]:
    if not value or not isinstance(value, str):
        return None
    v = value.strip().replace("Z", "+00:00")
    for candidate in (v, v[:10]):
        try:
            d = datetime.fromisoformat(candidate)
            return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


def _share(n: int, d: int) -> float:
    return n / d if d else 0.0


def _avg(values: List[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def _pct(x: float) -> str:
    return f"{x:.0%}"


def _apportion(total: int, weights: List[float]) -> List[int]:
    s = sum(weights)
    if total <= 0 or s <= 0:
        return [0] * len(weights)
    raw = [total * w / s for w in weights]
    parts = [int(r) for r in raw]
    for i in sorted(range(len(weights)), key=lambda i: raw[i] - parts[i], reverse=True)[: total - sum(parts)]:
        parts[i] += 1
    return parts


def _explain(score: int, content_share: float, quality: List[dict], gates: List[dict]) -> List[Dict[str, Any]]:
    """Points lost, in whole numbers that sum exactly to score - 100: first on content, then on access."""
    content_lost = 100 - round(100 * content_share)
    access_lost = (100 - score) - content_lost
    rows = []
    q_missing = [c["points"] - c["earned"] for c in quality]
    for c, pts in zip(quality, _apportion(content_lost, q_missing)):
        if pts:
            rows.append({"label": f"{c['label']} ({c['earned']:g}/{c['points']})", "impact": -pts,
                         "detail": f"{c['detail']} Basis: {c['basis']}."})
    g_missing = [1 - g["multiplier"] for g in gates]
    for g, pts in zip(gates, _apportion(access_lost, g_missing)):
        if pts:
            rows.append({"label": f"{g['label']} (score x {g['multiplier']:.2f})", "impact": -pts,
                         "detail": f"{g['detail']} Basis: {g['basis']}."})
    return sorted(rows, key=lambda r: r["impact"])


def compute_geo_readiness(pages: List[dict], site_mode: bool, ai_crawlers: Optional[dict],
                          now: Optional[datetime] = None) -> Dict[str, Any]:
    """pages: the counted internal pages (same list the other scores use). Returns {status, score, band,
    components: [{key, kind: "quality"|"gate", label, points/earned or multiplier, detail, basis}], explanation, ...}.
    Components that could not be measured are left out: content points are rescaled, a missing gate counts as 1."""
    now = now or datetime.now(timezone.utc)
    html = [p for p in pages if _is_html_200(p)]
    measured = [p for p in html if _geo(p)]
    if not measured:
        return {"status": "no_data", "score": None, "band": None, "components": [],
                "reason": ("Re-run the audit: GEO readiness is measured during the crawl." if html
                           else "No HTML pages were crawled.")}
    content = [p for p in measured if (_geo(p).get("Words") or 0) >= MIN_CONTENT_WORDS] or measured
    comps: List[Dict[str, Any]] = []

    def add(key, label, points, fraction, detail, basis):
        comps.append({"key": key, "kind": "quality", "label": label, "points": points,
                      "earned": round(points * max(0.0, min(1.0, fraction)), 1), "detail": detail, "basis": basis})

    def gate(key, label, multiplier, detail, basis):
        comps.append({"key": key, "kind": "gate", "label": label, "multiplier": round(max(0.0, min(1.0, multiplier)), 3),
                      "detail": detail, "basis": basis})

    # Gates: being reachable earns nothing by itself, but failing them scales the whole score down.
    # 1a. AI search bots allowed by robots.txt: a blocked engine cannot cite the site at all
    agents = {a.get("agent"): a for a in (ai_crawlers or {}).get("agents") or []}
    bots = [b for b in SEARCH_BOTS if b in agents]
    if (ai_crawlers or {}).get("status") == "ok" and bots:
        blocked = [b for b in bots if not agents[b].get("allowed")]
        gate("search_bots", "AI search bots allowed", _share(len(bots) - len(blocked), len(bots)),
             f"robots.txt blocks {', '.join(blocked)}." if blocked else f"robots.txt allows {', '.join(bots)}.",
             "Each AI operator's crawler documentation")

    # 1b. Pages indexable with snippets allowed (14); canonicalised duplicates are left out (their target counts)
    eligible_pool = [p for p in measured if not ((p.get("audit_data") or {}).get("Canonicals") or {}).get("Canonicalised")]
    if eligible_pool:
        ok = [p for p in eligible_pool
              if ((p.get("audit_data") or {}).get("Indexability") or {}).get("Indexable") is not False
              and not _geo(p).get("NoSnippet")]
        gate("indexable", "Pages indexable, snippets allowed", _share(len(ok), len(eligible_pool)),
             f"{len(ok)} of {len(eligible_pool)} pages can be indexed and quoted (no noindex or nosnippet).",
             "Google Search Central: AI features need ordinary indexing and snippet eligibility")

    # 2. Main content present without JavaScript. Google renders JavaScript, so a JS-only page keeps a quarter of
    # its readiness (Google AI features can still read it); ChatGPT, Claude and Perplexity crawlers see nothing.
    js_dep = [p for p in measured if _geo(p).get("JS_Dependent")]
    compared = sum(1 for p in measured if _geo(p).get("JS_Check") == "compared")
    how = ("Compared with the rendered page." if compared else
           "Judged from the served HTML alone; turn on JS rendering for a full comparison.")
    gate("raw_html", "Content visible without JavaScript", 1 - JS_ONLY_LOSS * _share(len(js_dep), len(measured)),
         f"{len(js_dep)} of {len(measured)} pages show most of their content only after JavaScript runs. {how}",
         "Vercel/MERJ log study: GPTBot and ClaudeBot do not run JavaScript")

    # 3. Quotable evidence on content pages (20): statistics 6, quotations 4, cited sources 6, readable 4
    def evidence(p):
        g, content_flags = _geo(p), (p.get("audit_data") or {}).get("Content") or {}
        readable = not (content_flags.get("Readability Difficult") or content_flags.get("Readability Very Difficult"))
        return (6 * ((g.get("Statistics") or 0) >= 2) + 4 * ((g.get("Quotations") or 0) >= 1)
                + 6 * ((g.get("Cited_Domains") or 0) >= 1) + 4 * readable) / 20
    stats = sum(1 for p in content if (_geo(p).get("Statistics") or 0) >= 2)
    cites = sum(1 for p in content if (_geo(p).get("Cited_Domains") or 0) >= 1)
    quotes = sum(1 for p in content if (_geo(p).get("Quotations") or 0) >= 1)
    add("evidence", "Statistics, quotes and cited sources", 20, _avg([evidence(p) for p in content]),
        f"Of {len(content)} content pages: {stats} include statistics, {quotes} quote someone, {cites} link to outside sources.",
        "GEO paper (Aggarwal et al., KDD 2024): +30-40% visibility")

    # 4. Freshness on article-like pages (10): has a date 4, dated within a year 6
    dated_pool = [p for p in content if ((p.get("audit_data") or {}).get("Page_Type") or {}).get("Type") not in NON_ARTICLE_TYPES]
    if dated_pool:
        def fresh(p):
            dates = [d for d in (_parse_date(_geo(p).get("Date_Modified")), _parse_date(_geo(p).get("Date_Published"))) if d]
            if not dates:
                return 0.0
            return (4 + 6 * ((now - max(dates)).days <= FRESH_DAYS)) / 10
        dated = sum(1 for p in dated_pool if _geo(p).get("Date_Modified") or _geo(p).get("Date_Published"))
        add("freshness", "Visible dates, recently updated", 10, _avg([fresh(p) for p in dated_pool]),
            f"{dated} of {len(dated_pool)} article-type pages show a published or updated date.",
            "Ahrefs (17M citations): AI assistants cite fresher pages")

    # 5. Answer structure on content pages (8): question headings 3, answer-first paragraph 3, list or table 2
    def structure(p):
        g = _geo(p)
        return (3 * ((g.get("Question_Headings") or 0) >= 1) + 3 * bool(g.get("Answer_First"))
                + 2 * (((g.get("Lists") or 0) + (g.get("Tables") or 0)) >= 1)) / 8
    qh = sum(1 for p in content if (_geo(p).get("Question_Headings") or 0) >= 1)
    add("structure", "Answer-style structure", 8, _avg([structure(p) for p in content]),
        f"{qh} of {len(content)} content pages use question headings; answer-first paragraphs and lists also count.",
        "Correlational industry studies (weak evidence)")

    # 6. Entity and trust (7): Organization sameAs 3, author bylines 2, About + Contact pages 2 (whole-site audits)
    same_as = max((_geo(p).get("Org_SameAs_Count") or 0) for p in measured)
    authored = _share(sum(1 for p in content if _geo(p).get("Author")), len(content))
    if site_mode:
        urls = [str(p.get("url") or "") for p in pages]
        has_about, has_contact = any(ABOUT_RE.search(u) for u in urls), any(CONTACT_RE.search(u) for u in urls)
        fraction = (3 * (same_as >= 1) + 2 * authored + has_about + has_contact) / 7
        missing = [n for n, ok in (("About page", has_about), ("Contact page", has_contact)) if not ok]
        detail = (f"Organization schema links {same_as} official profile{'s' if same_as != 1 else ''}; "
                  f"{_pct(authored)} of content pages name an author"
                  + (f"; no {' or '.join(missing)} found." if missing else "; About and Contact pages found."))
        add("entity", "Brand and author signals", 7, fraction, detail, "Brand mentions correlate most with AI visibility (Ahrefs)")
    else:
        add("entity", "Brand and author signals", 5, (3 * (same_as >= 1) + 2 * authored) / 5,
            f"Organization schema links {same_as} official profile{'s' if same_as != 1 else ''}; "
            f"{'an author is' if authored else 'no author is'} named.", "Brand mentions correlate most with AI visibility (Ahrefs)")

    # 7. Structured data present and valid (5)
    sd_ok = sum(1 for p in measured
                if ((p.get("audit_data") or {}).get("Structured_Data") or {}).get("Schema Present")
                and not ((p.get("audit_data") or {}).get("Structured_Data") or {}).get("Invalid JSON-LD"))
    add("schema", "Structured data present and valid", 5, _share(sd_ok, len(measured)),
        f"{sd_ok} of {len(measured)} pages have valid structured data.",
        "No measured citation lift (Ahrefs matched test); helps entity clarity")

    quality = [c for c in comps if c["kind"] == "quality"]
    gates = [c for c in comps if c["kind"] == "gate"]
    possible = sum(c["points"] for c in quality)
    content_share = sum(c["earned"] for c in quality) / possible if possible else 0.0
    multiplier = 1.0
    for g in gates:
        multiplier *= g["multiplier"]
    score = round(100 * content_share * multiplier)
    explanation = _explain(score, content_share, quality, gates)
    llms = (ai_crawlers or {}).get("llms_txt") or {}
    # Measured visibility from the GEO integration (SerpAPI: is the site cited in Google's AI Overview for the
    # tracked query). Shown beside the readiness score, never mixed into it.
    ai_overview = next((g.get("Generative_AI_Overview_Inclusion") for g in
                        ((p.get("audit_data") or {}).get("GEO_Audit") or {} for p in pages)
                        if g.get("is_geo_connected") and g.get("Generative_AI_Overview_Inclusion")), None)
    return {
        "ai_overview": ai_overview,
        "status": "ok",
        "score": score,
        "band": next((label for floor, label in BANDS if score is not None and score >= floor), None),
        "components": comps,
        "points_possible": possible,
        "content_score": round(100 * content_share),
        "access_multiplier": round(multiplier, 3),
        "explanation": explanation,  # [{label, impact, detail}], whole points summing to score - 100
        "pages_measured": len(measured),
        "content_pages": len(content),
        "info": {
            "llms_txt": bool(llms.get("present")),
            "training_bots_blocked": (ai_crawlers or {}).get("training_bots_blocked") or [],
            "note": "Readiness, not predicted citations: mentions of the brand elsewhere on the web matter most, "
                    "and a crawl cannot see them. llms.txt and training-bot blocks are shown but not scored.",
        },
    }
