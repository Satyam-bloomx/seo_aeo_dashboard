"""Measured visibility: GEO, AEO and Search visibility from real answers and real Google results, never from
on-page heuristics or a model's opinion.

* Three non-branded questions per site (from the Keywords list; missing ones are generated from the crawled site and
  marked "auto"). Every question actually asked is shown to the user with every answer.
* GEO: each question is asked RUNS_PER_ENGINE times on every connected AI engine *with live web search*
  (Gemini with Google Search grounding, ChatGPT with web search, Claude with web search). A plain model call answers
  from training data and would measure what the model remembers, not current AI search, so it is never used.
  Score = share of answers that mention or cite the site, with a 95% interval (wide with only a few answers, and
  shown as such), labelled with the engines used. Only keys the user connected are used, never the server's.
* AEO: each question searched on Google through SerpAPI (one page + the AI Overview). Score = share of the
  questions where Google showed an answer feature (AI Overview, featured snippet, People Also Ask) in which the
  site appears.
* Search visibility: where the site ranks on page 1 for those questions.

Anything that could not be measured (no key, quota, provider error) is reported as not measured with the reason;
no score is ever filled in.
"""
import asyncio
import math
import time
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

import httpx

from app.services import keyword_tracking as kt

VISIBILITY_QUESTIONS = 3   # questions per site
RUNS_PER_ENGINE = 1        # each question asked once per engine (keeps the cost low)
ENGINES = ("gemini", "openai", "claude")
ENGINE_LABEL = {"gemini": "Gemini", "openai": "ChatGPT", "claude": "Claude"}
ENGINE_HOW = {"gemini": "Gemini with Google Search grounding", "openai": "ChatGPT (OpenAI) with web search",
              "claude": "Claude with web search"}
CONCURRENCY = 3
REUSE_HOURS = 24  # an automatic run after an audit reuses a measurement this fresh (same questions)
OPENAI_URL = "https://api.openai.com/v1/responses"
CLAUDE_WEB_SEARCH = {"type": "web_search_20260209", "name": "web_search", "max_uses": 3}
MAX_EXCERPT = 600


class EngineLimit(Exception):
    """The provider refused (bad key, quota, rate limit): stop asking that engine, keep what was measured."""


# ---------------------------------------------------------------- questions

def visibility_questions(state: Dict[str, Any]) -> List[Dict[str, Any]]:
    """The questions the check asks: the first VISIBILITY_QUESTIONS non-branded questions of the site's list."""
    return [i for i in (state.get("items") or []) if i.get("kind") == "question" and not i.get("branded")][:VISIBILITY_QUESTIONS]


QUESTION_PROMPT = (
    "You pick the questions used to measure whether a business shows up in AI answers and Google. From the site "
    "facts, write {n} questions that a potential customer would type into ChatGPT or Google BEFORE they know this "
    "business exists: generic questions about the category, the problem it solves, or where to buy / how to choose. "
    "Rules: never name the business, its domain, or product names that only this site uses (a question about a "
    "site-specific product name is effectively a brand search and would only measure that the site ranks for its "
    "own name); one question per distinct topic the site really covers; plain natural language, under 12 words; "
    "use the site's language and, when given, its location (e.g. 'in India'). Also return the business name "
    "exactly as the site writes it."
)
QUESTION_SCHEMA = {"type": "OBJECT", "properties": {
    "business_name": {"type": "STRING"},
    "questions": {"type": "ARRAY", "items": {"type": "STRING"}}}, "required": ["questions"]}


async def generate_questions(integrations: Dict[str, Any], pages: List[Any], domain: str, location: str,
                             n: int) -> Tuple[List[Dict[str, Any]], str]:
    """Generic, non-branded customer questions from the crawled site (one AI call). Returns (items, business name)."""
    from app.services.prompt_engine import PromptEngine
    ok, _by, data = await PromptEngine.execute_llm_json(
        system_prompt=QUESTION_PROMPT.replace("{n}", str(n)),
        user_prompt=kt.site_facts(pages, domain, location) + f"\n\nWrite {n} questions.",
        integrations=integrations, max_output_tokens=1200, response_schema=QUESTION_SCHEMA)
    if not ok or not isinstance(data.get("questions"), list):
        return [], ""
    name = str(data.get("business_name") or "").strip()[:80]
    raw = [{"text": q if str(q).strip().endswith("?") else f"{str(q).strip()}?", "kind": "question",
            "intent": "problem", "source": "auto"} for q in data["questions"] if str(q).strip()]
    return kt.clean_items(raw, domain, name), name


