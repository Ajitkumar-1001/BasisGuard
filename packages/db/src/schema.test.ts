import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { DbHandle } from "./client";
import { providerArtifacts, researchRuns, runEvents } from "./schema";
import { openTestDb, rejectionMessages } from "./test-helpers";

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
    expect(await rejectionMessages(h.db.execute(sql`UPDATE provider_artifacts SET content_hash='z' WHERE id=${art!.id}`))).toMatch(/immutable/);
    expect(await rejectionMessages(h.db.execute(sql`DELETE FROM provider_artifacts WHERE id=${art!.id}`))).toMatch(/immutable/);
    const [r] = await h.db.insert(researchRuns).values(run("11111111-1111-4111-8111-111111111111")).returning();
    const [ev] = await h.db.insert(runEvents).values({ runId: r!.id, eventType: "x" }).returning();
    expect(await rejectionMessages(h.db.execute(sql`UPDATE run_events SET event_type='y' WHERE id=${ev!.id}`))).toMatch(/append-only/);
  });

  it("keeps terminal runs terminal and provider_run_id write-once", async () => {
    const [r] = await h.db.insert(researchRuns).values(run("22222222-2222-4222-8222-222222222222")).returning();
    await h.db.execute(sql`UPDATE research_runs SET provider_run_id='p1' WHERE id=${r!.id}`);
    expect(await rejectionMessages(h.db.execute(sql`UPDATE research_runs SET provider_run_id='p2' WHERE id=${r!.id}`))).toMatch(/write-once/);
    await h.db.execute(sql`UPDATE research_runs SET status='failed' WHERE id=${r!.id}`);
    expect(await rejectionMessages(h.db.execute(sql`UPDATE research_runs SET status='queued' WHERE id=${r!.id}`))).toMatch(/terminal/);
  });

  it("enforces a globally unique request_key", async () => {
    await h.db.insert(researchRuns).values(run("33333333-3333-4333-8333-333333333333"));
    await expect(h.db.insert(researchRuns).values(run("33333333-3333-4333-8333-333333333333"))).rejects.toThrow();
  });
});
