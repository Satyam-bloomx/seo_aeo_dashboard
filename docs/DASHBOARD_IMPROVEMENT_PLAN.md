# Dashboard Improvement Plan: Data Integrity, Scoring, AI, Speed, Single-Page Mode

_Research date: 27 Oct 2026. Four research passes:_
1. _data-flow trace;_
2. _industry scoring research;_
3. _AI prompt grading with 20 live Gemini calls on bloomxsolutions.com;_
4. _performance profiling with measured builds and benchmarks._

_No code has been changed for this plan yet; it needs approval first._

## 1. What we found

### Data correctness (loose ends)
* **Search Console resync wipes real data.** `intelligence_service.py:277` passes the site-level payload (no `page_map`) into the per-page builder. Every page gets "0 clicks / Is_Live_GSC: True", which fires the High-priority "Excluded from Google Index" issue. An expired token does the same.
* **Fabrications still left** after the first cleanup:
  * GEO labels set because a key exists: "Top 3 Local Pack", "100% Verified NAP" (`enrichment_service.py:618-632`);
  * GA4 numbers hard-coded from one past site: 7 sessions, 42.86%, 47.72%, 9,814 (`IntegrationsWorkspace.jsx:1848-2015`, `intelligence_service.py:1272, 1378-1412`);
  * desktop PSI = mobile + 8, and TTI labelled as INP (`intelligence_service.py:1129-1133`);
  * "Not Indexed in Top SERPs" inferred from missing impressions, plus fake inspection defaults;
  * `Sessions_90d = sessions×3`;
  * AEO 85/88/80 defaults;
  * one Perplexity brand query sets every page's AEO score to 92/74.
* **Three different "health" numbers** for one audit: Overview Site Health, Overview Technical, and an Executive formula of 100 − 4×critical − 1.5×warning.
* **Status-0 pages** (blocked or failed) are displayed as 200 OK (`status_code || 200`).
* **Key mismatch:** the redirect target never displays (`"Redirect URL"` vs `Redirect_URL`).
* **Never populated:** Structured Data, GEO score, Hreflang, Pagination, page size, text ratio, X-Robots-Tag.
* **Constants:** "Canonical Alignment 100%", "Index, Follow".
* **False issues in the URL drawer:** every `true` boolean is shown as an issue (HTTPS, Indexable, In Sitemap…).
* **Link graph is corrupted.** Links are stored raw while pages are normalized, so inlinks, Link Score and orphans are wrong.
* **Mixed-content check misses every `<script>`.**
* **"URLs not in sitemap"** flags every page when no sitemap is found at the 4 hard-coded paths.
* **Rules that never fire count as "passed".** 4 rules can never fire, and Links/Sitemaps issues are excluded from the score.
* **Connecting GA4 lowers the score:** every page outside GA4's top 25 is called a "zombie".
* **SSRF gap:** the sitemap fetch (`post_processor.py:334`) does not use the SSRF guard.

### Scoring (research)
* The current formula claims to "replicate Ahrefs and Semrush" but matches neither: arbitrary constants, a min-5 floor, an 85 cap and invented pillar weights.
* **Industry methods:**
  * Ahrefs Health Score = % of URLs with no Error-level issue.
  * Lighthouse = severity-weighted pass rate with N/A checks excluded.
  * Semrush does not publish its weights.
  * Screaming Frog deliberately has no single score.

### AI suggestions (live test)
* **5 of 8 outputs contained a factual error.** Schema was reported "missing" on all 3 pages that have it, and CWV scores were invented with PageSpeed disconnected.
* **Fabricated "before" code:** the prompt asks for "exact code on this site" but sends no HTML.
* **Invented business claims:** "22–35% traffic uplift" and "15% conversion increase".
* **Spam fixes suggested:** hidden H1s and JS-set titles.
* **Platform detection fails:** URL-only detection says "Standard" for WordPress, and Shopify is detected from the word "shopify".
* **More than half the API calls wasted** on rate-limited preview models across a 9-model fallback list, which users see as a 10–20 s spinner.
* **The model was accurate whenever the facts were supplied.** The failures come from missing inputs and prompt design.

### Speed (measured)
* **`/` first load: 1,288 KB gzip.** One 889 KB chunk holds the Naruto demo (1.49 MB source) plus xlsx, jspdf and html2canvas.
* **Polling:** every 2.5 s it re-downloads all pages (2.5–6 MB per poll at 500 pages, uncompressed). There is no gzip, and the Overview remounts each poll (`key` includes `pages.length`).
* **Near-duplicate step is quadratic:** 500 pages take 12.5 s, 2,000 pages take **155 s**.
* **The extractor parses HTML twice on the event loop:** 41 ms/page, capped at ~25 pages/s, and API requests stall during crawls.
* **Enrichment holds "running" status for 60–180 s.** It runs serial PSI and Gemini calls with 60 s timeouts before the crawl is marked complete.
* **`duplicate_urls` lists grow quadratically** in the JSON payload.

## 2. Proposed design

### Single page / Whole site
* **Toggle** beside the URL bar:
  ```
  ┌──────────────────────────────────────────────────────┐
  │ https://bloomxsolutions.com/about/        [Run ▶]    │
  │ (•) Single page  ( ) Whole site      ⚙ crawl limits  │
  └──────────────────────────────────────────────────────┘
  ```
