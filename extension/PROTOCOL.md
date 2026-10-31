# AuditPro Helper: app ↔ extension protocol (v1)

The AuditPro web app talks to the helper with Chrome extension messaging. Only origins listed in the
manifest's `externally_connectable.matches` can connect (`http://localhost:3000` in development, plus the
production origins from `helper.config.json`, written by `build.mjs`). The extension checks the sender's
origin again on every connection and drops anything else.

- **Extension ID:** `phncnhdoeonnplmhjghkdogejgeglmnd` (fixed by the `key` in `manifest.json`; the same on
  every unpacked install). A Chrome Web Store listing would get a different ID; see README.
- **Transport:** one long-lived port per app tab: `chrome.runtime.connect(EXTENSION_ID)`. The service worker
  stays alive only while a port is open. Batches belong to the port that started them.
- **Messages:** JSON objects with a `type`. Requests may carry an `id` (any JSON value); the direct reply
  echoes it. Pushed messages (`result`, `progress`, `needs_verification`, `batch_done`, `tab_captured`)
  have no `id`.
- **Errors:** `{"type": "error", "id": 1, "code": "...", "message": "...", "crawl_id"?: "..."}`. Codes:
  `bad_message`, `unknown_type`, `bad_site`, `owner_not_confirmed`, `no_permission`, `bad_batch`,
  `duplicate_batch`, `site_busy`, `unknown_batch`, `batch_failed`, `internal`, `use_port`.

## 1. Detect and connect

Detection without a port (one-shot, also used for the version check):

```js
chrome.runtime.sendMessage(EXTENSION_ID, { type: "hello" }, (res) => {
  if (chrome.runtime.lastError || !res) { /* not installed (or app origin not allowed) */ }
});
```

On connect the extension immediately sends `hello` (and again whenever the app sends `{"type":"hello"}`):

```json
{
  "type": "hello",
  "extension": "auditpro-helper",
  "version": "0.1.0",
  "protocol": 1,
  "extension_id": "phncnhdoeonnplmhjghkdogejgeglmnd",
  "user_agent": "Mozilla/5.0 ... Chrome/130.0.0.0 Safari/537.36",
  "capabilities": ["batch", "verification", "capture_tab"],
  "active_batches": [],
  "orphaned": [
    { "crawl_id": "c-41", "site": "https://example.com", "remaining": ["https://example.com/a"], "at": 1730290000000 }
  ]
}
```

`orphaned` lists batches cut off by an earlier disconnect (see §7). It is reported once, then cleared.
Compare `version` with the latest zip the app offers and prompt for an update when older.

Keepalive: send `{"type":"ping"}` every 20 s while a batch runs; the reply is `{"type":"pong","version":"0.1.0"}`.

## 2. Site access

The helper has no access to any site at install. Access is per site (the host and its `www.`/apex twin,
http and https, never wildcards) and is granted by the user in a small helper window, because Chrome only
accepts a permission request from a click inside the extension.

Check (no UI):

```json
{ "type": "check_permission", "id": 1, "site": "https://example.com" }
```
```json
{ "type": "permission_status", "id": 1, "site": "https://example.com", "granted": true, "owner_confirmed": true, "verification": false }
```

Request (send it from a click handler in the app; the helper opens its window):

```json
{ "type": "request_permission", "id": 2, "site": "https://example.com", "owner_confirmed": true, "verification": true }
```

- `owner_confirmed` must be `true` (the user confirmed in the app that they own or may audit the site),
  otherwise `error` `owner_not_confirmed`. The helper window asks for the same confirmation again.
- `verification: true` pre-ticks "Use verification" in the window; the user decides.
- Reply when the user finishes or closes the window (`closed: true` when they closed it):

```json
{ "type": "permission_result", "id": 2, "site": "https://example.com", "granted": true, "owner_confirmed": true, "verification": true }
```

The app cannot turn on verification by itself: it is only on when the user ticked it in the helper's
window or options page.

## 3. Start a batch

```json
{
  "type": "start_batch",
  "id": 3,
  "crawl_id": "c-42",
  "site": "https://example.com",
  "owner_confirmed": true,
  "urls": ["https://example.com/", "https://example.com/about", "https://blog.other.com/x"],
  "mode": { "verification": true, "respect_robots": true }
}
```

- Refused without `"owner_confirmed": true` (`owner_not_confirmed`), without granted access
  (`no_permission`), with 0 or more than 5,000 URLs (`bad_batch`), when the `crawl_id` is already running
  (`duplicate_batch`) or another batch for the same site is running (`site_busy`).
