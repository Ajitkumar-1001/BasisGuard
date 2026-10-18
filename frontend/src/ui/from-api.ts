import type { Policy, RunStatus } from "@basisguard/contracts";
import type { BasisEntry, Citation, RunView } from "@/ui/view-models";

// Mirrors handleGetRun / handleGetRunEvents in src/server/handlers.ts (the Task 14 contract).
export type ApiRunDetail = {
  run: {
    id: string;
    status: RunStatus;
    errorCode: string | null;
    policy: Policy;
    processor: string;
    providerRunId: string | null;
    input: Record<string, unknown>;
    createdAt: string;
    completedAt: string | null;
    deadlineAt: string;
  };
  taskArtifact: { id: string; contentHash: string; fixtureOrigin: string | null; content: unknown; basis: unknown } | null;
  spend: { usd: string; httpRequests: number; byCostKind: Record<"reported" | "estimated" | "unknown", number> };
};
export type ApiRunEvent = { id: string; type: string; createdAt: string; details: unknown };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function toCitation(raw: unknown): Citation | null {
  if (!isRecord(raw) || typeof raw.url !== "string" || !raw.url.startsWith("https://")) return null;
  const excerpt = Array.isArray(raw.excerpts) && typeof raw.excerpts[0] === "string" ? raw.excerpts[0] : "";
  return { url: raw.url, title: typeof raw.title === "string" ? raw.title : raw.url, excerpt };
}

/** Upstream basis is untrusted metadata: keep only well-formed entries and never throw. */
function toBasis(raw: unknown): BasisEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: BasisEntry[] = [];
  for (const item of raw) {
    if (!isRecord(item) || typeof item.field !== "string") continue;
    const citations = Array.isArray(item.citations)
      ? item.citations.map(toCitation).filter((c): c is Citation => c !== null)
      : [];
    out.push({
      field: item.field,
      reasoning: typeof item.reasoning === "string" ? item.reasoning : "",
      citations,
      confidence: typeof item.confidence === "string" ? item.confidence : null,
    });
  }
  return out;
}

function toCostKindCalls(raw: unknown): RunView["costKindCalls"] {
  if (!isRecord(raw)) return null;
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  return { reported: n(raw.reported), estimated: n(raw.estimated), unknown: n(raw.unknown) };
}

function stringify(details: unknown): string {
  return JSON.stringify(details) ?? "";
}

export function fromApiDetail(detail: ApiRunDetail, events: ApiRunEvent[]): RunView {
  const { run, taskArtifact, spend } = detail;
  const input = isRecord(run.input) ? run.input : {};
  const domain = input.official_domain;
  return {
    id: run.id,
    source: "api",
    company: String(input.company_name ?? ""),
    domain: typeof domain === "string" && domain !== "" ? domain : null,
    policy: run.policy,
    processor: run.processor,
    mode: null,
    status: run.status,
    errorCode: run.errorCode,
    asOfDate: String(input.as_of_date ?? ""),
    createdAt: run.createdAt,
    taskSnapshotHash: taskArtifact?.contentHash ?? null,
    fixtureOrigin: taskArtifact?.fixtureOrigin ?? null,
    providerCalls: spend.httpRequests,
    extractUrlUnits: null,
    spendEstimatedUsd: null,
    spendReportedUsd: null,
    spendTotalUsd: spend.usd,
    costKindCalls: toCostKindCalls(spend.byCostKind),
    providerRunId: run.providerRunId,
    latencyMs: null,
    taskOutput: taskArtifact?.content ?? null,
    nativeBasis: toBasis(taskArtifact?.basis),
    claims: [],
    unanswered: [],
    evidence: [],
    events: events.map((e) => ({ at: e.createdAt, kind: e.type, detail: stringify(e.details) })),
  };
}
