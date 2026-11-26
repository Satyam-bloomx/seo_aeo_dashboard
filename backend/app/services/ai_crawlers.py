"""AI crawler access (robots.txt) and llms.txt presence.

Blocking AI training crawlers is a legitimate policy choice, so training bots and llms.txt are reported, never
graded. Access for the search/retrieval bots feeds the GEO readiness score (app/services/geo_readiness.py).
Uses the same Protego robots parser as the crawler.
"""
import asyncio
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

import httpx

from app.core.url_safety import UnsafeURLError, get_limited, safe_async_client
from app.services.robots import robots_service

# Zero-AI live bot-parity probes: compare what search & AI bots actually receive over HTTP
# against a standard browser baseline (status code + body length). No external API keys required.
PARITY_BOTS = [
    ("Browser", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"),
    ("Googlebot", "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"),
    ("OAI-SearchBot", "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot"),
    ("PerplexityBot", "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)"),
    ("GPTBot", "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2; +https://openai.com/gptbot"),
]


async def probe_bot_parity(seed_url: str, client: Optional[httpx.AsyncClient] = None) -> Dict[str, Any]:
    """Fetch seed_url as major search & AI bots and flag HTTP blocks or major HTML size drops.
    Always uses safe_async_client + get_limited when creating its own client so SSRF protections apply."""
    parsed = urlparse(seed_url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        return {"status": "error", "reason": "invalid_url", "bots": [], "blocked_bots": []}
    target = f"{parsed.scheme}://{parsed.netloc}{parsed.path or '/'}"

    async def _one(c: httpx.AsyncClient, name: str, ua: str) -> Dict[str, Any]:
        try:
            r = await get_limited(c, target, max_bytes=500_000, headers={"User-Agent": ua})
            body_bytes = len((r.text or "").encode("utf-8", errors="ignore"))
            return {"bot": name, "status_code": r.status_code, "bytes": body_bytes, "blocked": r.status_code in (401, 403, 429)}
        except UnsafeURLError:
            return {"bot": name, "status_code": None, "bytes": 0, "blocked": False, "error": "unsafe_url"}
        except httpx.HTTPError as e:
            return {"bot": name, "status_code": None, "bytes": 0, "blocked": False, "error": type(e).__name__}

    own = client is None
    if own:
        async with safe_async_client(timeout=6.0) as c:
            rows = list(await asyncio.gather(*(_one(c, n, ua) for n, ua in PARITY_BOTS)))
    else:
        rows = list(await asyncio.gather(*(_one(client, n, ua) for n, ua in PARITY_BOTS)))

    if any(r.get("error") == "unsafe_url" for r in rows):
        return {"status": "blocked_ssrf", "reason": "unsafe_url", "bots": rows, "blocked_bots": []}

    baseline = next((r for r in rows if r["bot"] == "Browser"), None)
    base_bytes = (baseline or {}).get("bytes") or 0
    blocked_bots: List[str] = []
    parity_issues: List[str] = []
    for r in rows:
        if r["bot"] == "Browser":
            continue
        if r.get("blocked"):
            blocked_bots.append(r["bot"])
        elif base_bytes >= 2000 and r.get("status_code") == 200 and r["bytes"] < base_bytes * 0.4:
            parity_issues.append(f"{r['bot']} received {r['bytes']}B vs browser {base_bytes}B")

    return {
        "status": "ok",
        "bots": rows,
        "blocked_bots": blocked_bots,
        "parity_issues": parity_issues,
    }

# (user agent token, operator, purpose)
AI_AGENTS = [
    # Google AI Overviews / AI Mode use ordinary Search indexing, so Googlebot is the retrieval bot for Google.
    ("Googlebot", "Google", "search"),
    ("GPTBot", "OpenAI", "training"),
    ("OAI-SearchBot", "OpenAI", "search"),
    ("ChatGPT-User", "OpenAI", "user_fetch"),
    ("ClaudeBot", "Anthropic", "training"),
    ("Claude-SearchBot", "Anthropic", "search"),
    ("Claude-User", "Anthropic", "user_fetch"),
    ("PerplexityBot", "Perplexity", "search"),
    ("Perplexity-User", "Perplexity", "user_fetch"),
    ("Google-Extended", "Google", "training"),
    ("Applebot-Extended", "Apple", "training"),
    ("CCBot", "Common Crawl", "training"),
    ("Meta-ExternalAgent", "Meta", "training"),
]


async def check_ai_crawler_access(seed_url: str) -> Dict[str, Any]:
    parsed = urlparse(seed_url)
    home = f"{parsed.scheme}://{parsed.netloc}/"
    try:
        parser = await robots_service.get_parser(home)
        agents = [
            {"agent": ua, "operator": op, "purpose": purpose, "allowed": bool(parser.can_fetch(home, ua))}
            for ua, op, purpose in AI_AGENTS
        ]
    except Exception as e:  # robots problems must not break the crawl report
        return {"status": "error", "reason": type(e).__name__, "agents": [], "llms_txt": None}

    llms = {"present": False, "url": None}
    try:
        async with safe_async_client(timeout=8.0) as client:
            r = await get_limited(client, f"{home}llms.txt", max_bytes=200_000)
        ctype = r.headers.get("content-type", "").lower()
        # Many sites return their HTML 404 page with status 200; only count a real text file.
        if r.status_code == 200 and "html" not in ctype and r.text.strip() and not r.text.lstrip().startswith("<"):
            llms = {"present": True, "url": f"{home}llms.txt"}
    except (UnsafeURLError, httpx.HTTPError):
        pass

    bot_parity = await probe_bot_parity(home)

    by_purpose = {p: [a for a in agents if a["purpose"] == p] for p in ("training", "search", "user_fetch")}
    return {
        "status": "ok",
        "agents": agents,
        "search_bots_allowed": all(a["allowed"] for a in by_purpose["search"]),
        "training_bots_blocked": [a["agent"] for a in by_purpose["training"] if not a["allowed"]],
        "llms_txt": llms,
        "bot_parity": bot_parity,
        "note": "Informational. Blocking AI training is a policy choice; llms.txt is not used by Google Search.",
    }
