# Semrush data sources and backlink options (research, 2026-10-31)

Scope: decide build vs buy for backlink data in our internal SEO audit app (small team, India, VPS-hosted).
Method: web searches only (summaries of official and third-party pages). Anything not seen on an official page is tagged [UNCONFIRMED]. Prices change often; re-check the vendor pricing page before buying.

## 1. How Semrush produces its data

| Item | What is known | Confidence |
|---|---|---|
| Backlink index | Semrush's own backlink pages claim ~43 trillion links, 800M+ domains, ~10B pages crawled per day (semrush.com/features/backlink-analysis). A product page gives 43.8T links / 1.6B referring domains. A third-party comparison (DataForSEO blog) shows ~651M referring domains, so RD counts are inconsistent across sources. | Vendor marketing numbers, [UNCONFIRMED] independently |
| Crawler | SemrushBot (own crawler; robots.txt user agent). Index is built from its own crawl, not from licensed data. | Official (Semrush KB "how are backlinks updated") |
| Refresh | Claims "updated continuously"; a product page says database updates within every hour. Another article says the UI layer refreshes every 15 min. These likely describe different pipeline layers. | [UNCONFIRMED] |
| Authority Score (AS) | Proprietary 0-100 score of domain/page strength, built from link quantity and quality (referring domains, link authority) plus traffic signals. Exact formula is not published. A third-party review lists traffic estimate, total backlinks and "span factor". | Formula [UNCONFIRMED] |
| Keyword volume | Semrush KB (kb/683-search-volume): takes data sets from third-party providers and overlays them with historical clickstream data from other sources, via ML models. National level in main DB; local level in Keyword Overview. Mobile + desktop combined. It is a modelled estimate, not a Google number. | Official (high-level only) |
| Keyword Difficulty | 0-100 score for ranking in top 10. Inputs per Semrush's methodology PDF: median referring domains and median Authority Score of top-ranking URLs, plus volume, with a weighting for regional databases. Full formula not retrieved. | Partly official, formula [UNCONFIRMED] |
| Position Tracking | Semrush runs scheduled SERP checks for a project's keywords/locations/devices (i.e. it scrapes SERPs; same idea as our SerpAPI checks). Official doc not retrieved. | [UNCONFIRMED] |
| Traffic Analytics / competitor traffic | Modelled estimates from clickstream panel data plus third-party sources, ML, and referring-domain data. Not measured analytics; accuracy is weakest for small sites. | Third-party descriptions only, [UNCONFIRMED] |

Takeaway: Semrush's moat is (a) a huge self-run crawler/index and (b) licensed clickstream panels. Neither is reproducible by us. What we can reproduce: rank tracking (SerpAPI, already built), real traffic (GSC/GA4 for owned sites).

Sources: semrush.com/features/backlink-analysis, semrush.com/kb/77-how-are-backlinks-updated, semrush.com/kb/683-search-volume, static.semrush.com KD methodology PDF, dataforseo.com/blog/backlink-api-comparison-dataforseo-ahrefs-semrush.

## 2. Building our own backlink index: realistic?

No. Rough engineering estimates (our own, not sourced) [UNCONFIRMED]:
- A useful index needs tens of billions of pages crawled and re-crawled. At 1B pages/month, you need ~400 pages/sec sustained, plus DNS, dedupe, politeness, JS-free parsing and link extraction. Realistically 10+ crawl nodes and multi-Gbps egress; far beyond a Hostinger VPS.
- Storage: ~10-50 TB of link edges for even a modest index (each edge = source URL, target URL, anchor, rel, first/last seen). Plus a graph/columnar store (ClickHouse-class) and ongoing ops.
- Cost: low-to-mid five figures USD per month in cloud plus 1-2 dedicated engineers. Versus ~$0-$10/month for API data on 50 domains.
- Link graphs are only valuable at scale; a small index misses most links and would mislead clients.
- Partial alternative that IS feasible: use Common Crawl as the "free index" (see 3.1) and crawl only our own client sites and a short list of competitors for verification (checking that a link still exists, anchor, rel=nofollow/sponsored/ugc).

