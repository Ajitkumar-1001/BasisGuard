import { describe, expect, it } from "vitest";
import { createStopper, loopBackoffMs, runLoop, type LoopError } from "./worker";

describe("runLoop error boundary", () => {
  it("a transient lease/DB error is logged sanitized, backed off and the loop continues until stopped", async () => {
    const outcomes: Array<boolean | Error> = [
      Object.assign(new Error("connect ECONNREFUSED postgres://u:secret@127.0.0.1/db"), { code: "ECONNREFUSED" }),
      Object.assign(new Error("write CONNECTION_ENDED"), { code: "CONNECTION_ENDED" }),
      true,
      false,
    ];
    const sleeps: number[] = [];
    const errors: Array<{ err: LoopError; failures: number; delayMs: number }> = [];
    let steps = 0;
    await runLoop({
      isStopping: () => steps >= outcomes.length,
      sleep: async (ms) => { sleeps.push(ms); },
      onError: (err, failures, delayMs) => { errors.push({ err, failures, delayMs }); },
      step: async () => {
        const o = outcomes[steps++]!;
        if (o instanceof Error) throw o;
        return o;
      },
    });
    expect(steps).toBe(4);
    expect(errors).toEqual([
      { err: { name: "Error", code: "ECONNREFUSED" }, failures: 1, delayMs: loopBackoffMs(1) },
      { err: { name: "Error", code: "CONNECTION_ENDED" }, failures: 2, delayMs: loopBackoffMs(2) },
    ]);
    expect(JSON.stringify(errors)).not.toContain("secret");
    expect(sleeps).toEqual([loopBackoffMs(1), loopBackoffMs(2), 500]); // backoff, backoff, idle
  });

  it("non-Error throws and code-less errors are reported without a code; backoff resets after a success", async () => {
    const errors: LoopError[] = [];
    const sleeps: number[] = [];
    const seq: Array<() => boolean> = [
      () => { throw "boom"; }, () => true, () => { throw new TypeError("x"); },
    ];
    let i = 0;
    await runLoop({
      isStopping: () => i >= seq.length,
      sleep: async (ms) => { sleeps.push(ms); },
      onError: (e) => { errors.push(e); },
      step: async () => seq[i++]!(),
    });
    expect(errors).toEqual([{ name: "non-error" }, { name: "TypeError" }]);
    expect(sleeps).toEqual([loopBackoffMs(1), loopBackoffMs(1)]);
  });

  it("loopBackoffMs grows exponentially and caps at 30s", () => {
    expect(loopBackoffMs(1)).toBe(1000);
    expect(loopBackoffMs(2)).toBe(2000);
    expect(loopBackoffMs(50)).toBe(30_000);
  });
});

describe("createStopper (interruptible shutdown)", () => {
  it("stop() wakes a pending sleep immediately and later sleeps return at once", async () => {
    const s = createStopper();
    const started = Date.now();
    const pending = s.sleep(60_000);
    setTimeout(() => s.stop(), 20);
    await pending;
    expect(Date.now() - started).toBeLessThan(1_000);
    expect(s.isStopping()).toBe(true);
    const again = Date.now();
    await s.sleep(60_000);
    expect(Date.now() - again).toBeLessThan(100);
  });

  it("a signal during the loop's error backoff ends runLoop without waiting out the backoff", async () => {
    const s = createStopper();
    let steps = 0;
    const started = Date.now();
    await runLoop({
      step: async () => { steps++; throw new Error("db down"); },
      isStopping: s.isStopping,
      sleep: s.sleep,
      onError: () => { setTimeout(() => s.stop(), 20); }, // the first backoff is loopBackoffMs(1) = 1 s
    });
    expect(steps).toBe(1);
    expect(Date.now() - started).toBeLessThan(loopBackoffMs(1) / 2);
  });
});
