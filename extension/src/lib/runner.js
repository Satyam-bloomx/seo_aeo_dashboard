// SiteRunner: fetches one site's URL list politely. All I/O is injected so the whole flow is unit-tested.
//
// deps = {
//   fetchPage(url, {signal}) -> {status, headers, html, truncated?, final_url, redirects?}
//        throws {aborted} | {timedOut} | {netError: "net::ERR_..."}
//   loadRobots(origin) -> robots policy (see robots.js)
//   emit(msg)            messages for the app (result, progress, needs_verification, batch_done)
//   gzip(text) -> Promise<base64>
//   now() -> ms (monotonic), wallNow() -> epoch ms, sleep(ms) -> Promise
// }

import { AdaptiveLimiter, FiveXxWindow, isLoadSignal, HARD_MAX_INFLIGHT } from "./limiter.js";
import { RetryScheduler, CircuitBreaker } from "./scheduler.js";
import { classifyResponse, classifyNetError, answerOutcome, pickHeaders, failure } from "./classify.js";

export const MAX_VERIFY_ROUNDS = 2; // after two "I completed the check" rounds, challenges count as failures
export const RETRY_PASS_CONCURRENCY = 2;
const PROGRESS_EVERY_MS = 1000;
const OUTCOMES = ["ok", "site_error", "crawler_error", "blocked", "unverified", "robots_blocked"];

function deferred() {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
}

export class SiteRunner {
  constructor({ crawlId, site, urls, deps, respectRobots = true, maxInflight = HARD_MAX_INFLIGHT }) {
    this.crawlId = crawlId;
    this.site = site;
    this.siteHostname = new URL(site).hostname;
    this.urls = [...new Set(urls)];
    this.deps = deps;
    this.respectRobots = respectRobots;
    this.limiter = new AdaptiveLimiter({ ceiling: maxInflight });
    this.sched = new RetryScheduler();
    this.breaker = new CircuitBreaker();
    this.window = new FiveXxWindow();
    this.abort = new AbortController();
    this.inflight = new Set();
    this.reported = new Set();
    this.counts = Object.fromEntries(OUTCOMES.map((o) => [o, 0]));
    this.robots = new Map();
    this.hostReached = false;
    this.paused = null; // {provider, url, ...} while waiting for the user
    this.verifyRounds = 0;
    this.declined = false;
    this.stopped = false;
    this.finished = false;
    this.capped = false;
    this.lastProgress = -Infinity;
    this._kick = deferred();
  }

  // ---------------------------------------------------------------- control (called by the background)

  /** The user completed the check in a normal tab: continue. */
  resume() {
    if (!this.paused) return false;
    this.verifyRounds++;
    this.paused = null;
    this._wake();
    this._progress(true);
    return true;
  }

  /** The user will not verify: stop pausing; challenged URLs go through normal retries and end as blocked. */
  decline() {
    this.declined = true;
    const was = !!this.paused;
    this.paused = null;
    this._wake();
    return was;
  }

  /** Stop now. Resolves with the URLs that have no result yet (the server takes them over). */
  async stop() {
    this.stopped = true;
    this.abort.abort();
    this._wake();
    await Promise.allSettled([...this.inflight]);
    return this.remaining();
  }

  remaining() {
    return this.urls.filter((u) => !this.reported.has(u));
  }

  stats() {
    const c = this.sched.counts();
    return {
      total: this.urls.length,
      done: this.reported.size,
      ...this.counts,
      queued: c.queued,
      parked: c.parked,
      inflight: c.inflight,
      pass: c.pass,
      paused: !!this.paused,
      ...this.limiter.snapshot(),
    };
  }

  // ---------------------------------------------------------------- main loop

  async run() {
    const { deps } = this;
    let todo = this.urls;
    if (this.respectRobots) {
      todo = [];
      for (const url of this.urls) {
        if (this.stopped) return this._finish(null);
        const robots = await this._robotsFor(url);
        if (robots.isAllowed(url)) todo.push(url);
        else
          await this._report(url, null, 0, {
            outcome: "robots_blocked",
            side: robots.unreachable ? "unknown" : "site",
            reason: robots.note ? `Not fetched: ${robots.note}, so every URL counts as disallowed.` : "Disallowed by the site's robots.txt.",
          });
      }
      const own = this.robots.get(new URL(this.site).origin);
      if (own) this.limiter.minDelayMs = (await own).crawlDelayMs;
    }
    this.sched.add(todo);

    while (!this.stopped) {
      if (this.paused) {
        await this._kick.promise;
        continue;
      }
      if (this.breaker.tripped || this.sched.done()) break;
      if (this.sched.inRetryPass && !this.capped) {
        this.capped = true;
        this.limiter.cap(RETRY_PASS_CONCURRENCY);
      }
      const now = deps.now();
      let wait = this.limiter.waitMs(now, this.inflight.size);
      if (wait === 0) {
        const task = this.sched.next(now);
        if (task) {
          this.limiter.markStart(now);
          this._start(task);
          continue;
        }
        const at = this.sched.nextWakeAt();
        wait = at == null ? Infinity : Math.max(1, at - now);
      }
      const waiters = [...this.inflight, this._kick.promise];
      if (wait !== Infinity || !this.inflight.size) waiters.push(deps.sleep(Math.min(wait, 1000)));
      await Promise.race(waiters);
    }
    await Promise.allSettled([...this.inflight]);
    if (this.stopped) return this._finish(null);

    let neverTried = [];
    if (this.breaker.tripped) {
      const drained = this.sched.drainForBreaker();
      for (const p of drained.parked) await this._reportFailure(p.url, null, 0, p.failure);
      neverTried = drained.neverTried;
    }
    // Defensive: anything still without a result is handed back rather than lost.
    return this._finish(neverTried.length ? neverTried : this.remaining());
  }

