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

class CrawlResponse(BaseModel):
    id: int
    project_id: int
    seed_url: str
    status: str
    started_at: datetime

class PageSummary(BaseModel):
    id: int
    url: str
    status_code: Optional[int]
    status_name: Optional[str]
    indexability: Optional[str]
    indexability_status: Optional[str]
    title_1: Optional[str]
    title_1_length: Optional[int]
    meta_desc_1: Optional[str]
    meta_desc_1_length: Optional[int]
    h1_1: Optional[str]
    word_count: Optional[int]
    size_bytes: Optional[int]
    response_time_ms: Optional[int]
    folder_depth: Optional[int]
    audit_data: Optional[Dict[str, Any]] = None
    
    class Config:
        from_attributes = True

class LinkSummary(BaseModel):
    id: int
    source_page_id: int
    destination_url: str
    anchor_text: Optional[str]
    is_follow: bool
    link_type: str
    is_internal: bool
    
    class Config:
        from_attributes = True