async def ensure_questions(state: Dict[str, Any], integrations: Dict[str, Any], pages: List[Any], domain: str,
                           location: str) -> Tuple[List[Dict[str, Any]], int]:
    """Top the list up to VISIBILITY_QUESTIONS non-branded questions, generated from the crawled site ("auto").
    Returns (questions, how many were generated)."""
    have = visibility_questions(state)
    if len(have) >= VISIBILITY_QUESTIONS:
        return have, 0
    items, name = await generate_questions(integrations, pages, domain, location, VISIBILITY_QUESTIONS + 2)
    existing = {kt._norm(i["text"]) for i in state.get("items") or []}
    added = []
    for item in items:
        if item["branded"] or kt._norm(item["text"]) in existing:
            continue
        added.append({**item, "source": "auto"})
        existing.add(kt._norm(item["text"]))
        if len(have) + len(added) >= VISIBILITY_QUESTIONS:
            break
    state["items"] = (state.get("items") or []) + added
    if name and not state.get("business_name"):
        state["business_name"] = name
    return visibility_questions(state), len(added)


def questions_key(questions: List[Dict[str, Any]]) -> str:
    return "|".join(kt._norm(q["text"]) for q in questions)


# ---------------------------------------------------------------- engines (same result shape for every engine)

def _answer(text: str, cited_urls: List[str], domain: str, business_name: str) -> Dict[str, Any]:
    hosts = list(dict.fromkeys(h for h in (kt.site_host(u) for u in cited_urls) if h))
    own = [h for h in hosts if kt._grounding_host_is_site(h, domain)]
    mentioned = kt.is_branded(text, domain, business_name) or domain in text.lower()
    return {"mentioned": bool(mentioned), "cited": bool(own), "sources": [h for h in hosts if h not in own][:8],
            "excerpt": " ".join((text or "").split())[:MAX_EXCERPT]}


def _aggregate(engine: str, model: Optional[str], answers: List[Dict[str, Any]]) -> Dict[str, Any]:
    counts: Dict[str, int] = {}
    for a in answers:
        for h in a["sources"]:
            counts[h] = counts.get(h, 0) + 1
    return {"engine": engine, "model": model, "runs": len(answers),
            "mentioned": sum(1 for a in answers if a["mentioned"]), "cited": sum(1 for a in answers if a["cited"]),
            "sources": [h for h, _ in sorted(counts.items(), key=lambda kv: -kv[1])[:6]], "answers": answers}


async def ask_gemini(client: httpx.AsyncClient, cfg: Any, question: str, domain: str, business_name: str,
                     runs: int) -> Dict[str, Any]:
    try:
        r = await kt.gemini_check(client, cfg, question, domain, business_name, runs=runs)
    except kt.AiLimitError as e:
        raise EngineLimit(str(e)) from e
    return _aggregate("gemini", r.get("model"), r.get("answers") or [])


def parse_openai_response(data: Dict[str, Any]) -> Tuple[str, List[str]]:
    """Responses API output: message items carry output_text parts whose annotations hold url_citation links."""
    text, urls = [], []
    for item in data.get("output") or []:
        if item.get("type") != "message":
            continue
        for part in item.get("content") or []:
            if part.get("type") == "output_text":
                text.append(part.get("text") or "")
                urls += [a.get("url") for a in (part.get("annotations") or [])
                         if a.get("type") == "url_citation" and a.get("url")]
    return "".join(text), urls


