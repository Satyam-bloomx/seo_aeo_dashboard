// AuditPro Helper service worker (MV3, ES module).
//
// Talks only to the AuditPro app (externally_connectable origins in the manifest) over a long-lived port.
// Fetches pages for sites the user granted, without cookies, politely; see PROTOCOL.md for the messages.

import { SiteRunner } from "./lib/runner.js";
import { robotsFromFetch, ROBOTS_MAX_BYTES } from "./lib/robots.js";
import { isTextual, sniffCharset } from "./lib/classify.js";
import { gzipBase64 } from "./lib/gzip.js";
import { siteOrigin, siteHosts, permissionPatterns, urlInSite, originAllowed } from "./lib/origins.js";
import {
  DEFAULT_CLEARANCE_COOKIES, CLEARANCE_RULE_BASE, selectClearanceCookies, buildClearanceRule, ruleIdForHost,
  nameAllowed, cookieAppliesToHost, validateAllowlist,
} from "./lib/cookies.js";

const MANIFEST = chrome.runtime.getManifest();
const VERSION = MANIFEST.version;
const PROTOCOL_VERSION = 1;
const APP_MATCHES = (MANIFEST.externally_connectable && MANIFEST.externally_connectable.matches) || [];
const EXT_ORIGIN = new URL(chrome.runtime.getURL("")).origin;
const FETCH_TIMEOUT_MS = 30000;
const ROBOTS_TIMEOUT_MS = 10000;
const MAX_HTML_BYTES = 5 * 1024 * 1024;
const MAX_URLS_PER_BATCH = 5000;
const MAX_CAPTURE_B64 = 8 * 1024 * 1024; // chrome.storage.session holds 10 MB in total
const KEEPALIVE_MS = 20000;

/** @type {Map<chrome.runtime.Port, {origin: string}>} */
const ports = new Map();
/** crawl_id -> {runner, port, site, hosts, verification} */
const batches = new Map();
/** permission request token -> {port, id, site, verification, windowId, done} */
const permRequests = new Map();
let keepAliveTimer = null;

// ------------------------------------------------------------------ settings (chrome.storage.local)

async function getSettings() {
  const s = await chrome.storage.local.get({ sites: {}, cookieAllowlist: DEFAULT_CLEARANCE_COOKIES });
  return s;
}

async function siteRecord(origin) {
  const { sites } = await getSettings();
  return sites[origin] || null;
}

async function saveSiteRecord(origin, rec) {
  const { sites } = await getSettings();
  if (rec) sites[origin] = rec;
  else delete sites[origin];
  await chrome.storage.local.set({ sites });
}

async function hasSitePermission(origin) {
  try {
    return await chrome.permissions.contains({ origins: permissionPatterns(origin) });
  } catch {
    return false;
  }
}

async function permissionStatus(origin) {
  const rec = await siteRecord(origin);
  return {
    site: origin,
    granted: await hasSitePermission(origin),
    owner_confirmed: !!(rec && rec.owner_confirmed_at),
    verification: !!(rec && rec.verification),
  };
}

// ------------------------------------------------------------------ network log (net::ERR codes, redirects)
// fetch() only says "Failed to fetch"; webRequest tells which net::ERR_* it was. Only our own requests
// (no tab, initiator = this extension) are recorded, only for hosts the user granted.

const netErrors = new Map(); // url -> {error, at}
const netRedirects = new Map(); // url -> {to, status, at}
const ours = (d) => d.tabId === -1 && d.initiator === EXT_ORIGIN;

function prune(map) {
  if (map.size < 500) return;
  const cutoff = Date.now() - 120000;
  for (const [k, v] of map) if (v.at < cutoff) map.delete(k);
}

chrome.webRequest.onErrorOccurred.addListener(
  (d) => {
    if (!ours(d)) return;
    netErrors.set(d.url, { error: d.error, at: Date.now() });
    prune(netErrors);
  },
  { urls: ["<all_urls>"] }
);
chrome.webRequest.onBeforeRedirect.addListener(
  (d) => {
    if (!ours(d)) return;
    netRedirects.set(d.url, { to: d.redirectUrl, status: d.statusCode, at: Date.now() });
    prune(netRedirects);
  },
  { urls: ["<all_urls>"] }
);

