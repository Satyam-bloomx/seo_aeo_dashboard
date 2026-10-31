import test from "node:test";
import assert from "node:assert/strict";
import { SiteRunner, MAX_VERIFY_ROUNDS } from "../src/lib/runner.js";
import { createRobots } from "../src/lib/robots.js";

const SITE = "https://example.com";
const CF = "<html><head><title>Just a moment...</title></head></html>";

/** Virtual clock: sleep(ms) advances time instantly. fetch handlers get (url, n-th call for that url). */
function harness(handler, { robots = "User-agent: *\nDisallow: /private", latency = 50 } = {}) {
  let t = 0;
  const calls = new Map();
  const log = [];
  let inflight = 0;
  let maxInflight = 0;
  const messages = [];
  const deps = {
    now: () => t,
    wallNow: () => 1_700_000_000_000 + t,
    sleep: async (ms) => {
      t += ms;
      await Promise.resolve();
    },
    gzip: async (s) => `gz(${s.length})`,
    loadRobots: async () => createRobots(robots),
    emit: (m) => messages.push(m),
    fetchPage: async (url, { signal }) => {
      const n = (calls.get(url) || 0) + 1;
      calls.set(url, n);
      log.push({ url, n, t });
      inflight++;
      maxInflight = Math.max(maxInflight, inflight);
      try {
        await new Promise((r) => setTimeout(r, 0));
        t += latency;
        if (signal.aborted) throw { aborted: true };
        return await handler(url, n, t);
      } finally {
        inflight--;
      }
    },
  };
  return { deps, messages, calls, log, get t() { return t; }, get maxInflight() { return maxInflight; } };
}

const ok = (url) => ({ status: 200, headers: { "content-type": "text/html", "set-cookie": "x=1" }, html: `<p>${url}</p>`, final_url: url });
const results = (msgs) => Object.fromEntries(msgs.filter((m) => m.type === "result").map((m) => [m.url, m]));
const urls = (n) => Array.from({ length: n }, (_, i) => `${SITE}/p${i}`);

test("happy path: robots-blocked reported, others fetched, <= 4 in flight, headers filtered", async () => {
  const h = harness(async (u) => ok(u));
  const list = [...urls(12), `${SITE}/private/x`];
  const r = new SiteRunner({ crawlId: "c1", site: SITE, urls: list, deps: h.deps });
  const done = await r.run();
  const res = results(h.messages);
  assert.equal(res[`${SITE}/private/x`].outcome, "robots_blocked");
  assert.equal(res[`${SITE}/private/x`].attempts, 0);
  assert.equal(res[`${SITE}/p0`].outcome, "ok");
  assert.equal(res[`${SITE}/p0`].html_gzip_b64, `gz(${`<p>${SITE}/p0</p>`.length})`);
  assert.deepEqual(res[`${SITE}/p0`].headers, { "content-type": "text/html" });
  assert.ok(h.maxInflight <= 4 && h.maxInflight >= 2, `max inflight ${h.maxInflight}`);
  assert.equal(done.type, "batch_done");
  assert.deepEqual(done.remaining, []);
  assert.equal(done.stats.ok, 12);
  assert.equal(h.calls.has(`${SITE}/private/x`), false);
});

test("temporary failure is parked, retried after the main pass at >= 10 s then >= 30 s, then reported", async () => {
  const bad = `${SITE}/p0`;
  const h = harness(async (u) => (u === bad ? { status: 502, headers: {}, html: "", final_url: u } : ok(u)));
  const r = new SiteRunner({ crawlId: "c", site: SITE, urls: urls(5), deps: h.deps, respectRobots: false });
  await r.run();
  const tries = h.log.filter((l) => l.url === bad);
  assert.equal(tries.length, 3); // 1 + 2 retries
  const others = h.log.filter((l) => l.url !== bad);
  assert.ok(tries[1].t > Math.max(...others.map((o) => o.t)), "retry after the main pass");
  assert.ok(tries[1].t - (tries[0].t + 50) >= 10000);
  assert.ok(tries[2].t - (tries[1].t + 50) >= 30000);
  const res = results(h.messages)[bad];
  assert.equal(res.outcome, "site_error");
  assert.equal(res.side, "site");
  assert.equal(res.attempts, 3);
  assert.match(res.reason, /502/);
});

test("a URL that recovers on retry ends ok", async () => {
  const h = harness(async (u, n) => (n === 1 ? { status: 503, headers: {}, html: "", final_url: u } : ok(u)));
  const r = new SiteRunner({ crawlId: "c", site: SITE, urls: urls(2), deps: h.deps, respectRobots: false });
  await r.run();
  const res = results(h.messages);
  assert.equal(res[`${SITE}/p0`].outcome, "ok");
  assert.equal(res[`${SITE}/p0`].attempts, 2);
});

