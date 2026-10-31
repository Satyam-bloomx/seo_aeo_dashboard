"""Keywords & AI answers: the tracked list, AI suggestions and SerpAPI checks for the workspace's audited site."""
import logging
import time
from types import SimpleNamespace
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.core.auth import UserSession, get_current_user, get_user_project_id
from app.core.database import AsyncSessionLocal, get_db
from app.core.rate_limit import rate_limit
from app.models.domain import Crawl, Page
from app.services import keyword_tracking as kt
from app.services.prompt_engine import PromptEngine, active_ai_provider

router = APIRouter()
logger = logging.getLogger(__name__)


class KeywordItem(BaseModel):
    id: Optional[str] = Field(None, max_length=20)
    text: str = Field(..., max_length=kt.MAX_TEXT)
    kind: Optional[str] = None
    intent: Optional[str] = None
    branded: bool = False
    local: bool = False


class KeywordListUpdate(BaseModel):
    items: List[KeywordItem] = Field(default_factory=list, max_length=kt.MAX_ITEMS)
    location: str = Field("", max_length=120)
    business_name: str = Field("", max_length=80)


class SuggestRequest(BaseModel):
    location: Optional[str] = Field(None, max_length=120)
    keywords: int = Field(10, ge=0, le=15)
    questions: int = Field(10, ge=0, le=15)


async def _site_crawl(db: AsyncSession, project_id: int) -> Crawl:
    """The workspace's audited site: its latest completed crawl (whole-site audits first)."""
    base = select(Crawl).where(Crawl.project_id == project_id, Crawl.status == "completed")
    crawl = (await db.execute(base.where(Crawl.mode == "site").order_by(Crawl.id.desc()).limit(1))).scalars().first() \
        or (await db.execute(base.order_by(Crawl.id.desc()).limit(1))).scalars().first()
    if not crawl or not crawl.seed_url:
        raise HTTPException(status_code=404, detail="Run an audit first: keywords are suggested from the crawled site.")
    return crawl


async def _context(db: AsyncSession, user: UserSession):
    project_id = await get_user_project_id(db, user)
    crawl = await _site_crawl(db, project_id)
    domain = kt.site_host(crawl.seed_url)
    _, cfg = await kt.load_state(db, project_id)
    return project_id, crawl, domain, kt.site_state(cfg, domain)


def _view(crawl: Crawl, domain: str, state: Dict[str, Any], serp_key: Optional[str],
          integrations: Dict[str, Any]) -> Dict[str, Any]:
    items = state.get("items") or []
    return {
        "domain": domain,
        "crawl_id": crawl.id,
        "location": state.get("location") or "",
        "business_name": state.get("business_name") or "",
        "items": items,
        "suggested_by": state.get("suggested_by"),
        "last_check": state.get("last_check"),
        "running": kt.is_running(state),
        "last_error": state.get("last_error"),
        "serp_connected": bool(serp_key),
        "gsc_connected": "search_console" in integrations,
        "gemini_connected": bool(getattr(integrations.get("gemini"), "api_key", None)),
        "ai_provider": active_ai_provider(integrations),
        "estimate": kt.credit_estimate(items),
        "max_items": kt.MAX_ITEMS,
        "ideas": state.get("ideas"),
        "autocomplete_seeds_max": kt.AUTOCOMPLETE_SEEDS,
    }


@router.get("/keywords")
async def get_keywords(db: AsyncSession = Depends(get_db), user: UserSession = Depends(get_current_user)):
    project_id, crawl, domain, state = await _context(db, user)
    integrations = await PromptEngine.resolve_integrations(db, project_id)
    return _view(crawl, domain, state, await kt.resolve_serpapi_key(db, project_id), integrations)


@router.put("/keywords")
async def update_keywords(req: KeywordListUpdate, db: AsyncSession = Depends(get_db),
                          user: UserSession = Depends(get_current_user)):
    project_id, crawl, domain, state = await _context(db, user)
    state["business_name"] = req.business_name.strip()
    state["location"] = req.location.strip()
    state["items"] = kt.clean_items([i.model_dump() for i in req.items], domain, state["business_name"])
    await kt.save_site_state(db, project_id, user.id, domain, state)
    integrations = await PromptEngine.resolve_integrations(db, project_id)
    return _view(crawl, domain, state, await kt.resolve_serpapi_key(db, project_id), integrations)


@router.post("/keywords/suggest", dependencies=[Depends(rate_limit("ai"))])
async def suggest_keywords(req: SuggestRequest, db: AsyncSession = Depends(get_db),
                           user: UserSession = Depends(get_current_user)):
    """Suggest a list from the crawl (1 AI call). Returned for review; the client saves it with PUT."""
    project_id, crawl, domain, state = await _context(db, user)
    location = (req.location if req.location is not None else state.get("location") or "").strip()
    pages = (await db.execute(select(Page).where(Page.crawl_id == crawl.id))).scalars().all()
    integrations = await PromptEngine.resolve_integrations(db, project_id)
    out = await kt.suggest_items(integrations, pages, domain, location, req.keywords, req.questions)
    return {**out, "location": location}


