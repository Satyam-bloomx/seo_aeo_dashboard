"""Free Google Autocomplete keyword suggestions (no API key or AI credits required)."""
from typing import List, Optional
import httpx

SUGGEST_URL = "https://suggestqueries.google.com/complete/search"
MAX_SUGGESTIONS = 12


async def fetch_autocomplete(
    query: str,
    *,
    hl: str = "en",
    gl: str = "in",
    limit: int = 10,
    client: Optional[httpx.AsyncClient] = None,
) -> List[str]:
    """Return deduplicated Google Autocomplete suggestions for a seed query."""
    q = " ".join(str(query or "").split()).strip()[:120]
    if not q:
        return []
    params = {"client": "firefox", "hl": hl, "gl": gl, "q": q}
    try:
        if client is None:
            async with httpx.AsyncClient(timeout=5.0) as c:
                res = await c.get(SUGGEST_URL, params=params)
        else:
            res = await client.get(SUGGEST_URL, params=params)
        if res.status_code != 200:
            return []
        payload = res.json()
        raw = payload[1] if isinstance(payload, list) and len(payload) > 1 and isinstance(payload[1], list) else []
        out: List[str] = []
        seen = set()
        for item in raw:
            s = " ".join(str(item or "").split()).strip()
            low = s.lower()
            if s and low not in seen:
                seen.add(low)
                out.append(s)
                if len(out) >= min(limit, MAX_SUGGESTIONS):
                    break
        return out
    except (httpx.HTTPError, ValueError, TypeError):
        return []