- URLs outside the site's hosts are rejected up front; the server should fetch those.
- `mode.verification` only takes effect when the user enabled verification for this site in the helper.
- `mode.respect_robots` defaults to `true`; leave it on. (`false` exists for tests.)

```json
{
  "type": "batch_accepted",
  "id": 3,
  "crawl_id": "c-42",
  "site": "https://example.com",
  "accepted": 2,
  "rejected": [{ "url": "https://blog.other.com/x", "reason": "Outside the approved site (the server should fetch it)." }],
  "verification": true,
  "verification_note": null,
  "clearance_cookies": ["cf_clearance"]
}
```

`clearance_cookies` lists cookie **names** only (never values) the helper will attach.

## 4. Results and progress

One `result` per accepted URL, exactly once:

```json
{
  "type": "result",
  "crawl_id": "c-42",
  "url": "https://example.com/about",
  "final_url": "https://www.example.com/about/",
  "status": 200,
  "headers": { "content-type": "text/html; charset=utf-8", "x-robots-tag": "index, follow", "server": "cloudflare" },
  "html_gzip_b64": "H4sIAAAAAAAAA+1d...",
  "truncated": false,
  "redirects": [{ "url": "https://example.com/about", "status": 301 }, { "url": "https://www.example.com/about", "status": 308 }],
  "timing_ms": 412,
  "attempts": 1,
  "outcome": "ok",
  "side": "site",
  "reason": null,
  "provider": null
}
```

