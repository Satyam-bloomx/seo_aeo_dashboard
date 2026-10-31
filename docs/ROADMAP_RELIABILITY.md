# AuditPro reliability roadmap: 99% crawl success on a Hostinger VPS with Coolify

Goal: every page a human can open in a browser ends up audited, for at least **99% of pages**, without overloading the VPS and without bypassing any site's security.

## What "99% success" means (so we can measure it)

- **Page success rate** = pages that end with usable audit data (from any route below) ÷ pages discovered within the crawl limits. Target ≥ 99% per crawl, averaged over a fixed benchmark set.
- **Crawl success rate** = crawls that finish with results (not "failed") ÷ crawls started. Target ≥ 99.5%.
- **Our-side failures never lower a site's score**; site-side failures (404, 5xx, broken TLS) do.
- Benchmark set (re-run after every phase): books.toscrape.com (static store, 1,000 pages), sandbox.oxylabs.io (Next.js store), crawler-test.com (known errors), python.org (organisation), react.dev (JavaScript docs), wordpress.org/news (blog), bloomxsolutions.com (WordPress service), plus 2-3 real client sites behind Cloudflare.

Honest note: the server crawler alone cannot reach 99% on sites with strict bot protection. 99% overall relies on the helper extension (Phase 4) and the Google-data fallback (Phase 3) for those sites.

## Hosting facts this plan is built around

- Coolify deploys `docker-compose.yml` on the Hostinger VPS: `frontend` (limit 1 CPU / 1 GB), `backend` (2 CPU / 3 GB, `shm_size: 1gb` for Chromium), `postgres` (container with a volume on the VPS disk), `redis`.
- **Production crawl data lives in the VPS Postgres container**, not Supabase (Supabase is used for sign-in; the development `.env` points the database at Supabase). Storage = VPS disk, so storage size matters directly.
- Coolify adds ~1-2 GB of its own memory use. Hostinger KVM plans: KVM 2 (2 vCPU / 8 GB), KVM 4 (4 vCPU / 16 GB), KVM 8 (8 vCPU / 32 GB). Recommended: **KVM 4** for 3 normal + 1 JavaScript crawl at once with headroom; KVM 2 works with 2 + 1.
- The VPS has a fixed public IP: that is the IP clients allowlist.

## Phase 1: Storage (code done; migration pending)

- Links stored as JSON on each page instead of one row per link; duplicate indexes dropped. 500-page crawl: ~110 MB of link data → ~4 MB.
- One crawl kept per account, replaced only when the new crawl succeeds.
- Page limit 1,000 per crawl (env `MAX_CRAWL_PAGES`).
- AI report summary stored with the crawl (same text on every device, one AI call per crawl).
- **Pending:** run migration `e5f6a7b8c9d0` on the development database (Supabase) and on production (VPS Postgres) before deploying this code. Do not restart a backend on the new code until its database is migrated.
- Later: drop the unused `links` table once the new path has run in production for a week.

## Phase 2: Crawler reliability and speed (in progress)

- Crawl queue with fixed slots across the server: `CRAWL_SLOTS` (3) normal + `JS_CRAWL_SLOTS` (1) JavaScript; users see their queue position.
- Retries: deferred, never blocking, max 2 retries per URL (attempt 1 → parked → retry after ≥10 s → retry after ≥30 s → dead-letter list with reason). Permanent errors (404, robots-blocked, NXDOMAIN, bad TLS) never retried.
- Circuit breaker: >20% failing or 10 in a row → stop retrying, mark "site unreachable or blocking", one alert.
- Failure attribution: only site-side failures count in the score; our-side and unknown are listed as "not counted".
- JavaScript rendering: load + short idle grace (fixes random failures), one shared browser with a tab pool, plain-HTTP fallback.
- Adaptive politeness instead of fixed pauses; bot-protection detection (Cloudflare, Akamai, DataDome, PerimeterX, Imperva).
- Speed target: **1,000 pages in ≤ 3-4 minutes** for normal crawls on a responsive site; no fixed time limit (the 2-hour stuck-crawl sweep is the only safety net).
- Dev alerts: one grouped message per crawl to `ALERT_WEBHOOK_URL` (Slack, Discord or a Coolify-compatible webhook).

## Phase 3: Google-data fallback and blocked-site guidance

- When pages stay blocked, fill them from data Google itself collected: PageSpeed Insights (Lighthouse fetches the page: title, meta description, canonical, hreflang, robots, speed), Search Console URL Inspection for connected client sites, and the sitemap for the URL list.
- Blocked-site screen: "This site blocks automated crawlers" with one-click options: use the helper (Phase 4), or send the client allowlist instructions (VPS IP + AuditPro user-agent, with Cloudflare steps).
- Round 2 trust fixes: keep `?page=` pagination parameters, fairer score for site-wide gaps, Speed tab data fixes, page types for non-store sites, "stay inside this folder" option, AI copy never offered as ready-to-paste when it breaks the length rules.

