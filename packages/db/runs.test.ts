import { CreateRunRequest } from "@basisguard/contracts";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { DbHandle } from "./client";
import { appendRunEvent, createRun, getRun, listRunEvents, requestBodyHash, transitionRun } from "./runs";
import { jobQueue, researchRuns, runEvents } from "./schema";
import { openTestDb } from "./test-helpers";

let h: DbHandle;
beforeEach(async () => { if (h) await h.close(); h = await openTestDb(); });
afterAll(async () => { await h?.close(); });

const NOW = new Date("2026-10-17T12:00:00Z");
const req = (over: Record<string, unknown> = {}) =>
  CreateRunRequest.parse({ request_key: "6f2c1c9e-1d7e-4c47-9a3a-1b1b6f0a9f11", company_name: "Example Corp", profile: "startup_facts_v1", policy: "baseline", ...over });

describe("requestBodyHash", () => {
  it("ignores request_key and property order", () => {
    const a = req();
    const reordered = Object.fromEntries(Object.entries(a).reverse()) as CreateRunRequest;
    expect(Object.keys(reordered)).not.toEqual(Object.keys(a));
    expect(requestBodyHash(reordered)).toBe(requestBodyHash(a));
    expect(requestBodyHash(req({ request_key: "11111111-1111-4111-8111-111111111111" }))).toBe(requestBodyHash(a));
    expect(requestBodyHash(req({ company_name: "Other Corp" }))).not.toBe(requestBodyHash(a));
  });
});

describe("createRun (FR-01)", () => {
  it("creates one run + one acquire_task job + a run_created event, freezing as_of_date", async () => {
    const r = await createRun(h.db, req(), NOW);
    expect(r).toMatchObject({ kind: "created", status: "queued" });
    const run = await getRun(h.db, r.runId);
    expect(run?.inputJson).toMatchObject({ as_of_date: "2026-10-17", company_name: "Example Corp" });
    expect(run?.deadlineAt.toISOString()).toBe("2026-10-17T12:30:00.000Z");
    expect(await h.db.select().from(jobQueue).where(eq(jobQueue.runId, r.runId))).toHaveLength(1);
    expect((await listRunEvents(h.db, r.runId)).map((e) => e.eventType)).toEqual(["run_created"]);
  });

  it("returns the existing run for the same key + body, without a second job", async () => {
    const a = await createRun(h.db, req(), NOW);
    const b = await createRun(h.db, req(), new Date(NOW.getTime() + 86_400_000));
    expect(b).toEqual({ kind: "existing", runId: a.runId, status: "queued" });
    expect(await h.db.select().from(jobQueue)).toHaveLength(1);
    expect(await h.db.select().from(runEvents)).toHaveLength(1);
  });

  it("treats differently-spelled equal max_estimated_usd as the same body", async () => {
    const a = await createRun(h.db, req({ max_estimated_usd: "5" }), NOW);
    expect(await createRun(h.db, req({ max_estimated_usd: "5.00" }), NOW)).toEqual({ kind: "existing", runId: a.runId, status: "queued" });
  });

  it("reports a conflict for the same key with a different body", async () => {
    const a = await createRun(h.db, req(), NOW);
    expect(await createRun(h.db, req({ company_name: "Other Corp" }), NOW)).toEqual({ kind: "conflict", runId: a.runId });
  });

  it("is safe under concurrent duplicate submissions", async () => {
    const results = await Promise.all(Array.from({ length: 6 }, () => createRun(h.db, req(), NOW)));
    expect(results.filter((r) => r.kind === "created")).toHaveLength(1);
    expect(results.filter((r) => r.kind !== "created").every((r) => r.kind === "existing")).toBe(true);
    expect(new Set(results.map((r) => r.runId)).size).toBe(1);
    expect(await h.db.select().from(researchRuns)).toHaveLength(1);
    expect(await h.db.select().from(jobQueue)).toHaveLength(1);
    expect(await h.db.select().from(runEvents).where(eq(runEvents.eventType, "run_created"))).toHaveLength(1);
  });

  it("gives exactly one creator and idempotency conflicts to concurrent same-key/different-body submissions", async () => {
    const bodies = ["A Corp", "B Corp", "C Corp", "D Corp", "E Corp", "F Corp"];
    const results = await Promise.all(bodies.map((company_name) => createRun(h.db, req({ company_name }), NOW)));
    const created = results.filter((r) => r.kind === "created");
    expect(created).toHaveLength(1);
    expect(results.filter((r) => r.kind !== "created").every((r) => r.kind === "conflict")).toBe(true);
    expect(new Set(results.map((r) => r.runId))).toEqual(new Set([created[0]!.runId]));
    expect(await h.db.select().from(researchRuns)).toHaveLength(1);
    expect(await h.db.select().from(jobQueue)).toHaveLength(1);
    expect(await h.db.select().from(runEvents)).toHaveLength(1);
  });
});

