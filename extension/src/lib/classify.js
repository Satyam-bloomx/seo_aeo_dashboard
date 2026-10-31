// Classify one fetch attempt, mirroring backend/app/services/fetch_outcome.py. Pure module.
//
// outcome: ok | site_error | crawler_error | blocked | unverified | robots_blocked
// side:    site (counts in the score) | ours | unknown | blocked (never count in the score)
// A Failure is an attempt that produced no usable page: {reason, temporary, outcome, side, kind, status,
// retryAfterMs, provider}. kind: network | status | challenge.

import { detectChallenge } from "./challenge.js";

export const TEMPORARY_STATUSES = [429, 502, 503, 504];
export const MAX_RETRY_AFTER_MS = 30000;

export const HEADER_ALLOWLIST = [
  "content-type", "x-robots-tag", "link", "refresh", "content-security-policy", "strict-transport-security",
  "x-frame-options", "x-content-type-options", "referrer-policy", "retry-after", "cf-mitigated", "server",
];

/** Lowercased allowlisted headers from a Headers object or a plain object. */
export function pickHeaders(headers) {
  const out = {};
  if (!headers) return out;
  const get =
    typeof headers.get === "function"
      ? (k) => headers.get(k)
      : (k) => {
          const key = Object.keys(headers).find((x) => x.toLowerCase() === k);
          return key == null ? null : headers[key];
        };
  for (const k of HEADER_ALLOWLIST) {
    const v = get(k);
    if (v != null && v !== "") out[k] = String(v).slice(0, 8192);
  }
  return out;
}

/** Retry-After (seconds or HTTP date) in ms, capped at 30 s. 0 when absent or unparsable. */
export function parseRetryAfter(value, nowMs = Date.now(), capMs = MAX_RETRY_AFTER_MS) {
  if (value == null || value === "") return 0;
  const v = String(value).trim();
  let ms;
  if (/^\d+(\.\d+)?$/.test(v)) ms = Number(v) * 1000;
  else {
    const t = Date.parse(v);
    if (Number.isNaN(t)) return 0;
    ms = t - nowMs;
  }
  return Math.max(0, Math.min(capMs, Math.round(ms)));
}

export function failure(reason, temporary, outcome = "unverified", side = "unknown", extra = {}) {
  return { reason, temporary, outcome, side, kind: "network", status: 0, retryAfterMs: 0, provider: null, ...extra };
}

/**
 * Failure for a response that must not be treated as the page (challenge, 429, temporary 5xx), or null for a
 * normal answer. Permanent 4xx/5xx are normal answers: the site answered, the error page is the result.
 */
export function classifyResponse({ status, headers = {}, html = "" }, nowMs = Date.now()) {
  const retryAfterMs = parseRetryAfter(pickHeaders(headers)["retry-after"], nowMs);
  const ch = detectChallenge({ status, headers, html });
  if (ch)
    return failure(`The site showed a bot check (${providerName(ch.provider)}).`, true, "blocked", "blocked", {
      kind: "challenge", status, retryAfterMs, provider: ch.provider, evidence: ch.evidence,
    });
  if (status === 429)
    return failure("The site is rate-limiting requests (HTTP 429).", true, "blocked", "blocked", { kind: "status", status, retryAfterMs });
  if (TEMPORARY_STATUSES.includes(status))
    return failure(`The site had a temporary server error (HTTP ${status}).`, true, "site_error", "site", { kind: "status", status, retryAfterMs });
  return null;
}

/** Outcome/reason for a normal answer (classifyResponse returned null). */
export function answerOutcome(status) {
  if (status >= 200 && status < 400) return { outcome: "ok", side: "site", reason: null };
  if (status === 404 || status === 410) return { outcome: "site_error", side: "site", reason: `Page not found (HTTP ${status}).` };
  if (status === 401 || status === 403) return { outcome: "site_error", side: "site", reason: `The site refused access to this page (HTTP ${status}).` };
  if (status >= 500) return { outcome: "site_error", side: "site", reason: `The site returned a server error (HTTP ${status}).` };
  return { outcome: "site_error", side: "site", reason: `The site returned HTTP ${status}.` };
}

