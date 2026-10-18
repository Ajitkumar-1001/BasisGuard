import { CreateRunRequest } from "@basisguard/contracts";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { DbHandle } from "./client";
import { buildLeaseStatement, completeJob, expireLeasesForTest, failJob, heartbeatJob, LeaseLostError, leaseNextJob, retryJob } from "./queue";
import { createRun } from "./runs";
import { jobQueue } from "./schema";
import { openTestDb } from "./test-helpers";

let h: DbHandle;
beforeEach(async () => { if (h) await h.close(); h = await openTestDb(); });
afterAll(async () => { await h?.close(); });

const types = ["acquire_task"] as const;
async function seed(n = 1) {
  for (let i = 0; i < n; i++) {
    await createRun(h.db, CreateRunRequest.parse({ request_key: crypto.randomUUID(), company_name: `Co ${i}`, profile: "startup_facts_v1", policy: "baseline" }), new Date());
  }
}
async function rowOf(id: string) {
  const [row] = await h.db.select().from(jobQueue).where(eq(jobQueue.id, id));
  return row!;
}

describe("buildLeaseStatement", () => {
  it("refuses an empty jobTypes list instead of building a degenerate IN ()", () => {
    expect(() => buildLeaseStatement(h.db, { workerId: "x", leaseMs: 30_000, jobTypes: [] })).toThrow(/non-empty jobTypes/);
  });
});

describe("job queue", () => {
  it("leases a ready job exactly once across concurrent workers (SKIP LOCKED)", async () => {
    await seed(1);
    const leases = await Promise.all(Array.from({ length: 8 }, (_, i) => leaseNextJob(h.db, { workerId: `w${i}`, leaseMs: 30_000, jobTypes: types })));
    expect(leases.filter(Boolean)).toHaveLength(1);
  });

  it("distributes distinct jobs to concurrent workers", async () => {
    await seed(3);
    const leases = await Promise.all(Array.from({ length: 3 }, (_, i) => leaseNextJob(h.db, { workerId: `w${i}`, leaseMs: 30_000, jobTypes: types })));
    expect(new Set(leases.map((l) => l?.id)).size).toBe(3);
  });

  it("plans the lease subquery as a once-only InitPlan, not a rescannable semi-join", async () => {
    const stmt = buildLeaseStatement(h.db, { workerId: "x", leaseMs: 30_000, jobTypes: types });
    await h.db.transaction(async (tx) => {
      // Push the planner toward a nested loop, the shape in which an IN-semi-join would rescan the
      // LIMIT 1 FOR UPDATE SKIP LOCKED subquery and lease several rows.
      await tx.execute(sql`SET LOCAL enable_hashjoin = off`);
      await tx.execute(sql`SET LOCAL enable_mergejoin = off`);
      await tx.execute(sql`SET LOCAL enable_material = off`);
      const rows = await tx.execute<{ "QUERY PLAN": string }>(sql`EXPLAIN ${stmt.getSQL()}`);
      const plan = rows.map((r) => r["QUERY PLAN"]).join("\n");
      expect(plan).toMatch(/InitPlan/);
      expect(plan).not.toMatch(/ANY_subquery|Semi Join/);
    });
  });

  it("re-leases an expired lease and fences the old owner", async () => {
    await seed(1);
    const a = (await leaseNextJob(h.db, { workerId: "a", leaseMs: 30_000, jobTypes: types }))!;
    expect(await leaseNextJob(h.db, { workerId: "b", leaseMs: 30_000, jobTypes: types })).toBeNull();
    await expireLeasesForTest(h.db);
    const b = (await leaseNextJob(h.db, { workerId: "b", leaseMs: 30_000, jobTypes: types }))!;
    expect(b.id).toBe(a.id);
    expect(b.leaseVersion).toBe(a.leaseVersion + 1);
    expect(b.attemptCount).toBe(2);

    const before = await rowOf(b.id);
    const expectUnchanged = async () => {
      const row = await rowOf(b.id);
      expect(row).toMatchObject({ status: "leased", leaseOwner: "b", leaseVersion: b.leaseVersion, lastError: before.lastError });
    };
    await expect(completeJob(h.db, a)).rejects.toBeInstanceOf(LeaseLostError);
    await expectUnchanged();
    await expect(retryJob(h.db, a, 0, "stale retry")).rejects.toBeInstanceOf(LeaseLostError);
    await expectUnchanged();
    await expect(failJob(h.db, a, "stale fail")).rejects.toBeInstanceOf(LeaseLostError);
    await expectUnchanged();
    expect(await heartbeatJob(h.db, a, 30_000)).toBe(false);
    await expectUnchanged();

    expect(await heartbeatJob(h.db, b, 30_000)).toBe(true);
    await completeJob(h.db, b);
    expect((await rowOf(b.id)).status).toBe("succeeded");
  });

  it("rejects a holder with the right lease version but a different owner", async () => {
    await seed(1);
    const b = (await leaseNextJob(h.db, { workerId: "b", leaseMs: 30_000, jobTypes: types }))!;
    const impostor = { ...b, leaseOwner: "x" };
    await expect(completeJob(h.db, impostor)).rejects.toBeInstanceOf(LeaseLostError);
    await expect(retryJob(h.db, impostor, 0, "x")).rejects.toBeInstanceOf(LeaseLostError);
    await expect(failJob(h.db, impostor, "x")).rejects.toBeInstanceOf(LeaseLostError);
    expect(await heartbeatJob(h.db, impostor, 30_000)).toBe(false);
    expect(await rowOf(b.id)).toMatchObject({ status: "leased", leaseOwner: "b", leaseVersion: b.leaseVersion, lastError: null });
  });

  it("retryJob delays availability and records the reason; failJob is terminal", async () => {
    await seed(1);
    const j = (await leaseNextJob(h.db, { workerId: "a", leaseMs: 30_000, jobTypes: types }))!;
    await retryJob(h.db, j, 60_000, "poll");
    expect(await rowOf(j.id)).toMatchObject({ status: "retry_wait", lastError: "poll", leaseOwner: null, leaseUntil: null });
    expect(await leaseNextJob(h.db, { workerId: "a", leaseMs: 30_000, jobTypes: types })).toBeNull();
    await h.db.update(jobQueue).set({ availableAt: new Date(Date.now() - 1000) }).where(eq(jobQueue.id, j.id));
    const j2 = (await leaseNextJob(h.db, { workerId: "a", leaseMs: 30_000, jobTypes: types }))!;
    await failJob(h.db, j2, "boom");
    expect(await rowOf(j.id)).toMatchObject({ status: "failed", lastError: "boom" });
    expect(await leaseNextJob(h.db, { workerId: "a", leaseMs: 30_000, jobTypes: types })).toBeNull();
  });

  it("ignores job types the worker does not handle", async () => {
    await seed(1);
    expect(await leaseNextJob(h.db, { workerId: "a", leaseMs: 30_000, jobTypes: ["orchestrate_experiment"] })).toBeNull();
  });

  it("returns null for an empty jobTypes list", async () => {
    await seed(1);
    expect(await leaseNextJob(h.db, { workerId: "a", leaseMs: 30_000, jobTypes: [] })).toBeNull();
  });
});
