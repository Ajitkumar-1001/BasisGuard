import type { EvaluationView, RunView } from "@/ui/view-models";
import { EVALUATIONS } from "./evaluations";
import { FIXTURE_RUNS } from "./runs";

/** Synchronous ids for generateStaticParams. */
export const FIXTURE_RUN_IDS: readonly string[] = FIXTURE_RUNS.map((r) => r.id);
export const EVALUATION_IDS: readonly string[] = EVALUATIONS.map((e) => e.id);

export async function listFixtureRuns(): Promise<RunView[]> {
  return [...FIXTURE_RUNS];
}

export async function getFixtureRun(id: string): Promise<RunView | undefined> {
  return FIXTURE_RUNS.find((r) => r.id === id);
}

export async function listEvaluations(): Promise<EvaluationView[]> {
  return [...EVALUATIONS];
}

export async function getEvaluation(id: string): Promise<EvaluationView | undefined> {
  return EVALUATIONS.find((e) => e.id === id);
}
