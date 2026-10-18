export const CLAIM_VERDICTS = [
  "supported",
  "insufficient_evidence",
  "evidence_unavailable",
  "contradicted",
  "verification_failed",
  "decomposition_failed",
] as const;
export type ClaimVerdict = (typeof CLAIM_VERDICTS)[number];

export const FIELD_ACTIONS = ["accept", "abstain", "review"] as const;
export type FieldAction = (typeof FIELD_ACTIONS)[number];

export const FIELD_STATES = ["unverified", "unanswered"] as const;
export type FieldState = (typeof FIELD_STATES)[number];

export const REPAIR_STATES = [
  "not_eligible",
  "policy_disabled",
  "already_retried",
  "budget_exhausted",
  "succeeded",
  "failed",
] as const;
export type RepairState = (typeof REPAIR_STATES)[number];

export const REVIEW_DECISIONS = ["approved", "rejected", "needs_followup"] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

export const EVAL_STATUSES = [
  "queued",
  "validating",
  "running",
  "awaiting_repair_review",
  "complete",
  "needs_review",
  "failed",
] as const;
export type EvalStatus = (typeof EVAL_STATUSES)[number];
