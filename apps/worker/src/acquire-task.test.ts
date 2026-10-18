import { fileURLToPath } from "node:url";
import { CreateRunRequest } from "@basisguard/contracts";
import { loadRateCard, TaskResultEnvelope } from "@basisguard/core";
import {
  budgetReservations, createRun, type DbHandle, expireLeasesForTest, getRun, leaseNextJob, listRunEvents,
  openTestDb, providerArtifacts, usageEvents,
} from "@basisguard/db";
import { FIXTURE_ORIGIN, FixtureResearchProvider, ProviderError, type ResearchProvider } from "@basisguard/providers";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { backoffMs, MAX_ACQUIRE_ATTEMPTS, processAcquireTask, retryDelayMs, type WorkerDeps } from "./acquire-task";
import { drain, runOnce } from "./worker";

const { card, sha256 } = loadRateCard(fileURLToPath(new URL("../../../config/rate-cards/parallel-2026-10-17.json", import.meta.url)));
let h: DbHandle;
beforeEach(async () => { if (h) await h.close(); h = await openTestDb(); });
afterAll(async () => { await h?.close(); });

const deps = (provider: ResearchProvider = new FixtureResearchProvider(), over: Partial<WorkerDeps> = {}): WorkerDeps => ({
  db: h.db, provider, rateCard: card, rateCardSha256: sha256, vendor: "fixture:parallel", fixtureOrigin: FIXTURE_ORIGIN, pollDelayMs: 0, ...over,
});
const W = { workerId: "w1", leaseMs: 30_000 };
async function newRun(over: Record<string, unknown> = {}) {
  const r = await createRun(h.db, CreateRunRequest.parse({ request_key: crypto.randomUUID(), company_name: "Example Corp", profile: "startup_facts_v1", policy: "baseline", ...over }), new Date());
  return r.runId;
}
const lease = async () => (await leaseNextJob(h.db, { workerId: "crashy", leaseMs: 30_000, jobTypes: ["acquire_task"] }))!;
const CRASH = new Error("simulated process crash");