function redirectChain(url, since) {
  const chain = [];
  let cur = url;
  const seen = new Set();
  while (chain.length < 20 && !seen.has(cur)) {
    seen.add(cur);
    const r = netRedirects.get(cur);
    if (!r || r.at < since) break;
    chain.push({ url: cur, status: r.status });
    cur = r.to;
  }
  return chain;
}

function netErrorFor(url, since) {
  const chain = redirectChain(url, since);
  const urls = [url, ...chain.map((r) => r.url)];
  if (chain.length) urls.push(netRedirects.get(chain[chain.length - 1].url).to);
  let best = null;
  for (const u of urls) {
    const e = netErrors.get(u);
    if (e && e.at >= since && (!best || e.at > best.at)) best = e;
  }
  return best ? best.error : null;
}

// ------------------------------------------------------------------ fetching

async function readBody(resp, maxBytes) {
  if (!resp.body) return { bytes: new Uint8Array(0), truncated: false };
  const reader = resp.body.getReader();
  const parts = [];
  let total = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (total + value.length > maxBytes) {
      parts.push(value.subarray(0, maxBytes - total));
      total = maxBytes;
      truncated = true;
      await reader.cancel().catch(() => {});
      break;
    }
    parts.push(value);
    total += value.length;
  }
  const bytes = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    bytes.set(p, o);
    o += p.length;
  }
  return { bytes, truncated };
}

/** One GET, never with the user's cookies. Throws {aborted} | {timedOut} | {netError}. */
async function fetchPage(url, { signal, timeoutMs = FETCH_TIMEOUT_MS, maxBytes = MAX_HTML_BYTES } = {}) {
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, timeoutMs);
  const onAbort = () => ctrl.abort();
  if (signal) signal.addEventListener("abort", onAbort);
  const since = Date.now() - 50;
  try {
    const resp = await fetch(url, {
      method: "GET",
      credentials: "omit",
      redirect: "follow",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      signal: ctrl.signal,
      headers: { accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
    });
    const ct = resp.headers.get("content-type") || "";
    let html = "";
    let truncated = false;
    if (isTextual(ct)) {
      const body = await readBody(resp, maxBytes);
      truncated = body.truncated;
      html = new TextDecoder(sniffCharset(ct, body.bytes.subarray(0, 1024))).decode(body.bytes);
    } else if (resp.body) await resp.body.cancel().catch(() => {});
    return { status: resp.status, headers: resp.headers, html, truncated, final_url: resp.url || url, redirects: redirectChain(url, since) };
  } catch (e) {
    if (signal && signal.aborted) throw { aborted: true };
    if (timedOut) throw { timedOut: true };
    await new Promise((r) => setTimeout(r, 100)); // let webRequest.onErrorOccurred arrive
    const netError = netErrorFor(url, since);
    const redirects = redirectChain(url, since);
    if (!netError && redirects.length) {
      // A redirect to a host the user did not grant fails the CORS check without a net error code.
      const last = redirects[redirects.length - 1];
      const to = netRedirects.get(last.url).to;
      if (!(await chrome.permissions.contains({ origins: [new URL(to).origin + "/*"] }).catch(() => false)))
        throw { netError: "REDIRECT_OUTSIDE_SITE", redirectTo: to, redirectStatus: last.status, redirects };
    }
    throw { netError: netError || String((e && e.message) || "") };
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", onAbort);
  }
}

async function loadRobots(origin) {
  try {
    const r = await fetchPage(`${origin}/robots.txt`, { timeoutMs: ROBOTS_TIMEOUT_MS, maxBytes: ROBOTS_MAX_BYTES });
    return robotsFromFetch({ status: r.status, text: r.html });
  } catch {
    return robotsFromFetch({ error: true });
  }
}

// ------------------------------------------------------------------ "use verification": clearance cookies