async def ask_openai(client: httpx.AsyncClient, cfg: Any, question: str, domain: str, business_name: str,
                     runs: int) -> Dict[str, Any]:
    from app.core.config import chosen_ai_model
    model = chosen_ai_model(cfg, "openai")
    answers = []
    for _ in range(runs):
        res = await client.post(OPENAI_URL, headers={"Authorization": f"Bearer {cfg.api_key}"}, timeout=90.0,
                                json={"model": model, "input": question, "tools": [{"type": "web_search"}]})
        if res.status_code in (401, 403, 429):
            msg = ((res.json() if res.headers.get("content-type", "").startswith("application/json") else {})
                   .get("error") or {}).get("message") or f"HTTP {res.status_code}"
            raise EngineLimit(f"ChatGPT refused the request: {msg[:160]}")
        if res.status_code != 200:
            continue  # one failed run is skipped, not counted
        text, urls = parse_openai_response(res.json())
        answers.append(_answer(text, urls, domain, business_name))
    return _aggregate("openai", model, answers)


def parse_claude_message(data: Dict[str, Any]) -> Tuple[str, List[str]]:
    """Claude with web search: text blocks (with citations) and web_search_tool_result blocks listing the results."""
    text, urls = [], []
    for block in data.get("content") or []:
        kind = block.get("type")
        if kind == "text":
            text.append(block.get("text") or "")
            urls += [c.get("url") for c in (block.get("citations") or []) if c.get("url")]
        elif kind == "web_search_tool_result" and isinstance(block.get("content"), list):  # an error is an object
            urls += [r.get("url") for r in block["content"] if isinstance(r, dict) and r.get("url")]
    return "".join(text), urls


async def ask_claude(cfg: Any, question: str, domain: str, business_name: str, runs: int) -> Dict[str, Any]:
    import anthropic
    from app.core.config import chosen_ai_model
    model = chosen_ai_model(cfg, "claude")
    answers = []
    async with anthropic.AsyncAnthropic(api_key=cfg.api_key, timeout=120.0) as client:
        for _ in range(runs):
            messages: List[Dict[str, Any]] = [{"role": "user", "content": question}]
            try:
                for _continue in range(3):  # a server-side search loop can pause; resume it, never more than 3 times
                    msg = await client.beta.messages.create(
                        model=model, max_tokens=4000, messages=messages, tools=[CLAUDE_WEB_SEARCH],
                        betas=["server-side-fallback-2026-07-01"], fallbacks="default")
                    if msg.stop_reason != "pause_turn":
                        break
                    messages = [messages[0], {"role": "assistant", "content": msg.content}]
            except (anthropic.AuthenticationError, anthropic.PermissionDeniedError, anthropic.RateLimitError) as e:
                raise EngineLimit(f"Claude refused the request: {str(e)[:160]}") from e
            except anthropic.APIError:
                continue  # one failed run is skipped, not counted
            if msg.stop_reason == "refusal":
                continue
            text, urls = parse_claude_message(msg.model_dump())
            answers.append(_answer(text, urls, domain, business_name))
    return _aggregate("claude", model, answers)


def connected_engines(integrations: Dict[str, Any]) -> Dict[str, Any]:
    """Engines with a key, as plain copies (the measurement runs after the request's database session ends)."""
    from types import SimpleNamespace
    out = {}
    for name in ENGINES:
        row = integrations.get(name)
        key = (getattr(row, "api_key", None) or "").strip() if row else ""
        if key:
            out[name] = SimpleNamespace(api_key=key, config_json=dict(getattr(row, "config_json", None) or {}))
    return out


# ---------------------------------------------------------------- measurement

