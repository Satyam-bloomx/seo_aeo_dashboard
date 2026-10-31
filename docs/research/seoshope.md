# SEOShope research (2026-10-31)

Sources: seoshope.com homepage and /terms-and-conditions (fetched 2026-10-31), Trustpilot, Semrush and Ahrefs ToS, vendor pricing pages. Items marked [UNCONFIRMED] could not be verified. Not legal advice. No sign-up or login was done.

## 1. What it is and how access works
- A "group buy" reseller. It shares paid subscriptions to third-party tools among many members. It says it has run since Nov 2021 and lists 70+ tools. (seoshope.com)
- Delivery is a SEOShope-owned Chrome extension (desktop Windows/Mac only) plus a dashboard. The extension opens a "dedicated session", so the member never types the tool's password. "A few tools have direct access" (which ones is not stated). (homepage, T&C)
- The site does not say how sessions work. The extension almost certainly injects the vendor's logged-in session cookies into the member's browser. [UNCONFIRMED: inferred from how this product category works, not stated by SEOShope]
- The T&C ban VPN, proxy and RDP use. Dynamic IPs from your own location are allowed. One membership is for one person.
- Tools named on the site: Semrush, Moz Pro, Canva Pro, Grammarly, ChatGPT Plus, Jasper, Helium 10, Envato Elements, Similarweb data (Advance plan).
- Ahrefs is "Coming soon". Some Advance-plan tools are "Under Testing". Whether SpyFu is offered is [UNCONFIRMED].
- Limits:
  - Daily limits on reports, queries and downloads exist but no numbers are published, and SEOShope may change them.
  - Semrush has "fair-use limits shared across members".
  - The only explicit cap found is Freepik at 15 files/day.
  - Whether exports are allowed per tool is not stated. [UNCONFIRMED] Expect them to be capped or disabled on some tools.
  - Vendor "resets" interrupt access. The site says these are usually fixed within hours.

## 2. Pricing (as listed, monthly, no lock-in)
| Plan | INR | USD |
|---|---|---|
| Lite | 249 | 5.50 |
| Pro | 349 | 6 |
| Advance | 549 | 10 |
| Designer's | 499 | 8 |
| Writer's | 899 | 13 |
| AI | 1,999 | 24 |
- Single tools start at INR 49. Payment is by UPI, PayPal or Binance.
- Cancel anytime. Access lasts to the end of the paid period.
- Refund policy includes a "48+ hours downtime" rule. The full text was not read. The site says the refund policy is separate from the T&C.
- Which plan contains Semrush and Moz was not stated on the pages read. [UNCONFIRMED]

## 3. Reliability and reputation
- Trustpilot: 3.8/5 from 66 reviews (82% 5-star, 17% 1-star). The profile is unclaimed and the company has not invited reviews, so the sample is likely unrepresentative. (trustpilot.com/review/seoshope.com)
  - Praise: fast support, price, one login for many tools.
  - Complaints: "most tools not working/missing", daily limits, an unanswered refund request, a "scam" claim, and 404 pages with no contact info.
- The homepage says "500+ marketers" while Trustpilot shows 66 reviews. It calls 99.9% uptime a "target", not a guarantee.
- No Reddit or forum threads on SEOShope specifically turned up in the search. Treat that as no independent evidence either way.
- Group-buy review pages across the category show disputed or fake reviews on both sides. Weigh the Trustpilot score accordingly.
- Data accuracy: nothing independent was found. Shared Semrush/Moz accounts return the vendor's real data, but the heavy shared load and fair-use caps can block reports. [UNCONFIRMED] No comparison against the genuine tools was found.
- Ban risk: members are not banned by Semrush directly, but the shared account can be reset or blocked at any time. The vendor-side detection signal is reported to be concurrent logins from different IPs (third-party blogs only).

## 4. Legal / ToS and security risk
- SEOShope itself calls the arrangement a "gray area" under vendor terms (homepage and T&C). It disclaims responsibility.
- Semrush ToS (semrush.com/company/legal/terms-of-service):
  - 4.1: "Each Authorized User must use their own login credentials" and "two or more individuals may not share a single Authorized User's Account".
  - 3.3(a): no sublicensing, reselling or making the Services available to any third party.
  - 3.2: use only for your own internal business purposes.
  - 5.3: Semrush monitors user counts.
  - Group-buy access is a direct breach.
- Ahrefs ToS (ahrefs.com/legal/terms):
  - No explicit "do not share logins" line was seen in the fetch.
  - 12.4: the licence is non-transferable and non-sublicensable, for internal business operations.
  - 12.7(a): no selling, trading or transferring.
  - 4.1 and 4.2: you are responsible for all activity under your account and for your Authorised Users.
  - 8.4: Ahrefs may suspend or terminate for unauthorised use.
  - Ahrefs is not yet offered by SEOShope anyway.
