"""Measured visibility (GEO, AEO, Search visibility) for the workspace's audited site.

GET  /visibility        the questions, the last measurement, which engines are connected
POST /visibility/check  measure now (in the background; poll GET)

A measurement also starts by itself when an audit completes (run_after_audit), reusing one less than a day old
for the same questions so repeated audits don't spend searches and model calls twice.
"""
import logging
import time
from typing import Any, Dict, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.core.auth import UserSession, get_current_user, get_user_project_id
from app.core.database import AsyncSessionLocal, get_db
from app.core.rate_limit import rate_limit
from app.models.domain import Crawl, Page
from app.services import keyword_tracking as kt
from app.services import visibility as vis
from app.services.prompt_engine import PromptEngine

router = APIRouter()
logger = logging.getLogger(__name__)


def _engines_view(integrations: Dict[str, Any], serp_key: Optional[str]) -> Dict[str, Any]:
    connected = vis.connected_engines(integrations)
    return {
        "engines": {n: {"label": vis.ENGINE_LABEL[n], "how": vis.ENGINE_HOW[n], "connected": n in connected}
                    for n in vis.ENGINES},
        "serp_connected": bool(serp_key),
    }


def _view(domain: str, state: Dict[str, Any], integrations: Dict[str, Any], serp_key: Optional[str]) -> Dict[str, Any]:
    questions = vis.visibility_questions(state)
    engines = vis.connected_engines(integrations)
    return {
        "domain": domain,
        "location": state.get("location") or "",
        "questions": questions,
        "questions_needed": max(0, vis.VISIBILITY_QUESTIONS - len(questions)),
        "runs_per_engine": vis.RUNS_PER_ENGINE,
        "planned_calls": {"ai_answers": vis.VISIBILITY_QUESTIONS * vis.RUNS_PER_ENGINE * len(engines),
                          "google_searches_max": vis.VISIBILITY_QUESTIONS * 2 if serp_key else 0},
        "last": state.get("visibility"),
        "running": vis.is_running(state),
        "last_error": state.get("visibility_error"),
        **_engines_view(integrations, serp_key),
    }


async def _site(db: AsyncSession, project_id: int) -> Crawl:
    base = select(Crawl).where(Crawl.project_id == project_id, Crawl.status == "completed")
    crawl = (await db.execute(base.where(Crawl.mode == "site").order_by(Crawl.id.desc()).limit(1))).scalars().first() \
        or (await db.execute(base.order_by(Crawl.id.desc()).limit(1))).scalars().first()
    if not crawl or not crawl.seed_url:
        raise HTTPException(status_code=404, detail="Run an audit first: the questions come from the audited site.")
    return crawl


@router.get("/visibility")
async def get_visibility(db: AsyncSession = Depends(get_db), user: UserSession = Depends(get_current_user)):
    project_id = await get_user_project_id(db, user)
    crawl = await _site(db, project_id)
    domain = kt.site_host(crawl.seed_url)
    _, cfg = await kt.load_state(db, project_id)
    integrations = await PromptEngine.resolve_integrations(db, project_id)
    return _view(domain, kt.site_state(cfg, domain), integrations, await kt.resolve_serpapi_key(db, project_id))


async def run_measurement(project_id: int, crawl_id: int, user_id: Optional[str], force: bool) -> None:
    """Top the questions up, measure, save. Never raises: failures are saved as the reason."""
    domain = ""
    try:
        async with AsyncSessionLocal() as db:
            crawl = await db.get(Crawl, crawl_id)
            if not crawl or not crawl.seed_url:
                return
            domain = kt.site_host(crawl.seed_url)
            _, cfg = await kt.load_state(db, project_id)
            state = kt.site_state(cfg, domain)
            if vis.is_running(state):
                return
            integrations = await PromptEngine.resolve_integrations(db, project_id)
            serp_key = await kt.resolve_serpapi_key(db, project_id)
            engines = vis.connected_engines(integrations)
            if not engines and not serp_key:
                state["visibility_error"] = ("Nothing to measure with: connect Gemini, ChatGPT or Claude (AI answers) "
                                             "or SerpAPI (Google results) in Integrations.")
                await kt.save_site_state(db, project_id, user_id, domain, state)
                return
            pages = (await db.execute(select(Page).where(Page.crawl_id == crawl_id))).scalars().all()
            questions, _added = await vis.ensure_questions(state, integrations, pages, domain, state.get("location") or "")
            if not questions:
                state["visibility_error"] = "No questions to ask: add questions in Keywords & AI answers."
                await kt.save_site_state(db, project_id, user_id, domain, state)
                return
            if not force and vis.is_fresh(state.get("visibility"), questions):
                await kt.save_site_state(db, project_id, user_id, domain, state)  # keep generated questions
                return
            state["visibility_running"] = {"started": time.time()}
            state.pop("visibility_error", None)
            await kt.save_site_state(db, project_id, user_id, domain, state)
            location, business = state.get("location") or "", state.get("business_name") or ""

        check = await vis.measure(questions, domain, location, business, serp_key, engines)
        error = None
    except Exception:  # noqa: BLE001
        logger.exception("Visibility measurement failed for project %s", project_id)
        check, error = None, "The measurement failed unexpectedly. Nothing was saved; please try again."
    if not domain:
        return
    async with AsyncSessionLocal() as db:
        _, cfg = await kt.load_state(db, project_id)
        state = kt.site_state(cfg, domain)  # re-read: the list may have changed meanwhile
        state.pop("visibility_running", None)
        if check is not None:
            state["visibility"] = check
        if error:
            state["visibility_error"] = error
        await kt.save_site_state(db, project_id, user_id, domain, state)


class VisibilityCheck(BaseModel):
    force: bool = True


@router.post("/visibility/check", dependencies=[Depends(rate_limit("serp"))])
async def check_visibility(background: BackgroundTasks, req: Optional[VisibilityCheck] = None,
                           db: AsyncSession = Depends(get_db), user: UserSession = Depends(get_current_user)):
    req = req or VisibilityCheck()
    project_id = await get_user_project_id(db, user)
    crawl = await _site(db, project_id)
    domain = kt.site_host(crawl.seed_url)
    _, cfg = await kt.load_state(db, project_id)
    state = kt.site_state(cfg, domain)
    if vis.is_running(state):
        raise HTTPException(status_code=409, detail="A visibility measurement is already running for this site.")
    integrations = await PromptEngine.resolve_integrations(db, project_id)
    serp_key = await kt.resolve_serpapi_key(db, project_id)
    if not vis.connected_engines(integrations) and not serp_key:
        raise HTTPException(status_code=400, detail="Connect Gemini, ChatGPT or Claude, or SerpAPI, in Integrations.")
    background.add_task(run_measurement, project_id, crawl.id, user.id, req.force)
    view = _view(domain, state, integrations, serp_key)
    view["running"] = True
    return view


async def run_after_audit(crawl_id: int) -> None:
    """Started when an audit completes: measure the audited site unless a fresh measurement exists."""
    try:
        async with AsyncSessionLocal() as db:
            crawl = await db.get(Crawl, crawl_id)
            if not crawl or crawl.status != "completed":
                return
            project_id = crawl.project_id
        await run_measurement(project_id, crawl_id, None, force=False)
    except Exception:  # noqa: BLE001 - never affects the audit
        logger.exception("Automatic visibility measurement failed for crawl %s", crawl_id)
