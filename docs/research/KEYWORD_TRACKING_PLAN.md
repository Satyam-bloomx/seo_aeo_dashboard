# Keywords & AI answers: implementation plan

Based on three research reports in this folder: `serpapi.md` (API facts and costs), `ai-visibility-methods.md` (how AEO tools measure), `codebase-keyword-feature.md` (where it fits). Status: **proposal, awaiting approval**.

## What the user gets

A **Keywords & AI answers** tab: a list of ~20 keywords and customer questions, each tested on Google, with:
- Google position (top 30) and which page ranks,
- whether an **AI Overview** appears and whether the site is **cited** in it (and which competitors are),
- **People Also Ask** questions Google shows,
- for local items, **map pack** position,
- optional: whether **Perplexity** mentions/cites the site (asked 3 times, shown as "2 of 3").

Plus three plain-language scores (Google visibility, AI answer visibility, local visibility), and a "where competitors win and you don't" list as the action list. The dashboard's "Keyword rankings" card shows the real numbers instead of the current single branded query.

## How the list is made

1. **AI suggests** (1 AI call, any connected provider): grounded in the crawl only: service/product page titles and H1s, page-type counts, FAQ/question headings, intro text, schema types. Output per item: text, keyword or question, intent, branded yes/no, local yes/no.
2. **Mix** (from the research): 10 keywords + 10 questions; at least 80% non-branded; roughly category/service 35%, problem/how-to 25%, comparison 15%, local 15%, brand 10%. Brand items are reported separately (they are almost always won, so they don't count in the score).
3. **Location**: the crawl doesn't capture the business city, so the user sets it once (prefilled from Google Business Profile when connected), e.g. "Pune, Maharashtra, India". Local items only when a location is set.
4. **The user edits** the list (add, remove, re-tag) before any paid check. No AI connected: manual entry plus suggestions built from titles/H1s.

## How each item is checked (SerpAPI)

Settings for every search: `gl=in`, `hl=en`, `location=<the city>`, `device=desktop`, fixed so results are comparable over time.

| Step | When | Credits |
|---|---|---|
| Google search, page 1 (organic, People Also Ask, local pack, inline AI Overview) | always | 1 |
| AI Overview follow-up (`google_ai_overview` with the page token, within 1 minute) | only if Google returned a token | +1 |
| Pages 2 and 3 (`start=10`, `start=20`) | only if the site isn't on page 1 | +1 each |
| Google Maps search | only for local items | +1 |

Typical: **1-2 credits per item, 4 at most; 20 items ≈ 20-40 credits per check.** SerpAPI free plan = 250/month (about 6-12 checks); Developer $75 = 5,000.

Matching is by host (www/apex), never by substring. Errors and quota limits keep partial results and say which items failed; never more than one retry.

Unconfirmed until we test (1-2 real searches, with your OK): whether AI Overviews appear for India (`gl=in`); exact paging cost; whether Maps results include the website field (else match by business name).

## Optional: Perplexity check

If Perplexity is connected: each **question** (not keywords) asked 3 times; record mentioned yes/no and cited yes/no; show "2 of 3". 10 questions × 3 = 30 calls per check. Off by default; a toggle with the call estimate. This replaces the current single Perplexity probe per crawl.

## Scores (non-branded items only, labelled "directional, based on N queries")

| Score | How |
|---|---|
| Google visibility | Top 3 = full credit, 4-10 = 60%, 11-30 = 20%, not found = 0, averaged over keywords + questions |
| AI answer visibility | Share of items with an AI Overview where the site is cited; plus Perplexity mention rate when enabled |
| Local visibility | Share of local items in the map pack top 3 (single location; geo-grid later, opt-in) |
| Combined | Google 30, AI 35, People Also Ask 10, Local 25; local weight redistributed when no local items |

Position inside AI answers is not scored (research: AI answer lists rarely repeat, so only presence is stable).

## When it runs and cost control

- Only when the user clicks **Check rankings**, showing the credit estimate first; never automatically per crawl.
- Results cached with a timestamp ("checked 3 days ago"); suggested cadence weekly or monthly.
- New rate-limit bucket: 10 checks per hour per user.

## Where it lives (no database migration)

The app keeps one crawl per account and deletes old ones, so the list must not live on the crawl. It goes in the integration settings table as a new `keyword_tracking` entry per account (survives re-crawls and SerpAPI reconnects). Results are stored there too, keyed by site.

## Code changes

- Backend: new `services/keyword_tracking.py` (suggest, check, parse, score), endpoints (suggest, get/update list, run check, results) with the existing auth and ownership checks, a SerpAPI client that resolves the key itself (env fallback), scoring change in `scoring.py` (remove the hard-coded "1 keyword tracked"; bump `SCORING_VERSION`), and remove the old branded-only query from enrichment.
- Frontend: new tab (sidebar, mobile bar, dashboard), the list editor, results table, scores, empty states; update the Keyword rankings card and the Overview SERP card.
- Tests with recorded-style SerpAPI responses (no paid calls in tests).

## Decisions for the owner

1. Approve the plan and the default of 10 keywords + 10 questions.
2. Perplexity check: off by default (toggle), or not built for now?
3. Depth: check up to position 30 (pages 1-3), or page 1 only (cheapest)?
4. Allow 1-2 real SerpAPI test searches (about 2-4 credits) to confirm AI Overviews show for India before building the AI Overview parts.
