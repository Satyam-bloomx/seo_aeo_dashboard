import asyncio
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.models.domain import Page, Link
import collections
import json

from sqlalchemy.orm.attributes import flag_modified

class PostProcessor:
    def __init__(self, crawl_id: int, db: AsyncSession):
        self.crawl_id = crawl_id
        self.db = db
        
    async def run(self):
        res = await self.db.execute(select(Page).where(Page.crawl_id == self.crawl_id))
        pages = res.scalars().all()
        
        res_links = await self.db.execute(select(Link).where(Link.crawl_id == self.crawl_id))
        links = res_links.scalars().all()
        
        inlink_counts = collections.defaultdict(int)
        for link in links:
            inlink_counts[link.destination_url] += 1
            
        title_hashes = collections.defaultdict(list)
        content_hashes = collections.defaultdict(list)
        
        for p in pages:
            t_hash = getattr(p, 'title_hash', None)
            c_hash = getattr(p, 'content_hash', None)
            if t_hash: title_hashes[t_hash].append(p)
            if c_hash: content_hashes[c_hash].append(p)
                
        for h, page_list in title_hashes.items():
            if len(page_list) > 1 and h:
                for p in page_list:
                    if p.audit_data:
                        ad = dict(p.audit_data)
                        if "Page_Titles" in ad:
                            ad["Page_Titles"]["Duplicate"] = True
                        p.audit_data = ad
                        flag_modified(p, "audit_data")
                        
        for h, page_list in content_hashes.items():
            if len(page_list) > 1 and h:
                for p in page_list:
                    if p.audit_data:
                        ad = dict(p.audit_data)
                        if "Content" in ad:
                            ad["Content"]["Exact Duplicates"] = True
                        p.audit_data = ad
                        flag_modified(p, "audit_data")

        for p in pages:
            if p.audit_data:
                ad = dict(p.audit_data)
                
                if inlink_counts.get(p.url, 0) == 0 and (p.crawl_depth or 0) > 0:
                    if "Sitemaps" in ad: ad["Sitemaps"]["Orphan URLs"] = True
                    if "Analytics" in ad: ad["Analytics"]["Orphan URLs"] = True
                    
                p.audit_data = ad
                flag_modified(p, "audit_data")
                self.db.add(p)
                
        await self.db.commit()

