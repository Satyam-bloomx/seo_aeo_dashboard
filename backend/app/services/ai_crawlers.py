"""AI crawler access (robots.txt) and llms.txt presence: informational, never scored.

Blocking AI training crawlers is a legitimate policy choice, so this reports what each AI user agent
may fetch rather than grading it. Uses the same Protego robots parser as the crawler.
"""
from typing import Any, Dict
from urllib.parse import urlparse

import httpx

from app.core.url_safety import UnsafeURLError, get_limited, safe_async_client
from app.services.robots import robots_service

# (user agent token, operator, purpose)
AI_AGENTS = [
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

    by_purpose = {p: [a for a in agents if a["purpose"] == p] for p in ("training", "search", "user_fetch")}
    return {
        "status": "ok",
        "agents": agents,
        "search_bots_allowed": all(a["allowed"] for a in by_purpose["search"]),
        "training_bots_blocked": [a["agent"] for a in by_purpose["training"] if not a["allowed"]],
        "llms_txt": llms,
        "note": "Informational. Blocking AI training is a policy choice; llms.txt is not used by Google Search.",
    }