| field | meaning |
|---|---|
| `headers` | lowercased allowlist only: content-type, x-robots-tag, link, refresh, content-security-policy, strict-transport-security, x-frame-options, x-content-type-options, referrer-policy, retry-after, cf-mitigated, server |
| `html_gzip_b64` | gzip (RFC 1952) of the decoded HTML text (UTF-8), base64. Present for `ok` and for error pages the site served (`site_error` with a 4xx/5xx body); `null` otherwise and for non-text content |
| `truncated` | the body was cut at 5 MB |
| `redirects` | each redirect hop (from webRequest); empty when none |
| `attempts` | fetches made for this URL (0 for `robots_blocked`); max 3 |
| `outcome` | `ok`, `site_error` (the site answered with an error, DNS not found, bad TLS, redirect loop, temporary 5xx after all retries), `crawler_error` (our side: user's connection, another extension blocked it), `blocked` (bot protection or 429 after retries), `unverified` (could not be reached; nothing can be said), `robots_blocked` |
| `side` | `site` (counts in the score), `ours`, `unknown`, `blocked` (never count) |
| `reason` | plain-language reason, `null` for `ok` |
| `provider` | `cloudflare`, `datadome`, `perimeterx`, `akamai`, `imperva` for bot-protection outcomes |

`robots_blocked` URLs have `side: "site"`, or `"unknown"` when robots.txt itself could not be fetched
(then, like the server, every URL counts as disallowed).

`progress` (at most once a second, and on pause/resume):

```json
{
  "type": "progress", "crawl_id": "c-42", "site": "https://example.com",
  "total": 120, "done": 37, "ok": 33, "site_error": 2, "crawler_error": 0, "blocked": 0, "unverified": 0, "robots_blocked": 2,
  "queued": 79, "parked": 3, "inflight": 4, "pass": 0, "paused": false,
  "concurrency": 4, "delay_ms": 0, "slowdowns": 0, "lowest_concurrency": 4
}
```

`pass` is 0 for the main pass, 1 and 2 for the retry passes.

## 5. Human verification

When a page is a bot-protection challenge, the helper pauses the whole site (in-flight requests finish;
the challenged URL does not use up an attempt) and sends:

```json
{
  "type": "needs_verification",
  "crawl_id": "c-42",
  "site": "https://example.com",
  "provider": "cloudflare",
  "url": "https://example.com/pricing",
  "status": 403,
  "evidence": "<title>just a moment...",
  "round": 1,
  "max_rounds": 2
}
```

The app tells the user to open `url` in a normal tab, complete the check themselves, then click Continue.
The helper never solves challenges, never changes its user agent, never uses proxies.

```json
{ "type": "resume", "id": 4, "crawl_id": "c-42" }
```
```json
{ "type": "resumed", "id": 4, "crawl_id": "c-42", "resumed": true, "clearance_cookies": ["cf_clearance"] }
```

With verification on, the helper reads only that site's allowlisted clearance cookies at this moment and
attaches them to its own requests to that exact host. Without verification it continues cookie-less
(useful when the block was temporary). If verification is off for the site and challenges keep coming,
the app can send `request_permission` with `"verification": true` so the user can turn it on in the helper
window, then `resume`. After `max_rounds` resumes, further challenges are treated as
ordinary temporary failures: retried like the server, then reported as `blocked`.

If the user will not verify:

```json
{ "type": "decline_verification", "id": 5, "crawl_id": "c-42" }
```
```json
{ "type": "verification_declined", "id": 5, "crawl_id": "c-42", "was_paused": true }
```

The batch continues without pausing; challenged URLs end as `blocked` after their retries.

## 6. Finish and stop

```json
{
  "type": "batch_done",
  "crawl_id": "c-42",
  "site": "https://example.com",
  "stopped": false,
  "breaker": null,
  "stats": { "total": 120, "done": 120, "ok": 115, "site_error": 3, "crawler_error": 0, "blocked": 0, "unverified": 0, "robots_blocked": 2, "queued": 0, "parked": 0, "inflight": 0, "pass": 2, "paused": false, "concurrency": 4, "delay_ms": 0, "slowdowns": 0, "lowest_concurrency": 4 },
  "remaining": []
}
```

When the circuit breaker opened, `breaker` holds the reason (e.g. `"10 requests in a row failed"`),
parked URLs got their final `result` with that reason, and `remaining` lists URLs the helper never tried:
the server decides whether to crawl them.

Stop on request:

```json
{ "type": "stop", "id": 6, "crawl_id": "c-42" }
```
```json
{ "type": "stopped", "id": 6, "crawl_id": "c-42", "reason": "requested", "remaining": ["https://example.com/x", "https://example.com/y"] }
```

All `result` messages for finished URLs arrive before `stopped`. No `batch_done` follows a stop.

## 7. Disconnect: server takeover

If the port closes (tab closed, laptop asleep, browser quit, extension reloaded), the helper stops that
port's batches at once and removes their cookie rules. It cannot reply on a closed port, so:

1. **Authoritative rule for the app/server:** remaining = accepted URLs − URLs with a `result` received.
   Hand those to the server crawler.
2. Best effort: on the next connection the helper's `hello` carries `orphaned` with the same list.

The helper keeps no batch across a browser restart.

## 8. Audit this tab

The user clicks "Audit this tab" in the helper's popup. The helper captures the rendered page
(`document.documentElement.outerHTML` with the doctype, final URL, title) and keeps it in
`chrome.storage.session` until the browser closes or the app clears it. If an app port is open it is also
pushed:

```json
{
  "type": "tab_captured",
  "capture": {
    "url": "https://example.com/pricing",
    "final_url": "https://example.com/pricing#plans",
    "title": "Pricing | Example",
    "content_type": "text/html",
    "html_gzip_b64": "H4sIAAAAAAAAA+1d...",
    "html_length": 182340,
    "captured_at": 1730290000000
  }
}
```

Pull it later:

```json
{ "type": "get_capture", "id": 7 }
```
```json
{ "type": "capture", "id": 7, "capture": { "url": "...", "final_url": "...", "title": "...", "html_gzip_b64": "...", "captured_at": 1730290000000 } }
```

`capture` is `null` when nothing was captured. `{"type":"clear_capture","id":8}` → `{"type":"capture_cleared","id":8}`.
A capture is what the user's browser rendered (their session, scripts run); show it as such in the report.

## 9. Fetch rules (same as the server)

- `credentials: "omit"`: no cookies, no logins, no HTTP auth. Browser user agent, unchanged.
- robots.txt fetched once per origin per batch: group `AuditPro` (exact product token), else `*`; longest
  match wins, Allow wins ties; `*` and `$`; Crawl-delay honoured up to 10 s. 2xx parse, 4xx allow all,
  5xx or unreachable disallow all.
- At most 4 requests in flight per site. Load signals (429, challenge, timeouts/resets, and temporary 5xx
  only with Retry-After or when ≥ 4 of the last 20 answers were 5xx) halve concurrency, add spacing up to
  5 s and honour Retry-After up to 30 s; 20 successes in a row speed back up.
- Temporary failures (429, 502, 503, 504, challenge, timeouts, resets, refused, temporary DNS) are parked
  and retried after the main pass: retry 1 at ≥ 10 s and retry 2 at ≥ 30 s after the URL last failed, with
  at most 2 in flight. Permanent errors (other 4xx/5xx answers, DNS not found, TLS errors, redirect loops)
  are never retried.
- Circuit breaker on main-pass attempts only: > 20 % temporary failures with ≥ 10 attempts, or 10 in a row.