## 3. Realistic backlink data sources

### 3.1 Free / own-site

| Source | Access | Limits and quality | Integration |
|---|---|---|---|
| Google Search Console Links report | UI only. Official docs: Search Console API covers Performance data only; bulk export to BigQuery is Performance only. No Links API found. | Own verified sites only. Manual CSV export ("Export external links": top linking sites, top linked pages, top anchor text). Sampled/capped (about 1,000 rows per table, [UNCONFIRMED]). Best accuracy for own site, since it is Google's data. | Manual: team uploads CSV into app (parse and store). No automation possible. |
| Bing Webmaster Tools API | Official, legacy IWebmasterApi: GetLinkCounts (pages with inbound-link counts, paged) and GetUrlLinks (inbound links for one URL). REST at ssl.bing.com/webmaster/api.svc/json/..., `apikey` query param, site must be verified in Bing WMT. | Own sites only; Bing's index is smaller than Google's; counts differ. Whether Microsoft still maintains these endpoints should be confirmed [UNCONFIRMED]. Free. | Per-site API key from Bing WMT settings. Simple GET calls, fits our existing integrations pattern. Good free automated source for owned sites. |
| Common Crawl web graph | Free downloads (commoncrawl.org). Latest release found: May-Jun-Jul 2026 (announced 2026-07-28): host graph 240.4M nodes / 3.7B edges; domain graph 118.0M nodes / 2.8B edges; includes ranks file (harmonic centrality + PageRank), 4.5 GiB host-ranks file. Earlier: Jun-Aug 2025 host 691M nodes / 5.0B edges, domain 207.6M / 3.9B. | Quarterly-ish releases, so freshness 1-3 months. Domain/host level only (no URLs, no anchor text, no nofollow). Node counts vary a lot between releases, so coverage is inconsistent. Good for: "which domains link to domain X", plus a free authority proxy (harmonic centrality). | Download the domain-level edges + vertices files (a few GB compressed), load into SQLite/DuckDB/Postgres once per quarter, index by target id. Querying referring domains is then a local join. Cost: disk + a one-off ETL job. Alternative: query via Athena/BigQuery (paid per scan). Exact file sizes for 2026 not verified [UNCONFIRMED]. |
| Moz Links API free tier | Free key at moz.com/products/api; sources say 50 rows/month and ~1 request per 10 s; some conflict (10 requests/month; card required or not). Paid reported ~$20/mo for 3,000 rows, Growth $125-500, Advanced $2,000+. Official pricing page not reachable. | Domain Authority, Page Authority, spam score, linking root domains, top pages. Free tier is too small for more than ~a handful of lookups. | HTTP Basic auth (Access ID + Secret key), JSON endpoints (url_metrics, linking_root_domains, anchor_text). |
| OpenPageRank | Free key at openpagerank.com; API-OPR header; /getPageRank takes up to 100 domains per request. Quota: 30,000 checks/month per one listing, 10,000 calls/hour per one Apify README; official quota only in dashboard [UNCONFIRMED]. | Domain-level 0-10 rank derived from Common Crawl + other data. Authority proxy only; no link lists. | GET with header, trivial to integrate. Useful to rank referring domains by quality at zero cost. |
| Others | Own-site crawler (already built) can verify known links; Wayback/CDX not useful for backlinks. | | |

### 3.2 Paid