async function refreshClearance(entry) {
  const { cookieAllowlist } = await getSettings();
  const allowlist = validateAllowlist(cookieAllowlist).list;
  const scheme = new URL(entry.site).protocol;
  const names = new Set();
  for (const host of entry.hosts) {
    let jar = [];
    try {
      jar = await chrome.cookies.getAll({ url: `${scheme}//${host}/` });
    } catch {
      jar = [];
    }
    const picked = selectClearanceCookies(jar, { host, allowlist });
    const rule = buildClearanceRule({ host, cookies: picked, extensionId: chrome.runtime.id });
    await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [ruleIdForHost(host)], addRules: rule ? [rule] : [] });
    picked.forEach((c) => names.add(c.name));
  }
  return [...names];
}

async function clearClearance(hosts) {
  await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: hosts.map(ruleIdForHost) }).catch(() => {});
}

async function clearAllClearanceRules() {
  try {
    const rules = await chrome.declarativeNetRequest.getSessionRules();
    const ids = rules.filter((r) => r.id >= CLEARANCE_RULE_BASE).map((r) => r.id);
    if (ids.length) await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: ids });
  } catch {}
}
clearAllClearanceRules(); // a previous service worker may have stopped without cleaning up

let cookieRefreshTimer = null;
chrome.cookies.onChanged.addListener(async ({ cookie }) => {
  const { cookieAllowlist } = await getSettings();
  const active = [...batches.values()].filter(
    (b) => b.verification && b.hosts.some((h) => cookieAppliesToHost(cookie, h)) && nameAllowed(cookie.name, cookieAllowlist)
  );
  if (!active.length) return;
  clearTimeout(cookieRefreshTimer);
  cookieRefreshTimer = setTimeout(() => active.forEach((b) => refreshClearance(b).catch(() => {})), 500);
});

// ------------------------------------------------------------------ app connection

function post(port, msg) {
  try {
    port.postMessage(msg);
    return true;
  } catch {
    return false;
  }
}

function senderOrigin(sender) {
  if (sender.origin) return sender.origin;
  try {
    return new URL(sender.url).origin;
  } catch {
    return null;
  }
}

function keepAlive() {
  if (ports.size && !keepAliveTimer) keepAliveTimer = setInterval(() => chrome.runtime.getPlatformInfo(() => {}), KEEPALIVE_MS);
  if (!ports.size && keepAliveTimer) {
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
  }
}

async function helloPayload() {
  const { orphaned = [] } = await chrome.storage.session.get("orphaned");
  return {
    type: "hello",
    extension: "auditpro-helper",
    version: VERSION,
    protocol: PROTOCOL_VERSION,
    extension_id: chrome.runtime.id,
    user_agent: navigator.userAgent,
    capabilities: ["batch", "verification", "capture_tab"],
    active_batches: [...batches.entries()].map(([crawl_id, b]) => ({ crawl_id, site: b.site, paused: !!b.runner.paused })),
    orphaned, // batches cut off by an earlier disconnect: their URLs without a result
  };
}

chrome.runtime.onConnectExternal.addListener(async (port) => {
  const origin = senderOrigin(port.sender);
  if (!originAllowed(origin, APP_MATCHES)) {
    port.disconnect();
    return;
  }
  ports.set(port, { origin });
  keepAlive();
  port.onMessage.addListener((msg) => handleAppMessage(port, msg).catch((e) => reply(port, msg, { type: "error", code: "internal", message: String(e && e.message) })));
  port.onDisconnect.addListener(() => onPortClosed(port));
  const hello = await helloPayload();
  if (post(port, hello) && hello.orphaned.length) await chrome.storage.session.set({ orphaned: [] });
  publishStatus();
});

// One-shot messages: detection and version check without opening a port.
chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  if (!originAllowed(senderOrigin(sender), APP_MATCHES)) return false;
  if (msg && (msg.type === "hello" || msg.type === "ping")) {
    helloPayload().then((h) => sendResponse({ ...h, orphaned: undefined }));
    return true;
  }
  sendResponse({ type: "error", code: "use_port", message: "Open a port with chrome.runtime.connect for this message." });
  return false;
});

