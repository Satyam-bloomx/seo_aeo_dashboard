import asyncio
import collections
import json
import math
import re
from typing import Dict, List, Set
from urllib.parse import urlparse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm.attributes import flag_modified

from app.models.domain import Page, Crawl
from app.services.extractor import normalize_url_for_canonical, pagination_base
from app.services.link_store import INLINK_SAMPLE_CAP, compact_inlink
from app.services.fetch_outcome import is_uncounted



URL_SAMPLE_CAP = 20


def _url_sample(urls: List[str], exclude: str) -> List[str]:
    """Up to URL_SAMPLE_CAP other URLs in a duplicate group (full lists grow quadratically in payloads)."""
    out = []
    for u in urls:
        if u != exclude:
            out.append(u)
            if len(out) >= URL_SAMPLE_CAP:
                break
    return out

class PostProcessor:
    """
    Screaming Frog v20.4-compliant Post-Crawl Processor.
    Computes cross-page metrics that can only be evaluated once all URLs have been scanned:
      1. Duplicate Page Titles (case-insensitive normalized)
      2. Duplicate H1 Headings (identifies keyword cannibalization across URLs)
      3. Duplicate H2 Headings
      4. Duplicate Meta Descriptions
      5. Title Same as H1
      6. Exact Duplicates (MD5 content hash matching)
      7. Near Duplicates (pages with identical H1/title and word count within 15%, or matching headings)
      8. Non-Indexable Canonical Targets (canonical pointing to 3xx, 4xx, 5xx, or noindex URLs)
      9. Inlink and Outlink metrics (total inlinks, unique anchor texts, orphan URLs)
     10. Internal Links to 3xx/4xx (identifies internal redirect hops and broken links)
    """

    def __init__(self, crawl_id: int, db: AsyncSession, mode: str = "site"):
        self.crawl_id = crawl_id
        self.db = db
        self.mode = mode

    async def _iter_outlinks(self, chunk: int = 200):
        """Yield (page_id, outlink list) for the crawl, a chunk of pages at a time (no ORM objects held)."""
        last_id = 0
        while True:
            rows = (await self.db.execute(
                select(Page.id, Page.outlinks)
                .where(Page.crawl_id == self.crawl_id, Page.id > last_id)
                .order_by(Page.id).limit(chunk)
            )).all()
            if not rows:
                return
            for page_id, outlinks in rows:
                yield page_id, (outlinks or [])
            last_id = rows[-1][0]

    def is_page_indexable(self, page: Page) -> bool:
        """
        Screaming Frog v20.4 Standard:
        A page is Indexable only if:
          1. HTTP Status is 200 OK
          2. Directives do not contain Noindex or None
          3. Not blocked by robots.txt
          4. Canonical tag is either self-referencing or missing (i.e. not canonicalised to a different URL)
        """
        if not page or (page.status_code and page.status_code != 200):
            return False

        ad = page.audit_data or {}
        dirs = ad.get("Directives", {})
        if dirs.get("NoIndex") or dirs.get("None") or getattr(page, 'dir_noindex', False):
            return False

        canon = getattr(page, 'canonical_link_element_1', None)
        if canon and page.url:
            if normalize_url_for_canonical(canon) != normalize_url_for_canonical(page.url):
                return False

        idx_info = ad.get("Indexability", {})
        if idx_info and idx_info.get("Indexable") is False:
            return False

        return True

    async def run(self):
        try:
            # 1. Fetch all pages and links for this crawl
            res_pages = await self.db.execute(select(Page).where(Page.crawl_id == self.crawl_id))
            pages = res_pages.scalars().all()
            if not pages:
                return

            # Fast URL lookup maps
            url_to_page: Dict[str, Page] = {p.url: p for p in pages}
            id_to_page: Dict[int, Page] = {p.id: p for p in pages}
            inlink_counts = collections.defaultdict(int)
            outlink_counts = collections.defaultdict(int)
            internal_followed_out = collections.defaultdict(set)
            internal_followed_in = collections.defaultdict(set)
            links_to_non200 = collections.defaultdict(list)
            inlinks_sample: Dict[str, list] = collections.defaultdict(list)
            total_links = 0

            # Trailing-slash tolerant lookup (pages and links share the crawler's normalization).
            slash_key = lambda u: (u or "").rstrip("/")
            key_to_page: Dict[str, Page] = {slash_key(p.url): p for p in pages}

            # Canonical targets that some internal hyperlink points to ("Unlinked" canonicals have none).
            hyperlinked_targets = set()
            # The link graph is built from each page's stored outlink list, one chunk of pages at a time.
            async for source_id, outlinks in self._iter_outlinks():
                src_page = id_to_page.get(source_id)
                for rec in outlinks:
                    link_type = (rec.get("t") or "A").upper()
                    if link_type in ("CANONICAL", "REDIRECT"):
                        continue  # not navigational links: excluded from inlink/outlink counts
                    total_links += 1
                    dest_url = rec.get("u") or ""
                    is_internal = not rec.get("x")
                    is_follow = not rec.get("n")
                    dest_page = key_to_page.get(slash_key(dest_url))
                    if is_internal:
                        hyperlinked_targets.add(normalize_url_for_canonical(dest_url))
                    outlink_counts[source_id] += 1
                    if dest_page is not None:
                        inlink_counts[dest_page.url] += 1
                        if (dest_page.status_code is not None and (dest_page.status_code == 0 or dest_page.status_code >= 300)
                                and not is_uncounted(dest_page.audit_data)):
                            links_to_non200[source_id].append(dest_page)
                        sample = inlinks_sample[dest_page.url]
                        if len(sample) < INLINK_SAMPLE_CAP and src_page is not None and src_page.url != dest_page.url:
                            sample.append(compact_inlink(source_id, rec.get("a"), is_follow, link_type))

                    if is_internal and is_follow:
                        if src_page and dest_page and src_page.url != dest_page.url:
                            internal_followed_out[src_page.url].add(dest_page.url)
                            internal_followed_in[dest_page.url].add(src_page.url)

            # 2. Sync indexability & reset duplicate flags
            from app.models.domain import IndexabilityStatus

            for p in pages:
                if not p.audit_data:
                    p.audit_data = {}

                # Sync Indexability based on status code, directives, and canonical
                c_target = p.canonical_link_element_1
                has_noindex = getattr(p, 'dir_noindex', False) or p.audit_data.get("Directives", {}).get("NoIndex") or p.audit_data.get("Directives", {}).get("None")
                is_canonicalised = False
                if c_target and p.url:
                    is_canonicalised = (normalize_url_for_canonical(c_target) != normalize_url_for_canonical(p.url))

                if is_uncounted(p.audit_data) and p.status_code != 200:
                    # A fetch problem that is not the site's fault (bot protection, our side): keep the reason, no HTTP verdict.
                    p.indexability = IndexabilityStatus.NON_INDEXABLE
                    p.indexability_status = (p.audit_data.get("Fetch") or {}).get("reason") or p.indexability_status
                elif p.status_code and p.status_code >= 400:
                    p.indexability = IndexabilityStatus.NON_INDEXABLE
                    p.indexability_status = f"Client Error ({p.status_code})" if p.status_code < 500 else f"Server Error ({p.status_code})"
                elif p.status_code and p.status_code >= 300:
                    p.indexability = IndexabilityStatus.NON_INDEXABLE
                    p.indexability_status = f"Redirect ({p.status_code})"
                elif (p.audit_data.get("Response_Codes") or {}).get("Redirection (Meta Refresh)"):
                    p.indexability = IndexabilityStatus.NON_INDEXABLE
                    p.indexability_status = f"Redirect ({p.audit_data['Response_Codes'].get('Redirect Type') or 'Meta Refresh'})"
                elif has_noindex:
                    p.indexability = IndexabilityStatus.NON_INDEXABLE
                    p.indexability_status = "Noindex"
                elif is_canonicalised:
                    p.indexability = IndexabilityStatus.NON_INDEXABLE
                    p.indexability_status = "Canonicalised"
                elif p.status_code == 200:
                    p.indexability = IndexabilityStatus.INDEXABLE
                    p.indexability_status = "Indexable"

                p.audit_data["Indexability"] = {
                    "Indexable": (p.indexability == IndexabilityStatus.INDEXABLE),
                    "Non-Indexable Reason": p.indexability_status if p.indexability != IndexabilityStatus.INDEXABLE else ""
                }

                # Reset duplicate flags
                if p.audit_data.get("Pagination"):
                    p.audit_data["Pagination"]["Duplicate Title From Pagination"] = False
                if "Page_Titles" in p.audit_data:
                    p.audit_data["Page_Titles"]["Duplicate"] = False
                    p.audit_data["Page_Titles"]["duplicate_urls"] = []
                    p.audit_data["Page_Titles"]["duplicate_count"] = 0
                if "H1" in p.audit_data:
                    p.audit_data["H1"]["Duplicate"] = False
                    p.audit_data["H1"]["duplicate_urls"] = []
                    p.audit_data["H1"]["duplicate_count"] = 0
                if "H2" in p.audit_data:
                    p.audit_data["H2"]["Duplicate"] = False
                    p.audit_data["H2"]["duplicate_urls"] = []
                    p.audit_data["H2"]["duplicate_count"] = 0
                if "Meta_Description" in p.audit_data:
                    p.audit_data["Meta_Description"]["Duplicate"] = False
                    p.audit_data["Meta_Description"]["duplicate_urls"] = []
                    p.audit_data["Meta_Description"]["duplicate_count"] = 0
                if "Content" in p.audit_data:
                    p.audit_data["Content"]["Exact Duplicates"] = False
                    p.audit_data["Content"]["Near Duplicates"] = False
                    p.audit_data["Content"]["exact_duplicate_urls"] = []
                    p.audit_data["Content"]["duplicate_urls"] = []
                    p.audit_data["Content"]["near_duplicate_urls"] = []
                    p.audit_data["Content"]["duplicate_count"] = 0

            # 3. Group pages for duplicate detection (STRICTLY INDEXABLE PAGES ONLY - Screaming Frog Standard)
            title_groups = collections.defaultdict(list)
            h1_groups = collections.defaultdict(list)
            h2_groups = collections.defaultdict(list)
            desc_groups = collections.defaultdict(list)
            content_hash_groups = collections.defaultdict(list)

            for p in pages:
                # In technical SEO, canonicalised pages/parameter variants yield to their canonical target and must NOT be flagged as duplicate issues
                if not self.is_page_indexable(p):
                    continue

                # Page Titles
                if p.title_1:
                    clean_title = p.title_1.strip().lower()
                    if clean_title:
                        title_groups[clean_title].append(p)

                # H1 Headings
                if p.h1_1:
                    clean_h1 = p.h1_1.strip().lower()
                    if clean_h1:
                        h1_groups[clean_h1].append(p)

                # H2 Headings
                if p.h2_1:
                    clean_h2 = p.h2_1.strip().lower()
                    if clean_h2:
                        h2_groups[clean_h2].append(p)

                # Meta Descriptions
                if p.meta_desc_1:
                    clean_desc = p.meta_desc_1.strip().lower()
                    if clean_desc:
                        desc_groups[clean_desc].append(p)

                # Content Hashes (Exact Duplicates)
                c_hash = getattr(p, 'content_hash', None)
                if c_hash:
                    content_hash_groups[c_hash].append(p)

            # 4. Flag Duplicates across Indexable Pages
            # 4a. Page Titles
            for title_str, group in title_groups.items():
                if len(group) > 1:
                    all_urls = [p.url for p in group]
                    for p in group:
                        if p.audit_data and "Page_Titles" in p.audit_data:
                            p.audit_data["Page_Titles"]["Duplicate"] = True
                            p.audit_data["Page_Titles"]["duplicate_urls"] = _url_sample(all_urls, p.url)
                            p.audit_data["Page_Titles"]["duplicate_count"] = len(all_urls)
                            flag_modified(p, "audit_data")
                    # Duplication explained by pagination: members of one paginated series share a title.
                    bases = collections.Counter(pagination_base(p.url) for p in group)
                    for p in group:
                        pg = (p.audit_data or {}).get("Pagination")
                        if pg and pg.get("Paginated") and bases[pagination_base(p.url)] > 1:
                            pg["Duplicate Title From Pagination"] = True

            # 4b. H1 Headings
            for h1_str, group in h1_groups.items():
                if len(group) > 1:
                    all_urls = [p.url for p in group]
                    for p in group:
                        if p.audit_data and "H1" in p.audit_data:
                            p.audit_data["H1"]["Duplicate"] = True
                            p.audit_data["H1"]["duplicate_urls"] = _url_sample(all_urls, p.url)
                            p.audit_data["H1"]["duplicate_count"] = len(all_urls)
                            flag_modified(p, "audit_data")

            # 4c. H2 Headings
            for h2_str, group in h2_groups.items():
                if len(group) > 1:
                    all_urls = [p.url for p in group]
                    for p in group:
                        if p.audit_data and "H2" in p.audit_data:
                            p.audit_data["H2"]["Duplicate"] = True
                            p.audit_data["H2"]["duplicate_urls"] = _url_sample(all_urls, p.url)
                            p.audit_data["H2"]["duplicate_count"] = len(all_urls)
                            flag_modified(p, "audit_data")

            # 4d. Meta Descriptions
            for desc_str, group in desc_groups.items():
                if len(group) > 1:
                    all_urls = [p.url for p in group]
                    for p in group:
                        if p.audit_data and "Meta_Description" in p.audit_data:
                            p.audit_data["Meta_Description"]["Duplicate"] = True
                            p.audit_data["Meta_Description"]["duplicate_urls"] = _url_sample(all_urls, p.url)
                            p.audit_data["Meta_Description"]["duplicate_count"] = len(all_urls)
                            flag_modified(p, "audit_data")

            # 4e. Exact Duplicate Content
            for c_hash, group in content_hash_groups.items():
                if len(group) > 1:
                    all_urls = [p.url for p in group]
                    for p in group:
                        if p.audit_data and "Content" in p.audit_data:
                            p.audit_data["Content"]["Exact Duplicates"] = True
                            p.audit_data["Content"]["exact_duplicate_urls"] = _url_sample(all_urls, p.url)
                            p.audit_data["Content"]["duplicate_urls"] = _url_sample(all_urls, p.url)
                            p.audit_data["Content"]["duplicate_count"] = len(all_urls)
                            flag_modified(p, "audit_data")

            # 4f. Near Duplicates Detection (Pages sharing identical H1 or Title + word count within 15%)
            # Only between distinct Indexable pages that do NOT share a canonical target
            indexable_pages = [p for p in pages if (self.is_page_indexable(p) and (p.word_count or 0) >= 30)]
            # Same-H1 is required for a match, so compare only within H1 buckets (near-linear in practice).
            h1_buckets: Dict[str, List[Page]] = collections.defaultdict(list)
            for p in indexable_pages:
                if p.h1_1 and p.h1_1.strip():
                    h1_buckets[p.h1_1.strip().lower()].append(p)
            canon_of = {p.id: normalize_url_for_canonical(p.canonical_link_element_1 or p.url) for p in indexable_pages}
            near_matches: Dict[int, List[str]] = collections.defaultdict(list)
            for bucket in h1_buckets.values():
                if len(bucket) < 2:
                    continue
                for i in range(len(bucket)):
                    p1 = bucket[i]
                    for j in range(i + 1, len(bucket)):
                        p2 = bucket[j]
                        # Pages sharing a canonical target are consolidated, not competing duplicates.
                        if p1.url == p2.url or canon_of[p1.id] == canon_of[p2.id]:
                            continue
                        w1, w2 = p1.word_count or 1, p2.word_count or 1
                        if min(w1, w2) / max(w1, w2) >= 0.85:
                            near_matches[p1.id].append(p2.url)
                            near_matches[p2.id].append(p1.url)
            for p in indexable_pages:
                matches = near_matches.get(p.id)
                if matches and p.audit_data and "Content" in p.audit_data:
                    p.audit_data["Content"]["Near Duplicates"] = True
                    p.audit_data["Content"]["near_duplicate_urls"] = matches[:URL_SAMPLE_CAP]
                    p.audit_data["Content"]["near_duplicate_count"] = len(matches)
                    flag_modified(p, "audit_data")

            # 4g. Page type refinement: a page with no type signals that links to many product pages is a category.
            product_urls = {slash_key(p.url) for p in pages if (p.audit_data.get("Page_Type") or {}).get("Type") == "Product"}
            product_links = collections.defaultdict(set)
            if product_urls:
                async for source_id, outlinks in self._iter_outlinks():
                    for rec in outlinks:
                        if not rec.get("x") and (rec.get("t") or "A").upper() not in ("CANONICAL", "REDIRECT"):
                            dest_key = slash_key(rec.get("u"))
                            if dest_key in product_urls:
                                product_links[source_id].add(dest_key)
            for p in pages:
                pt = p.audit_data.get("Page_Type")
                if pt and pt.get("Type") == "Other" and len(product_links.get(p.id, ())) >= 5:
                    p.audit_data["Page_Type"] = {"Type": "Category",
                                                 "Signals": [f"Links to {len(product_links[p.id])} product pages"]}
                    flag_modified(p, "audit_data")

            # 4h. HTML pages left out of the duplicate checks above, and why (reported, not changed).
            duplicates_excluded = {"canonicalised": 0, "noindex": 0, "non_200": 0}
            for p in pages:
                if p.indexability_status == "External" or self.is_page_indexable(p):
                    continue
                if p.status_code != 200:
                    duplicates_excluded["non_200"] += 1
                elif "html" not in str(p.content_type or "html").lower():
                    continue
                elif (p.audit_data.get("Indexability") or {}).get("Non-Indexable Reason") == "Noindex" or p.audit_data.get("Directives", {}).get("NoIndex"):
                    duplicates_excluded["noindex"] += 1
                elif p.canonical_link_element_1:
                    duplicates_excluded["canonicalised"] += 1

            # 5. Compute Internal Link Score (PageRank 1-100 Algorithm)
            page_urls = [p.url for p in pages]
            n_pages = len(page_urls)
            link_scores: Dict[str, int] = {}
            if n_pages > 0:
                pr = {u: 1.0 / n_pages for u in page_urls}
                d = 0.85
                for _ in range(25):
                    new_pr = {}
                    dangling_sum = sum(pr[u] for u in page_urls if not internal_followed_out[u])
                    for u in page_urls:
                        incoming = sum(pr[v] / len(internal_followed_out[v]) for v in internal_followed_in[u])
                        new_pr[u] = ((1.0 - d) / n_pages) + d * (incoming + (dangling_sum / n_pages))
                    pr = new_pr

                min_pr = min(pr.values())
                max_pr = max(pr.values())
                if max_pr > min_pr:
                    log_min = math.log(max(min_pr, 1e-12))
                    log_max = math.log(max(max_pr, 1e-12))
                    if log_max > log_min:
                        for u in page_urls:
                            scaled = 1 + int(round(((math.log(max(pr[u], 1e-12)) - log_min) / (log_max - log_min)) * 99))
                            link_scores[u] = max(1, min(100, scaled))
                    else:
                        for u in page_urls:
                            scaled = 1 + int(round(((pr[u] - min_pr) / (max_pr - min_pr)) * 99))
                            link_scores[u] = max(1, min(100, scaled))
                else:
                    link_scores = {u: 50 for u in page_urls}

            # 6. Sitemap discovery (robots.txt Sitemap: lines + conventional paths), SSRF-guarded.
            #    Skipped for single-page audits: sitemap checks are site-level.
            from app.services.sitemaps import discover_sitemap_urls, sitemap_key, SitemapResult
            crawl_row = await self.db.get(Crawl, self.crawl_id)
            seed = (crawl_row.seed_url if crawl_row else None) or pages[0].url
            try:
                sitemap_result = SitemapResult() if self.mode == "page" else await discover_sitemap_urls(seed)
            except Exception as e:
                print(f"[PostProcessor] Sitemap discovery failed: {type(e).__name__}")
                from app.services.sitemaps import SitemapResult
                sitemap_result = SitemapResult(errors=[type(e).__name__])
            sitemap_keys = {sitemap_key(u) for u in sitemap_result.urls}
            crawled_keys = {sitemap_key(p.url) for p in pages}
            sitemap_only = sorted(u for u in sitemap_result.urls if sitemap_key(u) not in crawled_keys)
            from app.services.ai_crawlers import check_ai_crawler_access
            try:
                ai_crawlers = await check_ai_crawler_access(seed)
            except Exception as e:
                ai_crawlers = {"status": "error", "reason": type(e).__name__, "agents": []}
            crawl_summary_updates = {
                "ai_crawlers": ai_crawlers,
                "duplicates_excluded": duplicates_excluded,
                "sitemap": {
                    "found": sitemap_result.found,
                    "files": sitemap_result.sitemap_files[:50],
                    "url_count": len(sitemap_result.urls),
                    # Listed in the sitemap but never reached by following links: orphan candidates.
                    "not_linked_count": len(sitemap_only),
                    "not_linked_sample": sitemap_only[:100],
                    "errors": sitemap_result.errors[:20],
                }
            }

            # 7. Relational, Link & Sitemap Audits
            for p in pages:
                if not p.audit_data:
                    continue

                ad = dict(p.audit_data)

                # Check Title Same as H1
                if p.title_1 and p.h1_1 and p.title_1.strip().lower() == p.h1_1.strip().lower():
                    if "Page_Titles" in ad:
                        ad["Page_Titles"]["Same as H1"] = True

                # Check Canonicals
                canon_target = p.canonical_link_element_1
                if canon_target and "Canonicals" in ad:
                    # Self Referencing vs Canonicalised (normalized, consistent with indexability)
                    if normalize_url_for_canonical(canon_target) == normalize_url_for_canonical(p.url):
                        ad["Canonicals"]["Self Referencing"] = True
                        ad["Canonicals"]["Canonicalised"] = False
                    else:
                        ad["Canonicals"]["Self Referencing"] = False
                        ad["Canonicals"]["Canonicalised"] = True

                    # Only same-site canonicals can be linked internally; an external canonical is a different finding.
                    same_site = urlparse(canon_target).netloc.lower().removeprefix("www.") == urlparse(p.url).netloc.lower().removeprefix("www.")
                    ad["Canonicals"]["Unlinked"] = same_site and normalize_url_for_canonical(canon_target) not in hyperlinked_targets

                    # Non-Indexable Canonical Target Check
                    target_page = url_to_page.get(canon_target)
                    if target_page:
                        target_is_indexable = (target_page.status_code == 200 and str(target_page.indexability) in ("Indexable", "IndexabilityStatus.INDEXABLE"))
                        if not target_is_indexable:
                            ad["Canonicals"]["Non-Indexable Canonical"] = True

                # Check Inlinks, Outlinks, and Link Score
                page_inlinks = inlink_counts.get(p.url, 0)
                page_outlinks = outlink_counts.get(p.id, 0)
                p_score = link_scores.get(p.url, 50)

                ad.setdefault("Links", {})
                ad.setdefault("Internal", {})
                ad["Links"]["Link_Score"] = p_score
                p.inlinks_sample = inlinks_sample.get(p.url, [])
                ad["Links"]["Inlinks"] = page_inlinks
                ad["Links"]["Outlinks"] = page_outlinks
                ad["Internal"]["Link_Score"] = p_score
                ad["Internal"]["Inlinks"] = page_inlinks
                ad["Internal"]["Outlinks"] = page_outlinks

                # Screaming Frog Link Diagnostic Filters
                ad["Links"]["Pages With High Crawl Depth"] = (p.crawl_depth or 0) >= 4
                ad["Links"]["Pages With High Internal Outlinks"] = page_outlinks > 150
                
                sources = internal_followed_in.get(p.url, set())
                if sources:
                    all_sources_non_indexable = all(
                        (url_to_page[s].status_code != 200 or getattr(url_to_page[s], 'dir_noindex', False))
                        for s in sources if s in url_to_page
                    )
                    ad["Links"]["Non-Indexable Page Inlinks Only"] = all_sources_non_indexable
                else:
                    ad["Links"]["Non-Indexable Page Inlinks Only"] = False

                # Internal links pointing at broken / redirecting URLs (site-level check)
                bad_targets = links_to_non200.get(p.id, [])
                ad["Links"]["Internal Links To Broken Pages"] = any(
                    t.status_code == 0 or t.status_code >= 400 for t in bad_targets)
                ad["Links"]["Internal Links To Redirects"] = any(300 <= t.status_code < 400 for t in bad_targets)

                # Sitemaps reconciliation. Without a sitemap these checks are not evaluated (None),
                # never "failed" for every page.
                ad.setdefault("Sitemaps", {})
                is_html_page = p.status_code == 200 and "html" in (p.content_type or "html").lower()
                if not sitemap_result.found:
                    for k in ("URLs In Sitemap", "URLs Not In Sitemap", "Non-Indexable URLs in Sitemap"):
                        ad["Sitemaps"][k] = None
                else:
                    in_sitemap = sitemap_key(p.url) in sitemap_keys
                    ad["Sitemaps"]["URLs In Sitemap"] = in_sitemap
                    is_canonicalised = bool(ad.get("Canonicals", {}).get("Canonicalised"))
                    indexable = is_html_page and not bool(p.dir_noindex) and not is_canonicalised
                    ad["Sitemaps"]["Non-Indexable URLs in Sitemap"] = in_sitemap and not indexable
                    ad["Sitemaps"]["URLs Not In Sitemap"] = (not in_sitemap) and indexable
                # Pages reached by link-following always have an inlink (or are the seed), so true
                # orphans are the sitemap-only URLs recorded on the crawl summary instead.
                ad["Sitemaps"]["Orphan URLs"] = None

                p.audit_data = ad
                flag_modified(p, "audit_data")
                self.db.add(p)

            if crawl_row is not None:
                crawl_row.summary = {**(crawl_row.summary or {}), **crawl_summary_updates}
                flag_modified(crawl_row, "summary")
            await self.db.commit()
            print(f"[PostProcessor] Successfully processed crawl {self.crawl_id} ({len(pages)} pages, {total_links} links).")

        except Exception as e:
            print(f"Error in PostProcessor for crawl {self.crawl_id}: {e}")
            await self.db.rollback()
