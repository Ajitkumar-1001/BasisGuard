import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { DbHandle } from "./client";
import { providerArtifacts, researchRuns, runEvents } from "./schema";
import { openTestDb, rejectionMessages } from "./test-helpers";
import { recordUsage } from "./usage";

let h: DbHandle;
beforeEach(async () => { if (h) await h.close(); h = await openTestDb(); });
afterAll(async () => { await h?.close(); });

const run = (key: string) => ({
  requestKey: key, requestBodyHash: "h", inputJson: {}, policyVersion: "baseline" as const, providerProcessor: "base",
  maxProviderCalls: 12, maxEstimatedUsd: "5.00", deadlineAt: new Date(Date.now() + 60_000),
});

describe("schema integrity", () => {
  it("enforces UNIQUE(kind, content_hash) on artifacts", async () => {
    const a = { kind: "task_result" as const, rawJson: { a: 1 }, contentHash: "x" };
    await h.db.insert(providerArtifacts).values(a);
    await expect(h.db.insert(providerArtifacts).values(a)).rejects.toThrow();
  });

  it("makes artifacts and run events immutable", async () => {
    const [art] = await h.db.insert(providerArtifacts).values({ kind: "task_result", rawJson: {}, contentHash: "y" }).returning();
    expect(await rejectionMessages(h.db.execute(sql`UPDATE provider_artifacts SET content_hash='z' WHERE id=${art!.id}`))).toMatch(/provider_artifacts is append-only\/immutable \(UPDATE blocked\)/);
    expect(await rejectionMessages(h.db.execute(sql`DELETE FROM provider_artifacts WHERE id=${art!.id}`))).toMatch(/provider_artifacts is append-only\/immutable \(DELETE blocked\)/);
    const [r] = await h.db.insert(researchRuns).values(run("11111111-1111-4111-8111-111111111111")).returning();
    const [ev] = await h.db.insert(runEvents).values({ runId: r!.id, eventType: "x" }).returning();
    expect(await rejectionMessages(h.db.execute(sql`UPDATE run_events SET event_type='y' WHERE id=${ev!.id}`))).toMatch(/run_events is append-only\/immutable \(UPDATE blocked\)/);
    expect(await rejectionMessages(h.db.execute(sql`DELETE FROM run_events WHERE id=${ev!.id}`))).toMatch(/run_events is append-only\/immutable \(DELETE blocked\)/);
  });

  it("keeps terminal runs terminal and provider_run_id write-once", async () => {
    const [r] = await h.db.insert(researchRuns).values(run("22222222-2222-4222-8222-222222222222")).returning();
    await h.db.execute(sql`UPDATE research_runs SET provider_run_id='p1' WHERE id=${r!.id}`);
    expect(await rejectionMessages(h.db.execute(sql`UPDATE research_runs SET provider_run_id='p2' WHERE id=${r!.id}`))).toMatch(/^research_runs [0-9a-f-]{36}: provider_run_id is write-once$/m);
    await h.db.execute(sql`UPDATE research_runs SET status='failed' WHERE id=${r!.id}`);
    expect(await rejectionMessages(h.db.execute(sql`UPDATE research_runs SET status='queued' WHERE id=${r!.id}`))).toMatch(/^research_runs [0-9a-f-]{36}: terminal status failed cannot change to queued$/m);
  });

  it("makes source_task_artifact_id write-once", async () => {
    const [r] = await h.db.insert(researchRuns).values(run("44444444-4444-4444-8444-444444444444")).returning();
    const [a1] = await h.db.insert(providerArtifacts).values({ kind: "task_result", rawJson: { n: 1 }, contentHash: "a1" }).returning();
    const [a2] = await h.db.insert(providerArtifacts).values({ kind: "task_result", rawJson: { n: 2 }, contentHash: "a2" }).returning();
    await h.db.execute(sql`UPDATE research_runs SET source_task_artifact_id=${a1!.id} WHERE id=${r!.id}`);
    expect(await rejectionMessages(h.db.execute(sql`UPDATE research_runs SET source_task_artifact_id=${a2!.id} WHERE id=${r!.id}`)))
      .toMatch(/^research_runs [0-9a-f-]{36}: source_task_artifact_id is write-once$/m);
    expect(await rejectionMessages(h.db.execute(sql`UPDATE research_runs SET source_task_artifact_id=NULL WHERE id=${r!.id}`)))
      .toMatch(/^research_runs [0-9a-f-]{36}: source_task_artifact_id is write-once$/m);
  });

  it("makes usage_events append-only (UPDATE and DELETE)", async () => {
    const [r] = await h.db.insert(researchRuns).values(run("55555555-5555-4555-8555-555555555555")).returning();
    await recordUsage(h.db, { requestId: "u1", runId: r!.id, operation: "task_create", vendor: "fixture:parallel", httpRequestCount: 1, costKind: "estimated", usd: "0.01", rateCardVersion: null, latencyMs: 1 });
    expect(await rejectionMessages(h.db.execute(sql`UPDATE usage_events SET usd_decimal = 0`))).toMatch(/usage_events is append-only\/immutable \(UPDATE blocked\)/);
    expect(await rejectionMessages(h.db.execute(sql`DELETE FROM usage_events`))).toMatch(/usage_events is append-only\/immutable \(DELETE blocked\)/);
  });

  it("enforces a globally unique request_key", async () => {
    await h.db.insert(researchRuns).values(run("33333333-3333-4333-8333-333333333333"));
    await expect(h.db.insert(researchRuns).values(run("33333333-3333-4333-8333-333333333333"))).rejects.toThrow();
  });
});
