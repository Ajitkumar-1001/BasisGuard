import { CreateRunRequest } from "@basisguard/contracts";
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { reserveRunBudget, settleReservation } from "./budget";
import type { DbHandle } from "./client";
import { createRun } from "./runs";
import { openTestDb } from "./test-helpers";
import { recordUsage, runSpend } from "./usage";

let h: DbHandle;
beforeEach(async () => { if (h) await h.close(); h = await openTestDb(); });
afterAll(async () => { await h?.close(); });

/** Drizzle wraps Postgres errors ("Failed query: ..."); the trigger message lives on err.cause. */
async function rejectsWithCause(p: Promise<unknown>, re: RegExp): Promise<void> {
  const err = await p.then(() => { throw new Error("expected rejection"); }, (e: unknown) => e);
  const messages: string[] = [];
  for (let e: unknown = err; e instanceof Error; e = e.cause) messages.push(e.message);
  expect(messages.join("\n")).toMatch(re);
}

async function run(maxUsd = "5.00", maxCalls = 12) {
  const r = await createRun(h.db, CreateRunRequest.parse({ request_key: crypto.randomUUID(), company_name: "Example Corp", profile: "startup_facts_v1", policy: "baseline", max_estimated_usd: maxUsd, max_provider_calls: maxCalls }), new Date());
  return r.runId;
}
/**
 * Runs the reservers in genuinely overlapping transactions: every tx first opens (barrier), then reserves
 * and holds its transaction open briefly before COMMIT. Without the run row lock, every reserver would read
 * the pre-insert sum and the caps would be overrun; with it, later reservers block until the holder commits.
 */
async function concurrentReserve(runId: string, keys: string[]) {
  let arrived = 0;
  let release!: () => void;
  const allOpen = new Promise<void>((r) => { release = r; });
  return Promise.all(keys.map((k) => h.db.transaction(async (tx) => {
    await tx.execute(sql`select 1`);
    if (++arrived === keys.length) release();
    await allOpen;
    const res = await reserveRunBudget(tx, op(runId, k));
    await tx.execute(sql`select pg_sleep(0.05)`);
    return res;
  })));
}
const op = (runId: string, key: string, usd = "0.010", units = 1) => ({ runId, operationKey: key, operation: "task_create", providerCallUnits: units, extractUrlUnits: 0, reservedUsd: usd });

describe("run budget reservations (FR-11)", () => {
  it("reserves within caps and is idempotent by operation key", async () => {
    const id = await run();
    const a = await h.db.transaction((tx) => reserveRunBudget(tx, op(id, "k1")));
    const b = await h.db.transaction((tx) => reserveRunBudget(tx, op(id, "k1")));
    expect(a).toMatchObject({ ok: true, existing: false });
    expect(b).toEqual({ ok: true, reservationId: (a as { reservationId: string }).reservationId, existing: true });
  });

  it("returns the existing reservation for a known key regardless of its status", async () => {
    const id = await run();
    const a = await h.db.transaction((tx) => reserveRunBudget(tx, op(id, "k1")));
    await settleReservation(h.db, "k1", "released");
    const b = await h.db.transaction((tx) => reserveRunBudget(tx, op(id, "k1")));
    expect(b).toEqual({ ok: true, reservationId: (a as { reservationId: string }).reservationId, existing: true });
    const rows = await h.db.execute<{ n: string }>(sql`SELECT count(*)::text AS n FROM budget_reservations WHERE operation_key = 'k1'`);
    expect(rows[0]?.n).toBe("1");
  });

  it("refuses an operation key that belongs to another run", async () => {
    const a = await run();
    const b = await run();
    await h.db.transaction((tx) => reserveRunBudget(tx, op(a, "shared")));
    await expect(h.db.transaction((tx) => reserveRunBudget(tx, op(b, "shared")))).rejects.toThrow(/belongs to another scope/);
  });

  it("throws for a missing run and for invalid units or USD", async () => {
    const id = await run();
    const missing = crypto.randomUUID();
    await expect(h.db.transaction((tx) => reserveRunBudget(tx, op(missing, "m")))).rejects.toThrow(`run ${missing} not found`);
    await expect(h.db.transaction((tx) => reserveRunBudget(tx, op(id, "x1", "0.010", -1)))).rejects.toThrow(/providerCallUnits/);
    await expect(h.db.transaction((tx) => reserveRunBudget(tx, op(id, "x2", "0.010", 1.5)))).rejects.toThrow(/providerCallUnits/);
    await expect(h.db.transaction((tx) => reserveRunBudget(tx, { ...op(id, "x3"), extractUrlUnits: -2 }))).rejects.toThrow(/extractUrlUnits/);
    await expect(h.db.transaction((tx) => reserveRunBudget(tx, op(id, "x4", "-0.01")))).rejects.toThrow(/invalid USD/);
    await expect(h.db.transaction((tx) => reserveRunBudget(tx, op(id, "x5", "abc")))).rejects.toThrow(/invalid USD/);
  });

  it("refuses when the USD cap would be exceeded, using exact decimal arithmetic", async () => {
    const id = await run("0.030000");
    for (const k of ["a", "b", "c"]) expect((await h.db.transaction((tx) => reserveRunBudget(tx, op(id, k)))).ok).toBe(true);
    expect(await h.db.transaction((tx) => reserveRunBudget(tx, op(id, "d", "0.000001")))).toEqual({ ok: false, reason: "usd_cap" });
  });

  it("refuses when the provider-call cap would be exceeded", async () => {
    const id = await run("5.00", 2);
    await h.db.transaction((tx) => reserveRunBudget(tx, op(id, "a")));
    await h.db.transaction((tx) => reserveRunBudget(tx, op(id, "b")));
    expect(await h.db.transaction((tx) => reserveRunBudget(tx, op(id, "c")))).toEqual({ ok: false, reason: "provider_call_cap" });
  });

  it("released reservations stop counting; reconciled ones keep counting", async () => {
    const id = await run("0.010000");
    await h.db.transaction((tx) => reserveRunBudget(tx, op(id, "a")));
    expect(await settleReservation(h.db, "a", "released")).toBe(true);
    expect(await settleReservation(h.db, "a", "reconciled")).toBe(false); // only from active
    expect((await h.db.transaction((tx) => reserveRunBudget(tx, op(id, "b")))).ok).toBe(true);
    await settleReservation(h.db, "b", "reconciled");
    expect((await h.db.transaction((tx) => reserveRunBudget(tx, op(id, "c")))).ok).toBe(false);
  });

  it("never overspends under concurrent reservations", async () => {
    const id = await run("0.015000");
    const results = await concurrentReserve(id, ["a", "b", "c", "d"]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toEqual([
      { ok: false, reason: "usd_cap" },
      { ok: false, reason: "usd_cap" },
      { ok: false, reason: "usd_cap" },
    ]);
  });

  it("never exceeds the provider-call cap under concurrent reservations", async () => {
    const id = await run("5.00", 1);
    const results = await concurrentReserve(id, ["a", "b", "c", "d"]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok).every((r) => !r.ok && r.reason === "provider_call_cap")).toBe(true);
  });
});

