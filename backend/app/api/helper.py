"""AuditPro Helper endpoints: the dashboard relays work between the crawler and the browser extension.

    GET  /api/helper/info                      latest helper version the app offers
    GET  /api/helper/download                  the helper zip (signed-in users only)
    GET  /api/crawls/{id}/helper/batch         heartbeat + URLs the crawler wants the helper to fetch
    POST /api/crawls/{id}/helper/results       results (and progress/state) from the helper
    POST /api/crawls/{id}/helper/capture       add a tab captured with "Audit this tab" to a running crawl
    POST /api/helper/capture-audit             start a single-page audit from a captured tab

Only URLs the crawler actually offered (or, for captures, pages of the crawl's own site) are accepted, each at most
once, from the crawl's owner, with bounded sizes. See app/services/helper_exchange.py for the transport.
"""
import json
import logging
import os
import re
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.core.auth import UserSession, get_current_user, get_user_project_id
from app.core.database import get_db
from app.core.rate_limit import rate_limit
from app.core.url_safety import UnsafeURLError, assert_public_url
from app.models.domain import Crawl
from app.models.schemas import CrawlRequest
from app.services import helper_exchange as hx

router = APIRouter()
logger = logging.getLogger(__name__)

_VERSION_RE = re.compile(r"^\d{1,4}(\.\d{1,4}){0,3}$")
_ZIP_RE = re.compile(r"^auditpro-helper-(\d{1,4}(?:\.\d{1,4}){0,3})\.zip$")


# ------------------------------------------------------------------ download and version

def _dist_dirs() -> List[Path]:
    env = os.getenv("HELPER_DIST_DIR")
    backend = Path(__file__).resolve().parents[2]
    dirs = [Path(env)] if env else []
    return dirs + [backend / "helper_dist", backend.parent / "extension" / "dist"]


def _version_tuple(v: str):
    return tuple(int(x) for x in v.split("."))


def latest_helper_zip() -> Optional[tuple]:
    """(version, path) of the newest auditpro-helper-<version>.zip, or None."""
    best = None
    for d in _dist_dirs():
        try:
            entries = list(d.iterdir()) if d.is_dir() else []
        except OSError:
            continue
        for f in entries:
            m = _ZIP_RE.match(f.name)
            if m and f.is_file() and (best is None or _version_tuple(m.group(1)) > _version_tuple(best[0])):
                best = (m.group(1), f)
    return best


@router.get("/helper/info")
async def helper_info(user: UserSession = Depends(get_current_user)):
    found = latest_helper_zip()
    return {"available": bool(found), "version": found[0] if found else None,
            "filename": found[1].name if found else None, "extension_id": "phncnhdoeonnplmhjghkdogejgeglmnd",
            "protocol": 1}


@router.get("/helper/download")
async def helper_download(user: UserSession = Depends(get_current_user)):
    found = latest_helper_zip()
    if not found:
        raise HTTPException(status_code=404, detail="The helper download is not available on this server yet.")
    return FileResponse(found[1], media_type="application/zip", filename=found[1].name)


# ------------------------------------------------------------------ request models

class HelperRedirect(BaseModel):
    url: str = Field(..., max_length=2048)
    status: Optional[int] = Field(None, ge=0, le=599)


class HelperResultIn(BaseModel):
    url: str = Field(..., max_length=2048)
    final_url: Optional[str] = Field(None, max_length=2048)
    status: int = Field(0, ge=0, le=599)
    headers: Dict[str, Any] = Field(default_factory=dict)
    html_gzip_b64: Optional[str] = Field(None, max_length=hx.MAX_HELPER_GZ_B64)
    truncated: bool = False
    redirects: List[HelperRedirect] = Field(default_factory=list, max_length=20)
    timing_ms: int = Field(0, ge=0, le=10_000_000)
    attempts: int = Field(1, ge=0, le=3)
    outcome: Literal["ok", "site_error", "crawler_error", "blocked", "unverified", "robots_blocked"]
    side: Optional[Literal["site", "ours", "unknown", "blocked"]] = None
    reason: Optional[str] = Field(None, max_length=500)
    provider: Optional[str] = Field(None, max_length=40)


class HelperResultsIn(BaseModel):
    batch_id: str = Field(..., min_length=1, max_length=64)
    results: List[HelperResultIn] = Field(default_factory=list, max_length=hx.MAX_RESULTS_PER_POST)
    state: Optional[Literal[hx.HELPER_STATES]] = None  # type: ignore[valid-type]
    progress: Optional[Dict[str, Any]] = None


class CaptureIn(BaseModel):
    url: str = Field(..., max_length=2048)
    final_url: Optional[str] = Field(None, max_length=4096)
    title: Optional[str] = Field(None, max_length=1000)
    html_gzip_b64: str = Field(..., max_length=hx.MAX_HELPER_GZ_B64)
    captured_at: Optional[int] = None


