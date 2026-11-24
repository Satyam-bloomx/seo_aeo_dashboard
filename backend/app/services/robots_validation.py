"""robots.txt validity: problems a robots parser silently tolerates, which a site owner needs to see.

A parser follows RFC 9309 and skips what it cannot use, so a malformed file "works" but its rules quietly stop
applying. Example: `User-agent: User-agent: *` names an agent called "User-agent: *" that matches no crawler, so every
Disallow in that group is ignored. Rules here follow Google's robots.txt documentation
(https://developers.google.com/search/docs/crawling-indexing/robots/robots_txt) and RFC 9309
(https://www.rfc-editor.org/rfc/rfc9309.html):
  * Google supports user-agent, allow, disallow and sitemap; other fields are ignored.
  * Rules must follow a user-agent line; rules outside any group are ignored.
  * Files over 500 KiB are cut off; 5xx or an unreachable file is treated as "disallow everything".

Each finding is a site-wide issue {id, label, type, priority, detail} using Screaming Frog's types. robots.txt is a
file for the whole site, so these are not tied to one URL; an error-level finding caps Site Health at 70.
"""
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

import httpx

from app.core.url_safety import UnsafeURLError, get_limited, safe_async_client

SUPPORTED = {"user-agent", "allow", "disallow", "sitemap"}
KNOWN_IGNORED = {"crawl-delay", "host", "clean-param", "request-rate", "visit-time", "noindex"}
MAX_BYTES = 500 * 1024
MAX_EXAMPLES = 3


def _issue(id_: str, label: str, type_: str, priority: str, detail: str) -> Dict[str, Any]:
    return {"id": id_, "label": label, "type": type_, "priority": priority, "detail": detail, "source": "robots.txt"}