  _finish(remaining) {
    this.finished = true;
    const msg = {
      type: "batch_done",
      crawl_id: this.crawlId,
      site: this.site,
      stopped: this.stopped,
      breaker: this.breaker.reason,
      stats: this.stats(),
      remaining: remaining || this.remaining(),
    };
    if (!this.stopped) this.deps.emit(msg);
    return msg;
  }

  _wake() {
    const k = this._kick;
    this._kick = deferred();
    k.resolve();
  }

  _robotsFor(url) {
    const origin = new URL(url).origin;
    if (!this.robots.has(origin)) this.robots.set(origin, Promise.resolve(this.deps.loadRobots(origin)));
    return this.robots.get(origin);
  }

  _start(task) {
    const p = this._process(task)
      .catch((e) => {
        // A bug of ours: report it once, never retry in a loop.
        this.sched.complete(task.url);
        return this._report(task.url, null, 0, { outcome: "crawler_error", side: "ours", reason: `Helper error: ${e && e.message}` });
      })
      .finally(() => {
        this.inflight.delete(p);
        this._wake();
      });
    this.inflight.add(p);
  }

  async _process({ url }) {
    const { deps } = this;
    const t0 = deps.now();
    let res;
    try {
      res = await deps.fetchPage(url, { signal: this.abort.signal });
    } catch (e) {
      if (this.stopped || (e && e.aborted)) return; // no result: listed in remaining()
      let f = classifyNetError(e || {});
      if (
        this.hostReached &&
        !f.temporary &&
        /NAME_NOT_RESOLVED/i.test(String(e && e.netError)) &&
        new URL(url).hostname === this.siteHostname
      ) {
        // The domain resolved earlier in this batch: "not found" now is a DNS hiccup on the user's side.
        f = failure("DNS lookup failed on your side (the site answered earlier in this audit).", true, "crawler_error", "ours");
      }
      const partial = e && e.redirects ? { status: e.redirectStatus || 0, headers: {}, final_url: e.redirectTo || url, redirects: e.redirects } : null;
      return this._onFailure(url, f, partial, deps.now() - t0);
    }
    if (this.stopped) return;
    const timing = deps.now() - t0;
    const f = classifyResponse(res, deps.wallNow());
    this.hostReached = true;
    if (!f) {
      this.window.push(res.status >= 500);
      this.limiter.onSuccess();
      if (!this.sched.inRetryPass) this.breaker.record(false);
      this.sched.complete(url);
      return this._report(url, res, timing, answerOutcome(res.status), null, true);
    }
    if (f.kind === "challenge" && !this.declined && this.verifyRounds < MAX_VERIFY_ROUNDS) {
      // Pause the site and ask the user to pass the check in a normal tab. This attempt does not count.
      this.limiter.onThrottle(deps.now(), f.retryAfterMs);
      this.sched.unclaim(url);
      if (!this.paused) {
        this.paused = { provider: f.provider, url: res.final_url || url, status: res.status };
        deps.emit({
          type: "needs_verification",
          crawl_id: this.crawlId,
          site: this.site,
          provider: f.provider,
          url: res.final_url || url,
          status: res.status,
          evidence: f.evidence,
          round: this.verifyRounds + 1,
          max_rounds: MAX_VERIFY_ROUNDS,
        });
        this._progress(true);
      }
      return;
    }
    return this._onFailure(url, f, res, timing);
  }

  async _onFailure(url, f, res, timing) {
    const now = this.deps.now();
    if (isLoadSignal(f, this.window)) this.limiter.onThrottle(now, f.retryAfterMs);
    if (!this.sched.inRetryPass) this.breaker.record(f.temporary);
    const verdict = this.sched.fail(url, f, now, { breakerOpen: this.breaker.tripped });
    if (verdict === "parked") return this._progress();
    return this._reportFailure(url, res, timing, f);
  }

  _reportFailure(url, res, timing, f) {
    let reason = f.reason;
    if (f.temporary && this.breaker.tripped) reason += ` Retries stopped: ${this.breaker.reason}, so the site looks unreachable or is blocking the helper.`;
    return this._report(url, res, timing, { outcome: f.outcome, side: f.side, reason }, f, false);
  }

  async _report(url, res, timing, o, f = null, withBody = false) {
    if (this.reported.has(url)) return;
    this.reported.add(url);
    this.counts[o.outcome] = (this.counts[o.outcome] || 0) + 1;
    const html = withBody && res && res.html ? res.html : "";
    this.deps.emit({
      type: "result",
      crawl_id: this.crawlId,
      url,
      final_url: (res && res.final_url) || url,
      status: (res && res.status) || 0,
      headers: res ? pickHeaders(res.headers) : {},
      html_gzip_b64: html ? await this.deps.gzip(html) : null,
      truncated: !!(res && res.truncated),
      redirects: (res && res.redirects) || [],
      timing_ms: Math.round(timing),
      attempts: this.sched.attemptsFor(url),
      outcome: o.outcome,
      side: o.side,
      reason: o.reason || null,
      provider: (f && f.provider) || null,
    });
    this._progress();
  }

  _progress(force = false) {
    const now = this.deps.now();
    if (!force && now - this.lastProgress < PROGRESS_EVERY_MS) return;
    this.lastProgress = now;
    this.deps.emit({ type: "progress", crawl_id: this.crawlId, site: this.site, ...this.stats() });
  }
}