- Risk to us:
  - The data was obtained through a breach of the vendor's terms. Putting it in client deliverables raises exposure for the agency.
  - Anything derived from it (reports, an app feature, a database) increases that exposure.
  - Service can disappear mid-project.
  - The vendors have not been seen suing individual members. [UNCONFIRMED] Enforcement is mostly account resets.
- Security: the extension is a high-trust component. A Chrome extension that injects sessions typically requests "cookies" and all-sites host access (`<all_urls>`). [UNCONFIRMED: manifest not inspected, since installing is out of scope]
  - A cookie-capable extension on all sites can read session cookies for Google Workspace, Search Console, banking and so on.
  - Do not install it in a browser profile that is logged into the agency's Google account, Search Console, Supabase, Coolify, GitHub or client systems.
  - If the owner already installed it, use a separate throwaway Chrome profile, and rotate passwords and sessions for anything that was logged in while it was installed.
  - Never paste API keys or client data into the tool UIs. Other members and the operator may see activity. [UNCONFIRMED]
- Decision: SEOShope's own T&C also forbid scraping beyond fair use. We will not build against it.

## 5. API / automation
- Confirmed none for Semrush: the site says the Semrush "API not included" in the group buy.
- "Similarweb API Data" is listed in the Advance plan, but no API terms are described. Treat that as a data-in-dashboard feature, not an API we can call. [UNCONFIRMED]
- Automation (scraping, scripts, bots) breaches SEOShope's own terms and would get the account banned. No official API exists.

## 6. Checklist: what to export manually in the next 8 days
Rules: export only what the plan allows for your own team's internal planning. Avoid anything that takes client data from the tool. Check whether the data is still plausible against GSC before trusting it.

Keyword planning (Semrush, if included):
1. Keyword Magic Tool for each core seed topic per client. Columns: Keyword, Volume, KD%, Intent, CPC, Trend, SERP Features, Number of Results.
2. Keyword Gap and Organic Research for 3 to 5 main competitors per client. Columns: Keyword, Position, Volume, KD, URL, Traffic %, Competitor positions.
3. Top Pages (Organic Research) per competitor. Columns: URL, Traffic, Traffic %, Keywords count.
4. Position Tracking is not needed. We have SerpAPI and GSC.

Backlink and authority planning:
5. Backlink Analytics or Backlink Gap (Semrush). Columns: Referring domain, Authority Score, Backlinks count, Country, first seen.
6. Moz Link Explorer or Domain Analysis, if available. Columns: Domain Authority, Spam Score, Linking root domains, Anchor text.
7. Referring domains and anchor text distribution for each client and each main competitor (the "link intersect" target list).

Also worth saving:
- Screenshots of dashboards for a baseline, and notes on how each tool computes KD or Authority Score.
- One CSV per client/competitor, stamped with the export date and source. Keep them in an internal-only folder, not in the shared app DB.
- Label every dataset "third-party, snapshot, not for client delivery".

Avoid:
- Bulk or automated exports, scrapers, or macros (bans, T&C breach).
- Logging into your Google or client accounts in the same browser profile.
- Putting these exports into client-facing reports, dashboards or the app's database.
- Using the export as a substitute for the real data. Plan to rebuild the high-value lists with legit sources (section 7).
- Paying for a renewal, since replacements are cheap and legitimate.

## 7. Legitimate alternatives (prices as publicly listed, check before buying)
| Option | Price | What you get |
|---|---|---|
| Google Search Console | free | Own-site queries, clicks, positions (already integrated) |
| Bing Webmaster Tools | free | Own verified sites only: keywords, backlinks, SEO reports |
| Ahrefs Free (Webmaster Tools) | free | Verified sites only: Site Audit (5K credits/project/month), Site Explorer top 1K backlinks and keywords, Web Analytics. Competitors need a paid plan. (ahrefs.com/webmaster-tools) |
| Moz free | free | Limited Link Explorer queries per month. Sources conflict (10/month in one 2026 comparison). [UNCONFIRMED] |
| DataForSEO | pay-as-you-go, $50 min top-up, funds don't expire, $1 trial credit | SERP API from $0.0006/SERP, Keywords Data from $0.0012/task, Labs $0.012/task plus $0.00012/item. Backlinks pricing not confirmed on the pricing page. (dataforseo.com/pricing) Best fit for our app: an API. |
| SE Ranking | Core about $103/mo, Growth about $223/mo (annual-billing-looking discounted prices; list $129/$279) | Rank tracking, backlinks research, 25K/100K API credits plus MCP. (seranking.com/subscription.html) |
| Ubersuggest | sources conflict: $12, $20 or $29/mo for Individual; official page returned 403 | Basic keyword and backlink data. [UNCONFIRMED] Check ubersuggest.com. |
| SerpAPI (already used) | existing plan | Rank checks |

Recommendation for the build: keep GSC, SerpAPI and Bing Webmaster Tools. Add DataForSEO pay-as-you-go for keyword volume, difficulty and competitor backlinks. A $50 deposit covers a large volume of keyword tasks at the listed rates. Add Ahrefs Free for each verified client site. Avoid integrating any group-buy access.
