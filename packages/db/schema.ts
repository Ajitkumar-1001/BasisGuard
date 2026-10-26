import { sql } from "drizzle-orm";
import {
  type AnyPgColumn, check, index, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, unique, uuid,
} from "drizzle-orm/pg-core";
import { ArtifactKind, CostKind, JobStatus, JobType, Policy, RunStatus } from "@basisguard/contracts";

/** Zod 4 types `.options` as `T[]`; pgEnum needs a non-empty tuple. z.enum() is never empty, so this is sound. */
const values = <T extends string>(e: { options: readonly T[] }): [T, ...T[]] => e.options as [T, ...T[]];

export const policyVersionEnum = pgEnum("policy_version", values(Policy));
export const runStatusEnum = pgEnum("run_status", values(RunStatus));
export const artifactKindEnum = pgEnum("artifact_kind", values(ArtifactKind));
export const jobTypeEnum = pgEnum("job_type", values(JobType));
export const jobStatusEnum = pgEnum("job_status", values(JobStatus));
export const costKindEnum = pgEnum("cost_kind", values(CostKind));
export const budgetScopeEnum = pgEnum("budget_scope_type", ["run", "experiment"]);
export const reservationStatusEnum = pgEnum("reservation_status", ["active", "reconciled", "released"]);

const tstz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const usd = (name: string) => numeric(name, { precision: 12, scale: 6 });

export const providerArtifacts = pgTable(
  "provider_artifacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerRunId: uuid("owner_run_id"),
    kind: artifactKindEnum("kind").notNull(),
    rawJson: jsonb("raw_json").notNull(),
    contentHash: text("content_hash").notNull(),
    fixtureOrigin: text("fixture_origin"),
    createdAt: tstz("created_at").notNull().defaultNow(),
  },
  (t) => [unique("provider_artifacts_kind_hash_uq").on(t.kind, t.contentHash), index("provider_artifacts_kind_hash_idx").on(t.kind, t.contentHash)],
);

export const researchRuns = pgTable(
  "research_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestKey: uuid("request_key").notNull().unique(),
    requestBodyHash: text("request_body_hash").notNull(),
    inputJson: jsonb("input_json").notNull(),
    policyVersion: policyVersionEnum("policy_version").notNull(),
    providerProcessor: text("provider_processor").notNull(),
    providerRunId: text("provider_run_id"),
    sourceTaskArtifactId: uuid("source_task_artifact_id").references(() => providerArtifacts.id),
    parentRunId: uuid("parent_run_id").references((): AnyPgColumn => researchRuns.id),
    experimentId: uuid("experiment_id"),
    caseId: uuid("case_id"),
    variantKey: text("variant_key"),
    status: runStatusEnum("status").notNull().default("queued"),
    errorCode: text("error_code"),
    maxProviderCalls: integer("max_provider_calls").notNull(),
    maxEstimatedUsd: usd("max_estimated_usd").notNull(),
    rateCardSha256: text("rate_card_sha256"),
    deadlineAt: tstz("deadline_at").notNull(),
    createdAt: tstz("created_at").notNull().defaultNow(),
    updatedAt: tstz("updated_at").notNull().defaultNow(),
    completedAt: tstz("completed_at"),
  },
  (t) => [index("research_runs_status_created_idx").on(t.status, t.createdAt)],
);

export const jobQueue = pgTable(
  "job_queue",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id").references(() => researchRuns.id),
    experimentId: uuid("experiment_id"),
    jobType: jobTypeEnum("job_type").notNull(),
    status: jobStatusEnum("status").notNull().default("pending"),
    dedupeKey: text("dedupe_key").notNull().unique(),
    leaseOwner: text("lease_owner"),
    leaseUntil: tstz("lease_until"),
    leaseVersion: integer("lease_version").notNull().default(0),
    attemptCount: integer("attempt_count").notNull().default(0),
    availableAt: tstz("available_at").notNull().defaultNow(),
    lastError: text("last_error"),
    createdAt: tstz("created_at").notNull().defaultNow(),
    updatedAt: tstz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("job_queue_ready_idx").on(t.status, t.availableAt),
    index("job_queue_lease_idx").on(t.status, t.leaseUntil),
    check("job_queue_owner_ck", sql`${t.runId} IS NOT NULL OR ${t.experimentId} IS NOT NULL`),
  ],
);

export const runEvents = pgTable(
  "run_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id").references(() => researchRuns.id),
    experimentId: uuid("experiment_id"),
    eventType: text("event_type").notNull(),
    detailsJson: jsonb("details_json").notNull().default({}),
    // clock_timestamp(): distinct, ordered timestamps even for events written in one transaction
    createdAt: tstz("created_at").notNull().default(sql`clock_timestamp()`),
  },
  (t) => [
    index("run_events_run_created_idx").on(t.runId, t.createdAt),
    check("run_events_owner_ck", sql`${t.runId} IS NOT NULL OR ${t.experimentId} IS NOT NULL`),
  ],
);

export const usageEvents = pgTable(
  "usage_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    createdAt: tstz("created_at").notNull().default(sql`clock_timestamp()`),
    requestId: text("request_id").notNull().unique(),
    runId: uuid("run_id").references(() => researchRuns.id),
    experimentId: uuid("experiment_id"),
    operation: text("operation").notNull(),
    vendor: text("vendor").notNull(),
    httpRequestCount: integer("http_request_count").notNull(),
    extractUrlUnits: integer("extract_url_units").notNull().default(0),
    costKind: costKindEnum("cost_kind").notNull(),
    usdDecimal: usd("usd_decimal").notNull(),
    rateCardVersion: text("rate_card_version"),
    latencyMs: integer("latency_ms"),
  },
  (t) => [index("usage_events_run_idx").on(t.runId)],
);

export const budgetReservations = pgTable(
  "budget_reservations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scopeType: budgetScopeEnum("scope_type").notNull(),
    scopeId: uuid("scope_id").notNull(),
    operationKey: text("operation_key").notNull().unique(),
    operation: text("operation").notNull(),
    providerCallUnits: integer("provider_call_units").notNull(),
    extractUrlUnits: integer("extract_url_units").notNull().default(0),
    reservedUsd: usd("reserved_usd").notNull(),
    status: reservationStatusEnum("status").notNull().default("active"),
    createdAt: tstz("created_at").notNull().defaultNow(),
    updatedAt: tstz("updated_at").notNull().defaultNow(),
  },
  (t) => [index("budget_reservations_scope_idx").on(t.scopeType, t.scopeId, t.status)],
);