async def _read_json(request: Request, model, cap: Optional[int] = None):
    """Parse a size-capped JSON body: the stream is cut off at `cap` bytes before anything is decoded."""
    cap = cap or hx.MAX_RESULTS_BODY_BYTES
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > cap:
        raise HTTPException(status_code=413, detail="Too much data in one request.")
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > cap:
            raise HTTPException(status_code=413, detail="Too much data in one request.")
    try:
        return model.model_validate(json.loads(body or b"null"))
    except (ValueError, ValidationError) as e:
        errors = e.errors() if isinstance(e, ValidationError) else []
        detail = "; ".join(f"{'.'.join(str(p) for p in err['loc'])}: {err['msg']}" for err in errors[:5]) or "Invalid JSON"
        raise HTTPException(status_code=422, detail=detail)


async def _owned(db: AsyncSession, crawl_id: int, user: UserSession) -> Crawl:
    project_id = await get_user_project_id(db, user)
    crawl = await db.get(Crawl, crawl_id)
    if not crawl or crawl.project_id != project_id:
        raise HTTPException(status_code=404, detail="Crawl not found")
    return crawl


def _sanitize_progress(progress: Optional[dict]) -> Optional[dict]:
    if not isinstance(progress, dict):
        return None
    keys = ("total", "done", "ok", "site_error", "crawler_error", "blocked", "unverified", "robots_blocked",
            "queued", "parked", "inflight", "pass")
    out = {k: int(progress[k]) for k in keys if isinstance(progress.get(k), (int, float)) and 0 <= progress[k] <= 10**6}
    if isinstance(progress.get("paused"), bool):
        out["paused"] = progress["paused"]
    return out


def _is_http(url: Optional[str]) -> bool:
    try:
        return bool(url) and urlparse(url).scheme in ("http", "https") and bool(urlparse(url).hostname)
    except ValueError:
        return False


# ------------------------------------------------------------------ batch relay

@router.get("/crawls/{crawl_id}/helper/batch")
async def get_helper_batch(
    crawl_id: int,
    helper_version: Optional[str] = Query(None, max_length=20),
    db: AsyncSession = Depends(get_db),
    user: UserSession = Depends(get_current_user),
):
    """Polled by the dashboard while a crawl runs. With `helper_version` the call is also the heartbeat that says a
    helper is connected in this user's browser: only then does the crawler offer it work."""
    crawl = await _owned(db, crawl_id, user)
    summary = crawl.summary or {}
    running = crawl.status == "running"
    ex = hx.get_exchange()
    if running and helper_version and _VERSION_RE.match(helper_version):
        await ex.touch_presence(crawl_id, {"version": helper_version})
    batch = await ex.get_batch(crawl_id) if running else None
    out_batch = None
    if batch:
        answered = set(await ex.answered_keys(crawl_id))
        urls = [u for u in batch["urls"] if hx.url_key(u) not in answered]
        out_batch = {k: batch.get(k) for k in ("batch_id", "round", "site", "total", "deadline_s", "idle_s", "opened_at")}
        out_batch.update(urls=urls, answered=len(answered))
    return {"crawl_status": crawl.status, "phase": summary.get("phase"), "batch": out_batch,
            "helper": summary.get("helper")}


@router.post("/crawls/{crawl_id}/helper/results")
async def post_helper_results(
    crawl_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: UserSession = Depends(get_current_user),
):
    crawl = await _owned(db, crawl_id, user)
    payload: HelperResultsIn = await _read_json(request, HelperResultsIn)
    if crawl.status != "running":
        raise HTTPException(status_code=409, detail="This audit is no longer running.")
    ex = hx.get_exchange()
    batch = await ex.get_batch(crawl_id)
    if not batch or batch.get("batch_id") != payload.batch_id:
        raise HTTPException(status_code=409, detail="This helper batch is closed; the server kept its own results.")

    accepted, rejected = [], []
    for r in payload.results:
        if not hx.url_in_site(r.url, crawl.seed_url):
            rejected.append({"url": r.url[:300], "reason": "Not a page of this audit's site."})
            continue
        try:
            html = hx.decode_html(r.html_gzip_b64)
        except hx.HelperPayloadError as e:
            rejected.append({"url": r.url[:300], "reason": str(e)})
            continue
        final_url = r.final_url if _is_http(r.final_url) else r.url
        if not hx.url_in_site(final_url, crawl.seed_url):
            html = None  # redirected off the site: only the redirect is recorded, never another site's HTML
        offered = await ex.claim(crawl_id, payload.batch_id, hx.url_key(r.url))
        if offered is None:
            rejected.append({"url": r.url[:300], "reason": "This URL was not requested from the helper, or was already answered."})
            continue
        accepted.append({
            "url": offered, "final_url": final_url, "status": r.status, "headers": hx.clean_headers(r.headers),
            "html": html, "truncated": r.truncated,
            "redirects": [{"url": h.url, "status": h.status or 301} for h in r.redirects if _is_http(h.url)],
            "timing_ms": r.timing_ms, "attempts": r.attempts, "outcome": r.outcome, "side": r.side,
            "reason": (r.reason or "")[:300] or None, "provider": r.provider,
        })
    if accepted:
        await ex.push_results(crawl_id, accepted)
    await ex.note_activity(crawl_id, payload.state, _sanitize_progress(payload.progress))
    answered = len(await ex.answered_keys(crawl_id))
    return {"accepted": len(accepted), "rejected": rejected, "remaining": max(0, len(batch["urls"]) - answered)}


