from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, Boolean, ForeignKey, DateTime, Text, Enum, JSON, Index, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship, deferred
import enum
from typing import Optional
from app.core.database import Base
from app.core.security import encrypt_secret, decrypt_secret

class IndexabilityStatus(str, enum.Enum):
    INDEXABLE = "Indexable"
    NON_INDEXABLE = "Non-Indexable"

class NonIndexableReason(str, enum.Enum):
    NONE = "None"
    NOINDEX = "Noindex"
    CANONICALISED = "Canonicalised"
    ROBOTS_BLOCKED = "Blocked by robots.txt"
    CLIENT_ERROR = "Client Error"
    SERVER_ERROR = "Server Error"

class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    user_id = Column(String(128), nullable=True, unique=True, index=True)  # one workspace per user
    created_at = Column(DateTime, default=datetime.utcnow)
    
    crawls = relationship("Crawl", back_populates="project", cascade="all, delete-orphan")

class Crawl(Base):
    __tablename__ = "crawls"

    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    seed_url = Column(String(2048), nullable=False)
    status = Column(String(50), default="running") # running, completed, failed
    started_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    # "site" = full crawl, "page" = single-page audit (both can coexist per workspace).
    mode = Column(String(10), nullable=False, default="site", server_default="site")
    # Crawl-level facts (sitemap discovery, scores, integration results) stored once, not per page.
    summary = Column(JSON().with_variant(JSONB, 'postgresql'), nullable=True)

    project = relationship("Project", back_populates="crawls")
    pages = relationship("Page", back_populates="crawl", cascade="all, delete-orphan")
    links = relationship("Link", back_populates="crawl", cascade="all, delete-orphan")
    images = relationship("Image", back_populates="crawl", cascade="all, delete-orphan")

