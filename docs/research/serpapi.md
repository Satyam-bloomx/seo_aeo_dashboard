# SerpAPI research for keyword/question tracking (as of 2026-10-31)

Method: official SerpAPI doc pages fetched via WebFetch (summaries by a small model, so treat quotes as paraphrase; re-verify before coding), plus web search. Items marked [UNCONFIRMED] could not be verified from an official source.

## 1. Google Search API parameters
Source: https://serpapi.com/search-api
- q (required, supports site:/inurl:). location (city-level recommended; cannot combine with uule/lat/lon; pair with gl). gl = 2-letter country; hl = language; google_domain (default google.com); device = desktop|tablet|mobile; start = offset (0,10,20...); no_cache; async.
- The search-api page does NOT document `num`. Pagination = `start` plus `serpapi_pagination.next` links.
- India: gl=in is supported (https://serpapi.com/google-countries). Locations API is free (https://serpapi.com/locations-api). I queried https://serpapi.com/locations.json?q=Pune and ?q=Jaipur: canonical names "Pune,Maharashtra,India", "Jaipur,Rajasthan,India" (target_type City). Use canonical_name or id as `location`.
- num=100 removal: Google stopped honouring num=100 around Sept 2025 (https://dataforseo.com/update/google-organic-serp-api-critical-updates-depth). SerpAPI blog (Sept 16 2025, updated Dec 4 2025): num "more often than not" returns 10 organic results; 100+ still reachable by pagination but "generates additional costs" (https://serpapi.com/blog/google-experiments-with-restricting-results-per-page/). SerpAPI's `google_light_fast` num=100 workaround was DISCONTINUED because Google limits that endpoint to 3 organic results (https://serpapi.com/blog/solution-to-scrape-100-search-results-on-google-google-fast-light-api.md). A SerpAPI test found only ~8 organic results on a default page (https://serpapi.com/blog/minimum-amount-of-results-per-page-across-serpapis-supported-google-engines.md), so pages are not a clean 10.
- Credits to check positions 1-100: no official figure found. Assuming each `start` page is 1 successful search, depth 100 = ~10+ searches. [UNCONFIRMED: no SerpAPI doc states per-page cost; official pricing says only successful searches count and result count per response does not affect usage: https://serpapi.com/pricing]. Third-party claims of "5-25 credits per Google search" contradict the official pricing page; ignore.

## 2. AI Overview
Sources: https://serpapi.com/ai-overview, https://serpapi.com/google-ai-overview-api, https://serpapi.com/blog/understanding-ai-overview-data-from-serpapi.md
- Inline: when Google includes it in the SERP, it is in `ai_overview` of the normal google response.
- Follow-up: otherwise `ai_overview` has `page_token` + `serpapi_link`; call `engine=google_ai_overview&page_token=...`. Same JSON shape as inline. Frequency of inline vs token is not published (token mostly for "less common or more complex queries").
- Token expiry: 1 minute (official doc pages). One search-summary cited "~4 minutes" from another SerpAPI article; assume 1 minute. Use immediately; no_cache=true recommended on both calls to avoid stale/expired tokens.
- Credit cost: follow-up is a second API call and "counts as two SerpApi searches" in total (SerpAPI blog above). Engine doc page states no cost. Cached (1h) calls are free.
- Fields: text_blocks (paragraph/heading/list/expandable/comparison/table), reference_indexes -> `references[]` {title, link, snippet, source, index}. `error` possible ("Can't generate an AI overview right now"). json_restrictor=ai_overview trims payload.
- India reliability: SerpAPI states "Currently, the AI Overview block is only seen for English searches (hl=en) with a limited range of countries (gl)"; countries not listed, India not mentioned. [UNCONFIRMED for gl=in; test empirically. hl=hi likely returns none.]
- Citation check: match client domain against host of references[].link.
- AI Mode: yes. `engine=google_ai_mode`, q required; location/uule, gl, hl, device, no_cache; returns text_blocks, references (title, link, snippet, source, index), related_questions, shopping_results; follow-ups via continuable=true + subsequent_request_token. Credit cost not stated; supported gl/hl not listed. https://serpapi.com/google-ai-mode-api

## 3. People Also Ask
Sources: https://serpapi.com/search-api (sample), https://serpapi.com/google-related-questions-api
- `related_questions[]` in the google response: question, type, snippet, title, date, link, next_page_token, serpapi_link (sample). Some answers are type ai_overview with text_blocks/references.
- Expand: `engine=google_related_questions&next_page_token=...`. Cost not stated; presumably 1 search each [UNCONFIRMED].

## 4. Local pack vs Maps
Sources: https://serpapi.com/google-local-api, https://serpapi.com/google-maps-api, https://serpapi.com/search-api
- Google engine local pack: `local_results.places[]` (sample): position, rating, reviews, price, place_id, gps_coordinates, title, type, address; plus more_locations_link. Comes in the same search (no extra credit stated). Usually ~3 places; match by place_id or title. Website not shown in sample [UNCONFIRMED].
- `engine=google_local`: local_results with position, title, place_id, place_id_search, provider_id, gps_coordinates, address, hours, rating, reviews; `ludocid` lookup by CID.
- `engine=google_maps`: type=search, q, ll=@lat,lon,zoom (or location/lat/lon + z/m), hl, gl (gl only affects Place Results); start offsets 0,20,40; SerpAPI recommends max offset 100. Fields: position, title, place_id, data_cid, gps_coordinates, rating, reviews, address, phone, operating_hours. Website not confirmed in the list sample [UNCONFIRMED]; use type=place&place_id=... (extra search).
- Match client business: prefer place_id/data_cid (from client's GBP), else fuzzy title + phone/address.
- Geo-grid feasible by varying `ll` per point; assume 1 search per point (3x3 = 9, 5x5 = 25 per keyword). Expensive; keep opt-in.

## 5. Pricing and limits
Source: https://serpapi.com/pricing
- Free 250/mo, 50/hr, no Legal Shield. Starter $25 = 1,000/mo, 200/hr. Developer $75 = 5,000, 1,000/hr. Production $150 = 15,000, 3,000/hr (Legal Shield). Big Data $275 = 30,000, 6,000/hr. Searcher $725 = 100k, 20k/hr. Larger Cloud tiers up to millions. Ludicrous Speed 2x/4x price.
- Per search: Starter $0.025, Developer $0.015, Production $0.010, Big Data ~$0.0092, Searcher $0.00725.
- Only successful searches count; cached (same query + all params, 1h) and errored searches free. no_cache=true forces a fresh, billable fetch.
- Third-party sites list different plans/free quota (e.g. 100 free); official page says 250.

## 6. Alternatives (for later decision)
- DataForSEO (https://dataforseo.com/pricing/serp/google-organic-serp-api): per 10-result SERP Standard queue $0.0006 ($0.60/1k), Priority $0.0012, Live $0.002 ($2/1k). Depth billed per extra 10 results (100 = 10x). AI Overview block +1 base price (2x). AI Mode SERP API (https://dataforseo.com/pricing/serp/google-ai-mode-serp-api): Standard $0.0012, Live $0.004 per request, returns answer + citations. Pay-as-you-go.
- Serper.dev: ~2,500 free queries; packs from ~$50/50k ($1.00/1k) down to ~$0.30/1k; 1 credit up to 10 results, 11-100 = 2 credits (third-party: https://apiserpent.com/blog/serper-pricing-credits-explained). Its /pricing URL returned 404 for me; AI Overview support and current prices [UNCONFIRMED].
- ValueSERP / Scale SERP (Traject Data): conflicting reports ($0.50-$2.50/1k PAYG; https://costbench.com/software/ai-search-apis/valueserp/). AI Overview support unconfirmed.

## Recommended request strategy (per tracked item)
1. One google search per keyword/question: gl=in, hl=en, location=<client city canonical_name>, device=desktop. Returns organic page 1, related_questions, local pack, inline AI Overview. 1 credit.
2. If ai_overview.page_token present: immediately call google_ai_overview (+1 credit); use no_cache=true on the primary search when you intend to follow up.
3. Organic depth: if client not on page 1, fetch start=10, 20 (+1 each); stop at page 3. Full top-100 ~10 credits; avoid.
4. Local-intent terms only: google_maps type=search with ll at client location (+1; 3x3 grid +9, opt-in).
5. PAA expansion: skip by default.
Typical 1-2 credits per item, worst case ~4; 20 items = 20-40 credits per audit. Free plan (250) = ~6-12 audits/month; Developer ($75/5,000) = ~125-250 audits.
