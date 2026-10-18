import { isTerminalRunStatus, type RateCard, type RunErrorCode, type RunStatus, StoredRunInput } from "@basisguard/contracts";
import { TaskResultEnvelope } from "@basisguard/core";
import {
  appendRunEvent, budgetReservations, type Db, type DbOrTx, getRun, insertArtifact, jobQueue, type LeasedJob, recordUsage,
  reserveRunBudget, type RunRow, settleReservation, transitionRun,
} from "@basisguard/db/runtime";
import { ProviderError, type ResearchProvider, type ResearchTaskInput } from "@basisguard/providers";
import { and, eq } from "drizzle-orm";

export type CrashHooks = { afterSubmittingCommitted?: () => Promise<void>; afterProviderCreate?: () => Promise<void> };
export type WorkerDeps = {
  db: Db; provider: ResearchProvider; rateCard: RateCard; rateCardSha256: string;
  vendor: "parallel" | "fixture:parallel"; fixtureOrigin: string | null; pollDelayMs: number;
  now?: () => Date; hooks?: CrashHooks;
};
export type StepOutcome = { kind: "done" } | { kind: "retry"; delayMs: number; reason: string };

/**
 * Leases of one acquire_task job beyond this fail a still-`queued` run (attempt_count increments on every
 * lease, uncapped in the queue). Not applied once `researching`: every healthy pending poll is a fresh
 * lease, so a lease-count cap there would fail long-running upstream Tasks that are succeeding.
 */
export const MAX_ACQUIRE_ATTEMPTS = 20;
/**
 * While `researching`, polling is bounded by deadline_at; this caps consecutive steps that ended in a
 * failed read (a healthy pending poll resets the count). The count is carried in job_queue.last_error.
 */
export const MAX_CONSECUTIVE_READ_FAILURES = 20;
const READ_FAILURE_RE = /^read_failure (\d+): /;
const MAX_DELAY_MS = 60_000;
const DONE: StepOutcome = { kind: "done" };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const backoffMs = (attempt: number): number =>
  Math.min(MAX_DELAY_MS, 1000 * 2 ** Math.min(attempt, 6)) + Math.floor(Math.random() * 250);

/** Upstream Retry-After, clamped to [0, 60s]; NaN, non-finite or negative values are ignored in favour of backoff. */
export function retryDelayMs(retryAfterMs: number | undefined, attempt: number): number {
  if (retryAfterMs === undefined || !Number.isFinite(retryAfterMs) || retryAfterMs < 0) return backoffMs(attempt);
  return Math.min(retryAfterMs, MAX_DELAY_MS);
}

/** Thrown inside a transaction to roll it back without an error surfacing to the caller. */
class Rollback extends Error {}

const clock = (deps: WorkerDeps): Date => (deps.now ?? (() => new Date()))();

/** Never sleep past the deadline: the next step must observe it and fail the run. */
function bounded(deps: WorkerDeps, run: RunRow, delayMs: number, reason: string): StepOutcome {
  const untilDeadline = Math.max(0, run.deadlineAt.getTime() - clock(deps).getTime());
  return { kind: "retry", delayMs: Math.min(delayMs, untilDeadline), reason };
}

/**
 * Outcome after a lost run CAS. A terminal (or missing) run needs nothing more, so the job finishes.
 * A still non-terminal run was moved by someone else — possibly a stale-lease worker whose own job writes
 * are fenced off (its retryJob throws LeaseLostError), so it cannot requeue the run. Finishing the job
 * here would strand the run with no job and no deadline check; instead this lease holder re-evaluates
 * from the run's current status on the next step.
 */
async function afterLostCas(db: DbOrTx, runId: string): Promise<StepOutcome> {
  const current = await getRun(db, runId);
  if (!current || isTerminalRunStatus(current.status)) return DONE;
  return { kind: "retry", delayMs: 0, reason: `lost_race: run is ${current.status}` };
}

/** Fail-transition helper. On a lost CAS it defers to `afterLostCas` (never DONE on a non-terminal run). */
async function failRun(
  db: DbOrTx, run: RunRow, from: RunStatus, errorCode: RunErrorCode, details: Record<string, unknown>,
): Promise<StepOutcome> {
  const moved = await transitionRun(db, run.id, from, "failed", { errorCode }, { type: "run_failed", details });
  return moved ? DONE : afterLostCas(db, run.id);
}