## Phase 4: Deployment hardening on Coolify

- Split the backend into two Coolify services from the same image: `api` (uvicorn, serves the app) and `worker` (runs crawls from the queue). Crawls can never slow the app; scale workers by adding one.
- Move the queue to Redis (already in the compose file) so API and worker share it and queued crawls survive a redeploy.
- Resource limits per service sized to the VPS plan (worker gets most CPU/RAM; Chromium `shm_size` on the worker only). Memory safety valve: new crawls wait if worker memory > 75%.
- Run `alembic upgrade head` automatically on deploy (pre-deploy command or entrypoint) so code and database never drift.
- Coolify health checks for api and worker; Coolify notifications (Discord/Telegram/email) for container restarts and failed deploys.
- Backups: Coolify scheduled backups of the Postgres volume (daily, keep 7) to S3-compatible storage; test a restore once.
- Load test: 6 people starting crawls at once (mix of normal and JS) must finish with no container restarts, app response < 1 s, memory < 80%.

## Phase 5: AuditPro Helper extension v1 (on by default)

- Distributed as a zip download inside the app (signed-in users only), loaded with Chrome/Edge "Load unpacked"; or force-installed through Google Workspace policy if BloomX uses Workspace.
- The app detects the helper; version check prompts updates.
- On by default: the helper fetches pages from the user's browser and connection; the server analyses them exactly as it does its own crawls. If the helper disconnects (browser closed, laptop asleep, phone), the server takes over the remaining URLs automatically.
- Human-verification flow: when a site shows a challenge, the user completes it in a normal tab; the helper continues politely using only that site's clearance cookie (never the user's other cookies or logins). Only for sites the user confirms they own or may audit. No automated CAPTCHA solving, no fingerprint faking, no proxy rotation.
- "Audit this tab": captures the fully rendered page the user has open. Works on any page a human can open.
- Same rules as the server: max 2 retries, dead-letter list, failure attribution.

## Phase 6: Helper v2 and success measurement

- Move simple extraction into the helper (uses the user's CPU; sends small results instead of HTML), verified against the server's output on the benchmark set so results never drift.
- Success dashboard for the team: page success rate and crawl success rate per crawl and per week, top failure reasons, dead-letter review.
- Round 3 testing: the five personas on the benchmark set, plus 2-3 weeks of real team audits. Exit criterion: ≥ 99% page success and ≥ 99.5% crawl success on the benchmark set.

## Status (30 Oct 2026)

| Phase | Status | Evidence |
|---|---|---|
| 1 Storage | Done; migration applied to the dev database (Supabase) | One crawl per account; a 30-page crawl stored 30 pages with link lists (~2.5 KB each) and 0 rows in `links` |
| 2 Reliability and speed | Done | 1,000-page bookstore crawl in **55 s** (was ~6-8 min) with 66/66 duplicates and 0 field errors; crawler-test.com main pass 402 pages in 40 s, deliberately broken URLs retried at most twice and attributed (site problems counted, our side / unknown not counted); 155 backend tests |
| 3 Fallbacks and round 2 fixes | Mostly done | `?page=` pagination kept; site-wide problem penalty; stay-in-start-folder (default on); Docs / Info page types; AI copy over the limit shown as "Needs editing"; report filler and model names removed; Client report in the sidebar. **Open:** Google-data fallback for blocked pages (PageSpeed gives pass/fail checks only; lower value than the helper) |
| 4 Coolify hardening | Done (worker mode off by default) | `docs/DEPLOY_COOLIFY.md`; API/worker split (`CRAWL_RUNNER`), migrations on deploy with an advisory lock, health checks, resource limits for KVM 4 / KVM 2, backups procedure. The production database still needs its first migration (see the deploy guide: baseline step) |
| 5 Helper extension | Extension done (69 tests); app integration in progress | `extension/` |
| 6 Helper v2 + measurement | Not started | |

Decisions still needed from the owner: production app domain (for the helper), where to keep the helper signing key, whether production helper zips include `localhost:3000`, Hostinger VPS plan (sets crawl slots), production database backup method, and whether to keep the 5 AI calls per crawl for answer readiness.

## Order and dependencies

1 → 2 → 3 can ship one after another on the current single backend. Phase 4 (worker split) should land before the helper (Phase 5), because the helper and the server share the queue. Phase 6 follows real usage.