# ------------------------------------------------------------------ "Audit this tab"

def _decode_capture(cap: CaptureIn) -> str:
    if not _is_http(cap.url):
        raise HTTPException(status_code=400, detail="Only web pages (http or https) can be audited.")
    try:
        html = hx.decode_html(cap.html_gzip_b64)
    except hx.HelperPayloadError as e:
        raise HTTPException(status_code=413 if "large" in str(e) else 400, detail=f"The captured page could not be used: {e}.")
    if not html or not html.strip():
        raise HTTPException(status_code=400, detail="The captured page is empty.")
    return html


@router.post("/crawls/{crawl_id}/helper/capture")
async def add_capture_to_crawl(
    crawl_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: UserSession = Depends(get_current_user),
):
    """Add a captured tab to a crawl that is still running (same site only)."""
    crawl = await _owned(db, crawl_id, user)
    cap: CaptureIn = await _read_json(request, CaptureIn, cap=hx.MAX_HELPER_GZ_B64 + 64 * 1024)
    if crawl.status != "running" or (crawl.summary or {}).get("phase") in ("analysing", "enriching"):
        raise HTTPException(status_code=409, detail="This audit is no longer fetching pages. Audit the captured page on its own instead.")
    if not hx.url_in_site(cap.url, crawl.seed_url):
        raise HTTPException(status_code=400, detail="The captured page is not on the site this audit is crawling.")
    html = _decode_capture(cap)
    from app.api.endpoints import normalize_seed_url
    await hx.get_exchange().push_capture(crawl_id, {"url": normalize_seed_url(cap.url.split("#")[0]), "html": html,
                                                    "title": (cap.title or "")[:300]})
    return {"queued": True, "message": "The captured page will be added to this audit before it finishes."}


@router.post("/helper/capture-audit", dependencies=[Depends(rate_limit("crawl"))])
async def start_capture_audit(
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: UserSession = Depends(get_current_user),
):
    """Start a single-page audit of a captured tab: the captured HTML is analysed instead of fetching the page."""
    from app.api.endpoints import _delete_crawl_rows, crawl_settings_used, enqueue_crawl, normalize_seed_url
    from app.services.crawl_queue import crawl_queue

    cap: CaptureIn = await _read_json(request, CaptureIn, cap=hx.MAX_HELPER_GZ_B64 + 64 * 1024)
    html = _decode_capture(cap)
    seed = normalize_seed_url(cap.url.split("#")[0])
    try:
        await assert_public_url(seed)
    except UnsafeURLError as e:
        raise HTTPException(status_code=400, detail=f"This URL cannot be audited: {e}.")
    crawl_request = CrawlRequest(seed_url=seed, mode="page")
    project_id = await get_user_project_id(db, user)
    try:
        waiting = (await db.execute(select(Crawl.id).where(
            Crawl.project_id == project_id, Crawl.mode == "page", Crawl.status == "queued"))).scalars().all()
        for old_id in waiting:
            crawl_queue.cancel(old_id)
        if waiting:
            await _delete_crawl_rows(db, list(waiting))
        crawl = Crawl(project_id=project_id, seed_url=seed, status="queued", mode="page",
                      summary={"settings": {**crawl_settings_used(crawl_request), "source": "tab_capture"},
                               "request": crawl_request.model_dump(), "phase": "queued"})
        db.add(crawl)
        await db.commit()
        await db.refresh(crawl)
    except Exception:
        await db.rollback()
        logger.exception("Database error starting a capture audit")
        raise HTTPException(status_code=500, detail="Could not start the audit. Please try again.")
    # The capture must be waiting before the crawl can start.
    await hx.get_exchange().push_capture(crawl.id, {"url": seed, "html": html, "title": (cap.title or "")[:300]})
    enqueue_crawl(crawl.id, seed, crawl_request)
    return {"id": crawl.id, "project_id": crawl.project_id, "mode": "page", "seed_url": seed, "status": crawl.status,
            "started_at": crawl.started_at}