async def measure(questions: List[Dict[str, Any]], domain: str, location: str, business_name: str,
                  serp_key: Optional[str], engines: Dict[str, Any], runs: int = RUNS_PER_ENGINE,
                  client: Optional[httpx.AsyncClient] = None) -> Dict[str, Any]:
    sem = asyncio.Semaphore(CONCURRENCY)
    stopped: Dict[str, str] = {}
    searches = 0

    async def ask(c: httpx.AsyncClient, name: str, cfg: Any, text: str) -> Optional[Dict[str, Any]]:
        if name in stopped:
            return None
        try:
            if name == "gemini":
                return await ask_gemini(c, cfg, text, domain, business_name, runs)
            if name == "openai":
                return await ask_openai(c, cfg, text, domain, business_name, runs)
            return await ask_claude(cfg, text, domain, business_name, runs)
        except EngineLimit as e:
            stopped[name] = str(e)[:200]
        except Exception as e:  # noqa: BLE001 - one engine failing never fails the check
            return {"engine": name, "runs": 0, "error": f"{ENGINE_LABEL[name]} failed ({type(e).__name__})."}
        return None

    async def one(c: httpx.AsyncClient, q: Dict[str, Any]) -> Dict[str, Any]:
        nonlocal searches
        row: Dict[str, Any] = {"id": q["id"], "text": q["text"], "source": q.get("source", "user"), "ai": {}}
        async with sem:
            if serp_key and "serp" not in stopped:
                try:
                    serp, used = await kt.check_item(c, serp_key, q, domain, location, business_name, depth=1)
                    searches += used
                    row["google"] = {k: serp.get(k) for k in ("rank", "url", "ai_overview", "featured_snippet",
                                                               "featured_snippet_cited", "paa", "paa_cited", "competitors")}
                except kt.SerpQuotaError as e:
                    stopped["serp"] = "SerpAPI: " + str(e)[:180]
                except Exception as e:  # noqa: BLE001 - no retry: each retry is a paid search
                    row["google_error"] = f"Google search failed ({type(e).__name__})."
            results = await asyncio.gather(*(ask(c, n, cfg, q["text"]) for n, cfg in engines.items()))
            for name, r in zip(engines, results):
                if r is not None:
                    row["ai"][name] = r
        return row

    own = client is None
    c = client or httpx.AsyncClient(timeout=kt.REQUEST_TIMEOUT_S)
    try:
        rows = list(await asyncio.gather(*(one(c, q) for q in questions)))
    finally:
        if own:
            await c.aclose()

    engine_status = {}
    for name in ENGINES:
        answered = sum((r["ai"].get(name) or {}).get("runs", 0) for r in rows)
        if name not in engines:
            engine_status[name] = {"status": "not_connected", "reason": f"Connect {ENGINE_LABEL[name]} in Integrations."}
        elif answered:
            engine_status[name] = {"status": "ok", "answers": answered,
                                   "model": next((r["ai"][name].get("model") for r in rows if r["ai"].get(name)), None),
                                   "reason": stopped.get(name)}  # partial: stopped part-way
        else:
            engine_status[name] = {"status": "error", "answers": 0,
                                   "reason": stopped.get(name) or f"{ENGINE_LABEL[name]} returned no answers."}
    serp_status = ({"status": "not_connected", "reason": "Connect SerpAPI in Integrations for Google results."}
                   if not serp_key else
                   {"status": "error" if stopped.get("serp") and not any(r.get("google") for r in rows) else "ok",
                    "searches": searches, "reason": stopped.get("serp")})
    check = {"checked_at": datetime.utcnow().isoformat() + "Z", "domain": domain, "location": location,
             "runs_per_engine": runs, "questions_key": questions_key(questions), "questions": rows,
             "engines": engine_status, "google": serp_status}
    check["scores"] = score_visibility(check)
    return check


# ---------------------------------------------------------------- scores

def wilson(hits: int, n: int, z: float = 1.96) -> Tuple[int, int]:
    """95% interval for a share (Wilson score): honest about how little 10-20 answers can tell."""
    if not n:
        return 0, 0
    p = hits / n
    centre = (p + z * z / (2 * n)) / (1 + z * z / n)
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / (1 + z * z / n)
    return max(0, round(100 * (centre - half))), min(100, round(100 * (centre + half)))


def _not_measured(reason: str) -> Dict[str, Any]:
    return {"status": "not_measured", "score": None, "reason": reason}


