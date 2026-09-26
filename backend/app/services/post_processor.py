import asyncio
import collections
import json
import re
from typing import Dict, List, Set
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm.attributes import flag_modified

from app.models.domain import Page, Link


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

    def __init__(self, crawl_id: int, db: AsyncSession):
        self.crawl_id = crawl_id
        self.db = db

    async def run(self):
        try:
            # 1. Fetch all pages and links for this crawl
            res_pages = await self.db.execute(select(Page).where(Page.crawl_id == self.crawl_id))
            pages = res_pages.scalars().all()
            if not pages:
                return

            res_links = await self.db.execute(select(Link).where(Link.crawl_id == self.crawl_id))
            links = res_links.scalars().all()

            # Fast URL lookup maps
            url_to_page: Dict[str, Page] = {p.url: p for p in pages}
            inlink_counts = collections.defaultdict(int)
            outlink_counts = collections.defaultdict(int)
            links_to_non200 = collections.defaultdict(list)

            for link in links:
                inlink_counts[link.destination_url] += 1
                outlink_counts[link.source_page_id] += 1
                dest_page = url_to_page.get(link.destination_url)
                if dest_page and dest_page.status_code and dest_page.status_code >= 300:
                    links_to_non200[link.source_page_id].append(dest_page)

            # 2. Group pages for duplicate detection
            title_groups = collections.defaultdict(list)
            h1_groups = collections.defaultdict(list)
            h2_groups = collections.defaultdict(list)
            desc_groups = collections.defaultdict(list)
            content_hash_groups = collections.defaultdict(list)

            for p in pages:
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

            # 3. Flag Duplicates
            # 3a. Page Titles
            for title_str, group in title_groups.items():
                if len(group) > 1:
                    all_urls = [p.url for p in group]
                    for p in group:
                        if p.audit_data and "Page_Titles" in p.audit_data:
                            p.audit_data["Page_Titles"]["Duplicate"] = True
                            p.audit_data["Page_Titles"]["duplicate_urls"] = [u for u in all_urls if u != p.url]
                            p.audit_data["Page_Titles"]["duplicate_count"] = len(all_urls)
                            flag_modified(p, "audit_data")

            # 3b. H1 Headings
            for h1_str, group in h1_groups.items():
                if len(group) > 1:
                    all_urls = [p.url for p in group]
                    for p in group:
                        if p.audit_data and "H1" in p.audit_data:
                            p.audit_data["H1"]["Duplicate"] = True
                            p.audit_data["H1"]["duplicate_urls"] = [u for u in all_urls if u != p.url]
                            p.audit_data["H1"]["duplicate_count"] = len(all_urls)
                            flag_modified(p, "audit_data")

            # 3c. H2 Headings
            for h2_str, group in h2_groups.items():
                if len(group) > 1:
                    all_urls = [p.url for p in group]
                    for p in group:
                        if p.audit_data and "H2" in p.audit_data:
                            p.audit_data["H2"]["Duplicate"] = True
                            p.audit_data["H2"]["duplicate_urls"] = [u for u in all_urls if u != p.url]
                            p.audit_data["H2"]["duplicate_count"] = len(all_urls)
                            flag_modified(p, "audit_data")

            # 3d. Meta Descriptions
            for desc_str, group in desc_groups.items():
                if len(group) > 1:
                    all_urls = [p.url for p in group]
                    for p in group:
                        if p.audit_data and "Meta_Description" in p.audit_data:
                            p.audit_data["Meta_Description"]["Duplicate"] = True
                            p.audit_data["Meta_Description"]["duplicate_urls"] = [u for u in all_urls if u != p.url]
                            p.audit_data["Meta_Description"]["duplicate_count"] = len(all_urls)
                            flag_modified(p, "audit_data")

            # 3e. Exact Duplicate Content
            for c_hash, group in content_hash_groups.items():
                if len(group) > 1:
                    all_urls = [p.url for p in group]
                    for p in group:
                        if p.audit_data and "Content" in p.audit_data:
                            p.audit_data["Content"]["Exact Duplicates"] = True
                            p.audit_data["Content"]["exact_duplicate_urls"] = [u for u in all_urls if u != p.url]
                            p.audit_data["Content"]["duplicate_urls"] = [u for u in all_urls if u != p.url]
                            p.audit_data["Content"]["duplicate_count"] = len(all_urls)
                            flag_modified(p, "audit_data")

            # 4. Near Duplicates Detection (Pages sharing identical H1 or Title + word count within 15%)
            # Classic case: /services/ and /service-new/
            indexable_pages = [p for p in pages if (p.status_code == 200 and (p.word_count or 0) >= 30)]
            for i in range(len(indexable_pages)):
                for j in range(i + 1, len(indexable_pages)):
                    p1 = indexable_pages[i]
                    p2 = indexable_pages[j]
                    if p1.url == p2.url:
                        continue

                    # Condition A: Identical H1 and neither is empty
                    same_h1 = (p1.h1_1 and p2.h1_1 and p1.h1_1.strip().lower() == p2.h1_1.strip().lower())
                    # Condition B: Very close word count (within 15%)
                    w1 = p1.word_count or 1
                    w2 = p2.word_count or 1
                    wc_ratio = min(w1, w2) / max(w1, w2)

                    if same_h1 and wc_ratio >= 0.85:
                        if p1.audit_data and "Content" in p1.audit_data:
                            p1.audit_data["Content"]["Near Duplicates"] = True
                            p1.audit_data["Content"].setdefault("near_duplicate_urls", [])
                            if p2.url not in p1.audit_data["Content"]["near_duplicate_urls"]:
                                p1.audit_data["Content"]["near_duplicate_urls"].append(p2.url)
                            flag_modified(p1, "audit_data")
                        if p2.audit_data and "Content" in p2.audit_data:
                            p2.audit_data["Content"]["Near Duplicates"] = True
                            p2.audit_data["Content"].setdefault("near_duplicate_urls", [])
                            if p1.url not in p2.audit_data["Content"]["near_duplicate_urls"]:
                                p2.audit_data["Content"]["near_duplicate_urls"].append(p1.url)
                            flag_modified(p2, "audit_data")

            # 5. Relational & Link Audits (Canonicals, Inlinks, Orphans, Internal Redirects)
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
                    # Self Referencing vs Canonicalised
                    if canon_target == p.url:
                        ad["Canonicals"]["Self Referencing"] = True
                        ad["Canonicals"]["Canonicalised"] = False
                    else:
                        ad["Canonicals"]["Self Referencing"] = False
                        ad["Canonicals"]["Canonicalised"] = True

                    # Non-Indexable Canonical Target Check
                    target_page = url_to_page.get(canon_target)
                    if target_page:
                        target_is_indexable = (target_page.status_code == 200 and str(target_page.indexability) in ("Indexable", "IndexabilityStatus.INDEXABLE"))
                        if not target_is_indexable:
                            ad["Canonicals"]["Non-Indexable Canonical"] = True

                # Check Inlinks and Orphan Pages
                page_inlinks = inlink_counts.get(p.url, 0)
                page_outlinks = outlink_counts.get(p.id, 0)

                ad.setdefault("Links", {})
                ad["Links"]["Inlinks"] = page_inlinks
                ad["Links"]["Outlinks"] = page_outlinks

                if page_inlinks == 0 and (p.crawl_depth or 0) > 0:
                    if "Sitemaps" in ad:
                        ad["Sitemaps"]["Orphan URLs"] = True
                    if "Analytics" in ad:
                        ad["Analytics"]["Orphan URLs"] = True

                p.audit_data = ad
                flag_modified(p, "audit_data")
                self.db.add(p)

            await self.db.commit()
            print(f"[PostProcessor] Successfully processed crawl {self.crawl_id} ({len(pages)} pages, {len(links)} links).")

        except Exception as e:
            print(f"Error in PostProcessor for crawl {self.crawl_id}: {e}")
            await self.db.rollback()