export async function processAcquireTask(deps: WorkerDeps, job: LeasedJob): Promise<StepOutcome> {
  if (!job.runId) throw new Error(`acquire_task job ${job.id} has no run_id`);
  const run = await getRun(deps.db, job.runId);
  if (!run || isTerminalRunStatus(run.status)) return DONE;

  // FR-02: checked before deadline and attempt cap. Never re-create a Task.
  if (run.status === "submitting" && !run.providerRunId) {
    return failSubmissionUnknown(deps, run, "found submitting without provider_run_id after restart");
  }
  if (clock(deps) >= run.deadlineAt) return failRun(deps.db, run, run.status, "deadline_exceeded", {});
  if (run.status === "queued" && job.attemptCount > MAX_ACQUIRE_ATTEMPTS) {
    return failRun(deps.db, run, run.status, "max_attempts_exceeded", { attemptCount: job.attemptCount, max: MAX_ACQUIRE_ATTEMPTS });
  }
  switch (run.status) {
    case "queued":
      return submit(deps, run, job);
    case "researching":
      return poll(deps, run, job);
    default:
      throw new Error(`run ${run.id}: status ${run.status} is not handled in Phase 1`);
  }
}

function taskInput(run: RunRow): ResearchTaskInput {
  const input = StoredRunInput.parse(run.inputJson);
  if (!UUID_RE.test(run.requestKey)) throw new Error(`run ${run.id}: request_key is not a UUID`);
  return {
    companyName: input.company_name, officialDomain: input.official_domain, profileVersion: input.profile,
    asOfDate: input.as_of_date, processor: input.processor, requestKey: run.requestKey.toLowerCase(),
  };
}