| Provider | Access and price | Backlink coverage | Notes |
|---|---|---|---|
| DataForSEO Backlinks API | Pay-as-you-go. Official pricing update says the monthly minimum was removed; official pricing page lists min top-up $50, no expiry. Backlinks live pricing: $0.024 per request + $0.000036 per row. Older help pages still mention $100/month minimum, so verify at dataforseo.com/pricing/backlinks/backlinks. | Summary, backlinks list, referring domains, anchors, domain pages, competitors, domain intersection (link gap), bulk metrics up to 1,000 domains per request, history, new/lost timeseries. `new_lost_summary` endpoint name [UNCONFIRMED]. | Basic auth (login + password), REST/JSON, async or live. Own index (own crawler). Best value for us. |
| Ahrefs API v3 | Direct API now on all paid plans from Lite (changelog 2026-05-13, per cloro.dev Oct 2026); units included per plan; buying more units Enterprise only; some endpoints Enterprise-only. Plan prices ~ Lite $129+/mo [UNCONFIRMED]; unit allowances conflict between sources. | Best-in-class backlink index and metrics (DR, UR, anchors, new/lost, link intersect). | Bearer token. Needs a paid Ahrefs plan we may not otherwise want. Check help.ahrefs.com/en/articles/6559232-about-api-v3. |
| Majestic API | API plan ~$399.99/mo (100M analysis units); Lite $49.99 and Pro $99.99 reportedly have no full API [UNCONFIRMED, third-party sources]. | Trust Flow / Citation Flow, fresh + historic index, anchors. | Too expensive for 50 domains. |
| Semrush API | Needs Business/"Advanced" tier (~$450-550/mo, name and price conflicting) plus API units bought separately; Backlinks endpoint 40 units per line (v4 early access: 45/40). Unit price reported $20-50 per million, or custom [UNCONFIRMED]. | Large index; Authority Score. | Plan cost dominates. Not sensible unless we already pay for Semrush. |
| SE Ranking Data API | Pay-as-you-go $50 per 250K credits (~$0.0002/credit); enterprise from ~$30/1M credits; free trial 100K credits. Backlink endpoints mostly 0 per-request + 1-100 credits per record (summary: 100 credits/record). Third-party sources quote differing annual plans [UNCONFIRMED]. | Summary, backlinks, referring domains, anchors, authority endpoints. | API-key bearer token. Comparable to DataForSEO; mid-size index. Official: seranking.com/api-pricing.html. |

### Cost estimate: ~50 domain lookups per month

Assumed per domain: 1 summary, 1 referring-domains page (100 rows), 1 anchors page (100 rows), 1 backlinks sample (100 rows), 1 new/lost or history call. About 5 requests and ~300 rows. All figures are our arithmetic from the rates above.

- DataForSEO: per request $0.024 + rows. 5 x $0.024 = $0.12; rows 300 x $0.000036 = $0.011; ~ $0.13 per domain; 50 domains = ~$6.5/month. Bulk metrics (up to 1,000 domains/request) is far cheaper for plain authority counts. Initial $50 top-up lasts ~7 months at this rate.
- SE Ranking: summary 100 credits = ~$0.02 per domain; with referring domains/anchors/backlinks pages maybe $0.10-0.20 per domain, so ~$5-10/month. $50 top-up needed [UNCONFIRMED per-record credit costs for each endpoint].
- Moz: free tier (50 rows) covers only ~1-5 domains; $20/mo plan covers ~3,000 rows = ~10 domains at 300 rows each; 50 domains needs ~15,000 rows, likely the $125+ tier.
- Semrush: 50 x 100 lines x 40 units = 200K units (~$4-10 in units) but the ~$450-550/mo plan is the real cost.
- Ahrefs: roughly $129+/mo plan fee; units probably sufficient but price is the plan [UNCONFIRMED].
- Majestic: $399.99/mo for API.

## 4. Metrics worth showing in an agency audit, and who supplies them

