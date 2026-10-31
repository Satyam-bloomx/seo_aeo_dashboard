# Backlinks: plan, and running costs for the internal team

Based on `semrush-and-backlinks.md` and `seoshope.md` in this folder. Status: **proposal, awaiting approval**.

## The honest starting point

- Semrush and Ahrefs build backlink data by crawling most of the web with their own bots (Semrush claims ~43T links). Copying that is not realistic for us: billions of pages crawled, terabytes of storage, five figures a month.
- So nobody small "solves" backlinks alone. We combine **free sources for our own sites**, a **cheap pay-per-use API for competitors**, and **our own crawler** to verify links and connect them to the audit (what Semrush cannot do for us).
- SEOShope (group-buy shared logins) has no API and sharing accounts breaks Semrush's terms (§4.1). We do not build on it. Use the remaining days only for manual, internal exports (see the end).

## Sources

| Source | Gives | Covers | Cost |
|---|---|---|---|
| Google Search Console **Links export** (CSV, manual) | Top linking sites, top linked pages, top anchor text | Own verified sites | Free (no API exists; upload the CSV) |
| **Bing Webmaster Tools API** | Inbound links per page (linking URL + anchor) | Own verified sites | Free (API key) |
| **OpenPageRank** | Authority score per domain, 100 domains per call | Any domain | Free |
| **Our crawler** | Is a known backlink still live, follow/nofollow, anchor; does it point at a page that 404s or redirects | Any known link | Free |
| **DataForSEO Backlinks API** | Referring domains, anchors, new/lost links, top linked pages, link gap between domains | Any domain incl. competitors | Pay per use: ~$0.024 per request + tiny per-row fee; ~$6-7/month for ~50 domains; $50 minimum top-up |

Skipped: Semrush API (~$450-550/month plan + units), Majestic (~$400/month), Ahrefs API (plan fee), Moz (useful tier $125+/month), building our own index, Common Crawl graph (free but 2.8B edges, months stale, heavy to host: maybe later).

## What the Backlinks tab shows

1. **Summary**: referring domains, authority (OpenPageRank), trend (new/lost in 30 days), with the source under each number.
2. **Top linking sites and anchors**: are anchors natural or over-optimised.
3. **Backlinks to broken pages** (the audit join nobody else gives you): links pointing at pages our crawl found as 404 or redirect chains → "redirect /old-page to /new-page to recover N links". This is usually the fastest backlink win.
4. **Lost links to reclaim**: links that disappeared (DataForSEO) or that our crawler finds gone/nofollow now.
5. **Link gap vs competitors**: sites linking to 2+ competitors but not to you → outreach list (the main action list).
6. **Review flags** (not "toxic", no auto-disavow): spammy-looking anchors, link farms by pattern, sudden spikes. Labelled "review", because no source gives a reliable toxic score.

Every number shows its source and date ("Bing, 3 days ago", "DataForSEO, Nov 2026").

## Phases

| Phase | Work | Cost |
|---|---|---|
| 1. Free, own sites | GSC Links CSV upload, Bing Webmaster API connect, OpenPageRank, our crawler verifies links, "backlinks to broken pages" | ₹0 |
| 2. Competitors | DataForSEO connector (key in Integrations like SerpAPI), link gap, new/lost, 30-day cache so each domain costs once a month, cost shown before each run | ~$6-10/month |
| 3. Later, optional | Common Crawl domain graph as an offline monthly job; outreach tracking | Disk + CPU only |

Storage: same pattern as keywords (one integration row per workspace, per site, capped lists), so no database migration. If it grows large we add a table later (needs your approval for the migration).

## Running cost estimate (internal team)

Assumptions: ~10 client sites, each audited and keyword-checked about weekly, competitors' backlinks monthly. Prices are approximate (USD, late 2026); check each provider's page before paying. ₹ at ~₹88/$.

| Item | Lean | Typical | Heavy |
|---|---|---|---|
| Hostinger VPS (Coolify, app + DB + worker) | KVM 2 ~$8-15 | KVM 4 ~$13-30 | KVM 4/8 ~$30-50 |
| Coolify, Postgres, Next.js, FastAPI | $0 (self-hosted) | $0 | $0 |
| Supabase Auth (free tier, 50k users) | $0 | $0 | $0 |
| Domain + backups (off-site storage) | ~$2 | ~$3 | ~$5 |
| AI (Gemini Flash; audits, suggestions, ideas) | ~$0-3 | ~$3-8 | ~$10-20 |
| PageSpeed, Search Console, GA4 APIs | $0 | $0 | $0 |
| SerpAPI (keyword checks + autocomplete) | Free 250/month | Starter $25 (1,000) | Developer $75 (5,000) |
| DataForSEO backlinks (phase 2) | $0 | ~$7 ($50 top-up lasts months) | ~$15-25 |
| **Total per month** | **~$10-20 (₹900-1,800)** | **~$50-75 (₹4,400-6,600)** | **~$130-180 (₹11,500-16,000)** |

Notes:
- VPS prices: Hostinger's low price needs a 1-2 year prepay; renewal is roughly double. Budget for the renewal price.
- SerpAPI is the main variable cost: a 20-search keyword check uses ~20-40 searches, worst case 80; ideas use up to 8. 10 sites weekly ≈ 1,500-2,000 searches/month → Developer plan. Monthly checks → Starter.
- Compare: one Semrush Guru seat is ~$250/month and has no API; Semrush with API is ~$500+/month.

## SEOShope: last 8 days (manual, internal only)

Export by hand (no bulk/automated exports): Semrush Keyword Magic, Keyword Gap and competitor Top Pages (keyword, volume, KD, intent, CPC, position, URL); Backlink Gap and referring domains (domain, authority score, anchors). Keep them as internal planning snapshots, not in client reports and not imported into the app. Use its extension only in a separate Chrome profile, and sign out/rotate passwords for anything you were logged into while it was installed (it can read cookies).

## Decisions for the owner

1. Approve phase 1 (free) now?
2. Phase 2: OK to open a DataForSEO account with a $50 top-up when we get there?
3. Which plan is the VPS actually on (KVM 2 or 4) and which SerpAPI plan do you expect, so the estimate can be firmed up?
