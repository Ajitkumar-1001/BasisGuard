import type { RunStatus } from "@basisguard/contracts";
import type {
  ClaimVerdict,
  EvalStatus,
  FieldAction,
  FieldState,
  RepairState,
  ReviewDecision,
} from "./types";

export type Tone = "moss" | "ochre" | "brick" | "plum" | "slate";
export type IconName = "check" | "x" | "minus" | "flag" | "alert" | "clock" | "progress" | "link-off" | "dash";
export type StatusMeta = { label: string; tone: Tone; icon: IconName };

const m = (label: string, tone: Tone, icon: IconName): StatusMeta => ({ label, tone, icon });

export const TONE_CLASSES: Record<Tone, string> = {
  moss: "bg-moss-tint text-moss",
  ochre: "bg-ochre-tint text-ochre",
  brick: "bg-brick-tint text-brick",
  plum: "bg-plum-tint text-plum",
  slate: "bg-slate-tint text-slate",
};

export const RUN_STATUS_META: Record<RunStatus, StatusMeta> = {
  queued: m("Queued", "slate", "clock"),
  submitting: m("Submitting", "slate", "progress"),
  researching: m("Researching", "slate", "progress"),
  verifying: m("Verifying", "slate", "progress"),
  repairing: m("Repairing", "slate", "progress"),
  complete: m("Complete", "moss", "check"),
  needs_review: m("Needs review", "plum", "flag"),
  failed: m("Failed", "brick", "x"),
};

export const VERDICT_META: Record<ClaimVerdict, StatusMeta> = {
  supported: m("Supported", "moss", "check"),
  insufficient_evidence: m("Insufficient evidence", "ochre", "minus"),
  evidence_unavailable: m("Evidence unavailable", "ochre", "link-off"),
  contradicted: m("Contradicted", "brick", "x"),
  verification_failed: m("Verification failed", "plum", "alert"),
  decomposition_failed: m("Decomposition failed", "plum", "alert"),
};

export const ACTION_META: Record<FieldAction, StatusMeta> = {
  accept: m("Accept", "moss", "check"),
  abstain: m("Abstain", "ochre", "minus"),
  review: m("Review", "plum", "flag"),
};

export const FIELD_STATE_META: Record<FieldState, StatusMeta> = {
  unverified: m("Unverified", "slate", "dash"),
  unanswered: m("Unanswered", "slate", "dash"),
};

export const REPAIR_META: Record<RepairState, StatusMeta> = {
  not_eligible: m("Not eligible", "slate", "dash"),
  policy_disabled: m("Disabled by policy", "slate", "dash"),
  already_retried: m("Already repaired", "slate", "dash"),
  budget_exhausted: m("Budget exhausted", "ochre", "minus"),
  succeeded: m("Repair succeeded", "moss", "check"),
  failed: m("Repair failed", "brick", "x"),
};

export const REVIEW_META: Record<ReviewDecision, StatusMeta> = {
  approved: m("Approved", "moss", "check"),
  rejected: m("Rejected", "brick", "x"),
  needs_followup: m("Needs follow-up", "ochre", "flag"),
};

export const EVAL_STATUS_META: Record<EvalStatus, StatusMeta> = {
  queued: m("Queued", "slate", "clock"),
  validating: m("Validating", "slate", "progress"),
  running: m("Running", "slate", "progress"),
  awaiting_repair_review: m("Awaiting repair review", "plum", "flag"),
  complete: m("Complete", "moss", "check"),
  needs_review: m("Needs review", "plum", "flag"),
  failed: m("Failed", "brick", "x"),
};