async function submit(deps: WorkerDeps, run: RunRow, job: LeasedJob): Promise<StepOutcome> {
  const input = taskInput(run);
  const price = deps.rateCard.task_usd_per_run[input.processor];
  const opKey = `task_create:${run.id}:a${job.attemptCount}`;
  const ledger = { runId: run.id, operation: "task_create", vendor: deps.vendor, httpRequestCount: 1, rateCardVersion: deps.rateCard.version };

  // Reserve + queued→submitting in one tx. reserveRunBudget locks the run row first, so the CAS below
  // is the non-terminal gate for this billable dispatch; if it loses, the reservation rolls back.
  let reserved: boolean;
  try {
    reserved = await deps.db.transaction(async (tx) => {
      const r = await reserveRunBudget(tx, { runId: run.id, operationKey: opKey, operation: "task_create", providerCallUnits: 1, extractUrlUnits: 0, reservedUsd: price });
      if (!r.ok) {
        const failed = await transitionRun(tx, run.id, "queued", "failed", { errorCode: "budget_exhausted" }, { type: "run_failed", details: { reason: r.reason } });
        if (!failed) throw new Rollback();
        return false;
      }
      const moved = await transitionRun(tx, run.id, "queued", "submitting", { rateCardSha256: deps.rateCardSha256 },
        { type: "task_submitting", details: { operationKey: opKey, reservedUsd: price } });
      if (!moved) throw new Rollback();
      return true;
    });
  } catch (e) {
    // Lost CAS (terminal, or moved by another worker): no dispatch, no reservation kept.
    if (e instanceof Rollback) return afterLostCas(deps.db, run.id);
    throw e;
  }
  if (!reserved) return DONE;

  await deps.hooks?.afterSubmittingCommitted?.();
  const started = Date.now();
  let created: Awaited<ReturnType<ResearchProvider["createStructuredTask"]>>;
  try {
    created = await deps.provider.createStructuredTask(input);
  } catch (e) {
    const latencyMs = Date.now() - started;
    if (e instanceof ProviderError && e.submitted === "no") {
      return deps.db.transaction(async (tx): Promise<StepOutcome> => {
        await settleReservation(tx, opKey, "released");
        await recordUsage(tx, { ...ledger, requestId: opKey, costKind: "estimated", usd: "0", latencyMs });
        if (e.code === "provider_rate_limited") {
          const moved = await transitionRun(tx, run.id, "submitting", "queued", {}, { type: "task_create_rate_limited", details: { message: e.message } });
          return moved ? bounded(deps, run, retryDelayMs(e.retryAfterMs, job.attemptCount), "rate_limited") : afterLostCas(tx, run.id);
        }
        return failRun(tx, run, "submitting", e.code, { message: e.message });
      });
    }
    // Create phase: anything not definitively rejected (including connection errors, timeouts and the
    // adapter's 404/409 → provider_unavailable/unknown mapping) may have created an upstream Task.
    // Fail closed (D-009): count the reservation as spent, ledger the call as unknown, never re-create.
    const message = e instanceof Error ? `${e.name}: ${e.message}` : "non-error thrown";
    return deps.db.transaction(async (tx): Promise<StepOutcome> => {
      await settleReservation(tx, opKey, "reconciled");
      await recordUsage(tx, { ...ledger, requestId: opKey, costKind: "unknown", usd: price, latencyMs });
      return failRun(tx, run, "submitting", "submission_unknown", { message });
    });
  }
  await deps.hooks?.afterProviderCreate?.();
  const latencyMs = Date.now() - started;

  // provider_run_id is persisted (write-once CAS) before any poll can run.
  return deps.db.transaction(async (tx): Promise<StepOutcome> => {
    await recordUsage(tx, { ...ledger, requestId: opKey, costKind: "estimated", usd: price, latencyMs });
    await settleReservation(tx, opKey, "reconciled");
    const request = await insertArtifact(tx, { kind: "task_request", raw: created.rawRequest, ownerRunId: run.id, fixtureOrigin: deps.fixtureOrigin });
    const moved = await transitionRun(tx, run.id, "submitting", "researching", { providerRunId: created.providerRunId },
      { type: "task_submitted", details: { taskRequestArtifactId: request.id, createResponse: created.rawResponse } });
    if (!moved) {
      // D-011 zombie: another worker already resolved this run (typically failed/submission_unknown).
      // The upstream Task really exists, so the executed call stays ledgered and is audited as orphaned;
      // the run itself is never mutated.
      const current = await getRun(tx, run.id);
      await appendRunEvent(tx, run.id, "orphaned_provider_run", {
        providerRunId: created.providerRunId, createResponse: created.rawResponse, taskRequestArtifactId: request.id,
        observedStatus: current?.status ?? null,
      });
      return afterLostCas(tx, run.id);
    }
    return { kind: "retry", delayMs: 0, reason: "poll" };
  });
}

/**
 * `run` is a snapshot read outside any lock: a stale-lease worker may have persisted provider_run_id
 * (submitting→researching) or gone back to queued (429) since. If the CAS loses, the reservation
 * settlement rolls back with it and the outcome comes from the run's current status.
 */
async function failSubmissionUnknown(deps: WorkerDeps, run: RunRow, why: string): Promise<StepOutcome> {
  try {
    await deps.db.transaction(async (tx) => {
      const active = await tx
        .select({ key: budgetReservations.operationKey })
        .from(budgetReservations)
        .where(and(eq(budgetReservations.scopeType, "run"), eq(budgetReservations.scopeId, run.id), eq(budgetReservations.status, "active")));
      for (const r of active) await settleReservation(tx, r.key, "reconciled");
      // No usage row: whether the create executed is unknown, and the ledger holds executed calls only.
      const moved = await transitionRun(tx, run.id, "submitting", "failed", { errorCode: "submission_unknown" },
        { type: "run_failed", details: { reason: why } });
      if (!moved) throw new Rollback();
    });
  } catch (e) {
    if (e instanceof Rollback) return afterLostCas(deps.db, run.id);
    throw e;
  }
  return DONE;
}

/**
 * Poll-phase read (provider_run_id already stored). Policy:
 * - provider_auth_error / provider_bad_request ⇒ fail the run with that code.
 * - everything else, including provider_unavailable with any `submitted` value and the adapter's
 *   HTTP 404/409 → provider_unavailable/unknown mapping ⇒ retry with backoff. Reads never create, so this
 *   never becomes submission_unknown. The MAX_CONSECUTIVE_READ_FAILURES-th failed step in a row fails the
 *   run with max_attempts_exceeded; otherwise a permanently missing run ends in deadline_exceeded.
 */
