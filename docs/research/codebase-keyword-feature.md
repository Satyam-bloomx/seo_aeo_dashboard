# Codebase map: AI keywords/questions + SerpAPI feature

Branch feat/reliability-ux-overhaul, HEAD 5c94e4c. `git status` clean, `git diff` empty, no stash: NO partial work from the stopped agent exists. No keyword/question/SerpAPI-batch files or edits anywhere. Start from scratch.
Paths relative to `backend/app` (BE) and `frontend/src` (FE).

## 1. Existing SerpAPI usage (a single call site)
- Only `services/enrichment_service.py` calls search: `_probe_serpapi_intelligence` (:359-417). `intelligence_service.py` has no SerpAPI code. Key tests: `api/integrations.py:504-514` (`/account.json`, free) and `:1137-1176`.
- Request: GET https://serpapi.com/search.json, params engine=google, q=f"{domain} services and reviews" (:370-374), api_key, num=10, httpx timeout 10s. No gl/hl/location/google_domain params, no retries, no cache. 1 query per crawl.
- Parsing: PAA = `related_questions[].question` (first 6); `has_ai_overview = bool(ai_overview or "Generative AI" in str(data))` (loose, :383); cited = domain substring in `str(source)` of `ai_overview.sources` (:385-386; SerpAPI AI Overview may need a second `engine=google_ai_overview` call via `page_token` when not inline); rank = first organic `link` containing domain (:389-393); `local_pack_present = "local_results" in data`; `featured_snippet_present = bool(answer_box)`.
- Errors: any exception is printed and swallowed (:404); non-200 falls through to fallback dict `is_live_verified False, status "SerpAPI Not Connected"` (:407-417). No quota/429 distinction.
- Key resolution: `EnrichmentService.run` (:75-128) loads `Integration` rows (project_id, connected) then env fallback `SERPAPI_API_KEY` via an ad-hoc object (:127-128). `PromptEngine.resolve_integrations` (`services/prompt_engine.py:428-445`) only env-falls-back gemini/openai/claude (ANTHROPIC_API_KEY), NOT serpapi/perplexity. A new endpoint must resolve serpapi itself (Integration row, else env).
- Storage: result stored once as `audit_data["SERP_Data"]` on the rank-0 HTML page only (:228-232); every other page pops it. `_compute_geo_metrics` (:545-580) derives `GEO_Audit` per page from it. `prompt_engine.py:121-151,226` feeds it into dossiers. `Crawl.summary` is not used for SERP.

## 2. Scoring and card
- `services/scoring.py:628-636` (`integration_scores`, :542): finds first page with `SERP_Data.is_live_verified`; returns `{"status":"insufficient","tracked_keywords":1,"query","rank","reason":"Visibility score needs at least 10 tracked keywords."}` else `{"status":"no_data","reason":"SerpAPI not connected."}`. Result lands in `integrations.serp`.
- Cached: `get_crawl_summary` (`api/endpoints.py:397-434`) caches `crawl.summary["scores"]` for completed crawls keyed by `SCORING_VERSION = "2026.10-4"` (`scoring.py:18`). Changing the serp shape/source requires bumping the version or stale cached scores are served. `integration_data` passed in is `{type: config_json["data"]}` for connected integrations (:423-427), so keyword data could be read from there too.
- FE card: `features/AuditDashboard/ResultsTab/IntegrationScoresPanel.jsx:91-95` (id `serpapi`, "Keyword rankings"; headline `#rank`, line "N keyword tracked"). `no_data` cards collapse into a "connect more" row. Summary arrives via `context/CrawlSummaryContext.jsx` (`useCrawlSummary`). A second, older SERP view lives in `ResultsTab/OverviewTab.jsx:347-370` (`computeSerpData`) and card 2 at :1150-1245 ("AI Engine Citations & SERP Features": AI Overview, PAA, Top Rank) reading `audit_data.SERP_Data` directly; update it too or it will disagree.

## 3. AI visibility probes (overlap)
- `_probe_perplexity_citation` (:279-330): 1 Sonar call/crawl, query "What services ... does {domain} provide", max_tokens 160; cited = domain in `citations`. Stored as `AEO_Audit.Perplexity_*`; scoring :638-646 labels it `ai_visibility` "insufficient, prompts_run 1" (needs 20 prompts x 3 runs). Card "AI answer visibility" (`IntegrationScoresPanel.jsx:96-100`).
- `_probe_gemini_synthesis` (~:420-470): page-level LLM judging 4 booleans (AEO_Criteria), top 5 pages (`idx<5`); `_probe_openai_synthesis` (~:333-358): top 3 pages, only when Gemini gave no score. Both are page-readiness checks, NOT keyword/question visibility. `_compute_aeo_metrics` (~:478-545) assembles `AEO_Audit`. Per crawl: up to 1 Perplexity + 5 Gemini (or 3 OpenAI) + 1 SerpAPI.
- Overlap: Perplexity is the only "AI answer visibility" measure; the new feature (Google AI Overview/PAA per question) supersedes the single SerpAPI branded query and the `serp` card, and could feed the `ai_visibility` card (Google-only, not ChatGPT/Perplexity). Decide whether to keep both.

