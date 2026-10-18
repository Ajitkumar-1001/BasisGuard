import type { EvalCase, EvalMetric, EvalStratum, EvaluationView } from "@/ui/view-models";
import { hex64 } from "./helpers";

type Counts = EvalCase["b"];

function counts(accept: number, abstain: number, review: number): Counts {
  return { accept, abstain, review };
}

/**
 * Dataset case. `fields` is the case's non-null field count; B and C counts
 * must each sum to it. B and C share one explicit initial-bundle hash because
 * C imports B's initial verdicts (PRD 3.2).
 */
function evalCase(
  id: string,
  company: string,
  kind: EvalCase["kind"],
  fields: number,
  b: Counts,
  c: Counts,
  perturbation?: string,
): EvalCase {
  const initialHash = hex64(`case:${id}:initial-bundle`);
  return {
    id,
    company,
    kind,
    ...(perturbation ? { perturbation } : {}),
    aUnverified: fields,
    b,
    c,
    bInitialHash: initialHash,
    cInitialHash: initialHash,
    cPostRepair: hex64(`case:${id}:post-repair`),
  };
}

/** Metric whose totals and strata are derived from the case rows, so they cannot disagree. */
function metric(
  label: string,
  cases: EvalCase[],
  pick: (c: EvalCase) => [number, number],
  missingLabels: number,
): EvalMetric {
  const sum = (kind: EvalCase["kind"] | null): EvalStratum => {
    let numerator = 0;
    let denominator = 0;
    for (const c of cases) {
      if (kind !== null && c.kind !== kind) continue;
      const [n, d] = pick(c);
      numerator += n;
      denominator += d;
    }
    return { numerator, denominator };
  };
  const total = sum(null);
  return {
    label,
    numerator: total.numerator,
    denominator: total.denominator,
    missingLabels,
    errors: 0,
    natural: sum("natural"),
    synthetic: sum("perturbed"),
  };
}

function initialMetrics(cases: EvalCase[], missingLabels: number): EvalMetric[] {
  return [
    metric("Fields accepted (B)", cases, (c) => [c.b.accept, c.aUnverified], missingLabels),
    metric("Fields sent to review (B)", cases, (c) => [c.b.review, c.aUnverified], missingLabels),
    metric("Fields abstained (B)", cases, (c) => [c.b.abstain, c.aUnverified], missingLabels),
  ];
}

function repairMetrics(cases: EvalCase[], missingLabels: number): EvalMetric[] {
  return [
    metric("Abstentions recovered by repair (C)", cases, (c) => [c.c.accept - c.b.accept, c.b.abstain], missingLabels),
  ];
}

const v3Cases: EvalCase[] = [
  evalCase("case-ashgrove", "Ashgrove Dynamics", "natural", 8, counts(5, 2, 1), counts(6, 1, 1)),
  evalCase("case-bellwether", "Bellwether Optics", "natural", 8, counts(6, 2, 0), counts(6, 2, 0)),
  evalCase("case-corvane", "Corvane Textiles", "perturbed", 8, counts(4, 2, 2), counts(5, 1, 2), "founder_swap"),
];

const v3: EvaluationView = {
  id: "2c8e4f10-5d93-4b27-96a1-d07f3b8e5c42",
  datasetVersion: "v3",
  status: "complete",
  preview: false,
  snapshotHash: hex64("startup_facts_v1:v3:snapshot"),
  manifestHash: hex64("startup_facts_v1:v3:manifest"),
  truthLabels: "complete",
  supportLabelsDone: 24,
  supportLabelsTotal: 24,
  repairLabelQueue: 0,
  casesNatural: 2,
  casesPerturbed: 1,
  cases: v3Cases,
  initialMetrics: initialMetrics(v3Cases, 0),
  repairMetrics: repairMetrics(v3Cases, 0),
  // Task acquired once during dataset prep. Attributed: A = Task, B = A + initial judge,
  // C = B + repair. Actual experiment spend = judge + repair = C - A.
  spendActualUsd: "0.700000",
  spendAttributed: [
    { policy: "baseline", usd: "0.540000" },
    { policy: "verify", usd: "0.980000" },
    { policy: "verify_and_repair", usd: "1.240000" },
  ],
  events: [
    { at: "2026-09-20T12:00:00Z", kind: "evaluation.queued", detail: "Experiment queued against dataset v3." },
    { at: "2026-09-20T12:00:05Z", kind: "evaluation.validating", detail: "Snapshot and manifest hashes match; labels are complete." },
    { at: "2026-09-20T12:40:00Z", kind: "evaluation.running", detail: "Branch A and B finished for 3 cases; C copied B initial verdicts." },
    { at: "2026-09-20T13:10:00Z", kind: "evaluation.complete", detail: "All branches finished; repair labels reviewed." },
  ],
};

const v4Cases: EvalCase[] = [
  evalCase("case-dunmore", "Dunmore Marine", "natural", 7, counts(4, 2, 1), counts(5, 1, 1)),
  evalCase("case-evergreen", "Evergreen Mills", "natural", 7, counts(5, 2, 0), counts(6, 1, 0)),
  evalCase("case-fenwick", "Fenwick Labs", "natural", 7, counts(5, 1, 1), counts(5, 1, 1)),
];

const v4: EvaluationView = {
  id: "9a1d6b37-8c20-4e5f-b4d8-6f3a0c7e1925",
  datasetVersion: "v4-draft",
  status: "needs_review",
  preview: true,
  snapshotHash: hex64("startup_facts_v1:v4-draft:snapshot"),
  manifestHash: hex64("startup_facts_v1:v4-draft:manifest"),
  truthLabels: "draft",
  supportLabelsDone: 14,
  supportLabelsTotal: 21,
  repairLabelQueue: 3,
  casesNatural: 3,
  casesPerturbed: 0,
  cases: v4Cases,
  initialMetrics: initialMetrics(v4Cases, 7),
  repairMetrics: repairMetrics(v4Cases, 3),
  spendActualUsd: "0.480000",
  spendAttributed: [
    { policy: "baseline", usd: "0.390000" },
    { policy: "verify", usd: "0.700000" },
    { policy: "verify_and_repair", usd: "0.870000" },
  ],
  events: [
    { at: "2026-10-10T09:00:00Z", kind: "evaluation.queued", detail: "Preview experiment queued against draft dataset v4-draft." },
    { at: "2026-10-10T09:00:06Z", kind: "evaluation.validating", detail: "Draft labels accepted for preview only." },
    { at: "2026-10-10T09:35:00Z", kind: "evaluation.running", detail: "Branches finished for 3 cases." },
    { at: "2026-10-10T09:50:00Z", kind: "evaluation.needs_review", detail: "7 support labels and 3 repair labels are pending; metrics are not publishable." },
  ],
};

export const EVALUATIONS: readonly EvaluationView[] = [v3, v4];
