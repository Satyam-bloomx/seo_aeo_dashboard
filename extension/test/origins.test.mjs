import test from "node:test";
import assert from "node:assert/strict";
import { siteOrigin, siteHosts, permissionPatterns, urlInSite, originAllowed, validateAppOrigin } from "../src/lib/origins.js";
import { gzipBase64, gunzipBase64 } from "../src/lib/gzip.js";

test("site normalisation", () => {
  assert.equal(siteOrigin("example.com"), "https://example.com");
  assert.equal(siteOrigin("http://Example.com/path?q=1"), "http://example.com");
  assert.throws(() => siteOrigin("ftp://x.com"));
  assert.throws(() => siteOrigin("https://u:p@x.com"));
});

test("permission patterns: exact host and its www twin, never wildcards", () => {
  assert.deepEqual(permissionPatterns("https://example.com"), [
    "https://example.com/*", "http://example.com/*", "https://www.example.com/*", "http://www.example.com/*",
  ]);
  assert.deepEqual(siteHosts("https://www.example.com"), ["www.example.com", "example.com"]);
  assert.deepEqual(siteHosts("http://localhost:8080"), ["localhost"]);
  for (const p of permissionPatterns("https://shop.example.com")) assert.ok(!p.includes("*."));
});

test("urls in site", () => {
  assert.equal(urlInSite("https://www.example.com/a", "https://example.com"), true);
  assert.equal(urlInSite("https://blog.example.com/a", "https://example.com"), false);
  assert.equal(urlInSite("https://example.com.evil.net/", "https://example.com"), false);
  assert.equal(urlInSite("javascript:alert(1)", "https://example.com"), false);
});

test("app origin check is an exact origin compare", () => {
  const m = ["http://localhost:3000/*", "https://audit.example.com/*"];
  assert.equal(originAllowed("http://localhost:3000", m), true);
  assert.equal(originAllowed("https://audit.example.com", m), true);
  assert.equal(originAllowed("http://localhost:3001", m), false);
  assert.equal(originAllowed("https://audit.example.com.evil.net", m), false);
  assert.equal(originAllowed("http://audit.example.com", m), false);
  assert.equal(originAllowed(undefined, m), false);
});

test("app origins for the manifest", () => {
  assert.equal(validateAppOrigin("https://audit.example.com"), "https://audit.example.com");
  assert.throws(() => validateAppOrigin("http://audit.example.com"));
  assert.throws(() => validateAppOrigin("https://audit.example.com/app"));
  assert.equal(validateAppOrigin("http://localhost:3000"), "http://localhost:3000");
});

test("gzip + base64 round trip (CompressionStream)", async () => {
  const html = "<html>" + "héllo wörld ".repeat(5000) + "</html>";
  const b64 = await gzipBase64(html);
  assert.ok(b64.length < html.length / 5);
  assert.equal(await gunzipBase64(b64), html);
  // standard gzip: Node's zlib can read it
  const { gunzipSync } = await import("node:zlib");
  assert.equal(gunzipSync(Buffer.from(b64, "base64")).toString("utf8"), html);
});