## 4. Grounding data
- `Page` columns (`models/domain.py`): url, status_code, content_type, indexability(_status), word_count, crawl_depth, title_1, meta_desc_1, h1_1/h1_2, h2_1/h2_2, meta_keyword_1, canonical; `audit_data` JSON(B).
- `audit_data` keys (extractor.py:725-758): `Page_Type` (`classify_page_type`, :243; has `Type`), `Technology` (:757), `Content_Outline {Headings:[{level,text}], Intro_Text (600 chars, :482)}`, `Structured_Data` (:95-120) holds only `Schema_Types` + flags. It does NOT store addresses, org name, city or phone: location/business name must come from title/H1/intro, the Google Business integration (`integration_data["google_business"]`: place_id, rating), or user input.
- Grounding templates to copy: facts block in `_probe_gemini_synthesis` (`enrichment_service.py` ~:425-440) and `AuditDossierBuilder.build_page_dossier` (`prompt_engine.py:56-152`; `_clean` :43; `CORE_RULES` :238; wrap page data as untrusted).
- Crawl summary keys: request, settings, phase, coverage, helper, ai_crawlers, scores, executive_summary (`_crawl_facts`, endpoints.py:437-458).
- LLM JSON: `PromptEngine.execute_llm_json(system_prompt, user_prompt, integrations, max_output_tokens=2500, response_schema)` returns `(ok, powered_by, dict)` (`prompt_engine.py:448-469`); order via `ai_provider_order` (:394-409; workspace-connected first, env fallback); runners `_json_gemini/_json_openai/_json_claude` (:471-581); failure reason in `_AI_FAILURE` ("rate_limited:<s>", "unavailable", "error"). Schemas are Gemini-style uppercase (`{"type":"OBJECT",...}`) in `JSON_SCHEMAS` (:322-351); add a "keywords" entry. Pattern to copy: `/audits/ai-executive-summary` (`endpoints.py:685-772`): builds lines, calls LLM, caches in `crawl.summary`, returns `_ai_off_response` when no AI.

## 5. Storage constraints
- One stored crawl per workspace: `replace_previous_crawls` (`endpoints.py:91-100`, invoked :199) deletes other non-running crawls when a new one completes. Anything in `Crawl.summary` / `Page.audit_data` is LOST on re-crawl; `intelligence_service.py:289-290` also strips `scores`.
- `Crawl.summary` merge pattern `{**old, key: val}` + `flag_modified` (endpoints.py:431, 743; crawler.py:917; post_processor.py:542). Fine for per-crawl results (e.g. `summary["keyword_research"]`), like `executive_summary`.
- Survives re-crawls with no migration: an `Integration` row (`models/domain.py:190-210`; unique (project_id, integration_type); `config_json` JSON(B)); `Project` has only id/name/user_id/created_at (no JSON column). Options: (a) keyword list + last results in `config_json` of the `serpapi` row; (b) new `integration_type` e.g. "keyword_tracking", `connected=True`, `config_json["data"]` so `integration_data` (endpoints.py:423-427) sees it; then add to `SUPPORTED_SERVICES` (`api/integrations.py:122-132`) and check list/status endpoints. Caveats: disconnect DELETES the row (integrations.py:2078-2109) so (a) loses data on SerpAPI disconnect; `/me/data` wipes all (endpoints.py:984-1000); config_json writes elsewhere copy dict then `flag_modified`: do the same. DB is remote Supabase: avoid new tables without approval.

## 6. Rate limit, auth, nav
- `core/rate_limit.py`: `rate_limit(bucket)` dependency, in-memory per user, buckets `crawl` 30/h, `ai` 60/h, `integration_sync` 60/h (:15-19); env override `RATE_LIMIT_<BUCKET>=n/seconds`. Add a bucket (e.g. `serp`, ~10/h): each run costs ~20 paid searches; single-instance only.
- Auth/ownership: `get_current_user` -> `UserSession`; `get_user_project_id(db, user)` (`core/auth.py:110`); `_owned_crawl` (`endpoints.py:34`), `_latest_completed_crawl` (:678). Never trust `project_id` in bodies (existing code sets `req.project_id = await get_user_project_id(...)`).
- FE nav: `features/AuditDashboard/Sidebar/Sidebar.jsx:50-66` (overview, issues, explorer, performance, integrations); mobile bottom bar `AuditDashboard.jsx:1978-1982`; tab content branches `activeTab === ...` at `AuditDashboard.jsx:1463,1496,1577,1593,1608`; `activeTab` state :183, `handleTabChange`. A new `keywords` tab needs all three. API client `api/client.js` (e.g. `ai-executive-summary` at :75).

## Risks / constraints
1. Cost: ~10 keywords + 10 questions = 20+ paid searches (plus AI Overview follow-ups): user-triggered, rate-limited, cached with timestamp, never auto-run per crawl.
2. Fix loose matching: compare registrable-domain host, not substring of `str(source)`; handle `ai_overview.page_token`; set gl/hl/location (local pack needs location).
3. Bump `SCORING_VERSION` if serp scoring changes; update OverviewTab SERP card too.
4. Persist outside `Crawl`/`Page` (wiped on re-crawl) or re-attach.
5. Resolve serpapi key manually (env fallback missing in `resolve_integrations`); degrade gracefully with no AI/SerpAPI (`_ai_off_response`).
6. Prompt injection: crawled text is untrusted (`_clean`, `CORE_RULES`).
7. No address/business name captured: take location from user input or GBP.
8. Test patterns in `backend/tests` (test_scoring.py, test_ai_and_settings.py).