test("permanent errors are reported at once, never retried", async () => {
  const h = harness(async (u) => {
    if (u.endsWith("p1")) return { status: 404, headers: {}, html: "<h1>nope</h1>", final_url: u };
    if (u.endsWith("p0")) throw { netError: "net::ERR_NAME_NOT_RESOLVED" }; // answers first: site not reached yet
    if (u.endsWith("p2")) throw { netError: "net::ERR_CERT_AUTHORITY_INVALID" };
    return ok(u);
  });
  const r = new SiteRunner({ crawlId: "c", site: "https://other.example", urls: [0, 1, 2].map((i) => `https://other.example/p${i}`), deps: h.deps, respectRobots: false });
  await r.run();
  const res = results(h.messages);
  assert.equal(h.log.length, 3);
  assert.equal(res["https://other.example/p1"].outcome, "site_error");
  assert.ok(res["https://other.example/p1"].html_gzip_b64, "error page body is kept");
  assert.match(res["https://other.example/p0"].reason, /DNS/);
  assert.equal(res["https://other.example/p0"].side, "site");
  assert.match(res["https://other.example/p2"].reason, /certificate/);
});

test("DNS not-found after the site already answered is our side and retried", async () => {
  const h = harness(async (u, n) => {
    if (u.endsWith("p3") && n === 1) throw { netError: "net::ERR_NAME_NOT_RESOLVED" };
    return ok(u);
  });
  const r = new SiteRunner({ crawlId: "c", site: SITE, urls: urls(4), deps: h.deps, respectRobots: false });
  await r.run();
  const res = results(h.messages)[`${SITE}/p3`];
  assert.equal(res.outcome, "ok");
  assert.equal(res.attempts, 2);
});

test("circuit breaker: 10 consecutive temporary failures stop retries; untried URLs are handed back", async () => {
  const h = harness(async () => {
    throw { netError: "net::ERR_CONNECTION_RESET" };
  });
  const r = new SiteRunner({ crawlId: "c", site: SITE, urls: urls(40), deps: h.deps, respectRobots: false });
  const done = await r.run();
  assert.match(done.breaker, /in a row/);
  // nothing was retried
  assert.ok([...h.calls.values()].every((n) => n === 1));
  const res = Object.values(results(h.messages));
  assert.ok(res.length >= 10 && res.length < 40);
  assert.ok(res.every((m) => m.outcome === "unverified" && /Retries stopped/.test(m.reason)));
  assert.equal(done.remaining.length + res.length, 40);
  assert.ok(done.remaining.every((u) => !h.calls.has(u)));
});

test("breaker counts the main pass only", async () => {
  // 3 of 20 fail temporarily (15%): no trip; their retries fail too but must not trip the breaker
  const bad = new Set([5, 12, 18].map((i) => `${SITE}/p${i}`));
  const h = harness(async (u) => (bad.has(u) ? { status: 504, headers: {}, html: "", final_url: u } : ok(u)));
  const r = new SiteRunner({ crawlId: "c", site: SITE, urls: urls(20), deps: h.deps, respectRobots: false });
  const done = await r.run();
  assert.equal(done.breaker, null);
  for (const u of bad) assert.equal(h.calls.get(u), 3);
});

test("challenge pauses the site, needs_verification once, resume continues without using an attempt", async () => {
  let verified = false;
  const h = harness(async (u) => (verified ? ok(u) : { status: 403, headers: {}, html: CF, final_url: u }));
  const r = new SiteRunner({ crawlId: "c", site: SITE, urls: urls(6), deps: h.deps, respectRobots: false });
  const running = r.run();
  while (!h.messages.some((m) => m.type === "needs_verification")) await new Promise((x) => setTimeout(x, 1));
  await new Promise((x) => setTimeout(x, 20));
  assert.equal(h.messages.filter((m) => m.type === "needs_verification").length, 1);
  const nv = h.messages.find((m) => m.type === "needs_verification");
  assert.equal(nv.provider, "cloudflare");
  assert.equal(r.stats().paused, true);
  const callsWhilePaused = h.log.length;
  await new Promise((x) => setTimeout(x, 20));
  assert.equal(h.log.length, callsWhilePaused, "no requests while paused");
  verified = true;
  assert.equal(r.resume(), true);
  const done = await running;
  assert.equal(done.stats.ok, 6);
  for (const m of Object.values(results(h.messages))) assert.equal(m.attempts, 1);
});

