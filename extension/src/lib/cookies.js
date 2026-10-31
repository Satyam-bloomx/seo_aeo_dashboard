// "Use verification": which cookies the helper may attach, and the declarativeNetRequest rule that attaches
// them. Pure module.
//
// Only anti-bot clearance cookies whose NAME is on a short allowlist, for exactly the audited host, are ever
// read. The rule sets the Cookie header only on requests to that host that the extension itself makes
// (no tab, initiator = this extension). Requests from pages, tabs, other extensions or the site's own
// service worker are never touched.

export const DEFAULT_CLEARANCE_COOKIES = [
  "cf_clearance", // Cloudflare challenge pass
  "__cf_bm", // Cloudflare bot management
  "datadome", // DataDome
  "_px3", // PerimeterX / HUMAN
  "_pxhd",
  "reese84", // Imperva Advanced Bot Protection
  "incap_ses_*", // Imperva / Incapsula session pass
  "visid_incap_*",
  "_abck", // Akamai Bot Manager
  "bm_sz",
];
export const MAX_ALLOWLIST = 20;
const NAME_RE = /^[A-Za-z0-9_.-]+\*?$/;
const MIN_PREFIX = 5; // "incap*" is fine, "s*" or "_*" is not

export const CLEARANCE_RULE_BASE = 1000;
export const CLEARANCE_RESOURCE_TYPES = ["xmlhttprequest", "other"];

/** Validate an allowlist edited by the user. Returns {list, errors}. */
export function validateAllowlist(input) {
  const errors = [];
  const list = [];
  const raw = Array.isArray(input) ? input : String(input || "").split(/[\s,]+/);
  for (const r of raw) {
    const name = String(r).trim();
    if (!name) continue;
    if (!NAME_RE.test(name)) errors.push(`"${name}" is not a valid cookie name.`);
    else if (name.endsWith("*") && name.length - 1 < MIN_PREFIX) errors.push(`"${name}": a prefix needs at least ${MIN_PREFIX} characters.`);
    else if (!list.includes(name)) list.push(name);
  }
  if (list.length > MAX_ALLOWLIST) errors.push(`At most ${MAX_ALLOWLIST} names.`);
  return { list: list.slice(0, MAX_ALLOWLIST), errors };
}

export function nameAllowed(name, allowlist) {
  return allowlist.some((a) => (a.endsWith("*") ? name.startsWith(a.slice(0, -1)) : name === a));
}

/** RFC 6265 domain-match of a cookie against the request host. */
export function cookieAppliesToHost(cookie, host) {
  const h = host.toLowerCase();
  const d = String(cookie.domain || "").toLowerCase().replace(/^\./, "");
  if (!d || !d.includes(".")) return false; // never a bare TLD-style domain
  if (cookie.hostOnly) return h === d;
  return h === d || h.endsWith("." + d);
}

/**
 * Cookies (chrome.cookies.Cookie objects) that may be attached for `host`: allowlisted name, domain-matching
 * the host, not expired, not partitioned, and with a value that cannot break the header.
 */
export function selectClearanceCookies(cookies, { host, allowlist = DEFAULT_CLEARANCE_COOKIES, nowSec = Date.now() / 1000 }) {
  const out = new Map();
  for (const c of cookies || []) {
    if (!c || typeof c.name !== "string" || typeof c.value !== "string") continue;
    if (!nameAllowed(c.name, allowlist)) continue;
    if (!cookieAppliesToHost(c, host)) continue;
    if (c.partitionKey) continue;
    if (!c.session && c.expirationDate && c.expirationDate <= nowSec) continue;
    if (/[\r\n;\0]/.test(c.value) || /[\r\n;=\0\s]/.test(c.name)) continue;
    const prev = out.get(c.name);
    // the most specific domain wins, as in the browser
    if (!prev || String(c.domain).length > String(prev.domain).length) out.set(c.name, c);
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function cookieHeader(cookies) {
  return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

/** Stable rule id for a host (session rule ids must be integers). */
export function ruleIdForHost(host) {
  let h = 0x811c9dc5;
  for (const ch of host.toLowerCase()) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return CLEARANCE_RULE_BASE + (h % 1000000);
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The declarativeNetRequest session rule that attaches the clearance cookies to the extension's own requests
 * to exactly `host` (no subdomains, http or https, any port). Returns null when there is nothing to attach.
 */
export function buildClearanceRule({ host, cookies, extensionId }) {
  if (!host || !extensionId || !cookies || !cookies.length) return null;
  return {
    id: ruleIdForHost(host),
    priority: 1,
    action: {
      type: "modifyHeaders",
      requestHeaders: [{ header: "cookie", operation: "set", value: cookieHeader(cookies) }],
    },
    condition: {
      regexFilter: `^https?://${escapeRegex(host.toLowerCase())}(:[0-9]+)?/`,
      tabIds: [-1], // chrome.tabs.TAB_ID_NONE: not a page in a tab
      initiatorDomains: [extensionId], // only requests this extension starts
      resourceTypes: CLEARANCE_RESOURCE_TYPES,
    },
  };
}