* **Storage.** `Crawl.mode` = `page | site`. A new single-page audit replaces only the previous single-page audit, so both kinds coexist; 24 h retention still applies.
* **Single-page path** (`POST /audits/quick`): fetch once, parse once, run page-local checks only.
  * Returns in under 5 s.
  * PageSpeed, Gemini and GSC inspection run in parallel afterwards with 8 s caps and fill in live.
* **Site-level checks are hidden** for a single page, with the note "Run a whole-site crawl to evaluate":
  * duplicates, near-duplicates;
  * inlinks, Link Score, crawl depth;
  * orphans, sitemap coverage;
  * broken internal links;
  * hreflang reciprocity.
* **The dashboard shows a mode switcher** whenever both audits exist.

### Scoring specification (one engine, backend, shared by every screen)
* **Every check returns `pass | fail | not_evaluated`.** `not_evaluated` is excluded from both numerator and denominator and never counts as a pass. A category with nothing evaluated scores `null`.
* **Severity is defined per rule:** critical = 5, warning = 3, notice = 1. This is our design, to be calibrated on real audits.
* **Site Health** = 50% × (% of URLs with no failed critical check, Ahrefs method) + 50% × (severity-weighted pass rate, Lighthouse method).
  * No floor or cap.
  * Bands: 91–100 Excellent, 71–90 Good, 31–70 Fair, 0–30 Weak.
  * Shown with error, warning and notice URL counts and "N of M checks evaluated".
* **Category scores** use the weighted pass rate: Indexability, On-page, Links, Content, Security, Structured data (+ Accessibility only when axe actually ran).
* **Page Score** (single page) = severity-weighted pass rate over page-local checks. The same function also produces each URL's score in a site crawl.
* **Integration scores** (separate panels; never blended into Site Health; each shows "not enough data" below its minimum):

  | Integration | Its own score | Minimum data |
  |---|---|---|
  | Search Console | Indexed % of inspected URLs; CTR vs position benchmark | 20 inspected URLs; 100 impressions/row |
  | GA4 | Organic engagement rate + trend; traffic-weighted issue priority | 100 organic sessions |
  | PageSpeed / CrUX | Core Web Vitals pass/fail (LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1 at p75, field); Lighthouse lab score shown separately | CrUX data, else lab only |
  | SerpAPI | Keyword visibility (CTR-weighted rank share) | 10 tracked keywords |
  | AI engines | Mention rate, citation rate per engine | 20 non-branded prompts × 3 runs |
  | Google Business | Profile completeness %, rating, review count | Verified match |

* **Persist `scoring_version`** with each audit.

### AI suggestions
* **Engine fixes:**
  * real `system_instruction`;
  * `responseSchema`;
  * a stable default model first, plus a "last good model" memory;
  * 25 s timeout and capped thinking tokens;
  * at most 2 fallbacks.
* **Untrusted page data:** crawled text is wrapped in `<page_facts>` and marked as data to ignore instructions from.
* **Rules in every prompt:**
  * use only the supplied facts, else say "unknown – verify";
  * no traffic, rank or revenue predictions unless GSC/GA4 data is supplied;
  * no hidden or JS-injected content;
  * use CMS UI paths first (Yoast field, Elementor widget).
* **New facts sent to the model:**
  * schema types present;
  * alt-text counts;
  * heading outline;
  * first 300 words;
  * CMS/builder detected from HTML markers;
  * the actual HTML snippet of the offending element.
* **Scores are computed in code; the model only writes the narrative.** Remove the `revenue_growth_opportunity` uplift field and the injected fake `top_issues`.
* **Integration tiers add facts:**
  * GSC adds real queries and striking-distance terms;
  * GA4 adds sessions for traffic-ranked fixes;
  * PSI adds the LCP element and opportunities;
  * SerpAPI adds competitor titles and PAA questions;
  * AI engines add who is cited for non-branded questions.
* **Single page:** quoted element + copy-paste fix. **Whole site:** template-level pattern fix across samples.

## 3. Implementation phases (each verified with tests and screenshots)

| Phase | Scope | Effort |
|---|---|---|
| **A. Correctness & safety** | SSRF guard on sitemap fetch; fix GSC resync zero-fill; remove remaining fabrications (GEO, GA4, PSI desktop, GSC inference, AEO defaults); status-0 display; redirect key; drawer false issues; constants; normalize link URLs; mixed-content scripts; sitemap discovery via robots.txt; GA4 zombie logic | 1–1.5 days |
| **B. Scoring engine** | Backend scoring module (tri-state checks, severities, Site Health, categories, page score, integration scores), `/crawls/{id}/summary` endpoint; frontend renders it everywhere (Overview, modal, Executive, Export, Sidebar), deleting duplicate formulas; tests | 2 days |
| **C. Speed** | GZip; Overview key; near-dup bucketing; parse once off the event loop; enrichment after `completed` in parallel with caps; summary vs detail endpoints + delta polling + pagination; lazy-load Naruto/modals/export libs/tabs; virtualized Explorer; duplicate group IDs | 2–3 days |
| **D. Single-page mode** | `Crawl.mode`, `/audits/quick`, toggle UI, mode switcher, hidden site-level checks, page score | 1.5 days |
| **E. AI prompts** | Engine fixes, new prompts, enriched facts, integration tiers, re-grade with ≤ 20 Gemini calls | 1.5 days |
| **F. Integration panels** | Each integration's own panel + score with "not enough data" states; moderate redesign | 2 days |
| **G. Screenshot QA** | Playwright run of every tab in both modes, light and dark, desktop and mobile, against bloomxsolutions.com with the test account; fix visual and UX defects | 1 day |