test("challenge after the last verification round, or after decline, ends as blocked through normal retries", async () => {
  const h = harness(async (u) => ({ status: 403, headers: {}, html: CF, final_url: u }));
  const r = new SiteRunner({ crawlId: "c", site: SITE, urls: urls(2), deps: h.deps, respectRobots: false });
  const running = r.run();
  for (let round = 0; round < MAX_VERIFY_ROUNDS; round++) {
    while (!r.paused) await new Promise((x) => setTimeout(x, 1));
    r.resume();
  }
  const done = await running;
  const res = Object.values(results(h.messages));
  assert.equal(res.length, 2);
  for (const m of res) {
    assert.equal(m.outcome, "blocked");
    assert.equal(m.side, "blocked");
    assert.equal(m.provider, "cloudflare");
    assert.equal(m.attempts, 3);
  }
  assert.equal(h.messages.filter((m) => m.type === "needs_verification").length, MAX_VERIFY_ROUNDS);
  assert.equal(done.stats.blocked, 2);

  const h2 = harness(async (u) => ({ status: 403, headers: {}, html: CF, final_url: u }));
  const r2 = new SiteRunner({ crawlId: "c", site: SITE, urls: urls(1), deps: h2.deps, respectRobots: false });
  const run2 = r2.run();
  while (!r2.paused) await new Promise((x) => setTimeout(x, 1));
  r2.decline();
  await run2;
  assert.equal(results(h2.messages)[`${SITE}/p0`].outcome, "blocked");
});

test("429 with Retry-After slows the site and is honoured (capped 30 s)", async () => {
  const h = harness(async (u, n) => (u.endsWith("p0") && n === 1 ? { status: 429, headers: { "retry-after": "3600" }, html: "", final_url: u } : ok(u)));
  const r = new SiteRunner({ crawlId: "c", site: SITE, urls: urls(6), deps: h.deps, respectRobots: false });
  await r.run();
  assert.ok(r.limiter.throttleEvents >= 1);
  const t429 = h.log.find((l) => l.url.endsWith("p0")).t + 50;
  const later = h.log.filter((l) => l.t > t429);
  assert.ok(later.length > 0);
  assert.ok(Math.min(...later.map((l) => l.t)) - t429 >= 29000 && Math.min(...later.map((l) => l.t)) - t429 <= 31000);
});

test("a single 5xx does not slow the site down", async () => {
  const h = harness(async (u, n) => (u.endsWith("p0") && n === 1 ? { status: 503, headers: {}, html: "", final_url: u } : ok(u)));
  const r = new SiteRunner({ crawlId: "c", site: SITE, urls: urls(10), deps: h.deps, respectRobots: false });
  await r.run();
  assert.equal(r.limiter.throttleEvents, 0);
});

test("stop returns URLs without a result and emits no batch_done", async () => {
  const h = harness(async (u) => ok(u), { latency: 100 });
  const r = new SiteRunner({ crawlId: "c", site: SITE, urls: urls(30), deps: h.deps, respectRobots: false });
  const running = r.run();
  while (h.messages.filter((m) => m.type === "result").length < 5) await new Promise((x) => setTimeout(x, 1));
  const remaining = await r.stop();
  await running;
  const got = Object.keys(results(h.messages));
  assert.equal(got.length + remaining.length, 30);
  assert.ok(remaining.length > 0);
  for (const u of remaining) assert.ok(!got.includes(u));
  assert.equal(h.messages.some((m) => m.type === "batch_done"), false);
});

test("robots.txt unreachable: every URL robots_blocked with side unknown", async () => {
  const h = harness(async (u) => ok(u));
  h.deps.loadRobots = async () => (await import("../src/lib/robots.js")).robotsFromFetch({ error: true });
  const r = new SiteRunner({ crawlId: "c", site: SITE, urls: urls(3), deps: h.deps });
  await r.run();
  for (const m of Object.values(results(h.messages))) {
    assert.equal(m.outcome, "robots_blocked");
    assert.equal(m.side, "unknown");
  }
  assert.equal(h.log.length, 0);
});

test("redirect to a host the user did not grant: final, not retried, chain reported", async () => {
  const h = harness(async (u) => {
    if (u.endsWith("p0")) throw { netError: "REDIRECT_OUTSIDE_SITE", redirectTo: "https://elsewhere.net/x", redirectStatus: 301, redirects: [{ url: u, status: 301 }] };
    return ok(u);
  });
  const r = new SiteRunner({ crawlId: "c", site: SITE, urls: urls(2), deps: h.deps, respectRobots: false });
  await r.run();
  const m = results(h.messages)[`${SITE}/p0`];
  assert.equal(h.calls.get(`${SITE}/p0`), 1);
  assert.equal(m.status, 301);
  assert.equal(m.final_url, "https://elsewhere.net/x");
  assert.equal(m.side, "unknown");
  assert.match(m.reason, /outside the approved site/);
});
