import { and, asc, desc, eq } from "drizzle-orm";
import { type CreateRunRequest, isTerminalRunStatus, type RunStatus, StoredRunInput } from "@basisguard/contracts";
import { contentHash } from "@basisguard/core";
import type { Db, DbOrTx } from "./client";
import { jobQueue, researchRuns, runEvents } from "./schema";

export type RunRow = typeof researchRuns.$inferSelect;
export type RunEventRow = typeof runEvents.$inferSelect;
export type CreateRunResult =
  | { kind: "created" | "existing"; runId: string; status: RunStatus }
  | { kind: "conflict"; runId: string };

/**
 * Hash of the PARSED CreateRunRequest (defaults applied, money canonical) without request_key,
 * taken before as_of_date defaulting so retries on a later day still match.
 */
export function requestBodyHash(req: CreateRunRequest): string {
  const { request_key: _key, ...body } = req;
  return contentHash(body);
}

/**
 * FR-01 idempotent create. Concurrent duplicates are resolved by UNIQUE(request_key) via
 * INSERT … ON CONFLICT DO NOTHING; the follow-up SELECT (READ COMMITTED, new snapshot) sees the winner.
 */
export async function createRun(db: Db, req: CreateRunRequest, now: Date): Promise<CreateRunResult> {
  const bodyHash = requestBodyHash(req);
  const { request_key: requestKey, ...body } = req;
  const input = StoredRunInput.parse({ ...body, as_of_date: body.as_of_date ?? now.toISOString().slice(0, 10) });
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(researchRuns)
      .values({
        requestKey,
        requestBodyHash: bodyHash,
        inputJson: input,
        policyVersion: input.policy,
        providerProcessor: input.processor,
        maxProviderCalls: input.max_provider_calls,
        maxEstimatedUsd: input.max_estimated_usd,
        deadlineAt: new Date(now.getTime() + input.deadline_minutes * 60_000),
      })
      .onConflictDoNothing({ target: researchRuns.requestKey })
      .returning({ id: researchRuns.id, status: researchRuns.status });
    if (row) {
      await tx.insert(jobQueue).values({ runId: row.id, jobType: "acquire_task", dedupeKey: `acquire_task:${row.id}` });
      await tx.insert(runEvents).values({ runId: row.id, eventType: "run_created", detailsJson: { requestKey } });
      return { kind: "created", runId: row.id, status: row.status };
    }
    const [existing] = await tx
      .select({ id: researchRuns.id, status: researchRuns.status, hash: researchRuns.requestBodyHash })
      .from(researchRuns)
      .where(eq(researchRuns.requestKey, requestKey));
    if (!existing) throw new Error("request_key conflict without visible row");
    return existing.hash === bodyHash
      ? { kind: "existing", runId: existing.id, status: existing.status }
      : { kind: "conflict", runId: existing.id };
  });
}

export async function getRun(db: DbOrTx, id: string): Promise<RunRow | undefined> {
  const [row] = await db.select().from(researchRuns).where(eq(researchRuns.id, id));
  return row;
}

/** Compare-and-set status transition; appends an event only when the CAS succeeded. */
export async function transitionRun(
  tx: DbOrTx,
  runId: string,
  from: RunStatus,
  to: RunStatus,
  patch: { errorCode?: string; providerRunId?: string; sourceTaskArtifactId?: string; rateCardSha256?: string },
  event: { type: string; details?: Record<string, unknown> },
): Promise<boolean> {
  const now = new Date();
  const updated = await tx
    .update(researchRuns)
    .set({ ...patch, status: to, updatedAt: now, ...(isTerminalRunStatus(to) ? { completedAt: now } : {}) })
    .where(and(eq(researchRuns.id, runId), eq(researchRuns.status, from)))
    .returning({ id: researchRuns.id });
  if (updated.length === 0) return false;
  await tx.insert(runEvents).values({ runId, eventType: event.type, detailsJson: { from, to, ...patch, ...event.details } });
  return true;
}

export async function appendRunEvent(tx: DbOrTx, runId: string, type: string, details: Record<string, unknown> = {}): Promise<void> {
  await tx.insert(runEvents).values({ runId, eventType: type, detailsJson: details });
}

export async function listRuns(db: DbOrTx, o: { limit: number; status?: RunStatus }): Promise<RunRow[]> {
  return db
    .select()
    .from(researchRuns)
    .where(o.status ? eq(researchRuns.status, o.status) : undefined)
    .orderBy(desc(researchRuns.createdAt))
    .limit(o.limit);
}

export async function listRunEvents(db: DbOrTx, runId: string): Promise<RunEventRow[]> {
  return db.select().from(runEvents).where(eq(runEvents.runId, runId)).orderBy(asc(runEvents.createdAt), asc(runEvents.id));
}
