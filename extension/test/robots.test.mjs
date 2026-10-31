import test from "node:test";
import assert from "node:assert/strict";
import { parseRobots, createRobots, robotsFromFetch, isPathAllowed } from "../src/lib/robots.js";

test("longest match wins, Allow wins ties", () => {
  const r = createRobots("User-agent: *\nDisallow: /shop\nAllow: /shop/public\nDisallow: /a\nAllow: /a");
  assert.equal(r.isAllowed("https://x.com/shop/cart"), false);
  assert.equal(r.isAllowed("https://x.com/shop/public/item"), true);
  assert.equal(r.isAllowed("https://x.com/a/b"), true); // same length: allow
  assert.equal(r.isAllowed("https://x.com/other"), true);
});

test("AuditPro group beats *, matched case-insensitively by product token", () => {
  const r = createRobots("User-agent: *\nDisallow: /\n\nUser-agent: AuditPro/1.0\nDisallow: /private\n");
  assert.equal(r.isAllowed("https://x.com/page"), true);
  assert.equal(r.isAllowed("https://x.com/private/x"), false);
  // a group for another bot whose name is a substring of ours does not apply to us
  const r2 = createRobots("User-agent: audit\nDisallow: /\nUser-agent: *\nDisallow: /tmp");
  assert.equal(r2.isAllowed("https://x.com/page"), true);
  assert.equal(r2.isAllowed("https://x.com/tmp/1"), false);
});

test("falls back to * when no AuditPro group; merges repeated groups", () => {
  const r = createRobots("User-agent: Googlebot\nDisallow: /g\nUser-agent: *\nDisallow: /x\nUser-agent: *\nDisallow: /y");
  assert.equal(r.isAllowed("https://x.com/g"), true);
  assert.equal(r.isAllowed("https://x.com/x"), false);
  assert.equal(r.isAllowed("https://x.com/y1"), false);
});

test("consecutive user-agent lines share a group; sitemap does not break it", () => {
  const p = parseRobots("User-agent: a\nUser-agent: AuditPro\nSitemap: https://x.com/s.xml\nDisallow: /z\n");
  assert.equal(p.groups.length, 1);
  assert.deepEqual(p.groups[0].agents, ["a", "auditpro"]);
  assert.deepEqual(p.sitemaps, ["https://x.com/s.xml"]);
  assert.equal(createRobots("User-agent: a\nUser-agent: AuditPro\nDisallow: /z").isAllowed("/z/1"), false);
});

test("wildcards, $ anchor, query strings, empty Disallow", () => {
  const r = createRobots("User-agent: *\nDisallow: /*.pdf$\nDisallow: /*?sort=\nDisallow:");
  assert.equal(r.isAllowed("https://x.com/doc.pdf"), false);
  assert.equal(r.isAllowed("https://x.com/doc.pdf?x=1"), true);
  assert.equal(r.isAllowed("https://x.com/list?sort=asc"), false);
  assert.equal(r.isAllowed("https://x.com/list?page=2"), true);
  assert.equal(createRobots("User-agent: *\nDisallow:").isAllowed("/anything"), true);
});

test("percent-encoding compared decoded; robots.txt itself always allowed", () => {
  const r = createRobots("User-agent: *\nDisallow: /caf%C3%A9\nDisallow: /");
  assert.equal(isPathAllowed(r.rules, "/café"), false);
  assert.equal(r.isAllowed("https://x.com/robots.txt"), true);
});

test("comments, CRLF, BOM; rules before any user-agent ignored", () => {
  const r = createRobots("﻿Disallow: /early\r\nUser-agent: * # all\r\nDisallow: /b # note\r\n");
  assert.equal(r.isAllowed("/early"), true);
  assert.equal(r.isAllowed("/b"), false);
});

test("crawl-delay of the chosen group, capped at 10 s", () => {
  assert.equal(createRobots("User-agent: *\nCrawl-delay: 2").crawlDelayMs, 2000);
  assert.equal(createRobots("User-agent: *\nCrawl-delay: 120").crawlDelayMs, 10000);
  assert.equal(createRobots("User-agent: AuditPro\nCrawl-delay: 1\nUser-agent: *\nCrawl-delay: 5").crawlDelayMs, 1000);
});

test("fetch policy mirrors the server", () => {
  assert.equal(robotsFromFetch({ status: 200, text: "User-agent: *\nDisallow: /x" }).isAllowed("/x"), false);
  assert.equal(robotsFromFetch({ status: 404 }).isAllowed("/x"), true);
  assert.equal(robotsFromFetch({ status: 403 }).isAllowed("/x"), true);
  const r5 = robotsFromFetch({ status: 503 });
  assert.equal(r5.isAllowed("/x"), false);
  assert.match(r5.note, /503/);
  assert.equal(r5.unreachable, false);
  const rn = robotsFromFetch({ error: true });
  assert.equal(rn.isAllowed("/"), false);
  assert.equal(rn.unreachable, true);
});
