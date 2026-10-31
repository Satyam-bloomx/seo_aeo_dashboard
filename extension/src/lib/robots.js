// robots.txt (RFC 9309) for the helper. Pure module: no chrome APIs.
//
// - Groups: consecutive User-agent lines open a group; rules follow. Groups naming the same agent are merged.
// - Agent choice: groups whose product token is exactly "auditpro" (case-insensitive), otherwise "*".
// - Matching: longest pattern wins; on a tie Allow wins. `*` wildcard and `$` end anchor supported.
// - Fetch policy (same as the server): 2xx parse, 4xx allow everything, 5xx or unreachable disallow everything.

export const ROBOTS_AGENT = "auditpro";
export const ROBOTS_MAX_BYTES = 500 * 1024;
export const MAX_CRAWL_DELAY_MS = 10000;

export function parseRobots(text) {
  const groups = [];
  const sitemaps = [];
  let cur = null;
  let inAgents = false;
  const src = String(text || "").slice(0, ROBOTS_MAX_BYTES).replace(/^﻿/, "");
  for (const raw of src.split(/\r\n|\r|\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const i = line.indexOf(":");
    if (i < 0) continue;
    const key = line.slice(0, i).trim().toLowerCase();
    const val = line.slice(i + 1).trim();
    if (key === "user-agent") {
      if (!inAgents) {
        cur = { agents: [], rules: [], crawlDelay: null };
        groups.push(cur);
      }
      cur.agents.push(val.toLowerCase().split("/")[0].trim());
      inAgents = true;
      continue;
    }
    if (key === "sitemap") {
      sitemaps.push(val);
      continue;
    }
    inAgents = false;
    if (!cur) continue; // rules before any User-agent line are ignored
    if (key === "allow" || key === "disallow") cur.rules.push({ allow: key === "allow", pattern: val });
    else if (key === "crawl-delay") {
      const n = Number(val);
      if (Number.isFinite(n) && n >= 0) cur.crawlDelay = n;
    }
  }
  return { groups, sitemaps };
}

/** Rules (and crawl-delay) of the groups for `agent`, falling back to `*`. */
export function selectGroup(parsed, agent = ROBOTS_AGENT) {
  const a = agent.toLowerCase();
  let groups = parsed.groups.filter((g) => g.agents.includes(a));
  if (!groups.length) groups = parsed.groups.filter((g) => g.agents.includes("*"));
  const delays = groups.map((g) => g.crawlDelay).filter((d) => d != null);
  return {
    rules: groups.flatMap((g) => g.rules),
    crawlDelayMs: delays.length ? Math.min(MAX_CRAWL_DELAY_MS, Math.max(...delays) * 1000) : 0,
  };
}

function normalize(s) {
  // Compare decoded forms so "/caf%C3%A9" and "/café" match each other; keep reserved chars as-is.
  try {
    return decodeURI(s);
  } catch {
    return s;
  }
}

const regexCache = new Map();
function patternRegex(pattern) {
  let re = regexCache.get(pattern);
  if (re) return re;
  let p = normalize(pattern);
  let anchored = false;
  if (p.endsWith("$")) {
    anchored = true;
    p = p.slice(0, -1);
  }
  const body = p
    .split("*")
    .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  re = new RegExp("^" + body + (anchored ? "$" : ""));
  if (regexCache.size > 2000) regexCache.clear();
  regexCache.set(pattern, re);
  return re;
}

export function isPathAllowed(rules, pathWithQuery) {
  const path = normalize(pathWithQuery || "/");
  if (path === "/robots.txt") return true;
  let best = null;
  for (const r of rules) {
    if (!r.pattern) continue; // "Disallow:" (empty) allows everything; empty Allow is a no-op
    if (!patternRegex(r.pattern).test(path)) continue;
    const len = r.pattern.length;
    if (!best || len > best.len || (len === best.len && r.allow && !best.allow)) best = { len, allow: r.allow };
  }
  return best ? best.allow : true;
}

/** Build a robots policy object from a parsed file. */
export function createRobots(text, agent = ROBOTS_AGENT, note = null, unreachable = false) {
  const { rules, crawlDelayMs } = selectGroup(parseRobots(text), agent);
  return {
    rules,
    crawlDelayMs,
    unreachable, // robots.txt could not be fetched at all
    note, // why the policy is what it is, when not from a normal robots.txt (e.g. "HTTP 503")
    isAllowed(url) {
      let p = url;
      if (/^https?:\/\//i.test(p)) {
        const u = new URL(p);
        p = u.pathname + u.search;
      }
      return isPathAllowed(rules, p || "/");
    },
  };
}

export const ALLOW_ALL = "User-agent: *\nDisallow:";
export const DISALLOW_ALL = "User-agent: *\nDisallow: /";

/**
 * Policy from the robots.txt fetch, mirroring the server:
 *   {status, text} with 2xx -> parse; 4xx -> allow all; 5xx -> disallow all;
 *   {error} (network failure) -> disallow all.
 */
export function robotsFromFetch({ status = 0, text = "", error = null } = {}, agent = ROBOTS_AGENT) {
  if (error || !status) return createRobots(DISALLOW_ALL, agent, "robots.txt could not be fetched", true);
  if (status >= 200 && status < 300) return createRobots(text, agent);
  if (status >= 400 && status < 500) return createRobots(ALLOW_ALL, agent);
  return createRobots(DISALLOW_ALL, agent, `robots.txt answered HTTP ${status}`);
}
