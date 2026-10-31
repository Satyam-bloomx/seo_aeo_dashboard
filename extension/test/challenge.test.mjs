import test from "node:test";
import assert from "node:assert/strict";
import { detectChallenge } from "../src/lib/challenge.js";

const cfPage = `<!DOCTYPE html><html><head><title>Just a moment...</title></head><body><script>window._cf_chl_opt={cvId:'3'}</script></body></html>`;

test("Cloudflare interstitial on 403 and 503", () => {
  assert.equal(detectChallenge({ status: 403, html: cfPage }).provider, "cloudflare");
  assert.equal(detectChallenge({ status: 503, html: "<div class='cf-chl-widget'></div>" }).provider, "cloudflare");
});

test("cf-mitigated header on any status", () => {
  assert.equal(detectChallenge({ status: 200, headers: { "CF-Mitigated": "challenge" }, html: "" }).provider, "cloudflare");
  assert.equal(detectChallenge({ status: 403, headers: new Headers({ "cf-mitigated": "challenge" }) }).provider, "cloudflare");
});

test("vendor markers on challenge statuses", () => {
  assert.equal(detectChallenge({ status: 403, html: "<script src='https://ct.captcha-delivery.com/c.js'></script>" }).provider, "datadome");
  assert.equal(detectChallenge({ status: 403, html: "<div id='px-captcha'></div>" }).provider, "perimeterx");
  assert.equal(detectChallenge({ status: 403, html: "<h1>Access Denied</h1>Reference #18.6a2b1002.1700000000.abc" }).provider, "akamai");
  assert.equal(detectChallenge({ status: 403, html: "Request unsuccessful. Incapsula incident ID: 123" }).provider, "imperva");
  assert.equal(detectChallenge({ status: 403, headers: { server: "DataDome" }, html: "x" }).provider, "datadome");
});

test("structural markers on a 200", () => {
  assert.equal(detectChallenge({ status: 200, html: cfPage }).provider, "cloudflare");
  assert.equal(detectChallenge({ status: 200, html: "<title> Just a moment... </title>" }).provider, "cloudflare");
  assert.equal(detectChallenge({ status: 200, html: '<div id="px-captcha"></div>' }).provider, "perimeterx");
  assert.equal(detectChallenge({ status: 200, html: '<iframe src="https://geo.captcha-delivery.com/captcha/?initialCid=x"></iframe>' }).provider, "datadome");
  assert.equal(detectChallenge({ status: 200, html: '<script src="/_incapsula_resource?SWJIYLWA=1"></script>' }).provider, "imperva");
});

test("ordinary articles that mention vendors are not flagged", () => {
  const article = `<html><head><title>How we picked a CDN</title></head><body>
    We compared Cloudflare, DataDome, PerimeterX, Akamai and Imperva (Incapsula). Cloudflare shows "Just a moment..."
    and a captcha; px-captcha and cf-chl are names you may see. Access denied, Reference #18.1 in Akamai.
    <script src="/cdn-cgi/challenge-platform/scripts/jsd/main.js"></script></body></html>`;
  assert.equal(detectChallenge({ status: 200, html: article }), null);
  assert.equal(detectChallenge({ status: 404, html: article }), null);
});

test("a 403 or 429 without vendor markers is not a challenge", () => {
  assert.equal(detectChallenge({ status: 403, html: "<h1>Forbidden</h1>" }), null);
  assert.equal(detectChallenge({ status: 429, html: "Too many requests" }), null);
  assert.equal(detectChallenge({ status: 503, html: "" }), null);
});

test("a large 200 page with a structural marker deep inside is not flagged", () => {
  const big = "<html><body>" + "x".repeat(60000) + '<div id="px-captcha"></div></body></html>';
  assert.equal(detectChallenge({ status: 200, html: big }), null);
});