| Metric | Why it matters | Source options |
|---|---|---|
| Referring domains (count, trend) | Core link-profile health | DataForSEO summary/history; Bing (own site); Common Crawl domain graph (free approximation) |
| Total backlinks, dofollow vs nofollow/sponsored/ugc | Quality mix | DataForSEO, SE Ranking; GSC CSV does not split rel |
| New and lost links/domains (30/90 d) | Shows momentum and link loss | DataForSEO timeseries/history; Common Crawl diffing two releases (domain level only, coarse) |
| Top referring domains with authority | Who really links | DataForSEO + OpenPageRank/Common Crawl harmonic centrality; GSC top linking sites |
| Anchor text distribution (branded/exact/generic/naked) | Over-optimisation signal | DataForSEO anchors; GSC top anchors (own site); Moz |
| Top linked pages | Which content earns links; 404-with-backlinks (reclaim) | GSC, Bing GetLinkCounts, DataForSEO domain pages; join with our crawler's 404 list for reclamation |
| Toxic/spam signals | Disavow candidates | No source gives a reliable "toxic" flag. Compute heuristic ourselves: low OpenPageRank, spam TLDs, link-farm patterns (many links from one IP/C-block via DataForSEO referring IPs), exact-match anchor spikes, Moz spam score. Label as "review", not auto-disavow (Google says it mostly ignores spam links) [UNCONFIRMED]. |
| Competitor gap (domains linking to competitors but not us) | Link-building to-do list | DataForSEO domain intersection; or compute locally from Common Crawl graph |
| Authority score of site vs competitors | Benchmarking | DataForSEO rank, Moz DA (limited), OpenPageRank, CC harmonic centrality |
| Link verification (still live, rel, anchor) | Quality control for purchased/outreach links | Our own crawler, fetch the source URL |

## 5. Recommendation (cheapest reliable stack)

Tier 0, free, build first (a few days of work):
1. Bing Webmaster API for owned sites (inbound link counts per page, top linked pages) automated.
2. GSC Links CSV import (manual upload, parsed and stored per site per month) for top linking sites, anchors and linked pages. Document it as a monthly manual step.
3. OpenPageRank key to score referring domains (batch 100 per call).
4. Common Crawl domain-level graph loaded quarterly into the app database (or DuckDB file): free referring-domain list and harmonic-centrality authority for any domain, including competitors. Coarse and 1-3 months stale; label it "indicative".
5. Reuse the existing crawler to verify top links and flag 404 pages that have backlinks.

Tier 1, paid, add when clients need competitor and new/lost data: DataForSEO Backlinks API on a $50 top-up (~$6-10/month for our volume). Cache results per domain per 30 days in our DB to stay near that figure; use bulk metrics for competitor lists; call domain intersection only on request. Confirm on the pricing page that no monthly minimum applies before topping up (conflicting pages exist).

Avoid for now: Semrush API, Majestic API, Ahrefs (plan cost far above need). Revisit Ahrefs only if the agency buys it for the team anyway. SE Ranking Data API is a reasonable second source if DataForSEO quality disappoints. Moz free tier is fine only as a DA cross-check for a few domains.

Do not build a crawler-based backlink index.

Suggested integration shape: one `BacklinkProvider` interface with implementations (bing, gsc_csv, cc_graph, dataforseo), results normalised into a `backlink_snapshot` table (domain, source, referring_domains, backlinks, fetched_at, raw JSON), and a source/confidence label shown in the UI.

## Sources
- DataForSEO: dataforseo.com/pricing/backlinks/backlinks, dataforseo.com/update/pricing-update-in-dataforseo-apis, docs.dataforseo.com/v3/backlinks-overview/, dataforseo.com/backlinks-data-api, dataforseo.com/blog/backlink-api-comparison-dataforseo-ahrefs-semrush
- Semrush: semrush.com/features/backlink-analysis, semrush.com/kb/77-how-are-backlinks-updated, semrush.com/kb/683-search-volume, developer.semrush.com/api/basics/api-units-balance/
- Ahrefs: help.ahrefs.com/en/articles/6559232-about-api-v3; cloro.dev/comparisons/ahrefs-api-alternatives/ (third-party)
- Majestic: majestic.com/help/subscriptions and third-party 2026 pricing roundups
- SE Ranking: seranking.com/api-pricing.html, seranking.com/api/data/getting-started/
- Moz: moz.com/products/api/pricing (not directly reachable), toolsurf.com 2026 articles (third-party)
- Google: developers.google.com/search/blog/2020/02/data-export, support.google.com/webmasters (Exporting data)
- Bing: learn.microsoft.com IWebmasterApi.GetLinkCounts / GetUrlLinks
- Common Crawl: commoncrawl.org/blog/host--and-domain-level-web-graphs-may-june-and-july-2026
- OpenPageRank: openpagerank.com (dashboard for quota), jentic.com listing (third-party)
