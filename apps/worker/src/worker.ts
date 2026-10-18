import { completeJob, heartbeatJob, jobQueue, LeaseLostError, leaseNextJob, retryJob } from "@basisguard/db/runtime";
import { eq, sql } from "drizzle-orm";
import { backoffMs, processAcquireTask, type WorkerDeps } from "./acquire-task";

export async function runOnce(deps: WorkerDeps, o: { workerId: string; leaseMs: number }): Promise<boolean> {
  const job = await leaseNextJob(deps.db, { workerId: o.workerId, leaseMs: o.leaseMs, jobTypes: ["acquire_task"] });
  if (!job) return false;
  const beat = setInterval(() => void heartbeatJob(deps.db, job, o.leaseMs).catch(() => {}), Math.max(1000, o.leaseMs / 3));
  try {
    const outcome = await processAcquireTask(deps, job);
    if (outcome.kind === "done") await completeJob(deps.db, job);
    else await retryJob(deps.db, job, outcome.delayMs, outcome.reason);
  } catch (e) {
    if (e instanceof LeaseLostError) return true; // another worker owns it now
    // Unexpected error: the state machine resumes from DB checkpoints; ambiguous submits fail closed on re-entry.
    // Only the error's name/message is stored (never the whole object, which could carry config).
    const reason = e instanceof Error ? `${e.name}: ${e.message}` : "non-error thrown";
    await retryJob(deps.db, job, backoffMs(job.attemptCount), reason).catch(() => {});
  } finally {
    clearInterval(beat);
  }
  return true;
}

/** Test/E2E helper: process until no job is ready, collapsing retry delays. */
export async function drain(deps: WorkerDeps, o: { workerId: string; leaseMs: number; maxIterations?: number }): Promise<number> {
  let n = 0;
  for (; n < (o.maxIterations ?? 50); n++) {
    // TEST ONLY: unfenced bump so retry_wait jobs are ready immediately. Runtime code never does this.
    await deps.db.update(jobQueue).set({ availableAt: sql`now()` }).where(eq(jobQueue.status, "retry_wait"));
    if (!(await runOnce(deps, o))) break;
  }
  return n;
}

/** Sanitized loop error: name and string code only, never the message (it can carry the database URL). */
export type LoopError = { name: string; code?: string };
export type LoopControl = {
  step: () => Promise<boolean>;
  isStopping: () => boolean;
  sleep: (ms: number) => Promise<void>;
  onError: (err: LoopError, consecutiveFailures: number, delayMs: number) => void;
};
const IDLE_MS = 500;
const MAX_LOOP_BACKOFF_MS = 30_000;

export const loopBackoffMs = (consecutiveFailures: number): number =>
  Math.min(MAX_LOOP_BACKOFF_MS, 500 * 2 ** Math.min(consecutiveFailures, 6));

export function sanitizeLoopError(e: unknown): LoopError {
  if (!(e instanceof Error)) return { name: "non-error" };
  const code: unknown = (e as { code?: unknown }).code;
  return typeof code === "string" ? { name: e.name, code } : { name: e.name };
}

/**
 * Worker main loop with a per-iteration error boundary. A failure outside runOnce's own try (e.g.
 * leaseNextJob during a Postgres restart) is reported sanitized, backed off and retried until stopping;
 * DB checkpoints and lease fencing make resuming safe.
 */
export async function runLoop(c: LoopControl): Promise<void> {
  let failures = 0;
  while (!c.isStopping()) {
    let worked: boolean;
    try {
      worked = await c.step();
      failures = 0;
    } catch (e) {
      failures++;
      const delayMs = loopBackoffMs(failures);
      c.onError(sanitizeLoopError(e), failures, delayMs);
      await c.sleep(delayMs);
      continue;
    }
    if (!worked) await c.sleep(IDLE_MS);
  }
}
