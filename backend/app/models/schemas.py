import os
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any, Literal
from datetime import datetime

# Upper bound on pages per crawl (team default 1000, keeps the one stored crawl small); override with
# the MAX_CRAWL_PAGES env var, e.g. for larger plans once crawls run on a worker tier.
MAX_CRAWL_PAGES = int(os.getenv("MAX_CRAWL_PAGES", "1000"))

class CrawlRequest(BaseModel):
    seed_url: str = Field(..., min_length=3, max_length=2048)
    # "site" crawls by following links; "page" audits only seed_url (following redirects).
    mode: Literal["site", "page"] = "site"
    max_depth: int = Field(4, ge=0, le=100)
    max_concurrent: int = Field(10, ge=1, le=15)
    max_pages: int = Field(500, ge=1, le=MAX_CRAWL_PAGES)
    stealth_delay: float = Field(0.0, ge=0.0, le=10.0)
    ignore_url_params: bool = True
    check_external_links: bool = False
    exclude_paths: str = Field("", max_length=5000)
    ignore_robots: bool = False
    js_rendering: bool = False
    user_agent: str = Field("", max_length=256)
    crawl_author_archives: bool = False
    # Started from a sub-folder (e.g. /news/)? Only crawl inside it, as Screaming Frog does by default.
    stay_in_folder: bool = True

class CrawlResponse(BaseModel):
    id: int
    project_id: int
    mode: str = "site"
    seed_url: str
    status: str
    started_at: datetime

class PageSummary(BaseModel):
    id: int
    url: str
    status_code: Optional[int] = None
    status_name: Optional[str] = None
    content_type: Optional[str] = None
    indexability: Optional[str] = None
    indexability_status: Optional[str] = None
    crawl_depth: Optional[int] = None
    folder_depth: Optional[int] = None
    response_time_ms: Optional[int] = None
    word_count: Optional[int] = None
    size_bytes: Optional[int] = None
    content_hash: Optional[str] = None
    title_1: Optional[str] = None
    title_1_length: Optional[int] = None
    title_1_pixel_width: Optional[int] = None
    meta_desc_1: Optional[str] = None
    meta_desc_1_length: Optional[int] = None
    meta_desc_1_pixel_width: Optional[int] = None
    meta_keyword_1: Optional[str] = None
    meta_keyword_1_length: Optional[int] = None
    h1_1: Optional[str] = None
    h1_1_length: Optional[int] = None
    h1_2: Optional[str] = None
    h1_2_length: Optional[int] = None
    h2_1: Optional[str] = None
    h2_1_length: Optional[int] = None
    h2_2: Optional[str] = None
    h2_2_length: Optional[int] = None
    canonical_link_element_1: Optional[str] = None
    meta_robots_1: Optional[str] = None
    audit_data: Optional[Dict[str, Any]] = None
    
    class Config:
        from_attributes = True

class LinkSummary(BaseModel):
    id: int
    source_page_id: int
    source_url: Optional[str] = None
    destination_url: str
    anchor_text: Optional[str] = None
    is_follow: bool
    link_type: str
    is_internal: bool
    
    class Config:
        from_attributes = True