def validate_robots_txt(text: Optional[str], status: Optional[int] = 200, size_bytes: Optional[int] = None) -> List[Dict[str, Any]]:
    """Findings for one robots.txt body. status None means the file could not be fetched at all."""
    if status is None:
        # Our request failed (DNS, timeout, TLS): it may be our network, so it is reported but never caps the score.
        return [_issue("robots_unverified", "robots.txt could not be checked", "Warning", "High",
                       "The request for robots.txt failed before the server answered, so it could not be validated.")]
    if status >= 500:
        return [_issue("robots_unreachable", "robots.txt returns a server error", "Issue", "High",
                       f"The server answered HTTP {status}. Google treats an unreachable robots.txt as a full disallow "
                       "and may stop crawling the site.")]
    if status >= 400 or not text:
        return []  # no robots.txt: everything may be crawled (RFC 9309), which is a valid choice
    text = text.lstrip("\ufeff")  # a byte-order mark must not turn the first line into an unknown field
    if text.lstrip()[:1] == "<":
        return [_issue("robots_is_html", "robots.txt returns an HTML page", "Warning", "Medium",
                       "The URL answers with a web page instead of a robots.txt file, so crawlers find no rules and "
                       "crawl everything. Serve a plain-text file, or return 404 if there are no rules.")]

    issues: List[Dict[str, Any]] = []
    bad_agents, orphan_rules, unparseable, unknown, bad_sitemaps = [], [], [], [], []
    lost_rules = 0
    in_group = False      # a user-agent line has been seen and its rules may follow
    group_broken = False  # the current group's user-agent lines are all malformed
    group_has_good_agent = False
    prev_was_agent = False
    for n, raw in enumerate(text.splitlines(), 1):
        line = raw.split("#", 1)[0].strip()
        if not line:
            continue
        if ":" not in line:
            unparseable.append(f"line {n}: '{raw.strip()[:60]}'")
            continue
        field, value = (part.strip() for part in line.split(":", 1))
        field = field.lower()
        if field == "user-agent":
            if not prev_was_agent:  # a new group starts
                group_broken, group_has_good_agent = False, False
            if ":" in value or value.lower().startswith("user-agent"):
                bad_agents.append(f"line {n}: '{raw.strip()[:60]}'")
                group_broken = not group_has_good_agent
            else:
                group_has_good_agent, group_broken = True, False
            in_group, prev_was_agent = True, True
            continue
        prev_was_agent = False
        if field in ("allow", "disallow"):
            if not in_group:
                orphan_rules.append(f"line {n}")
            elif group_broken:
                lost_rules += 1
        elif field == "sitemap":
            if not urlparse(value).scheme.startswith("http"):
                bad_sitemaps.append(f"line {n}: '{value[:60]}'")
        elif field not in SUPPORTED and field not in KNOWN_IGNORED:
            unknown.append(f"line {n}: '{field}'")

    if bad_agents:
        issues.append(_issue(
            "robots_malformed_user_agent", "robots.txt has malformed User-agent lines", "Issue", "High",
            f"{len(bad_agents)} line{'s' if len(bad_agents) != 1 else ''} such as {', '.join(bad_agents[:MAX_EXAMPLES])}. "
            "The agent name contains 'User-agent:' so it matches no crawler, and the "
            f"{lost_rules} Allow/Disallow rule{'s' if lost_rules != 1 else ''} in those groups are ignored."))
    if orphan_rules:
        issues.append(_issue(
            "robots_rules_outside_group", "robots.txt rules appear before any User-agent line", "Issue", "High",
            f"{len(orphan_rules)} Allow/Disallow line{'s' if len(orphan_rules) != 1 else ''} "
            f"({', '.join(orphan_rules[:MAX_EXAMPLES])}) belong to no group, so crawlers ignore them."))
    if unparseable:
        issues.append(_issue(
            "robots_unparseable_lines", "robots.txt has lines crawlers cannot read", "Warning", "Low",
            f"{len(unparseable)} line{'s' if len(unparseable) != 1 else ''} without a 'field: value' form, e.g. "
            f"{', '.join(unparseable[:MAX_EXAMPLES])}. They are skipped."))
    if unknown:
        issues.append(_issue(
            "robots_unsupported_fields", "robots.txt uses fields Google ignores", "Warning", "Low",
            f"{', '.join(unknown[:MAX_EXAMPLES])}{' and more' if len(unknown) > MAX_EXAMPLES else ''}. Google reads only "
            "user-agent, allow, disallow and sitemap."))
    if bad_sitemaps:
        issues.append(_issue(
            "robots_bad_sitemap_url", "robots.txt Sitemap line is not a full URL", "Warning", "Medium",
            f"{', '.join(bad_sitemaps[:MAX_EXAMPLES])}. Sitemap lines need an absolute URL."))
    if size_bytes and size_bytes > MAX_BYTES:
        issues.append(_issue(
            "robots_too_large", "robots.txt is larger than 500 KiB", "Warning", "Medium",
            f"{size_bytes // 1024} KiB. Google ignores everything after the first 500 KiB."))
    return issues


async def check_robots_txt(seed_url: str) -> List[Dict[str, Any]]:
    """Fetch the site's robots.txt (as served, unparsed) and validate it."""
    parsed = urlparse(seed_url)
    url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"
    try:
        async with safe_async_client(timeout=10.0) as client:
            resp = await get_limited(client, url, max_bytes=MAX_BYTES + 1024)
    except (UnsafeURLError, httpx.HTTPError):
        return validate_robots_txt(None, None)
    # get_limited returns decoded text only (no raw bytes); a truncated body means it exceeded the read limit.
    size = MAX_BYTES + 1 if resp.truncated else len((resp.text or "").encode("utf-8"))
    text = resp.text
    if "html" in (resp.headers.get("content-type") or "").lower() and not (text or "").lstrip().startswith("<"):
        text = "<" + (text or "")  # served as an HTML page: report it as such
    return validate_robots_txt(text, resp.status_code, size)
