import { and, eq, inArray, sql } from "drizzle-orm";
import type { PgUpdateSetSource } from "drizzle-orm/pg-core";
import type { JobType } from "@basisguard/contracts";
import type { DbOrTx } from "./client";
import { jobQueue } from "./schema";

export type LeasedJob = {
  id: string;
  runId: string | null;
  experimentId: string | null;
  jobType: JobType;
  leaseOwner: string;
  leaseVersion: number;
  attemptCount: number;
};

export class LeaseLostError extends Error {
  constructor(jobId: string) {
    super(`lease lost for job ${jobId}`);
    this.name = "LeaseLostError";
  }
}

const inMs = (ms: number) => sql`now() + (${ms} * interval '1 millisecond')`;

/**
 * Atomically lease the oldest ready job of the given types. Selection (FOR UPDATE SKIP LOCKED) and
 * the lease write are one statement, so concurrent workers never lease the same row. An expired
 * lease is re-leasable; re-leasing bumps lease_version, which fences the previous holder.
 */
export async function leaseNextJob(
  db: DbOrTx,
  o: { workerId: string; leaseMs: number; jobTypes: readonly JobType[] },
): Promise<LeasedJob | null> {
  if (o.jobTypes.length === 0) return null;
  const ready = db
    .select({ id: jobQueue.id })
    .from(jobQueue)
    .where(
      and(
        inArray(jobQueue.jobType, [...o.jobTypes]),
        sql`((${jobQueue.status} IN ('pending','retry_wait') AND ${jobQueue.availableAt} <= now())
             OR (${jobQueue.status} = 'leased' AND ${jobQueue.leaseUntil} < now()))`,
      ),
    )
    .orderBy(jobQueue.availableAt, jobQueue.createdAt)
    .limit(1)
    .for("update", { skipLocked: true });

  const [row] = await db
    .update(jobQueue)
    .set({
      status: "leased",
      leaseOwner: o.workerId,
      leaseUntil: inMs(o.leaseMs),
      leaseVersion: sql`${jobQueue.leaseVersion} + 1`,
      attemptCount: sql`${jobQueue.attemptCount} + 1`,
      updatedAt: sql`now()`,
    })
    .where(inArray(jobQueue.id, ready))
    .returning();
  if (!row) return null;
  return {
    id: row.id,
    runId: row.runId,
    experimentId: row.experimentId,
    jobType: row.jobType,
    leaseOwner: o.workerId,
    leaseVersion: row.leaseVersion,
    attemptCount: row.attemptCount,
  };
}

/** Fencing predicate: the caller still holds this exact lease (id + version + owner + leased). */
const owned = (job: LeasedJob) =>
  and(
    eq(jobQueue.id, job.id),
    eq(jobQueue.leaseVersion, job.leaseVersion),
    eq(jobQueue.leaseOwner, job.leaseOwner),
    eq(jobQueue.status, "leased"),
  );

async function fencedUpdate(db: DbOrTx, job: LeasedJob, set: PgUpdateSetSource<typeof jobQueue>): Promise<void> {
  const rows = await db
    .update(jobQueue)
    .set({ ...set, updatedAt: sql`now()` })
    .where(owned(job))
    .returning({ id: jobQueue.id });
  if (rows.length === 0) throw new LeaseLostError(job.id);
}

/** Extends the lease; returns false when the lease was lost (expired and re-leased, or finished). */
export async function heartbeatJob(db: DbOrTx, job: LeasedJob, leaseMs: number): Promise<boolean> {
  const rows = await db
    .update(jobQueue)
    .set({ leaseUntil: inMs(leaseMs), updatedAt: sql`now()` })
    .where(owned(job))
    .returning({ id: jobQueue.id });
  return rows.length > 0;
}

export const completeJob = (db: DbOrTx, job: LeasedJob): Promise<void> =>
  fencedUpdate(db, job, { status: "succeeded", leaseOwner: null, leaseUntil: null });

export const retryJob = (db: DbOrTx, job: LeasedJob, delayMs: number, reason: string): Promise<void> =>
  fencedUpdate(db, job, {
    status: "retry_wait",
    availableAt: inMs(delayMs),
    leaseOwner: null,
    leaseUntil: null,
    lastError: reason,
  });

export const failJob = (db: DbOrTx, job: LeasedJob, reason: string): Promise<void> =>
  fencedUpdate(db, job, { status: "failed", leaseOwner: null, leaseUntil: null, lastError: reason });

/** TEST ONLY: force every current lease to be expired. Never call from production code. */
export async function expireLeasesForTest(db: DbOrTx): Promise<void> {
  await db
    .update(jobQueue)
    .set({ leaseUntil: sql`now() - interval '1 second'` })
    .where(eq(jobQueue.status, "leased"));
}
