import { and, eq, inArray, sql } from "drizzle-orm";
import { microsToUsd, usdToMicros } from "@basisguard/contracts";
import type { DbOrTx, Tx } from "./client";
import { budgetReservations, researchRuns } from "./schema";

export type ReserveInput = {
  runId: string;
  operationKey: string;
  operation: string;
  providerCallUnits: number;
  extractUrlUnits: number;
  reservedUsd: string;
};
export type ReserveResult =
  | { ok: true; reservationId: string; existing: boolean }
  | { ok: false; reason: "provider_call_cap" | "usd_cap" };

function assertUnits(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`);
}

/**
 * FR-11 atomic pre-dispatch reservation inside the caller's transaction.
 * The research_runs row lock (first statement) serializes all concurrent reservers for one run,
 * so the sum-then-insert below cannot race. Caps are compared in bigint micros, never floats.
 */
export async function reserveRunBudget(tx: Tx, r: ReserveInput): Promise<ReserveResult> {
  assertUnits("providerCallUnits", r.providerCallUnits);
  assertUnits("extractUrlUnits", r.extractUrlUnits);
  const reservedMicros = usdToMicros(r.reservedUsd);

  const [run] = await tx
    .select({ maxCalls: researchRuns.maxProviderCalls, maxUsd: researchRuns.maxEstimatedUsd })
    .from(researchRuns)
    .where(eq(researchRuns.id, r.runId))
    .for("update");
  if (!run) throw new Error(`run ${r.runId} not found`);

  const [existing] = await tx
    .select({ id: budgetReservations.id, scopeType: budgetReservations.scopeType, scopeId: budgetReservations.scopeId })
    .from(budgetReservations)
    .where(eq(budgetReservations.operationKey, r.operationKey));
  if (existing) {
    if (existing.scopeType !== "run" || existing.scopeId !== r.runId) {
      throw new Error(`operation key ${r.operationKey} belongs to another scope than run ${r.runId}`);
    }
    return { ok: true, reservationId: existing.id, existing: true };
  }

  const [used] = await tx
    .select({
      calls: sql<string>`coalesce(sum(${budgetReservations.providerCallUnits}), 0)::text`,
      usd: sql<string>`coalesce(sum(${budgetReservations.reservedUsd}), 0)::text`,
    })
    .from(budgetReservations)
    .where(
      and(
        eq(budgetReservations.scopeType, "run"),
        eq(budgetReservations.scopeId, r.runId),
        inArray(budgetReservations.status, ["active", "reconciled"]),
      ),
    );

  if (Number(used!.calls) + r.providerCallUnits > run.maxCalls) return { ok: false, reason: "provider_call_cap" };
  if (usdToMicros(used!.usd) + reservedMicros > usdToMicros(run.maxUsd)) return { ok: false, reason: "usd_cap" };

  const [row] = await tx
    .insert(budgetReservations)
    .values({
      scopeType: "run",
      scopeId: r.runId,
      operationKey: r.operationKey,
      operation: r.operation,
      providerCallUnits: r.providerCallUnits,
      extractUrlUnits: r.extractUrlUnits,
      reservedUsd: microsToUsd(reservedMicros),
    })
    .returning({ id: budgetReservations.id });
  return { ok: true, reservationId: row!.id, existing: false };
}

/** Transitions a reservation out of `active` only. `released` stops counting; `reconciled` keeps counting. */
export async function settleReservation(
  tx: DbOrTx,
  operationKey: string,
  to: "reconciled" | "released",
): Promise<boolean> {
  const rows = await tx
    .update(budgetReservations)
    .set({ status: to, updatedAt: new Date() })
    .where(and(eq(budgetReservations.operationKey, operationKey), eq(budgetReservations.status, "active")))
    .returning({ id: budgetReservations.id });
  return rows.length > 0;
}
