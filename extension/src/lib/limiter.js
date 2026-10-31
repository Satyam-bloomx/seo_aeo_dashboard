// Per-site adaptive politeness, mirroring backend/app/services/politeness.py. Pure: time is passed in (ms).
//
// Start at the ceiling (max 4 in flight). On a load signal halve the slots, add spacing between request
// starts and honour Retry-After (capped 30 s). A burst of throttles within 2 s counts once. After 20
// successes in a row shed the extra spacing first, then add one slot back.

export const HARD_MAX_INFLIGHT = 4;
export const SUCCESS_STREAK = 20;
export const MAX_EXTRA_DELAY_MS = 5000;
export const MAX_PAUSE_MS = 30000;
export const THROTTLE_COOLDOWN_MS = 2000;

export class AdaptiveLimiter {
  constructor({ ceiling = HARD_MAX_INFLIGHT, minDelayMs = 0 } = {}) {
    this.ceiling = Math.max(1, Math.min(HARD_MAX_INFLIGHT, ceiling));
    this.limit = this.ceiling;
    this.minDelayMs = Math.max(0, minDelayMs); // robots.txt crawl-delay: never undercut
    this.extraDelayMs = 0;
    this.nextStart = 0;
    this.pauseUntil = 0;
    this.successes = 0;
    this.lastThrottle = -Infinity;
    this.throttleEvents = 0;
    this.lowestLimit = this.limit;
  }

  /** ms until a new request may start given `inflight` running; Infinity when all slots are busy. */
  waitMs(now, inflight) {
    if (inflight >= this.limit) return Infinity;
    return Math.max(0, this.nextStart - now, this.pauseUntil - now);
  }

  markStart(now) {
    this.nextStart = Math.max(now, this.pauseUntil) + this.minDelayMs + this.extraDelayMs;
  }

  onSuccess() {
    if (++this.successes < SUCCESS_STREAK) return;
    this.successes = 0;
    if (this.extraDelayMs > 0) this.extraDelayMs = this.extraDelayMs <= 250 ? 0 : this.extraDelayMs / 2;
    else if (this.limit < this.ceiling) this.limit++;
  }

  onThrottle(now, retryAfterMs = 0) {
    if (retryAfterMs > 0) this.pauseUntil = Math.max(this.pauseUntil, now + Math.min(retryAfterMs, MAX_PAUSE_MS));
    this.successes = 0;
    if (now - this.lastThrottle < THROTTLE_COOLDOWN_MS) return;
    this.lastThrottle = now;
    this.throttleEvents++;
    this.limit = Math.max(1, Math.floor(this.limit / 2));
    this.lowestLimit = Math.min(this.lowestLimit, this.limit);
    this.extraDelayMs = Math.min(MAX_EXTRA_DELAY_MS, Math.max(500, this.extraDelayMs * 2));
  }

  /** Hard-cap concurrency (retry passes run with fewer slots) and stop ramping above it. */
  cap(n) {
    this.ceiling = Math.max(1, Math.min(this.ceiling, n));
    this.limit = Math.min(this.limit, this.ceiling);
  }

  snapshot() {
    return { concurrency: this.limit, delay_ms: Math.round(this.minDelayMs + this.extraDelayMs), slowdowns: this.throttleEvents, lowest_concurrency: this.lowestLimit };
  }
}

/** Remembers whether each of the last `size` answers was a 5xx. */
export class FiveXxWindow {
  constructor(size = 20, threshold = 4) {
    this.size = size;
    this.threshold = threshold;
    this.items = [];
  }
  push(is5xx) {
    this.items.push(!!is5xx);
    if (this.items.length > this.size) this.items.shift();
  }
  count() {
    return this.items.filter(Boolean).length;
  }
  frequent() {
    return this.count() >= this.threshold;
  }
}

/**
 * Should this failure slow the whole site down? Challenges and 429 always do; network failures (timeouts,
 * resets) do; a temporary 5xx only with Retry-After or when 4+ of the last 20 answers were 5xx.
 * Records the 5xx into `window` as a side effect (as the server does).
 */
export function isLoadSignal(f, window) {
  if (!f.temporary) return false;
  if (f.kind === "challenge" || f.status === 429) return true;
  if (f.kind === "status") {
    window.push(true);
    return f.retryAfterMs > 0 || window.frequent();
  }
  return f.kind === "network" && f.side !== "ours";
}
