import type { EvalCase, EvalMetric, EvaluationView } from "@/ui/view-models";
import { hex64 } from "./helpers";

function metric(
  label: string,
  numerator: number,
  denominator: number,
  nat: [number, number],
  syn: [number, number],
  missingLabels = 0,
  errors = 0,
): EvalMetric {
  return {
    label,
    numerator,
    denominator,
    missingLabels,
    errors,
    natural: { numerator: nat[0], denominator: nat[1] },
    synthetic: { numerator: syn[0], denominator: syn[1] },
  };
}

function evalCase(
  id: string,
  company: string,
  kind: EvalCase["kind"],
  b: EvalCase["b"],
  c: EvalCase["c"],
  perturbation?: string,
): EvalCase {
  const initial = hex64(`v3:${id}:initial`);
  return {
    id,
    company,
    kind,
    ...(perturbation ? { perturbation } : {}),
    aUnverified: 8,
    b,
    c,
    bInitialHash: initial,
    cInitialHash: initial,
    cPostRepair: hex64(`v3:${id}:post-repair`),
  };
}

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
  cases: [
    evalCase("case-northwind", "Northwind Robotics", "natural", { accept: 4, abstain: 2, review: 2 }, { accept: 5, abstain: 1, review: 2 }),
    evalCase("case-halcyon", "Halcyon Freight", "natural", { accept: 7, abstain: 1, review: 0 }, { accept: 7, abstain: 1, review: 0 }),
    evalCase("case-northwind-swap", "Northwind Robotics", "perturbed", { accept: 3, abstain: 2, review: 3 }, { accept: 3, abstain: 2, review: 3 }, "founder_swap"),
  ],
  initialMetrics: [
    metric("Scalar field accuracy", 14, 18, [10, 12], [4, 6]),
    metric("Unsupported accepted rate", 1, 14, [0, 10], [1, 4]),
    metric("Answer coverage", 20, 24, [14, 16], [6, 8]),
  ],
  repairMetrics: [
    metric("Repair precision", 1, 2, [1, 2], [0, 0]),
    metric("Recovery rate", 1, 3, [1, 3], [0, 0]),
  ],
  spendActualUsd: "1.240000",
  spendAttributed: [
    { policy: "baseline", usd: "0.540000" },
    { policy: "verify", usd: "0.980000" },
    { policy: "verify_and_repair", usd: "1.420000" },
  ],
  events: [
    { at: "2026-09-20T12:00:00Z", kind: "evaluation.queued", detail: "Experiment queued against dataset v3." },
    { at: "2026-09-20T12:00:05Z", kind: "evaluation.validating", detail: "Snapshot and manifest hashes match; labels are complete." },
    { at: "2026-09-20T12:40:00Z", kind: "evaluation.running", detail: "Branch A and B finished for 3 cases; C copied B initial verdicts." },
    { at: "2026-09-20T13:10:00Z", kind: "evaluation.complete", detail: "All branches finished; repair labels reviewed." },
  ],
};

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
  cases: [
    evalCase("case-tamarack", "Tamarack Bio", "natural", { accept: 5, abstain: 2, review: 1 }, { accept: 6, abstain: 1, review: 1 }),
    evalCase("case-lumen", "Lumen Ledger", "natural", { accept: 6, abstain: 1, review: 1 }, { accept: 6, abstain: 1, review: 1 }),
    evalCase("case-orchard", "Orchard Systems", "natural", { accept: 4, abstain: 3, review: 1 }, { accept: 5, abstain: 2, review: 1 }),
  ],
  initialMetrics: [
    metric("Scalar field accuracy", 9, 14, [9, 14], [0, 0], 7),
    metric("Unsupported accepted rate", 1, 10, [1, 10], [0, 0], 7),
    metric("Answer coverage", 17, 24, [17, 24], [0, 0]),
  ],
  repairMetrics: [
    metric("Repair precision", 0, 0, [0, 0], [0, 0], 3),
    metric("Recovery rate", 0, 0, [0, 0], [0, 0], 3),
  ],
  spendActualUsd: "0.870000",
  spendAttributed: [
    { policy: "baseline", usd: "0.390000" },
    { policy: "verify", usd: "0.700000" },
    { policy: "verify_and_repair", usd: "1.010000" },
  ],
  events: [
    { at: "2026-10-10T09:00:00Z", kind: "evaluation.queued", detail: "Preview experiment queued against draft dataset v4-draft." },
    { at: "2026-10-10T09:00:06Z", kind: "evaluation.validating", detail: "Draft labels accepted for preview only." },
    { at: "2026-10-10T09:35:00Z", kind: "evaluation.running", detail: "Branches finished for 3 cases." },
    { at: "2026-10-10T09:50:00Z", kind: "evaluation.needs_review", detail: "7 support labels and 3 repair labels are pending; metrics are not publishable." },
  ],
};

export const EVALUATIONS: readonly EvaluationView[] = [v3, v4];
