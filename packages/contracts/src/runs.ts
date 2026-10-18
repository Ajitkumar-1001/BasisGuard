import { z } from "zod";
import { Policy, Processor, type RunStatus } from "./enums";
import { UsdDecimal, microsToUsd, usdToMicros } from "./money";

export const MAX_RUN_USD = "5.00";

// RFC 1123 hostname with at least one dot; no scheme, port or path.
const HOSTNAME = /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;

const IsoCalendarDate = z.iso
  .date()
  .refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().startsWith(d), "not a real calendar date");

const RunFields = {
  company_name: z.string().trim().min(2).max(120),
  official_domain: z.string().trim().toLowerCase().regex(HOSTNAME, "must be a bare hostname").optional(),
  profile: z.literal("startup_facts_v1"),
  processor: Processor.default("base"),
  policy: Policy,
  max_provider_calls: z.number().int().min(1).max(12).default(12),
  // pipe() so the cap check only runs once the regex passed (usdToMicros throws on malformed input).
  // Canonical 6-dp form keeps equal budgets byte-identical for request-body hashing.
  // Zod 4 .default() bypasses transforms, so the default is supplied pre-canonicalized.
  max_estimated_usd: UsdDecimal.pipe(
    z.string()
      .refine((v) => usdToMicros(v) <= usdToMicros(MAX_RUN_USD), `must be ≤ ${MAX_RUN_USD}`)
      .transform((v) => microsToUsd(usdToMicros(v))),
  ).default(microsToUsd(usdToMicros(MAX_RUN_USD))),
  deadline_minutes: z.number().int().min(1).max(120).default(30),
};

export const CreateRunRequest = z
  .object({ request_key: z.uuid(), ...RunFields, as_of_date: IsoCalendarDate.optional() })
  .strict();
export type CreateRunRequest = z.infer<typeof CreateRunRequest>;

/** What research_runs.input_json holds: the validated body with as_of_date frozen at creation. */
export const StoredRunInput = z.object({ ...RunFields, as_of_date: IsoCalendarDate }).strict();
export type StoredRunInput = z.infer<typeof StoredRunInput>;

export const ApiErrorCode = z.enum([
  "invalid_request", "idempotency_conflict", "replay_read_only", "not_found", "policy_unavailable", "internal_error",
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCode>;
export type ApiError = { code: ApiErrorCode; message: string; requestId: string; issues?: unknown };
export type RunSummary = { runId: string; status: RunStatus };
