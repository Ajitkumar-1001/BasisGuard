import { eq, sql } from "drizzle-orm";
import { type CostKind, microsToUsd, usdToMicros } from "@basisguard/contracts";
import type { DbOrTx } from "./client";
import { usageEvents } from "./schema";

export type UsageInput = {
  requestId: string;
  runId: string;
  operation: string;
  vendor: string;
  httpRequestCount: number;
  extractUrlUnits?: number;
  costKind: CostKind;
  usd: string;
  rateCardVersion: string | null;
  latencyMs: number | null;
};

function assertCount(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`);
}

/**
 * Actual executed requests only (PRD FR-11 ledger invariant): call after the request ran.
 * Never insert reservations, forecasts, attributed or synthetic rows. Duplicate request_id rejects (UNIQUE).
 */
export async function recordUsage(tx: DbOrTx, u: UsageInput): Promise<void> {
  assertCount("httpRequestCount", u.httpRequestCount);
  const extractUrlUnits = u.extractUrlUnits ?? 0;
  assertCount("extractUrlUnits", extractUrlUnits);
  const usdDecimal = microsToUsd(usdToMicros(u.usd));
  await tx.insert(usageEvents).values({
    requestId: u.requestId,
    runId: u.runId,
    operation: u.operation,
    vendor: u.vendor,
    httpRequestCount: u.httpRequestCount,
    extractUrlUnits,
    costKind: u.costKind,
    usdDecimal,
    rateCardVersion: u.rateCardVersion,
    latencyMs: u.latencyMs,
  });
}

export async function runSpend(
  db: DbOrTx,
  runId: string,
): Promise<{ usd: string; httpRequests: number; byCostKind: Record<CostKind, number> }> {
  const rows = await db
    .select({
      costKind: usageEvents.costKind,
      usd: sql<string>`coalesce(sum(${usageEvents.usdDecimal}), 0)::text`,
      n: sql<string>`coalesce(sum(${usageEvents.httpRequestCount}), 0)::text`,
    })
    .from(usageEvents)
    .where(eq(usageEvents.runId, runId))
    .groupBy(usageEvents.costKind);
  const byCostKind: Record<CostKind, number> = { reported: 0, estimated: 0, unknown: 0 };
  let micros = 0n;
  let httpRequests = 0;
  for (const r of rows) {
    const n = Number(r.n);
    byCostKind[r.costKind] = n;
    httpRequests += n;
    micros += usdToMicros(r.usd);
  }
  return { usd: microsToUsd(micros), httpRequests, byCostKind };
}