/**
 * Failure for a fetch that threw. `err` = {netError?: "net::ERR_...", timedOut?: bool}.
 * DNS "not found", TLS errors and redirect loops are permanent; everything else is temporary.
 */
export function classifyNetError(err = {}) {
  if (err.timedOut) return failure("The site took too long to respond (timeout).", true);
  const e = String(err.netError || "").toUpperCase();
  if (e === "REDIRECT_OUTSIDE_SITE")
    return failure(`The page redirects outside the approved site (to ${err.redirectTo}); the server should fetch it.`, false, "unverified", "unknown");
  if (/ERR_NAME_NOT_RESOLVED/.test(e)) return failure("The domain does not exist (DNS lookup failed).", false, "site_error", "site");
  if (/ERR_NAME_RESOLUTION_FAILED|ERR_DNS_/.test(e)) return failure("The DNS lookup failed temporarily.", true);
  if (/ERR_CERT_|ERR_SSL_|ERR_BAD_SSL|ERR_TLS/.test(e)) return failure("The site's HTTPS certificate is invalid.", false, "site_error", "site");
  if (/ERR_TOO_MANY_REDIRECTS/.test(e)) return failure("Redirect loop or too many redirects.", false, "site_error", "site");
  if (/ERR_INTERNET_DISCONNECTED|ERR_NETWORK_CHANGED|ERR_NETWORK_ACCESS_DENIED|ERR_PROXY_/.test(e))
    return failure("Your internet connection dropped while fetching.", true, "crawler_error", "ours");
  if (/ERR_BLOCKED_BY_CLIENT|ERR_BLOCKED_BY_ADMINISTRATOR/.test(e))
    return failure("Another extension or a browser policy blocked the request.", false, "crawler_error", "ours");
  if (/ERR_UNSAFE_PORT|ERR_UNSAFE_REDIRECT|ERR_DISALLOWED_URL_SCHEME/.test(e))
    return failure("The browser refuses to open this address (unsafe port or redirect); the server should fetch it.", false, "crawler_error", "ours");
  if (/ERR_CONNECTION_REFUSED/.test(e)) return failure("The site refused the connection.", true);
  if (/ERR_CONNECTION_RESET|ERR_CONNECTION_CLOSED|ERR_EMPTY_RESPONSE|ERR_CONNECTION_ABORTED/.test(e))
    return failure("The site closed the connection unexpectedly.", true);
  if (/TIMED_OUT|TIMEOUT/.test(e)) return failure("The site took too long to respond (timeout).", true);
  if (/ERR_ADDRESS_UNREACHABLE|ERR_CONNECTION_FAILED/.test(e)) return failure("Could not connect to the site.", true);
  return failure(e ? `Network error (${e.replace(/^NET::/, "")}).` : "Network error (no details from the browser).", true);
}

export function providerName(p) {
  return { cloudflare: "Cloudflare", datadome: "DataDome", perimeterx: "PerimeterX", akamai: "Akamai", imperva: "Imperva" }[p] || p || "unknown";
}

/** Should the body be read (HTML or other text)? Empty content-type is read too. */
export function isTextual(contentType) {
  const ct = String(contentType || "").toLowerCase();
  return !ct || ct.includes("html") || ct.includes("xml") || ct.startsWith("text/") || ct.includes("json");
}

/** Charset from the Content-Type header, else a BOM, else <meta charset> in the first 1024 bytes, else utf-8. */
export function sniffCharset(contentType, head) {
  const fromHeader = /charset\s*=\s*["']?([\w.:-]+)/i.exec(String(contentType || ""));
  if (fromHeader) return validLabel(fromHeader[1]);
  const b = head || new Uint8Array(0);
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return "utf-8";
  if (b[0] === 0xff && b[1] === 0xfe) return "utf-16le";
  if (b[0] === 0xfe && b[1] === 0xff) return "utf-16be";
  let ascii = "";
  for (let i = 0; i < Math.min(b.length, 1024); i++) ascii += String.fromCharCode(b[i]);
  const meta = /<meta[^>]+charset\s*=\s*["']?([\w.:-]+)/i.exec(ascii);
  return meta ? validLabel(meta[1]) : "utf-8";
}

function validLabel(label) {
  try {
    return new TextDecoder(label).encoding;
  } catch {
    return "utf-8";
  }
}
