import { expect, test } from "@playwright/test";
import { killAllWorkers, startWorker, WorkerStartError } from "./helpers";

/**
 * Teardown safety net for spawned workers: a worker group must never outlive a failed start or a spec that
 * skipped its own cleanup, or it keeps polling basisguard_test and races later spec files.
 */
const groupAlive = (pgid: number): boolean => {
  try {
    process.kill(-pgid, 0);
    return true;
  } catch {
    return false;
  }
};

async function waitGroupDead(pgid: number, ms: number): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (!groupAlive(pgid)) return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return !groupAlive(pgid);
}

test.afterAll(() => {
  killAllWorkers();
});

test("a worker that fails to start in time has its process group killed", async () => {
  const err = await startWorker({ startTimeoutMs: 1 }).then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(WorkerStartError);
  expect(await waitGroupDead((err as WorkerStartError).pgid, 5_000)).toBe(true);
});

test("killAllWorkers kills every worker group a spec left running", async () => {
  const w = await startWorker();
  const pgid = w.child.pid!;
  expect(groupAlive(pgid)).toBe(true);
  killAllWorkers();
  expect(await waitGroupDead(pgid, 5_000)).toBe(true);
});