async function onPortClosed(port) {
  ports.delete(port);
  keepAlive();
  for (const [crawlId, b] of [...batches]) {
    if (b.port !== port) continue;
    const remaining = await b.runner.stop();
    await endBatch(crawlId);
    await storeOrphan({ crawl_id: crawlId, site: b.site, remaining, at: Date.now() });
  }
  for (const req of permRequests.values()) if (req.port === port) req.port = null;
  publishStatus();
}

async function storeOrphan(o) {
  const { orphaned = [] } = await chrome.storage.session.get("orphaned");
  orphaned.push(o);
  await chrome.storage.session.set({ orphaned: orphaned.slice(-20) });
}

function reply(port, req, msg) {
  return post(port, req && req.id != null ? { ...msg, id: req.id } : msg);
}

async function handleAppMessage(port, msg) {
  if (!msg || typeof msg.type !== "string") return reply(port, msg, { type: "error", code: "bad_message", message: "Messages need a type." });
  switch (msg.type) {
    case "hello":
      return reply(port, msg, await helloPayload());
    case "ping":
      return reply(port, msg, { type: "pong", version: VERSION });
    case "check_permission": {
      const origin = parseSite(port, msg);
      if (origin) reply(port, msg, { type: "permission_status", ...(await permissionStatus(origin)) });
      return;
    }
    case "request_permission":
      return requestPermission(port, msg);
    case "start_batch":
      return startBatch(port, msg);
    case "resume":
      return resumeBatch(port, msg);
    case "decline_verification": {
      const b = ownBatch(port, msg);
      if (b) reply(port, msg, { type: "verification_declined", crawl_id: msg.crawl_id, was_paused: b.runner.decline() });
      return;
    }
    case "stop": {
      const b = ownBatch(port, msg);
      if (!b) return;
      const remaining = await b.runner.stop();
      await endBatch(msg.crawl_id);
      return reply(port, msg, { type: "stopped", crawl_id: msg.crawl_id, reason: "requested", remaining });
    }
    case "get_capture": {
      const { capture = null } = await chrome.storage.session.get("capture");
      return reply(port, msg, { type: "capture", capture });
    }
    case "clear_capture":
      await chrome.storage.session.remove("capture");
      publishStatus();
      return reply(port, msg, { type: "capture_cleared" });
    default:
      return reply(port, msg, { type: "error", code: "unknown_type", message: `Unknown message type "${msg.type}".` });
  }
}

function parseSite(port, msg) {
  try {
    return siteOrigin(msg.site);
  } catch (e) {
    reply(port, msg, { type: "error", code: "bad_site", message: `Invalid site: ${e.message}` });
    return null;
  }
}

function ownBatch(port, msg) {
  const b = batches.get(msg.crawl_id);
  if (!b || b.port !== port) {
    reply(port, msg, { type: "error", code: "unknown_batch", crawl_id: msg.crawl_id, message: "No running batch with this crawl_id on this connection." });
    return null;
  }
  return b;
}

// ------------------------------------------------------------------ per-site permission (needs a click in our own window)

async function requestPermission(port, msg) {
  const origin = parseSite(port, msg);
  if (!origin) return;
  if (msg.owner_confirmed !== true)
    return reply(port, msg, { type: "error", code: "owner_not_confirmed", message: "The user must confirm they own or may audit this site." });
  const status = await permissionStatus(origin);
  if (status.granted && status.owner_confirmed && (!msg.verification || status.verification))
    return reply(port, msg, { type: "permission_result", ...status });
  const token = crypto.randomUUID();
  const req = { port, id: msg.id, site: origin, verification: !!msg.verification, windowId: null, done: false };
  permRequests.set(token, req);
  const win = await chrome.windows.create({
    url: chrome.runtime.getURL(`permission/permission.html?req=${encodeURIComponent(token)}`),
    type: "popup",
    width: 480,
    height: 640,
    focused: true,
  });
  req.windowId = win.id;
}

chrome.windows.onRemoved.addListener(async (windowId) => {
  for (const [token, req] of permRequests) {
    if (req.windowId !== windowId) continue;
    permRequests.delete(token);
    if (!req.done && req.port) reply(req.port, { id: req.id }, { type: "permission_result", ...(await permissionStatus(req.site)), closed: true });
  }
});