describe("transitionRun", () => {
  it("compare-and-sets status and appends a transition event", async () => {
    const { runId } = await createRun(h.db, req(), NOW);
    expect(await transitionRun(h.db, runId, "queued", "submitting", {}, { type: "task_submitting" })).toBe(true);
    expect(await transitionRun(h.db, runId, "queued", "failed", {}, { type: "nope" })).toBe(false);
    expect((await getRun(h.db, runId))?.status).toBe("submitting");
    const events = await listRunEvents(h.db, runId);
    expect(events.at(-1)).toMatchObject({ eventType: "task_submitting", detailsJson: { from: "queued", to: "submitting" } });
  });

  it("sets completed_at when entering a terminal status", async () => {
    const { runId } = await createRun(h.db, req(), NOW);
    await transitionRun(h.db, runId, "queued", "failed", { errorCode: "deadline_exceeded" }, { type: "run_failed" });
    const run = await getRun(h.db, runId);
    expect(run?.completedAt).toBeInstanceOf(Date);
    expect(run?.errorCode).toBe("deadline_exceeded");
  });

  it("is a no-op returning false when `from` is terminal (failed -> failed)", async () => {
    const { runId } = await createRun(h.db, req(), NOW);
    await transitionRun(h.db, runId, "queued", "failed", { errorCode: "deadline_exceeded" }, { type: "run_failed" });
    const before = await getRun(h.db, runId);
    const eventsBefore = await listRunEvents(h.db, runId);
    expect(await transitionRun(h.db, runId, "failed", "failed", { errorCode: "other" }, { type: "run_failed_again" })).toBe(false);
    const after = await getRun(h.db, runId);
    expect(after?.completedAt).toEqual(before?.completedAt);
    expect(after?.errorCode).toBe("deadline_exceeded");
    expect(after?.updatedAt).toEqual(before?.updatedAt);
    expect(await listRunEvents(h.db, runId)).toHaveLength(eventsBefore.length);
  });

  it("never lets event.details override the from/to audit fields", async () => {
    const { runId } = await createRun(h.db, req(), NOW);
    await transitionRun(h.db, runId, "queued", "submitting", {}, { type: "task_submitting", details: { from: "x", to: "y", note: "kept" } });
    expect((await listRunEvents(h.db, runId)).at(-1)?.detailsJson).toEqual({ from: "queued", to: "submitting", note: "kept" });
  });

  it("is atomic on a bare Db: a failing event insert leaves the status unchanged", async () => {
    const { runId } = await createRun(h.db, req(), NOW);
    // Postgres jsonb rejects the \u0000 escape, so the event INSERT fails deterministically after the UPDATE.
    await expect(
      transitionRun(h.db, runId, "queued", "submitting", {}, { type: "task_submitting", details: { bad: "nul\u0000byte" } }),
    ).rejects.toThrow();
    expect((await getRun(h.db, runId))?.status).toBe("queued");
    expect((await listRunEvents(h.db, runId)).map((e) => e.eventType)).toEqual(["run_created"]);
  });

  it("is atomic inside a caller transaction too (rolls back with it)", async () => {
    const { runId } = await createRun(h.db, req(), NOW);
    await expect(
      h.db.transaction(async (tx) => {
        await transitionRun(tx, runId, "queued", "submitting", {}, { type: "task_submitting", details: { bad: "nul\u0000byte" } });
      }),
    ).rejects.toThrow();
    expect((await getRun(h.db, runId))?.status).toBe("queued");
  });

  it("appendRunEvent records arbitrary audit events", async () => {
    const { runId } = await createRun(h.db, req(), NOW);
    await appendRunEvent(h.db, runId, "orphaned_provider_run", { providerRunId: "p" });
    expect((await listRunEvents(h.db, runId)).at(-1)?.eventType).toBe("orphaned_provider_run");
  });
});
