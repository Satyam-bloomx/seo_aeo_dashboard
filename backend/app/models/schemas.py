from pydantic import BaseModel, HttpUrl
from typing import List, Optional, Dict, Any
from datetime import datetime

class CrawlRequest(BaseModel):
    seed_url: str
    max_depth: int = 4
    max_concurrent: int = 5
    max_pages: int = 500
    stealth_delay: float = 0.0
    ignore_url_params: bool = True
    check_external_links: bool = False
    exclude_paths: str = ""
    ignore_robots: bool = False
    js_rendering: bool = False
    user_agent: str = "SEO-Spider-Bot"
    crawl_author_archives: bool = False

class CrawlResponse(BaseModel):
    id: int
    project_id: int
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