chrome.permissions.onRemoved.addListener(async () => {
  const { sites } = await getSettings();
  for (const origin of Object.keys(sites)) if (!(await hasSitePermission(origin))) delete sites[origin];
  await chrome.storage.local.set({ sites });
});

// ------------------------------------------------------------------ batches

async function startBatch(port, msg) {
  const { crawl_id: crawlId, urls, mode = {} } = msg;
  if (typeof crawlId !== "string" && typeof crawlId !== "number")
    return reply(port, msg, { type: "error", code: "bad_batch", message: "crawl_id is required." });
  if (msg.owner_confirmed !== true)
    return reply(port, msg, { type: "error", code: "owner_not_confirmed", crawl_id: crawlId, message: "Refused: owner_confirmed must be true." });
  if (!Array.isArray(urls) || !urls.length || urls.length > MAX_URLS_PER_BATCH)
    return reply(port, msg, { type: "error", code: "bad_batch", crawl_id: crawlId, message: `urls must be a list of 1-${MAX_URLS_PER_BATCH} URLs.` });
  const origin = parseSite(port, msg);
  if (!origin) return;
  if (batches.has(crawlId)) return reply(port, msg, { type: "error", code: "duplicate_batch", crawl_id: crawlId, message: "This crawl_id is already running." });
  if ([...batches.values()].some((b) => b.site === origin))
    return reply(port, msg, { type: "error", code: "site_busy", crawl_id: crawlId, message: "Another batch for this site is running." });
  const status = await permissionStatus(origin);
  if (!status.granted || !status.owner_confirmed)
    return reply(port, msg, { type: "error", code: "no_permission", crawl_id: crawlId, message: "The user has not granted access to this site in the helper yet." });

  const accepted = [];
  const rejected = [];
  for (const u of urls) {
    if (typeof u === "string" && urlInSite(u, origin)) accepted.push(new URL(u).href);
    else rejected.push({ url: String(u), reason: "Outside the approved site (the server should fetch it)." });
  }
  const verification = !!mode.verification && status.verification;
  const entry = { site: origin, hosts: siteHosts(origin), port, verification, runner: null };
  const runner = new SiteRunner({
    crawlId,
    site: origin,
    urls: accepted,
    respectRobots: mode.respect_robots !== false,
    deps: {
      fetchPage,
      loadRobots,
      gzip: gzipBase64,
      now: () => performance.now(),
      wallNow: () => Date.now(),
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      emit: (m) => {
        post(port, m);
        if (m.type === "progress" || m.type === "needs_verification") publishStatus();
      },
    },
  });
  entry.runner = runner;
  batches.set(crawlId, entry);
  let clearance = [];
  if (verification) clearance = await refreshClearance(entry).catch(() => []);
  reply(port, msg, {
    type: "batch_accepted",
    crawl_id: crawlId,
    site: origin,
    accepted: accepted.length,
    rejected,
    verification,
    verification_note: mode.verification && !status.verification ? "Verification is not enabled for this site in the helper; ask the user to enable it." : null,
    clearance_cookies: clearance,
  });
  publishStatus();
  runner
    .run()
    .catch((e) => post(port, { type: "error", code: "batch_failed", crawl_id: crawlId, message: String(e && e.message), remaining: runner.remaining() }))
    .finally(() => {
      if (batches.get(crawlId) === entry) endBatch(crawlId);
    });
}

async function resumeBatch(port, msg) {
  const b = ownBatch(port, msg);
  if (!b) return;
  let clearance = [];
  if (b.verification) clearance = await refreshClearance(b).catch(() => []);
  const resumed = b.runner.resume();
  reply(port, msg, { type: "resumed", crawl_id: msg.crawl_id, resumed, clearance_cookies: clearance });
}

async function endBatch(crawlId) {
  const b = batches.get(crawlId);
  if (!b) return;
  batches.delete(crawlId);
  if (b.verification) await clearClearance(b.hosts);
  publishStatus();
}