def score_visibility(check: Dict[str, Any]) -> Dict[str, Any]:
    rows = check.get("questions") or []
    engines = check.get("engines") or {}

    # GEO: answers that mention or cite the site, across every engine that answered
    per_engine, hits, total = {}, 0, 0
    for name in ENGINES:
        runs = sum((r["ai"].get(name) or {}).get("runs", 0) for r in rows)
        if not runs:
            continue
        mentioned = sum(sum(1 for a in (r["ai"][name].get("answers") or []) if a["mentioned"] or a["cited"])
                        for r in rows if r["ai"].get(name))
        cited = sum((r["ai"].get(name) or {}).get("cited", 0) for r in rows)
        per_engine[name] = {"answers": runs, "visible": mentioned, "cited": cited,
                            "score": round(100 * mentioned / runs)}
        hits, total = hits + mentioned, total + runs
    missing = [ENGINE_LABEL[n] for n in ENGINES if n not in per_engine]
    if total:
        lo, hi = wilson(hits, total)
        geo = {"status": "ok", "score": round(100 * hits / total), "interval": [lo, hi], "answers": total,
               "visible_answers": hits, "engines": [ENGINE_LABEL[n] for n in per_engine], "per_engine": per_engine,
               "missing_engines": missing,
               "label": f"Based on {' + '.join(ENGINE_LABEL[n] for n in per_engine)} ({total} answers)",
               "reason": (f"For a score across all major AI engines, connect {' and '.join(missing)}." if missing else None)}
    else:
        reasons = [e.get("reason") for e in engines.values() if e.get("reason")]
        geo = _not_measured("; ".join(reasons) or "No AI engine is connected.")

    # AEO: Google answer features for the questions
    google_rows = [r for r in rows if r.get("google")]
    if not google_rows:
        g = check.get("google") or {}
        aeo = _not_measured(g.get("reason") or "Google results could not be fetched.")
        seo = _not_measured(g.get("reason") or "Google results could not be fetched.")
    else:
        def shown(r):
            g = r["google"]
            return bool((g.get("ai_overview") or {}).get("shown") or g.get("featured_snippet") or g.get("paa"))

        def appears(r):
            g = r["google"]
            return bool((g.get("ai_overview") or {}).get("cited") or g.get("featured_snippet_cited") or g.get("paa_cited"))
        with_features = [r for r in google_rows if shown(r)]
        if with_features:
            n_in = sum(1 for r in with_features if appears(r))
            aeo = {"status": "ok", "score": round(100 * n_in / len(with_features)), "questions": len(google_rows),
                   "with_features": len(with_features), "appears": n_in,
                   "ai_overview_shown": sum(1 for r in google_rows if (r["google"].get("ai_overview") or {}).get("shown")),
                   "ai_overview_cited": sum(1 for r in google_rows if (r["google"].get("ai_overview") or {}).get("cited")),
                   "featured_snippet_cited": sum(1 for r in google_rows if r["google"].get("featured_snippet_cited")),
                   "paa_cited": sum(1 for r in google_rows if r["google"].get("paa_cited")),
                   "label": f"Google answer features for {len(with_features)} of {len(google_rows)} questions",
                   "reason": None}
        else:
            aeo = _not_measured("Google showed no AI Overview, featured snippet or People Also Ask for these "
                                "questions, so there was nothing to appear in.")

        def credit(rank):
            return 100 if rank and rank <= 3 else 60 if rank and rank <= 10 else 0
        ranked = [r for r in google_rows if r["google"].get("rank")]
        seo = {"status": "ok", "score": round(sum(credit(r["google"].get("rank")) for r in google_rows) / len(google_rows)),
               "questions": len(google_rows), "top3": sum(1 for r in ranked if r["google"]["rank"] <= 3),
               "page1": len(ranked),
               "average_position": round(sum(r["google"]["rank"] for r in ranked) / len(ranked), 1) if ranked else None,
               "label": f"Google page 1 for {len(ranked)} of {len(google_rows)} questions",
               "reason": None}
    return {"geo": geo, "aeo": aeo, "seo": seo}


def is_fresh(check: Optional[Dict[str, Any]], questions: List[Dict[str, Any]], hours: int = REUSE_HOURS) -> bool:
    if not check or check.get("questions_key") != questions_key(questions):
        return False
    try:
        at = datetime.fromisoformat(check["checked_at"].rstrip("Z"))
    except (KeyError, ValueError):
        return False
    return (datetime.utcnow() - at).total_seconds() < hours * 3600


def is_running(state: Dict[str, Any]) -> bool:
    run = state.get("visibility_running") or {}
    return bool(run) and time.time() - float(run.get("started", 0)) < kt.RUN_STALE_S
