// Retry/park scheduler and circuit breaker, mirroring backend/app/services/crawler.py. Pure: time passed in (ms).
//
// Main pass: every URL once. A temporary failure is parked (never blocks the queue). When the main pass has
// fully drained (queue empty, nothing in flight), retry pass 1 starts with the parked URLs, each no earlier
// than 10 s after it last failed; then retry pass 2 at >= 30 s. At most 3 attempts per URL (2 retries).
// Permanent failures are final at once. The breaker only judges main-pass attempts; once open, nothing more
// is retried.

export const MAX_ATTEMPTS = 3;
export const RETRY_GAPS_MS = [10000, 30000];

export class CircuitBreaker {
  constructor({ minAttempts = 10, maxRate = 0.2, maxConsecutive = 10 } = {}) {
    Object.assign(this, { minAttempts, maxRate, maxConsecutive });
    this.attempts = 0;
    this.failures = 0;
    this.consecutive = 0;
    this.reason = null;
  }
  get tripped() {
    return this.reason !== null;
  }
  /** Record one attempt (failed = temporary failure). Returns true when the breaker is open. */
  record(failed) {
    this.attempts++;
    if (failed) {
      this.failures++;
      this.consecutive++;
    } else this.consecutive = 0;
    if (!this.tripped) {
      if (this.consecutive >= this.maxConsecutive) this.reason = `${this.consecutive} requests in a row failed`;
      else if (this.attempts >= this.minAttempts && this.failures / this.attempts > this.maxRate)
        this.reason = `${this.failures} of ${this.attempts} requests failed (${Math.floor((100 * this.failures) / this.attempts)}%)`;
    }
    return this.tripped;
  }
}

export class RetryScheduler {
  constructor({ maxAttempts = MAX_ATTEMPTS, gapsMs = RETRY_GAPS_MS } = {}) {
    this.maxAttempts = maxAttempts;
    this.gapsMs = gapsMs;
    this.pass = 0; // 0 = main pass, 1..n = retry passes
    this.queue = []; // [{url, notBefore}]
    this.parked = []; // urls parked for the next retry pass
    this.inflight = new Set();
    this.items = new Map(); // url -> {attempts, lastFailureAt, lastFailure}
    this.finished = new Set();
  }

  add(urls) {
    for (const url of urls) {
      if (this.items.has(url)) continue;
      this.items.set(url, { attempts: 0, lastFailureAt: null, lastFailure: null });
      this.queue.push({ url, notBefore: 0 });
    }
  }

  get inRetryPass() {
    return this.pass > 0;
  }

  _maybeStartRetryPass() {
    if (this.queue.length || this.inflight.size || !this.parked.length || this.pass >= this.gapsMs.length) return false;
    const gap = this.gapsMs[this.pass];
    this.pass++;
    this.queue = this.parked
      .map((url) => ({ url, notBefore: this.items.get(url).lastFailureAt + gap }))
      .sort((a, b) => a.notBefore - b.notBefore);
    this.parked = [];
    return true;
  }

  /** Next {url, attempt} to fetch now, or null. */
  next(now) {
    this._maybeStartRetryPass();
    const idx = this.queue.findIndex((q) => q.notBefore <= now);
    if (idx < 0) return null;
    const { url } = this.queue.splice(idx, 1)[0];
    const it = this.items.get(url);
    it.attempts++;
    this.inflight.add(url);
    return { url, attempt: it.attempts };
  }

  /** Earliest time something could start, or null when nothing is waiting (in-flight work may still add some). */
  nextWakeAt() {
    if (this.queue.length) return Math.min(...this.queue.map((q) => q.notBefore));
    if (!this.inflight.size && this.parked.length && this.pass < this.gapsMs.length) {
      const gap = this.gapsMs[this.pass];
      return Math.min(...this.parked.map((u) => this.items.get(u).lastFailureAt + gap));
    }
    return null;
  }

  complete(url) {
    this.inflight.delete(url);
    this.finished.add(url);
  }

  /** Give the URL back without using up an attempt (the site is paused for a human verification). */
  unclaim(url) {
    if (!this.inflight.delete(url)) return;
    const it = this.items.get(url);
    it.attempts = Math.max(0, it.attempts - 1);
    this.queue.unshift({ url, notBefore: 0 });
  }

  /** Record a failed attempt. Returns "parked" (will be retried) or "final". */
  fail(url, f, now, { breakerOpen = false } = {}) {
    this.inflight.delete(url);
    const it = this.items.get(url);
    it.lastFailure = f;
    it.lastFailureAt = now;
    if (f.temporary && it.attempts < this.maxAttempts && !breakerOpen) {
      this.parked.push(url);
      return "parked";
    }
    this.finished.add(url);
    return "final";
  }

  attemptsFor(url) {
    return this.items.get(url)?.attempts || 0;
  }

  /** Breaker opened: parked URLs become final (with their last failure); queued URLs were never retried. */
  drainForBreaker() {
    const parked = this.parked.map((url) => ({ url, attempts: this.attemptsFor(url), failure: this.items.get(url).lastFailure }));
    const queued = this.queue.map((q) => q.url);
    for (const p of parked) this.finished.add(p.url);
    this.parked = [];
    // Retry-pass URLs in the queue already failed once: they end with their last failure too.
    const neverTried = [];
    for (const url of queued) {
      const it = this.items.get(url);
      if (it.lastFailure) {
        parked.push({ url, attempts: it.attempts, failure: it.lastFailure });
        this.finished.add(url);
      } else neverTried.push(url);
    }
    this.queue = [];
    return { parked, neverTried };
  }

  /** URLs with no final result yet (queued, parked or in flight). */
  pending() {
    return [...this.queue.map((q) => q.url), ...this.parked, ...this.inflight];
  }

  done() {
    return !this.queue.length && !this.inflight.size && (!this.parked.length || this.pass >= this.gapsMs.length);
  }

  counts() {
    return { queued: this.queue.length, parked: this.parked.length, inflight: this.inflight.size, pass: this.pass };
  }
}