class IdeasRequest(BaseModel):
    autocomplete: bool = False  # Google Autocomplete costs SerpAPI searches: only when asked


@router.post("/keywords/ideas", dependencies=[Depends(rate_limit("serp"))])
async def keyword_ideas(req: IdeasRequest, db: AsyncSession = Depends(get_db),
                        user: UserSession = Depends(get_current_user)):
    """Keyword ideas from Search Console, Google Autocomplete (up to 8 SerpAPI searches) and the last check's
    related searches and People Also Ask, reviewed by the AI. Stored with the list."""
    project_id, crawl, domain, state = await _context(db, user)
    pages = (await db.execute(select(Page).where(Page.crawl_id == crawl.id))).scalars().all()
    integrations = await PromptEngine.resolve_integrations(db, project_id)
    gsc_row = integrations.get("search_console")
    gsc_data = ((getattr(gsc_row, "config_json", None) or {}).get("data") or {}) if gsc_row else {}
    serp_key = await kt.resolve_serpapi_key(db, project_id)
    ideas = await kt.build_ideas(integrations, pages, domain, state, gsc_data, serp_key, req.autocomplete)
    _, cfg = await kt.load_state(db, project_id)
    state = kt.site_state(cfg, domain)
    state["ideas"] = ideas
    await kt.save_site_state(db, project_id, user.id, domain, state)
    return _view(crawl, domain, state, serp_key, integrations)


class CheckRequest(BaseModel):
    search_console: bool = True   # Google positions from Search Console (free)
    ai_answers: bool = True       # Gemini with Google Search, 3 runs per question
    serp: bool = False            # optional live Google results via SerpAPI (paid searches)


async def _run_check_task(project_id: int, user_id: str, domain: str, items: List[Dict[str, Any]],
                          location: str, business_name: str, use_gsc: bool, serp_key: Optional[str],
                          gemini: Any) -> None:
    result: Optional[Dict[str, Any]] = None
    try:
        gsc, gsc_note = None, None
        if use_gsc:
            async with AsyncSessionLocal() as db:
                gsc, gsc_note = await kt.gsc_positions(db, project_id, domain, items)
        result = await kt.run_check(items, domain, location, business_name, serp_key=serp_key, gemini=gemini,
                                    gsc=gsc, gsc_note=gsc_note)
    except Exception:
        logger.exception("Keyword check failed for project %s", project_id)
    async with AsyncSessionLocal() as db:
        _, cfg = await kt.load_state(db, project_id)
        state = kt.site_state(cfg, domain)  # re-read: the list may have been edited while the check ran
        state.pop("running", None)
        if result is not None:
            state["last_check"] = result
        else:
            state["last_error"] = "The check failed unexpectedly. Nothing was saved; please try again."
        await kt.save_site_state(db, project_id, user_id, domain, state)


@router.post("/keywords/check", dependencies=[Depends(rate_limit("serp"))])
async def check_keywords(background: BackgroundTasks, req: Optional[CheckRequest] = None,
                         db: AsyncSession = Depends(get_db), user: UserSession = Depends(get_current_user)):
    """Check every item: Search Console positions and Gemini AI answers by default; live Google results via
    SerpAPI only when asked (paid searches). Runs in the background; poll GET /keywords."""
    req = req or CheckRequest()
    project_id, crawl, domain, state = await _context(db, user)
    items = state.get("items") or []
    if not items:
        raise HTTPException(status_code=400, detail="Add keywords or questions first.")
    if kt.is_running(state):
        raise HTTPException(status_code=409, detail="A check is already running for this site.")
    integrations = await PromptEngine.resolve_integrations(db, project_id)
    serp_key = await kt.resolve_serpapi_key(db, project_id) if req.serp else None
    if req.serp and not serp_key:
        raise HTTPException(status_code=400, detail="Connect SerpAPI in Integrations for live Google results.")
    gem_row = integrations.get("gemini")
    gemini = None
    if req.ai_answers and getattr(gem_row, "api_key", None):
        # A plain copy: the background task outlives this request's database session.
        gemini = SimpleNamespace(api_key=gem_row.api_key, config_json=dict(getattr(gem_row, "config_json", None) or {}))
    use_gsc = req.search_console and "search_console" in integrations
    if not (use_gsc or gemini or serp_key):
        raise HTTPException(status_code=400, detail="Connect Search Console or Gemini in Integrations to check.")
    state["running"] = {"started": time.time(), "items": len(items)}
    state.pop("last_error", None)
    await kt.save_site_state(db, project_id, user.id, domain, state)
    background.add_task(_run_check_task, project_id, user.id, domain, items, state.get("location") or "",
                        state.get("business_name") or "", use_gsc, serp_key, gemini)
    return _view(crawl, domain, state, await kt.resolve_serpapi_key(db, project_id), integrations)


@router.get("/keywords/locations")
async def keyword_locations(q: str = Query(..., min_length=2, max_length=80),
                            user: UserSession = Depends(get_current_user)):
    try:
        return {"locations": await kt.search_locations(q)}
    except Exception:
        return {"locations": []}
