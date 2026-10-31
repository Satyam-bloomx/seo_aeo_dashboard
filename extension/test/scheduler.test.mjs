import test from "node:test";
import assert from "node:assert/strict";
import { RetryScheduler, CircuitBreaker } from "../src/lib/scheduler.js";

const temp = { temporary: true, reason: "timeout" };
const perm = { temporary: false, reason: "404" };

test("parked URLs wait for the main pass to drain, then >= 10 s, then >= 30 s", () => {
  const s = new RetryScheduler();
  s.add(["a", "b"]);
  assert.deepEqual(s.next(0), { url: "a", attempt: 1 });
  assert.equal(s.fail("a", temp, 1000), "parked");
  // main queue still has b: retries never jump ahead of it
  assert.deepEqual(s.next(20000), { url: "b", attempt: 1 });
  // b in flight: the retry pass cannot start (pass barrier)
  assert.equal(s.next(20000), null);
  s.complete("b");
  // pass 1: a is due 10 s after its failure at t=1000
  const s2 = new RetryScheduler();
  s2.add(["a"]);
  s2.next(0);
  s2.fail("a", temp, 1000);
  assert.equal(s2.next(10999), null);
  assert.equal(s2.nextWakeAt(), 11000);
  assert.deepEqual(s2.next(11000), { url: "a", attempt: 2 });
  assert.equal(s2.inRetryPass, true);
  assert.equal(s2.fail("a", temp, 12000), "parked");
  assert.equal(s2.next(41999), null);
  assert.deepEqual(s2.next(42000), { url: "a", attempt: 3 });
  // third attempt failing is final: max 2 retries
  assert.equal(s2.fail("a", temp, 43000), "final");
  assert.equal(s2.done(), true);
});

test("permanent failures are never retried", () => {
  const s = new RetryScheduler();
  s.add(["a"]);
  s.next(0);
  assert.equal(s.fail("a", perm, 0), "final");
  assert.equal(s.done(), true);
  assert.equal(s.attemptsFor("a"), 1);
});

test("an open breaker makes failures final", () => {
  const s = new RetryScheduler();
  s.add(["a"]);
  s.next(0);
  assert.equal(s.fail("a", temp, 0, { breakerOpen: true }), "final");
});

test("unclaim gives the URL back without using an attempt", () => {
  const s = new RetryScheduler();
  s.add(["a", "b"]);
  s.next(0);
  s.unclaim("a");
  assert.deepEqual(s.next(0), { url: "a", attempt: 1 });
});

test("duplicates are ignored; pending lists queued, parked and in-flight", () => {
  const s = new RetryScheduler();
  s.add(["a", "b", "a", "c"]);
  s.next(0); // a
  s.next(0); // b
  s.fail("a", temp, 0);
  assert.deepEqual(s.pending().sort(), ["a", "b", "c"]);
});

test("drainForBreaker: parked and retry-queued end with their failure, untried are handed back", () => {
  const s = new RetryScheduler();
  s.add(["a", "b", "c"]);
  s.next(0);
  s.fail("a", temp, 0);
  const d = s.drainForBreaker();
  assert.deepEqual(d.parked.map((p) => p.url), ["a"]);
  assert.equal(d.parked[0].failure, temp);
  assert.deepEqual(d.neverTried, ["b", "c"]);
  assert.equal(s.done(), true);
});

test("breaker: 10 consecutive temporary failures", () => {
  const b = new CircuitBreaker();
  for (let i = 0; i < 9; i++) assert.equal(b.record(true), false);
  assert.equal(b.record(true), true);
  assert.match(b.reason, /10 requests in a row/);
});

test("breaker: > 20% of at least 10 attempts", () => {
  const b = new CircuitBreaker();
  // 2 of 10 = 20%: not more than 20%
  for (let i = 0; i < 8; i++) b.record(false);
  b.record(true);
  b.record(true);
  assert.equal(b.tripped, false);
  b.record(true); // 3 of 11 = 27%
  assert.equal(b.tripped, true);
  // fewer than 10 attempts never trips on rate
  const b2 = new CircuitBreaker();
  for (let i = 0; i < 5; i++) b2.record(true);
  for (let i = 0; i < 3; i++) b2.record(false);
  assert.equal(b2.tripped, false);
});

test("breaker: successes reset the consecutive count", () => {
  const b = new CircuitBreaker({ maxRate: 1 });
  for (let i = 0; i < 9; i++) b.record(true);
  b.record(false);
  for (let i = 0; i < 9; i++) b.record(true);
  assert.equal(b.tripped, false);
});