describe("usage ledger", () => {
  it("records actual requests only, append-only, and sums decimal-safe spend", async () => {
    const id = await run();
    await recordUsage(h.db, { requestId: "r1", runId: id, operation: "task_create", vendor: "fixture:parallel", httpRequestCount: 1, costKind: "estimated", usd: "0.010", rateCardVersion: "parallel-2026-10-17", latencyMs: 5 });
    await recordUsage(h.db, { requestId: "r2", runId: id, operation: "task_status", vendor: "fixture:parallel", httpRequestCount: 1, costKind: "estimated", usd: "0", rateCardVersion: "parallel-2026-10-17", latencyMs: 1 });
    await rejectsWithCause(recordUsage(h.db, { requestId: "r1", runId: id, operation: "x", vendor: "v", httpRequestCount: 1, costKind: "unknown", usd: "0", rateCardVersion: null, latencyMs: null }), /duplicate key/);
    await rejectsWithCause(h.db.execute(sql`DELETE FROM usage_events`), /append-only/);
    await rejectsWithCause(h.db.execute(sql`UPDATE usage_events SET usd_decimal = 0`), /append-only/);
    expect(await runSpend(h.db, id)).toEqual({ usd: "0.010000", httpRequests: 2, byCostKind: { reported: 0, estimated: 2, unknown: 0 } });
  });

  it("returns zero spend for a run with no usage", async () => {
    const id = await run();
    expect(await runSpend(h.db, id)).toEqual({ usd: "0.000000", httpRequests: 0, byCostKind: { reported: 0, estimated: 0, unknown: 0 } });
  });

  it("rejects invalid request counts and USD values", async () => {
    const id = await run();
    const base = { runId: id, operation: "task_create", vendor: "fixture:parallel", costKind: "estimated" as const, usd: "0.010", rateCardVersion: null, latencyMs: null };
    await expect(recordUsage(h.db, { ...base, requestId: "b1", httpRequestCount: -1 })).rejects.toThrow(/httpRequestCount/);
    await expect(recordUsage(h.db, { ...base, requestId: "b2", httpRequestCount: 1.5 })).rejects.toThrow(/httpRequestCount/);
    await expect(recordUsage(h.db, { ...base, requestId: "b3", httpRequestCount: 1, extractUrlUnits: -1 })).rejects.toThrow(/extractUrlUnits/);
    await expect(recordUsage(h.db, { ...base, requestId: "b4", httpRequestCount: 1, usd: "1e-3" })).rejects.toThrow(/invalid USD/);
    expect((await runSpend(h.db, id)).httpRequests).toBe(0);
  });
});
