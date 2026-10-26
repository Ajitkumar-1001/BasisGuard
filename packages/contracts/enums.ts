import { z } from "zod";

export const Policy = z.enum(["baseline", "verify", "verify_and_repair"]);
export type Policy = z.infer<typeof Policy>;

export const RunStatus = z.enum([
  "queued", "submitting", "researching", "verifying", "repairing", "complete", "needs_review", "failed",
]);
export type RunStatus = z.infer<typeof RunStatus>;
export const TERMINAL_RUN_STATUSES = ["complete", "needs_review", "failed"] as const satisfies readonly RunStatus[];
export const isTerminalRunStatus = (s: RunStatus): boolean =>
  (TERMINAL_RUN_STATUSES as readonly RunStatus[]).includes(s);

export const Processor = z.enum(["lite", "base", "core", "core2x", "pro", "ultra", "ultra2x", "ultra4x", "ultra8x"]);
export type Processor = z.infer<typeof Processor>;

export const RuntimeMode = z.enum(["live", "fixture", "replay"]);
export type RuntimeMode = z.infer<typeof RuntimeMode>;

export const ArtifactKind = z.enum([
  "task_request", "task_result", "search_response", "extract_response", "judge_request", "judge_response",
]);
export type ArtifactKind = z.infer<typeof ArtifactKind>;

export const JobType = z.enum(["acquire_task", "evaluate_snapshot", "reconcile_task", "orchestrate_experiment"]);
export type JobType = z.infer<typeof JobType>;

export const JobStatus = z.enum(["pending", "leased", "retry_wait", "succeeded", "failed"]);
export type JobStatus = z.infer<typeof JobStatus>;

export const CostKind = z.enum(["reported", "estimated", "unknown"]);
export type CostKind = z.infer<typeof CostKind>;

export const RunErrorCode = z.enum([
  "submission_unknown", "provider_auth_error", "provider_rate_limited", "provider_unavailable",
  "provider_bad_request", "provider_task_failed", "provider_action_required", "normalization_failed",
  "budget_exhausted", "cost_unknown", "deadline_exceeded", "max_attempts_exceeded",
]);
export type RunErrorCode = z.infer<typeof RunErrorCode>;