class Page(Base):
    __tablename__ = "pages"

    id = Column(Integer, primary_key=True)
    crawl_id = Column(Integer, ForeignKey("crawls.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # 1. Core URI & Response Data
    url = Column(String(2048), nullable=False, index=True)
    content_type = Column(String(100), nullable=True)
    status_code = Column(Integer, nullable=True)
    status_name = Column(String(100), nullable=True)
    indexability = Column(Enum(IndexabilityStatus), default=IndexabilityStatus.INDEXABLE)
    indexability_status = Column(String(255), default="None")
    response_time_ms = Column(Integer, nullable=True)
    size_bytes = Column(Integer, nullable=True)
    content_hash = Column(String(32), nullable=True) # MD5 hash
    title_hash = Column(String(32), nullable=True) # MD5 hash of title
    word_count = Column(Integer, nullable=True)
    text_to_html_ratio = Column(Float, nullable=True)
    crawl_depth = Column(Integer, nullable=True)
    folder_depth = Column(Integer, nullable=True)

    # 3. On-Page Elements
    title_1 = Column(String(2048), nullable=True)
    title_1_length = Column(Integer, nullable=True)
    title_1_pixel_width = Column(Integer, nullable=True)
    
    meta_desc_1 = Column(Text, nullable=True)
    meta_desc_1_length = Column(Integer, nullable=True)
    meta_desc_1_pixel_width = Column(Integer, nullable=True)
    
    meta_keyword_1 = Column(Text, nullable=True)
    meta_keyword_1_length = Column(Integer, nullable=True)
    
    h1_1 = Column(Text, nullable=True)
    h1_1_length = Column(Integer, nullable=True)
    h1_2 = Column(Text, nullable=True)
    h1_2_length = Column(Integer, nullable=True)
    
    h2_1 = Column(Text, nullable=True)
    h2_1_length = Column(Integer, nullable=True)
    h2_2 = Column(Text, nullable=True)
    h2_2_length = Column(Integer, nullable=True)

    # 4. Directives & Indexation
    meta_robots_1 = Column(String(255), nullable=True)
    x_robots_tag_1 = Column(String(255), nullable=True)
    canonical_link_element_1 = Column(String(2048), nullable=True)
    rel_next_1 = Column(String(2048), nullable=True)
    rel_prev_1 = Column(String(2048), nullable=True)
    
    dir_index = Column(Boolean, default=True)
    dir_noindex = Column(Boolean, default=False)
    dir_follow = Column(Boolean, default=True)
    dir_nofollow = Column(Boolean, default=False)
    dir_noarchive = Column(Boolean, default=False)
    dir_nosnippet = Column(Boolean, default=False)
    dir_noodp = Column(Boolean, default=False)
    dir_nootranstale = Column(Boolean, default=False)
    dir_noimageindex = Column(Boolean, default=False)
    
    # 5. Advanced Audit Data (Store all 32 parameters as nested JSON / JSONB)
    audit_data = Column(JSON().with_variant(JSONB, 'postgresql'), nullable=True)

    # 6. Link data kept on the page instead of one row per link (see app/services/link_store.py).
    # Deferred: large, only read by the link endpoints and post-processing, never by the page list.
    outlinks = deferred(Column(JSON().with_variant(JSONB, 'postgresql'), nullable=True))  # [{u, a, n, t, x}]
    inlinks_sample = deferred(Column(JSON().with_variant(JSONB, 'postgresql'), nullable=True))  # [{p, a, n}] max 100

    crawl = relationship("Crawl", back_populates="pages")

    __table_args__ = (
        UniqueConstraint("crawl_id", "url", name="uq_pages_crawl_url"),
        Index("ix_pages_crawl_url", "crawl_id", "url"),
        Index("ix_pages_crawl_status", "crawl_id", "status_code"),
        Index("ix_pages_crawl_indexability", "crawl_id", "indexability"),
        Index("ix_pages_crawl_depth", "crawl_id", "crawl_depth"),
    )

class Link(Base):
    # Legacy: no longer read or written (links live on Page.outlinks). Dropped in a later migration.
    __tablename__ = "links"

    id = Column(Integer, primary_key=True)
    crawl_id = Column(Integer, ForeignKey("crawls.id", ondelete="CASCADE"), nullable=False, index=True)
    source_page_id = Column(Integer, ForeignKey("pages.id", ondelete="CASCADE"), nullable=False, index=True)
    destination_url = Column(String(2048), nullable=False, index=True)
    
    anchor_text = Column(Text, nullable=True)
    is_follow = Column(Boolean, default=True)
    link_type = Column(String(50), default="A") # A, IMG, CANONICAL, HREFLANG
    is_internal = Column(Boolean, default=True)

    crawl = relationship("Crawl", back_populates="links")
    source_page = relationship("Page", foreign_keys=[source_page_id])

    __table_args__ = (
        Index("ix_links_crawl_source", "crawl_id", "source_page_id"),
        Index("ix_links_crawl_dest", "crawl_id", "destination_url"),
        Index("ix_links_crawl_internal", "crawl_id", "is_internal"),
        Index("ix_links_crawl_type", "crawl_id", "link_type"),
    )

class Image(Base):
    __tablename__ = "images"

    id = Column(Integer, primary_key=True)
    crawl_id = Column(Integer, ForeignKey("crawls.id", ondelete="CASCADE"), nullable=False, index=True)
    page_id = Column(Integer, ForeignKey("pages.id", ondelete="CASCADE"), nullable=False, index=True)
    
    url = Column(String(2048), nullable=False)
    alt_text = Column(Text, nullable=True)
    size_bytes = Column(Integer, nullable=True)

    crawl = relationship("Crawl", back_populates="images")
    page = relationship("Page", backref="page_images")

    __table_args__ = (
        Index("ix_images_crawl_page", "crawl_id", "page_id"),
        Index("ix_images_crawl_url", "crawl_id", "url"),
    )

from sqlalchemy.types import TypeDecorator

class EncryptedText(TypeDecorator):
    """
    Transparently encrypts sensitive values (AES-128-CBC) before writing to the database,
    and automatically decrypts them upon reading.
    Backwards-compatible: legacy plain-text values in the database are returned as-is.
    """
    impl = Text
    cache_ok = True

    def process_bind_param(self, value, dialect):
        return encrypt_secret(value) if value is not None else None

    def process_result_value(self, value, dialect):
        return decrypt_secret(value) if value is not None else None

class Integration(Base):
    __tablename__ = "integrations"

    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String(128), nullable=True, index=True)
    integration_type = Column(String(50), nullable=False) # e.g., "google_analytics", "search_console", "pagespeed", "openai", "perplexity", "serpapi"
    connected = Column(Boolean, default=False)
    api_key = Column(EncryptedText, nullable=True)
    access_token = Column(EncryptedText, nullable=True)
    refresh_token = Column(EncryptedText, nullable=True)
    expires_at = Column(DateTime, nullable=True)
    config_json = Column(JSON().with_variant(JSONB, 'postgresql'), nullable=True)

    project = relationship("Project", backref="integrations")

    __table_args__ = (
        UniqueConstraint("project_id", "integration_type", name="uq_integrations_project_service"),
        Index("ix_integrations_project_type", "project_id", "integration_type"),
    )



