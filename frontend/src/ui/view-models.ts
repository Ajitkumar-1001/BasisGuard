import type { Policy, Processor, RunStatus, RuntimeMode } from "@basisguard/contracts";
import type {
  ClaimVerdict,
  EvalStatus,
  FieldAction,
  FieldState,
  RepairState,
  ReviewDecision,
} from "@/ui/types";

/**
 * Display-oriented view models. Fixtures build these directly; Task 5 maps real
 * API responses into the same shapes. Money is a 6-dp decimal string and
 * timestamps are ISO-8601 strings, so the models are safe to serialize.
 */

export interface Citation {
  url: string;
  title: string;
  excerpt: string;
}

export interface Evidence {
  id: string;
  url: string;
  excerpt: string;
  contentHash: string;
}

export interface RepairAttempt {
  state: RepairState;
  evidenceIds: string[];
  postVerdict?: ClaimVerdict;
  bundleHash?: string;
  at: string;
}

export interface ReviewEntry {
  decision: ReviewDecision;
  alias: string;
  at: string;
  rationale: string;
}

export interface Claim {
  id: string;
  pointer: string;
  template: string;
  originalValue: string;
  upstreamConfidence: "low" | "medium" | "high" | null;
  citations: Citation[];
  initialVerdict: ClaimVerdict | null;
  finalVerdict: ClaimVerdict | null;
  action: FieldAction | null;
  fieldState?: FieldState;
  judgeEvidenceIds: string[];
  judgeExplanation?: string;
  repair: RepairAttempt | null;
  reviews: ReviewEntry[];
}

export interface RunEvent {
  at: string;
  kind: string;
  detail: string;
}

export interface BasisEntry {
  field: string;
  reasoning: string;
  citations: Citation[];
  confidence: string | null;
}

export interface RunView {
  id: string;
  source: "api" | "fixture";
  company: string;
  domain: string | null;
  policy: Policy;
  processor: Processor | string;
  mode: RuntimeMode | null;
  status: RunStatus;
  errorCode: string | null;
  asOfDate: string;
  createdAt: string;
  taskSnapshotHash: string | null;
  fixtureOrigin: string | null;
  providerCalls: number | null;
  extractUrlUnits: number | null;
  spendEstimatedUsd: string | null;
  spendReportedUsd: string | null;
  /** Sum over all cost kinds (API runs only); fixtures use the estimated/reported split. */
  spendTotalUsd: string | null;
  /** Call counts per cost kind; null when not tracked (fixtures). */
  costKindCalls: Record<"reported" | "estimated" | "unknown", number> | null;
  providerRunId: string | null;
  latencyMs: number | null;
  taskOutput: unknown;
  nativeBasis: BasisEntry[];
  claims: Claim[];
  unanswered: string[];
  evidence: Evidence[];
  events: RunEvent[];
}

export interface EvalCase {
  id: string;
  company: string;
  kind: "natural" | "perturbed";
  perturbation?: string;
  aUnverified: number;
  b: Record<FieldAction, number>;
  c: Record<FieldAction, number>;
  bInitialHash: string;
  cInitialHash: string;
  cPostRepair: string;
}

export interface EvalStratum {
  numerator: number;
  denominator: number;
}

export interface EvalMetric {
  label: string;
  numerator: number;
  denominator: number;
  missingLabels: number;
  errors: number;
  natural: EvalStratum;
  synthetic: EvalStratum;
}

export interface EvaluationView {
  id: string;
  datasetVersion: string;
  status: EvalStatus;
  preview: boolean;
  snapshotHash: string;
  manifestHash: string;
  truthLabels: string;
  supportLabelsDone: number;
  supportLabelsTotal: number;
  repairLabelQueue: number;
  casesNatural: number;
  casesPerturbed: number;
  cases: EvalCase[];
  initialMetrics: EvalMetric[];
  repairMetrics: EvalMetric[];
  spendActualUsd: string;
  spendAttributed: { policy: Policy; usd: string }[];
  events: RunEvent[];
}
