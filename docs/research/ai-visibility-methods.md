# AI visibility / keyword + question tracking: industry methods (researched 2026-10-31)

Evidence quality note: most sources are vendor docs, vendor blogs and review sites. Items marked (unverified) were not confirmed against a primary source.

## 1. How tools work
- Profound: runs every tracked prompt daily; prompts come from its own prompt dataset (clustered by topic) or are user-uploaded; visibility = share of responses where brand appears (5/10 = 50%). Its docs are internally inconsistent on SoV and weighting. https://help.tryprofound.com/articles/3443229936-answer-engine-insights-overview , https://tryprofound.com/blog/introducing-the-profound-index
- Peec AI: visibility = share of tracked prompt runs where brand appears; SoV = brand mentions / all tracked-brand mentions; competitors auto-suggested after 2+ co-mentions; daily reruns (third-party claim); entry plan ~25 prompts, up to 3 engines selectable (reviews, pricing may be stale). https://peec.ai/ai-instructions , https://visible.seranking.com/blog/peec-ai-review/
- Otterly.AI: brand coverage = % of tracked prompts where brand appears; SoV (mentions) = % of total mentions vs competitors; link citations tracked (reportedly weekly); API-based (reviewer claim, unverified). https://help.otterly.ai/insights-on-brand-reports
- Rankscale: prompt groups tagged by branded/non-branded, intent (info/consideration/transaction) and scope (segment/geo); example 3x2x2 = 12 prompts per segment across 2-3 engines. https://rankscale.ai/resources/modules/setting-up-prompt-groups/branded-vs-non-branded
- SE Ranking prompt research uses five categories; Superlines four intent categories; both advise a lean, fixed set. https://visible.seranking.com/prompt-research/ , https://www.superlines.io/articles/what-prompts-to-track-for-ai-search
- (Not covered with public methodology in this pass: Semrush AI Toolkit, Ahrefs Brand Radar, Scrunch, Athena. Ahrefs MCP needs auth.)

## 2. Metrics
- Common core: visibility / coverage % (presence rate), SoV (mention share vs competitors), citation rate / source-domain counts, sentiment, average position. Definitions differ by vendor (SoV denominators differ even within Otterly), so define our own explicitly.
- Practitioner-endorsed: presence rate across many runs. SparkToro/Gumshoe study: identical brand lists repeat in <1 in 100 runs, order is even less stable, but visibility % across many runs is stable enough; Fishkin warns against tools without published statistics. https://searchengineland.com/ai-recommendation-lists-rarely-repeat-study-468076 , https://www.searchenginejournal.com/ai-recommendations-change-with-nearly-every-query-sparktoro/566242 (exact run counts per prompt unconfirmed; one source says 60-100).
- Position in a narrative AI answer is weak/unstable; prefer presence + cited yes/no.

## 3. Generating sets
- Build from topics and buyer stages, not keyword lists; split branded vs non-branded and report separately; branded prompts almost always surface the brand (vanity). Non-branded category/problem questions are the real test. https://www.conductor.com/academy/ai-prompt-tracking/ , https://www.jasper.ai/blog/branded-vs-non-branded-prompts
- Sets should be small, fixed and intentional; no universal sample size exists. Stability comes from repeated runs, not more near-duplicate prompts.

## 4. Pitfalls
- AI Overview volatility and weak organic overlap: Ahrefs ~38% of AIO citations in organic top 10, BrightEdge ~17%; ~30% of cited domains not on page one at all (arXiv longitudinal, 55k queries/40 days). AIO shows on ~21% of keywords, ~all informational (Ahrefs 146M SERPs). https://arxiv.org/html/2605.14021v1 , https://apiserpent.com/blog/ai-overview-citations-vs-rankings-overlap
- Personalization/location, prompt wording sensitivity, cost growth (prompts x engines x runs x days). Vendors cap plans (e.g. 25 prompts / 2,250 answers per month).
- Hallucinated citations: my search did not return a source; general knowledge says API answers without web search can fabricate URLs, so only count citations from search-grounded responses and verify domain/URL (unverified).
- SerpAPI: google engine returns local pack (local_results), PAA (related_questions), ai_overview when present; google_maps gives fuller local list; location needs exact names (secondhand, check docs). AI Overview may need a follow-up call by page token (verify).

## 5. Local
- Local Falcon: geo-grid scans; ARP = average over points where found in top 20; ATRP = average over all points (not found = 20+); SoLV = share of grid points in top 3. Grid costs scale 5x5=50, 7x7=98, 9x9=162 credits. https://localfalcon.com/knowledge-base/kb25-what-does-arp-atrp-mean
- BrightLocal offers both single-point Local Rank Tracker and Local Search Grid. https://www.brightlocal.com/resources/geo-grid-ranking-tool-comparison-guide/
- Lightweight v1: single-point (business city centre) map-pack rank via SerpAPI with explicit location; optional later 3x3 grid for key terms only.

## Recommended v1 methodology
- 10 keywords + 10 questions; label each by intent, branded flag, local flag.
- Intent mix (non-branded >= 80%): category/service 35%, problem/how-to 25%, comparison/alternatives 15%, local ("near me"/city) 15%, brand 10% (reported separately).
- Google (SerpAPI): 1 run per query with fixed location/device/language (organic is comparatively stable); AIO and PAA are volatile so show as presence flags, re-check weekly/monthly.
- AI engines (optional): 3 runs per question on 1-2 engines (Perplexity first, search-grounded), report presence as k/3; not scores to one decimal.
- Metrics: organic rank (top3/top10 buckets), AIO cited Y/N, PAA owned Y/N, local pack rank, AI mention rate, AI citation rate, competitor mentions (top 3). Sentiment and avg position optional/low trust.
- Weights (non-branded only): organic 30, AI/AIO citation+mention 35, PAA 10, local pack 25 if local business (else redistribute). Show confidence label ("directional, 20 queries").
- Cost cap: ~20 queries x 3 runs x 1 engine = 60 calls per audit.