async function readCall<T>(
  deps: WorkerDeps, run: RunRow, job: LeasedJob, operation: string, fn: () => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; outcome: StepOutcome }> {
  const started = Date.now();
  const ledger = {
    requestId: `${operation}:${run.id}:${crypto.randomUUID()}`, runId: run.id, operation, vendor: deps.vendor,
    httpRequestCount: 1, costKind: "estimated" as const, usd: "0", rateCardVersion: deps.rateCard.version,
  };
  try {
    const value = await fn();
    await recordUsage(deps.db, { ...ledger, latencyMs: Date.now() - started });
    return { ok: true, value };
  } catch (e) {
    await recordUsage(deps.db, { ...ledger, latencyMs: Date.now() - started });
    if (e instanceof ProviderError && (e.code === "provider_auth_error" || e.code === "provider_bad_request")) {
      return { ok: false, outcome: await failRun(deps.db, run, run.status, e.code, { operation, message: e.message }) };
    }
    const why = e instanceof Error ? `${e.name}: ${e.message}` : "non-error thrown";
    const failures = (await priorReadFailures(deps.db, job)) + 1;
    if (failures >= MAX_CONSECUTIVE_READ_FAILURES) {
      return { ok: false, outcome: await failRun(deps.db, run, run.status, "max_attempts_exceeded", {
        operation, message: why, consecutiveReadFailures: failures, max: MAX_CONSECUTIVE_READ_FAILURES,
      }) };
    }
    const delayMs = retryDelayMs(e instanceof ProviderError ? e.retryAfterMs : undefined, job.attemptCount);
    // The `read_failure N:` prefix is the counter; any other retry reason (healthy pending poll) resets it.
    return { ok: false, outcome: bounded(deps, run, delayMs, `read_failure ${failures}: ${operation}: ${why}`) };
  }
}

/** Consecutive failed read steps before this lease, parsed from the reason the previous step stored. */
async function priorReadFailures(db: DbOrTx, job: LeasedJob): Promise<number> {
  const [row] = await db.select({ lastError: jobQueue.lastError }).from(jobQueue).where(eq(jobQueue.id, job.id));
  const m = row?.lastError ? READ_FAILURE_RE.exec(row.lastError) : null;
  return m ? Number(m[1]) : 0;
}

async function poll(deps: WorkerDeps, run: RunRow, job: LeasedJob): Promise<StepOutcome> {
  const providerRunId = run.providerRunId;
  if (!providerRunId) throw new Error(`run ${run.id}: researching without provider_run_id`);
  const status = await readCall(deps, run, job, "task_status", () => deps.provider.getTaskStatus(providerRunId));
  if (!status.ok) return status.outcome;
  if (status.value.state === "pending") return bounded(deps, run, deps.pollDelayMs, `upstream ${status.value.rawStatus}`);
  if (status.value.state === "failed") {
    return failRun(deps.db, run, "researching", status.value.errorCode, { upstreamStatus: status.value.rawStatus });
  }
  const result = await readCall(deps, run, job, "task_result", () => deps.provider.getTaskResult(providerRunId));
  if (!result.ok) return result.outcome;

  await deps.db.transaction(async (tx) => {
    const art = await insertArtifact(tx, { kind: "task_result", raw: result.value.raw, ownerRunId: run.id, fixtureOrigin: deps.fixtureOrigin });
    const parsed = TaskResultEnvelope.safeParse(result.value.raw);
    if (!parsed.success) {
      await transitionRun(tx, run.id, "researching", "failed", { errorCode: "normalization_failed", sourceTaskArtifactId: art.id },
        { type: "run_failed", details: { issues: parsed.error.issues.slice(0, 10) } });
      return;
    }
    // Phase 1 accepts baseline only (D-002): original values are shown as unverified; no claims yet.
    // A false return (terminal / lost race) leaves the run untouched; the artifact is append-only anyway.
    await transitionRun(tx, run.id, "researching", "complete", { sourceTaskArtifactId: art.id }, { type: "task_completed", details: { contentHash: art.contentHash } });
  });
  return DONE;
}
