import { describe, expect, it } from "vitest";
import { RunStatus } from "@basisguard/contracts";
import {
  CLAIM_VERDICTS,
  EVAL_STATUSES,
  FIELD_ACTIONS,
  FIELD_STATES,
  REPAIR_STATES,
  REVIEW_DECISIONS,
} from "./types";
import {
  ACTION_META,
  EVAL_STATUS_META,
  FIELD_STATE_META,
  REPAIR_META,
  REVIEW_META,
  RUN_STATUS_META,
  VERDICT_META,
} from "./status";

const DOMAINS: [string, readonly string[], Record<string, { label: string }>][] = [
  ["run status", RunStatus.options, RUN_STATUS_META],
  ["verdict", CLAIM_VERDICTS, VERDICT_META],
  ["action", FIELD_ACTIONS, ACTION_META],
  ["field state", FIELD_STATES, FIELD_STATE_META],
  ["repair", REPAIR_STATES, REPAIR_META],
  ["review", REVIEW_DECISIONS, REVIEW_META],
  ["eval status", EVAL_STATUSES, EVAL_STATUS_META],
];

describe("status vocabulary", () => {
  for (const [name, values, meta] of DOMAINS) {
    it(`${name}: every value has a non-empty label, tone and icon`, () => {
      for (const v of values) {
        const m = meta[v] as { label: string; tone: string; icon: string } | undefined;
        expect(m, `${name}.${v}`).toBeDefined();
        expect(m!.label.length).toBeGreaterThan(0);
        expect(m!.tone.length).toBeGreaterThan(0);
        expect(m!.icon.length).toBeGreaterThan(0);
      }
      expect(Object.keys(meta).sort()).toEqual([...values].sort());
    });
  }

  it("uses the exact spec labels", () => {
    expect(RUN_STATUS_META.needs_review.label).toBe("Needs review");
    expect(VERDICT_META.evidence_unavailable.label).toBe("Evidence unavailable");
    expect(REPAIR_META.already_retried.label).toBe("Already repaired");
    expect(REPAIR_META.policy_disabled.label).toBe("Disabled by policy");
    expect(REVIEW_META.needs_followup.label).toBe("Needs follow-up");
    expect(FIELD_STATE_META.unverified.label).toBe("Unverified");
    expect(EVAL_STATUS_META.awaiting_repair_review.label).toBe("Awaiting repair review");
  });
});