// ------------------------------------------------------------------ popup / options / permission page

let statusTimer = null;
function publishStatus() {
  if (statusTimer) return;
  statusTimer = setTimeout(async () => {
    statusTimer = null;
    const { capture = null } = await chrome.storage.session.get("capture");
    await chrome.storage.session.set({
      status: {
        connected: ports.size,
        batches: [...batches.entries()].map(([crawl_id, b]) => ({ crawl_id, site: b.site, ...b.runner.stats() })),
        capture: capture && { url: capture.final_url, title: capture.title, captured_at: capture.captured_at },
        updated_at: Date.now(),
      },
    });
  }, 300);
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !String(sender.url || "").startsWith(EXT_ORIGIN)) return false;
  handleInternal(msg)
    .then(sendResponse)
    .catch((e) => sendResponse({ error: String(e && e.message) }));
  return true;
});

async function handleInternal(msg) {
  switch (msg && msg.type) {
    case "perm_get": {
      const req = permRequests.get(msg.req);
      if (!req) return { error: "This request has expired. Start again from AuditPro." };
      const { cookieAllowlist } = await getSettings();
      return { site: req.site, patterns: permissionPatterns(req.site), verification: req.verification, allowlist: cookieAllowlist, status: await permissionStatus(req.site) };
    }
    case "perm_done": {
      const req = permRequests.get(msg.req);
      if (!req) return { error: "expired" };
      req.done = true;
      const granted = await hasSitePermission(req.site);
      if (granted && msg.owner_confirmed === true) {
        const prev = (await siteRecord(req.site)) || {};
        await saveSiteRecord(req.site, { owner_confirmed_at: prev.owner_confirmed_at || Date.now(), verification: !!msg.verification });
      }
      if (req.port) reply(req.port, { id: req.id }, { type: "permission_result", ...(await permissionStatus(req.site)) });
      return { ok: true };
    }
    case "capture_store": {
      const c = msg.capture;
      if (!c || typeof c.html_gzip_b64 !== "string") return { error: "Nothing captured." };
      if (c.html_gzip_b64.length > MAX_CAPTURE_B64) return { error: "This page is too large to hand over (over 8 MB compressed)." };
      const capture = { ...c, captured_at: Date.now() };
      await chrome.storage.session.set({ capture });
      let delivered = 0;
      for (const port of ports.keys()) if (post(port, { type: "tab_captured", capture })) delivered++;
      publishStatus();
      return { ok: true, delivered };
    }
    case "status_get": {
      const { status = null } = await chrome.storage.session.get("status");
      return { version: VERSION, app_origins: APP_MATCHES.map((m) => m.replace(/\/\*$/, "")), status: status || { connected: ports.size, batches: [] } };
    }
    case "settings_get": {
      const s = await getSettings();
      const sites = [];
      for (const [origin, rec] of Object.entries(s.sites)) sites.push({ site: origin, ...rec, granted: await hasSitePermission(origin) });
      return { sites, cookieAllowlist: s.cookieAllowlist, defaultAllowlist: DEFAULT_CLEARANCE_COOKIES };
    }
    case "site_set_verification": {
      const origin = siteOrigin(msg.site);
      const rec = await siteRecord(origin);
      if (!rec) return { error: "Unknown site." };
      await saveSiteRecord(origin, { ...rec, verification: !!msg.verification });
      if (!msg.verification) for (const b of batches.values()) if (b.site === origin) {
        b.verification = false;
        await clearClearance(b.hosts);
      }
      return { ok: true };
    }
    case "site_forget": {
      // The options page already removed the host permission (needs its click); drop our record too.
      const origin = siteOrigin(msg.site);
      await saveSiteRecord(origin, null);
      await clearClearance(siteHosts(origin));
      return { ok: true };
    }
    case "allowlist_set": {
      const v = validateAllowlist(msg.list);
      if (v.errors.length) return { error: v.errors.join(" ") };
      await chrome.storage.local.set({ cookieAllowlist: v.list });
      return { ok: true, list: v.list };
    }
    default:
      return { error: "unknown message" };
  }
}
