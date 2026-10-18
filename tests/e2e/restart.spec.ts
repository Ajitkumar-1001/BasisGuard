import { expect, test } from "@playwright/test";
import type { DbHandle } from "../../packages/db/client";
import { expireLeasesForTest } from "../../packages/db/queue";
import { getRun } from "../../packages/db/runs";
import { jobQueue, usageEvents } from "../../packages/db/schema";
import { killAllWorkers, killWorkerHard, openResetDb, startWorker, stopWorker } from "./helpers";

/**
 * Phase 1 hard gate: keyless write-path restart/idempotency.
 *
 * Worker ownership: global setup starts no worker and this file spawns its own, so nothing races the kill.
 * Kill window (deterministic): the run uses the "Fixture Slow Task" scenario, whose upstream status stays
 * `pending` for FIXTURE_SLOW_PENDING_MS after the create. The run therefore sits in `researching` with
 * provider_run_id persisted, and the worker sleeps its fixture poll delay (200 ms) between status reads.
 * We wait until the run reaches `researching` and at least one healthy pending poll is ledgered, then
 * SIGKILL the worker's process group. A restarted worker must resume polling (no second Task create)
 * and finish the run. (The `submitting`-without-provider_run_id crash rule is covered by the worker's
 * DB tests.)
 */
const TERMINAL = new Set(["complete", "needs_review", "failed"]);
const AS_OF = "2026-10-17";
const SLOW_COMPANY = "Fixture Slow Task";
const body = (key: string, company: string) => ({
  request_key: key, company_name: company, profile: "startup_facts_v1", policy: "baseline", as_of_date: AS_OF,
});

let handle: DbHandle;
test.beforeAll(async () => {
  handle = await openResetDb();
});
// Safety net: a test timeout abandons the body (its finally/stopWorker never runs), so kill any w1/w2 left.
test.afterAll(async () => {
  killAllWorkers();
  await handle?.close();
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor<T>(fn: () => Promise<T | undefined>, ms: number, interval: number, what: string): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v !== undefined) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await sleep(interval);
  }
}

async function usageCount(runId: string, operation: string): Promise<number> {
  const rows = await handle.db.select().from(usageEvents);
  return rows.filter((r) => r.runId === runId && r.operation === operation).length;
}
const taskCreates = (runId: string) => usageCount(runId, "task_create");

test("SIGKILLed worker mid-run: restart finishes the run with exactly one provider create", async ({ request }) => {
  test.setTimeout(180_000);
  const key = crypto.randomUUID();
  const created = await request.post("/api/runs", { data: body(key, SLOW_COMPANY) });
  expect(created.status()).toBe(202);
  const { runId } = (await created.json()) as { runId: string };

  const w1 = await startWorker();
  let w1Dead = false;
  try {
    await waitFor(
      async () => {
        const r = await getRun(handle.db, runId);
        if (r && TERMINAL.has(r.status)) throw new Error(`run ${runId} reached ${r.status} before the kill; the pending window did not hold`);
        return r?.status === "researching" && (await usageCount(runId, "task_status")) >= 1 ? true : undefined;
      },
      30_000, 2, `run ${runId} to reach researching with a pending poll`,
    );
    await killWorkerHard(w1);
    w1Dead = true;
  } finally {
    if (!w1Dead) await stopWorker(w1);
  }
  const atKill = (await getRun(handle.db, runId))!;
  expect(atKill.status).toBe("researching");
  expect(atKill.providerRunId).toMatch(new RegExp(`^fx_slow_\\d+_${key}$`));
  expect(await taskCreates(runId)).toBe(1);
  const [job] = (await handle.db.select().from(jobQueue)).filter((j) => j.runId === runId);
  // A hard kill can leave a `leased` job for the 90 s lease; expiring it stands in for the timeout (TEST ONLY helper).
  if (job?.status === "leased") await expireLeasesForTest(handle.db);

  const w2 = await startWorker();
  let final;
  try {
    final = await waitFor(
      async () => {
        const r = await getRun(handle.db, runId);
        return r && TERMINAL.has(r.status) ? r : undefined;
      },
      60_000, 50, `run ${runId} to reach a terminal status after restart`,
    );
  } finally {
    await stopWorker(w2);
  }
  console.log(`[restart] job=${job?.status ?? "none"} final=${final.status}/${final.errorCode ?? "-"} creates=${await taskCreates(runId)}`);

  expect(final.status).toBe("complete");
  expect(await taskCreates(runId)).toBe(1);
  // provider_run_id is write-once: what was persisted before the kill is unchanged after restart.
  expect(final.providerRunId).toBe(atKill.providerRunId);

  // Idempotent resubmit after restart: same key + same body ⇒ 200 same run; different body ⇒ 409.
  const again = await request.post("/api/runs", { data: body(key, SLOW_COMPANY) });
  expect(again.status()).toBe(200);
  expect((await again.json()).runId).toBe(runId);
  const conflict = await request.post("/api/runs", { data: body(key, `${SLOW_COMPANY} changed`) });
  expect(conflict.status()).toBe(409);
  expect((await conflict.json()).code).toBe("idempotency_conflict");
  expect(await taskCreates(runId)).toBe(1);
});
