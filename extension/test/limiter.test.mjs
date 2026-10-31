import test from "node:test";
import assert from "node:assert/strict";
import { AdaptiveLimiter, FiveXxWindow, isLoadSignal, SUCCESS_STREAK } from "../src/lib/limiter.js";

test("never more than 4 in flight, even if asked", () => {
  const l = new AdaptiveLimiter({ ceiling: 10 });
  assert.equal(l.limit, 4);
  assert.equal(l.waitMs(0, 3), 0);
  assert.equal(l.waitMs(0, 4), Infinity);
});

test("throttle halves slots, adds spacing; bursts count once", () => {
  const l = new AdaptiveLimiter();
  l.onThrottle(0);
  assert.equal(l.limit, 2);
  assert.equal(l.extraDelayMs, 500);
  l.onThrottle(1000); // within the 2 s cooldown
  assert.equal(l.limit, 2);
  l.onThrottle(3000);
  assert.equal(l.limit, 1);
  assert.equal(l.extraDelayMs, 1000);
  l.onThrottle(6000);
  assert.equal(l.limit, 1); // floor
  l.markStart(6000);
  assert.equal(l.waitMs(6000, 0), 2000);
});

test("Retry-After pauses new starts, capped at 30 s", () => {
  const l = new AdaptiveLimiter();
  l.onThrottle(0, 120000);
  assert.equal(l.waitMs(0, 0), 30000);
  assert.equal(l.waitMs(30000, 0), 0);
});

test("recovers: sheds delay first, then adds slots back", () => {
  const l = new AdaptiveLimiter();
  l.onThrottle(0);
  for (let i = 0; i < SUCCESS_STREAK; i++) l.onSuccess();
  assert.equal(l.extraDelayMs, 250);
  for (let i = 0; i < SUCCESS_STREAK; i++) l.onSuccess();
  assert.equal(l.extraDelayMs, 0);
  for (let i = 0; i < SUCCESS_STREAK; i++) l.onSuccess();
  assert.equal(l.limit, 3);
});

test("robots crawl-delay is a minimum spacing", () => {
  const l = new AdaptiveLimiter({ minDelayMs: 2000 });
  l.markStart(0);
  assert.equal(l.waitMs(1000, 1), 1000);
});

test("cap for retry passes", () => {
  const l = new AdaptiveLimiter();
  l.cap(2);
  assert.equal(l.limit, 2);
  for (let i = 0; i < 100; i++) l.onSuccess();
  assert.equal(l.limit, 2);
});

test("load signals: challenge and 429 always; a single 5xx only with Retry-After; frequent 5xx", () => {
  const w = new FiveXxWindow();
  assert.equal(isLoadSignal({ temporary: true, kind: "challenge", status: 403 }, w), true);
  assert.equal(isLoadSignal({ temporary: true, kind: "status", status: 429, retryAfterMs: 0 }, w), true);
  const w2 = new FiveXxWindow();
  const f503 = { temporary: true, kind: "status", status: 503, retryAfterMs: 0 };
  assert.equal(isLoadSignal(f503, w2), false); // 1 of last 20
  assert.equal(isLoadSignal({ ...f503, retryAfterMs: 5000 }, w2), true);
  assert.equal(isLoadSignal(f503, w2), false); // 3
  assert.equal(isLoadSignal(f503, w2), true); // 4 of last 20
  // 20 healthy answers push them out of the window
  for (let i = 0; i < 20; i++) w2.push(false);
  assert.equal(isLoadSignal(f503, w2), false);
  // permanent failures and our own connection are not load signals
  assert.equal(isLoadSignal({ temporary: false, kind: "network" }, w), false);
  assert.equal(isLoadSignal({ temporary: true, kind: "network", side: "ours" }, w), false);
  assert.equal(isLoadSignal({ temporary: true, kind: "network", side: "unknown" }, w), true);
});
