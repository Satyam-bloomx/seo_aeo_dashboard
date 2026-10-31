import test from "node:test";
import assert from "node:assert/strict";
import { classifyResponse, classifyNetError, answerOutcome, parseRetryAfter, pickHeaders, sniffCharset, isTextual } from "../src/lib/classify.js";

test("temporary statuses and challenges", () => {
  const f429 = classifyResponse({ status: 429, headers: { "Retry-After": "120" }, html: "" }, 0);
  assert.equal(f429.temporary, true);
  assert.equal(f429.outcome, "blocked");
  assert.equal(f429.side, "blocked");
  assert.equal(f429.retryAfterMs, 30000); // capped
  for (const s of [502, 503, 504]) {
    const f = classifyResponse({ status: s, headers: {}, html: "" });
    assert.equal(f.temporary, true);
    assert.equal(f.side, "site");
  }
  const ch = classifyResponse({ status: 403, headers: {}, html: "<title>Just a moment...</title>" });
  assert.equal(ch.kind, "challenge");
  assert.equal(ch.provider, "cloudflare");
  assert.equal(ch.side, "blocked");
});

test("permanent 4xx/5xx are normal answers, not failures", () => {
  for (const s of [200, 301, 404, 410, 403, 500, 501]) assert.equal(classifyResponse({ status: s, headers: {}, html: "<p>hi</p>" }), null);
  assert.equal(answerOutcome(200).outcome, "ok");
  assert.equal(answerOutcome(404).outcome, "site_error");
  assert.match(answerOutcome(404).reason, /not found/i);
});

test("network errors: permanent vs temporary, and sides", () => {
  const dns = classifyNetError({ netError: "net::ERR_NAME_NOT_RESOLVED" });
  assert.deepEqual([dns.temporary, dns.side, dns.outcome], [false, "site", "site_error"]);
  assert.equal(classifyNetError({ netError: "net::ERR_CERT_DATE_INVALID" }).temporary, false);
  assert.equal(classifyNetError({ netError: "net::ERR_SSL_PROTOCOL_ERROR" }).temporary, false);
  assert.equal(classifyNetError({ netError: "net::ERR_TOO_MANY_REDIRECTS" }).temporary, false);
  assert.equal(classifyNetError({ netError: "net::ERR_CONNECTION_RESET" }).temporary, true);
  assert.equal(classifyNetError({ netError: "net::ERR_CONNECTION_RESET" }).side, "unknown");
  assert.equal(classifyNetError({ netError: "net::ERR_INTERNET_DISCONNECTED" }).side, "ours");
  assert.equal(classifyNetError({ netError: "net::ERR_BLOCKED_BY_CLIENT" }).temporary, false);
  assert.equal(classifyNetError({ netError: "net::ERR_UNSAFE_PORT" }).temporary, false);
  assert.equal(classifyNetError({ netError: "net::ERR_CONNECTION_REFUSED" }).temporary, true);
  assert.equal(classifyNetError({ timedOut: true }).temporary, true);
  assert.equal(classifyNetError({}).temporary, true);
});

test("Retry-After: seconds and HTTP date", () => {
  assert.equal(parseRetryAfter("5"), 5000);
  assert.equal(parseRetryAfter(new Date(10000).toUTCString(), 0), 10000);
  assert.equal(parseRetryAfter("soon"), 0);
  assert.equal(parseRetryAfter(null), 0);
});

test("header allowlist, lowercased; cookies never included", () => {
  const h = pickHeaders({ "Content-Type": "text/html", "Set-Cookie": "a=b", "X-Robots-Tag": "noindex", Server: "nginx" });
  assert.deepEqual(h, { "content-type": "text/html", "x-robots-tag": "noindex", server: "nginx" });
  assert.deepEqual(pickHeaders(new Headers({ "set-cookie": "x=1", link: "<a>; rel=canonical" })), { link: "<a>; rel=canonical" });
});

test("charset sniffing and textual types", () => {
  assert.equal(sniffCharset("text/html; charset=ISO-8859-1"), "windows-1252");
  assert.equal(sniffCharset("text/html", new TextEncoder().encode('<meta charset="shift_jis">')), "shift_jis");
  assert.equal(sniffCharset("text/html; charset=bogus"), "utf-8");
  assert.equal(sniffCharset("", new Uint8Array([0xef, 0xbb, 0xbf])), "utf-8");
  assert.equal(isTextual("image/png"), false);
  assert.equal(isTextual("application/xhtml+xml"), true);
  assert.equal(isTextual(""), true);
});
