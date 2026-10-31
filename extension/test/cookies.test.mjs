import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_CLEARANCE_COOKIES, validateAllowlist, nameAllowed, cookieAppliesToHost, selectClearanceCookies,
  buildClearanceRule, ruleIdForHost,
} from "../src/lib/cookies.js";

const ck = (name, value, domain, extra = {}) => ({ name, value, domain, hostOnly: !domain.startsWith("."), session: true, ...extra });

test("only allowlisted names; login and analytics cookies are never selected", () => {
  const jar = [
    ck("cf_clearance", "abc", ".example.com"),
    ck("session", "secret", "example.com"),
    ck("wordpress_logged_in_1", "secret", "example.com"),
    ck("_ga", "x", ".example.com"),
    ck("incap_ses_123_456", "i", ".example.com"),
  ];
  const sel = selectClearanceCookies(jar, { host: "example.com", allowlist: DEFAULT_CLEARANCE_COOKIES });
  assert.deepEqual(sel.map((c) => c.name), ["cf_clearance", "incap_ses_123_456"]);
});

test("domain scoping: other sites, sibling subdomains and host-only cookies of other hosts are excluded", () => {
  const jar = [
    ck("cf_clearance", "other", ".other.com"),
    ck("cf_clearance", "shop", "shop.example.com"), // host-only on a sibling
    ck("datadome", "ok", ".example.com"),
    ck("_px3", "evil", ".com"),
  ];
  const sel = selectClearanceCookies(jar, { host: "www.example.com" });
  assert.deepEqual(sel.map((c) => `${c.name}=${c.value}`), ["datadome=ok"]);
  assert.equal(cookieAppliesToHost(ck("x", "1", "example.com"), "www.example.com"), false);
  assert.equal(cookieAppliesToHost(ck("x", "1", ".example.com"), "www.example.com"), true);
  assert.equal(cookieAppliesToHost(ck("x", "1", ".example.com"), "notexample.com"), false);
});

test("expired, partitioned or header-breaking cookies are dropped; most specific domain wins", () => {
  const now = 1000;
  const jar = [
    ck("cf_clearance", "old", ".example.com", { session: false, expirationDate: 999 }),
    ck("datadome", "p", ".example.com", { partitionKey: { topLevelSite: "https://x.com" } }),
    ck("_px3", "a\r\nX-Evil: 1", ".example.com"),
    ck("reese84", "broad", ".example.com"),
    ck("reese84", "narrow", "www.example.com"),
  ];
  const sel = selectClearanceCookies(jar, { host: "www.example.com", nowSec: now });
  assert.deepEqual(sel.map((c) => `${c.name}=${c.value}`), ["reese84=narrow"]);
});

test("allowlist validation", () => {
  assert.deepEqual(validateAllowlist("cf_clearance, datadome cf_clearance").list, ["cf_clearance", "datadome"]);
  assert.equal(validateAllowlist(["s*"]).errors.length, 1);
  assert.equal(validateAllowlist(["bad name;"]).errors.length, 1);
  assert.equal(validateAllowlist(Array.from({ length: 25 }, (_, i) => `name${i}`)).list.length, 20);
  assert.equal(nameAllowed("incap_ses_1", ["incap_ses_*"]), true);
  assert.equal(nameAllowed("xincap_ses_1", ["incap_ses_*"]), false);
  assert.equal(nameAllowed("CF_CLEARANCE", ["cf_clearance"]), false); // exact, case-sensitive
});

test("rule only touches this extension's own requests to exactly this host", () => {
  const rule = buildClearanceRule({ host: "www.example.com", cookies: [ck("cf_clearance", "abc", ".example.com"), ck("__cf_bm", "z", ".example.com")], extensionId: "abcdefghijklmnopabcdefghijklmnop" });
  assert.equal(rule.id, ruleIdForHost("www.example.com"));
  assert.deepEqual(rule.action.requestHeaders, [{ header: "cookie", operation: "set", value: "cf_clearance=abc; __cf_bm=z" }]);
  assert.deepEqual(rule.condition.tabIds, [-1]);
  assert.deepEqual(rule.condition.initiatorDomains, ["abcdefghijklmnopabcdefghijklmnop"]);
  const re = new RegExp(rule.condition.regexFilter);
  assert.equal(re.test("https://www.example.com/page"), true);
  assert.equal(re.test("http://www.example.com:8080/"), true);
  assert.equal(re.test("https://evil.www.example.com/"), false);
  assert.equal(re.test("https://www.example.com.evil.net/"), false);
  assert.equal(re.test("https://wwwxexample.com/"), false);
  assert.equal(buildClearanceRule({ host: "example.com", cookies: [], extensionId: "x" }), null);
});

test("rule ids are stable and distinct per host", () => {
  assert.equal(ruleIdForHost("Example.com"), ruleIdForHost("example.com"));
  assert.notEqual(ruleIdForHost("a.com"), ruleIdForHost("b.com"));
});
