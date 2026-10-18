import { expect, test } from "@playwright/test";
import type { DbHandle } from "../../packages/db/src/client";
import { expireLeasesForTest } from "../../packages/db/src/queue";
import { getRun } from "../../packages/db/src/runs";
import { jobQueue, usageEvents } from "../../packages/db/src/schema";
import { killWorkerHard, openResetDb, startWorker, stopWorker } from "./helpers";

/**
 * Phase 1 hard gate: keyless write-path restart/idempotency.
 *
 * Worker ownership: global setup starts no worker and this file spawns its own, so nothing races the kill.
 * Kill window: a fixture run passes `submitting` in milliseconds and waits >= 200 ms (fixture poll delay) in
 * `researching`. We tight-poll the DB and SIGKILL the worker's process group as soon as the run leaves
 * `researching` (provider Task created, provider_run_id persisted) — the window where a restart must resume
 * polling and never create a second Task. If the run was already terminal at kill time the attempt proved
 * nothing about restart, so we retry with a fresh request_key (bounded). Invariants are asserted on every
 * attempt. (The `submitting`-without-provider_run_id crash rule is covered by the worker's DB tests; if an
 * attempt ever lands there it must end `failed/submission_unknown`.)
 */
const TERMINAL = new Set(["complete", "needs_review", "failed"]);
const MAX_ATTEMPTS = 8;
const AS_OF = "2026-10-17";
const body = (key: string, company: string) => ({
  request_key: key, company_name: company, profile: "startup_facts_v1", policy: "baseline", as_of_date: AS_OF,
});

let handle: DbHandle;
test.beforeAll(async () => {
  handle = await openResetDb();
});
test.afterAll(async () => {
  await handle.close();
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

async function taskCreates(runId: string): Promise<number> {
  const rows = await handle.db.select().from(usageEvents);
  return rows.filter((r) => r.runId === runId && r.operation === "task_create").length;
}

test("SIGKILLed worker mid-run: restart finishes the run with exactly one provider create", async ({ request }) => {
  test.setTimeout(300_000);
  let midRunKills = 0;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS && midRunKills === 0; attempt++) {
    const key = crypto.randomUUID();
    const company = `Restart Corp ${attempt}`;
    const created = await request.post("/api/runs", { data: body(key, company) });
    expect(created.status()).toBe(202);
    const { runId } = (await created.json()) as { runId: string };

    const w1 = await startWorker();
    let w1Dead = false;
    let caught: string;
    try {
      caught = await waitFor(
        async () => {
          const r = await getRun(handle.db, runId);
          return r && r.status !== "queued" && r.status !== "submitting" ? r.status : undefined;
        },
        30_000, 2, `run ${runId} to reach researching`,
      );
      await killWorkerHard(w1);
      w1Dead = true;
    } finally {
      if (!w1Dead) await stopWorker(w1);
    }
    const atKill = (await getRun(handle.db, runId))!;
    const [job] = (await handle.db.select().from(jobQueue)).filter((j) => j.runId === runId);
    const jobStatusAtKill = job?.status ?? "none";
    // A hard kill leaves a `leased` job for the 90 s lease; expiring it stands in for the timeout (TEST ONLY helper).
    if (job?.status === "leased") await expireLeasesForTest(handle.db);
    const createsAtKill = await taskCreates(runId);
    expect(createsAtKill).toBeLessThanOrEqual(1);

    const midRun = atKill.status === "researching";
    if (midRun) midRunKills++;

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

    const creates = await taskCreates(runId);
    console.log(
      `[restart attempt ${attempt}] observed=${caught} atKill=${atKill.status} job=${jobStatusAtKill} ` +
        `providerRunIdAtKill=${atKill.providerRunId ? "set" : "null"} createsAtKill=${createsAtKill} ` +
        `final=${final.status}/${final.errorCode ?? "-"} creates=${creates} midRun=${midRun}`,
    );

    // Invariants for whatever kill point was reached.
    expect(creates).toBeLessThanOrEqual(1);
    if (midRun) expect(final.status).toBe("complete");
    if (final.status === "complete") {
      expect(creates).toBe(1);
      expect(final.providerRunId).toBe(`fx_ok_${key}`);
    } else {
      // The only acceptable non-complete outcome: killed in `submitting` before provider_run_id was persisted.
      expect(final.status).toBe("failed");
      expect(final.errorCode).toBe("submission_unknown");
      expect(atKill.status).toBe("submitting");
      expect(atKill.providerRunId).toBeNull();
    }
    // provider_run_id is write-once: whatever was persisted before the kill is unchanged after restart.
    if (atKill.providerRunId) expect(final.providerRunId).toBe(atKill.providerRunId);

    // Idempotent resubmit after restart: same key + same body ⇒ 200 same run; different body ⇒ 409.
    const again = await request.post("/api/runs", { data: body(key, company) });
    expect(again.status()).toBe(200);
    expect((await again.json()).runId).toBe(runId);
    const conflict = await request.post("/api/runs", { data: body(key, `${company} changed`) });
    expect(conflict.status()).toBe(409);
    expect((await conflict.json()).code).toBe("idempotency_conflict");
    expect(await taskCreates(runId)).toBe(creates);
  }
  expect(midRunKills, "no attempt landed the SIGKILL while the run was researching").toBeGreaterThan(0);
});