describe("acquire_task happy path", () => {
  it("submits once, polls, stores the untouched result and completes a baseline run", async () => {
    const provider = new FixtureResearchProvider();
    const runId = await newRun();
    await drain(deps(provider), W);
    const run = await getRun(h.db, runId);
    expect(run).toMatchObject({ status: "complete", errorCode: null, rateCardSha256: sha256 });
    expect(run?.providerRunId).toMatch(/^fx_ok_/);
    expect(provider.createCalls).toHaveLength(1);
    const [art] = await h.db.select().from(providerArtifacts).where(eq(providerArtifacts.id, run!.sourceTaskArtifactId!));
    expect(art).toMatchObject({ kind: "task_result", fixtureOrigin: FIXTURE_ORIGIN });
    expect((art!.rawJson as { output: { basis: unknown[] } }).output.basis).toHaveLength(7);
    const usage = await h.db.select().from(usageEvents).where(eq(usageEvents.runId, runId));
    expect(usage.map((u) => u.operation).sort()).toEqual(["task_create", "task_result", "task_status"]);
    expect(usage.every((u) => u.rateCardVersion === card.version)).toBe(true);
    const [res] = await h.db.select().from(budgetReservations);
    expect(res).toMatchObject({ status: "reconciled", reservedUsd: "0.010000" });
    expect((await listRunEvents(h.db, runId)).map((e) => e.eventType)).toEqual(
      ["run_created", "task_submitting", "task_submitted", "task_completed"],
    );
  });

  it("a completed run exposes its task artifact through the GET /api/runs/:id read path (db helpers)", async () => {
    const runId = await newRun();
    await drain(deps(), W);
    const run = await getRun(h.db, runId);
    expect(run?.status).toBe("complete");
    expect(run?.sourceTaskArtifactId).toBeTruthy();
    // Same lookup handleGetRun performs for `taskArtifact`.
    const [artifact] = await h.db.select().from(providerArtifacts).where(eq(providerArtifacts.id, run!.sourceTaskArtifactId!));
    expect(artifact).toBeDefined();
    expect(artifact).toMatchObject({ kind: "task_result", ownerRunId: runId, fixtureOrigin: FIXTURE_ORIGIN });
    expect(TaskResultEnvelope.safeParse(artifact!.rawJson).success).toBe(true);
  });

  it("an upper-case request_key still completes against the fixture provider (lower-case UUID passed)", async () => {
    const provider = new FixtureResearchProvider();
    const runId = await newRun({ request_key: crypto.randomUUID().toUpperCase() });
    await drain(deps(provider), W);
    expect((await getRun(h.db, runId))?.status).toBe("complete");
    expect(provider.createCalls[0]!.requestKey).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("crash windows (FR-02)", () => {
  it("crash after 'submitting' committed, before create ⇒ submission_unknown and zero creates", async () => {
    const provider = new FixtureResearchProvider();
    const runId = await newRun();
    await expect(processAcquireTask(deps(provider, { hooks: { afterSubmittingCommitted: async () => { throw CRASH; } } }), await lease())).rejects.toBe(CRASH);
    await expireLeasesForTest(h.db);
    await drain(deps(provider), W);
    expect(await getRun(h.db, runId)).toMatchObject({ status: "failed", errorCode: "submission_unknown" });
    expect(provider.createCalls).toHaveLength(0);
    const [res] = await h.db.select().from(budgetReservations);
    expect(res?.status).toBe("reconciled"); // counted as spent, fail closed
    expect(await h.db.select().from(usageEvents)).toHaveLength(0); // no call was executed
  });

  it("crash after create returned, before persisting the id ⇒ submission_unknown, never re-created", async () => {
    const provider = new FixtureResearchProvider();
    const runId = await newRun();
    await expect(processAcquireTask(deps(provider, { hooks: { afterProviderCreate: async () => { throw CRASH; } } }), await lease())).rejects.toBe(CRASH);
    await expireLeasesForTest(h.db);
    await drain(deps(provider), W);
    expect(await getRun(h.db, runId)).toMatchObject({ status: "failed", errorCode: "submission_unknown" });
    expect(provider.createCalls).toHaveLength(1);
  });

  it("crash while researching with a persisted provider id ⇒ a fresh worker resumes polling and completes", async () => {
    let pending = true;
    const first = new FixtureResearchProvider();
    const slow: ResearchProvider = {
      createStructuredTask: (i) => first.createStructuredTask(i),
      getTaskStatus: async (id) => (pending ? { state: "pending", rawStatus: "running" } : first.getTaskStatus(id)),
      getTaskResult: (id) => first.getTaskResult(id),
    };
    const runId = await newRun();
    await runOnce(deps(slow), W); // submit
    await runOnce(deps(slow), W); // poll -> pending
    expect((await getRun(h.db, runId))?.status).toBe("researching");
    pending = false;
    const restarted = new FixtureResearchProvider(); // new process, new provider instance
    await drain(deps(restarted), { workerId: "w2", leaseMs: 30_000 });
    expect((await getRun(h.db, runId))?.status).toBe("complete");
    expect(first.createCalls).toHaveLength(1);
    expect(restarted.createCalls).toHaveLength(0);
  });

  it("a zombie worker's late create result never resurrects a failed run (D-011)", async () => {
    const provider = new FixtureResearchProvider();
    const runId = await newRun();
    const zombieJob = await lease();
    await processAcquireTask(deps(provider, {
      hooks: {
        afterSubmittingCommitted: async () => {
          await expireLeasesForTest(h.db);
          await drain(deps(new FixtureResearchProvider()), { workerId: "w2", leaseMs: 30_000 }); // marks submission_unknown
        },
      },
    }), zombieJob);
    expect(await getRun(h.db, runId)).toMatchObject({ status: "failed", errorCode: "submission_unknown", providerRunId: null });
    expect((await listRunEvents(h.db, runId)).map((e) => e.eventType)).toContain("orphaned_provider_run");
    expect((await h.db.select().from(usageEvents).where(eq(usageEvents.runId, runId))).some((u) => u.operation === "task_create")).toBe(true);
  });
});

describe("failure handling", () => {
  it("definitive create rejection ⇒ failed with code, reservation released, request still ledgered", async () => {
    const runId = await newRun({ company_name: "Fixture Auth Error" });
    await drain(deps(), W);
    expect(await getRun(h.db, runId)).toMatchObject({ status: "failed", errorCode: "provider_auth_error" });
    const [res] = await h.db.select().from(budgetReservations);
    expect(res?.status).toBe("released");
    const [u] = await h.db.select().from(usageEvents);
    expect(u).toMatchObject({ operation: "task_create", usdDecimal: "0.000000" });
  });

  it("ambiguous create failure ⇒ submission_unknown, no retry, spend counted as unknown", async () => {
    let creates = 0;
    const flaky: ResearchProvider = {
      createStructuredTask: async () => { creates++; throw new ProviderError("provider_unavailable", "socket hang up", "unknown"); },
      getTaskStatus: async () => { throw new Error("unreachable"); },
      getTaskResult: async () => { throw new Error("unreachable"); },
    };
    const runId = await newRun();
    await drain(deps(flaky), W);
    expect(await getRun(h.db, runId)).toMatchObject({ status: "failed", errorCode: "submission_unknown" });
    expect(creates).toBe(1);
    const [u] = await h.db.select().from(usageEvents);
    expect(u).toMatchObject({ costKind: "unknown", usdDecimal: "0.010000" });
    await drain(deps(flaky), W); // re-drain never re-creates
    expect(creates).toBe(1);
  });

  it("429 on create ⇒ back to queued, retried, then completes", async () => {
    const inner = new FixtureResearchProvider();
    let first = true;
    const limited: ResearchProvider = {
      createStructuredTask: async (i) => { if (first) { first = false; throw new ProviderError("provider_rate_limited", "429", "no", 1); } return inner.createStructuredTask(i); },
      getTaskStatus: (id) => inner.getTaskStatus(id),
      getTaskResult: (id) => inner.getTaskResult(id),
    };
    const runId = await newRun();
    await drain(deps(limited), W);
    expect((await getRun(h.db, runId))?.status).toBe("complete");
    expect((await h.db.select().from(budgetReservations)).map((r) => r.status).sort()).toEqual(["reconciled", "released"]);
  });

  it("upstream task failure ⇒ provider_task_failed", async () => {
    const runId = await newRun({ company_name: "Fixture Task Failure" });
    await drain(deps(), W);
    expect(await getRun(h.db, runId)).toMatchObject({ status: "failed", errorCode: "provider_task_failed" });
  });

  it("malformed result ⇒ normalization_failed with the raw artifact preserved", async () => {
    const runId = await newRun({ company_name: "Fixture Bad Result" });
    await drain(deps(), W);
    const run = await getRun(h.db, runId);
    expect(run).toMatchObject({ status: "failed", errorCode: "normalization_failed" });
    expect(run?.sourceTaskArtifactId).toBeTruthy();
  });

  it("budget too small for the processor price ⇒ budget_exhausted before any create", async () => {
    const provider = new FixtureResearchProvider();
    const runId = await newRun({ max_estimated_usd: "0.000001" });
    await drain(deps(provider), W);
    expect(await getRun(h.db, runId)).toMatchObject({ status: "failed", errorCode: "budget_exhausted" });
    expect(provider.createCalls).toHaveLength(0);
    expect(await h.db.select().from(usageEvents)).toHaveLength(0);
  });

  it("deadline already passed ⇒ deadline_exceeded before any create", async () => {
    const provider = new FixtureResearchProvider();
    const runId = await newRun();
    await drain(deps(provider, { now: () => new Date(Date.now() + 3 * 3_600_000) }), W);
    expect(await getRun(h.db, runId)).toMatchObject({ status: "failed", errorCode: "deadline_exceeded" });
    expect(provider.createCalls).toHaveLength(0);
  });

  it("terminal runs are never re-entered", async () => {
    const provider = new FixtureResearchProvider();
    const runId = await newRun();
    await drain(deps(provider), W);
    await drain(deps(provider), W);
    expect(provider.createCalls).toHaveLength(1);
    expect((await getRun(h.db, runId))?.status).toBe("complete");
  });
});

describe("phase-dependent provider_unavailable policy (Task 12 ruling)", () => {
  it("poll-phase provider_unavailable/unknown ⇒ retry, then completes on a later step without re-creating", async () => {
    const inner = new FixtureResearchProvider();
    let statusCalls = 0;
    const blip: ResearchProvider = {
      createStructuredTask: (i) => inner.createStructuredTask(i),
      getTaskStatus: async (id) => {
        if (statusCalls++ === 0) throw new ProviderError("provider_unavailable", "connection timeout", "unknown");
        return inner.getTaskStatus(id);
      },
      getTaskResult: (id) => inner.getTaskResult(id),
    };
    const runId = await newRun();
    await runOnce(deps(blip), W); // submit
    await runOnce(deps(blip), W); // poll -> provider_unavailable -> retry
    expect(await getRun(h.db, runId)).toMatchObject({ status: "researching", errorCode: null });
    await drain(deps(blip), W);
    expect((await getRun(h.db, runId))?.status).toBe("complete");
    expect(inner.createCalls).toHaveLength(1);
  });

  for (const status of [404, 409]) {
    it(`create-phase ${status} (mapped provider_unavailable/unknown) ⇒ submission_unknown, never re-created`, async () => {
      let creates = 0;
      const p: ResearchProvider = {
        createStructuredTask: async () => { creates++; throw new ProviderError("provider_unavailable", `HTTP ${status}`, "unknown"); },
        getTaskStatus: async () => { throw new Error("unreachable"); },
        getTaskResult: async () => { throw new Error("unreachable"); },
      };
      const runId = await newRun();
      await drain(deps(p), W);
      await drain(deps(p), W);
      expect(await getRun(h.db, runId)).toMatchObject({ status: "failed", errorCode: "submission_unknown" });
      expect(creates).toBe(1);
    });

    it(`poll-phase ${status} forever ⇒ bounded retry ending in max_attempts_exceeded, never re-created`, async () => {
      const inner = new FixtureResearchProvider();
      const p: ResearchProvider = {
        createStructuredTask: (i) => inner.createStructuredTask(i),
        getTaskStatus: async () => { throw new ProviderError("provider_unavailable", `HTTP ${status}`, "unknown"); },
        getTaskResult: async () => { throw new Error("unreachable"); },
      };
      const runId = await newRun();
      await drain(deps(p), W);
      const run = await getRun(h.db, runId);
      expect(run).toMatchObject({ status: "failed", errorCode: "max_attempts_exceeded" });
      expect(run?.providerRunId).toBeTruthy();
      expect(inner.createCalls).toHaveLength(1);
    });
  }
});

describe("attempt cap", () => {
  it("a queued run past MAX_ACQUIRE_ATTEMPTS fails max_attempts_exceeded without any create", async () => {
    const provider = new FixtureResearchProvider();
    const runId = await newRun();
    const job = await lease();
    expect(await processAcquireTask(deps(provider), { ...job, attemptCount: MAX_ACQUIRE_ATTEMPTS + 1 })).toEqual({ kind: "done" });
    expect(await getRun(h.db, runId)).toMatchObject({ status: "failed", errorCode: "max_attempts_exceeded" });
    expect(provider.createCalls).toHaveLength(0);
    expect(await h.db.select().from(budgetReservations)).toHaveLength(0);
  });

  it("FR-02 wins over the attempt cap: submitting without provider_run_id ⇒ submission_unknown", async () => {
    const provider = new FixtureResearchProvider();
    const runId = await newRun();
    await expect(processAcquireTask(deps(provider, { hooks: { afterSubmittingCommitted: async () => { throw CRASH; } } }), await lease())).rejects.toBe(CRASH);
    await expireLeasesForTest(h.db);
    const job = await lease();
    await processAcquireTask(deps(provider), { ...job, attemptCount: MAX_ACQUIRE_ATTEMPTS + 5 });
    expect(await getRun(h.db, runId)).toMatchObject({ status: "failed", errorCode: "submission_unknown" });
  });
});

describe("retry delays", () => {
  it("backoffMs grows exponentially, caps at 60s, adds < 250ms jitter", () => {
    for (const [attempt, base] of [[0, 1000], [1, 2000], [3, 8000], [6, 60_000], [20, 60_000]] as const) {
      const d = backoffMs(attempt);
      expect(d).toBeGreaterThanOrEqual(Math.min(base, 60_000));
      expect(d).toBeLessThan(Math.min(base, 60_000) + 250);
    }
  });

  it("retryAfterMs is clamped to [0, 60s]; NaN, non-finite and negative fall back to backoff", () => {
    expect(retryDelayMs(1500, 0)).toBe(1500);
    expect(retryDelayMs(0, 0)).toBe(0);
    expect(retryDelayMs(100_000, 0)).toBe(60_000);
    for (const bad of [Number.NaN, -1, Number.POSITIVE_INFINITY, undefined]) {
      const d = retryDelayMs(bad, 2);
      expect(d).toBeGreaterThanOrEqual(4000);
      expect(d).toBeLessThan(4250);
    }
  });
});
