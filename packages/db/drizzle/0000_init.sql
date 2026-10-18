CREATE TYPE "public"."artifact_kind" AS ENUM('task_request', 'task_result', 'search_response', 'extract_response', 'judge_request', 'judge_response');--> statement-breakpoint
CREATE TYPE "public"."budget_scope_type" AS ENUM('run', 'experiment');--> statement-breakpoint
CREATE TYPE "public"."cost_kind" AS ENUM('reported', 'estimated', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('pending', 'leased', 'retry_wait', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."job_type" AS ENUM('acquire_task', 'evaluate_snapshot', 'reconcile_task', 'orchestrate_experiment');--> statement-breakpoint
CREATE TYPE "public"."policy_version" AS ENUM('baseline', 'verify', 'verify_and_repair');--> statement-breakpoint
CREATE TYPE "public"."reservation_status" AS ENUM('active', 'reconciled', 'released');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('queued', 'submitting', 'researching', 'verifying', 'repairing', 'complete', 'needs_review', 'failed');--> statement-breakpoint
CREATE TABLE "budget_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope_type" "budget_scope_type" NOT NULL,
	"scope_id" uuid NOT NULL,
	"operation_key" text NOT NULL,
	"operation" text NOT NULL,
	"provider_call_units" integer NOT NULL,
	"extract_url_units" integer DEFAULT 0 NOT NULL,
	"reserved_usd" numeric(12, 6) NOT NULL,
	"status" "reservation_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budget_reservations_operation_key_unique" UNIQUE("operation_key")
);
--> statement-breakpoint
CREATE TABLE "job_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid,
	"experiment_id" uuid,
	"job_type" "job_type" NOT NULL,
	"status" "job_status" DEFAULT 'pending' NOT NULL,
	"dedupe_key" text NOT NULL,
	"lease_owner" text,
	"lease_until" timestamp with time zone,
	"lease_version" integer DEFAULT 0 NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_queue_dedupe_key_unique" UNIQUE("dedupe_key"),
	CONSTRAINT "job_queue_owner_ck" CHECK ("job_queue"."run_id" IS NOT NULL OR "job_queue"."experiment_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "provider_artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_run_id" uuid,
	"kind" "artifact_kind" NOT NULL,
	"raw_json" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"fixture_origin" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_artifacts_kind_hash_uq" UNIQUE("kind","content_hash")
);
--> statement-breakpoint
CREATE TABLE "research_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_key" uuid NOT NULL,
	"request_body_hash" text NOT NULL,
	"input_json" jsonb NOT NULL,
	"policy_version" "policy_version" NOT NULL,
	"provider_processor" text NOT NULL,
	"provider_run_id" text,
	"source_task_artifact_id" uuid,
	"parent_run_id" uuid,
	"experiment_id" uuid,
	"case_id" uuid,
	"variant_key" text,
	"status" "run_status" DEFAULT 'queued' NOT NULL,
	"error_code" text,
	"max_provider_calls" integer NOT NULL,
	"max_estimated_usd" numeric(12, 6) NOT NULL,
	"rate_card_sha256" text,
	"deadline_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "research_runs_request_key_unique" UNIQUE("request_key")
);
--> statement-breakpoint
CREATE TABLE "run_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid,
	"experiment_id" uuid,
	"event_type" text NOT NULL,
	"details_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "run_events_owner_ck" CHECK ("run_events"."run_id" IS NOT NULL OR "run_events"."experiment_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "usage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	"request_id" text NOT NULL,
	"run_id" uuid,
	"experiment_id" uuid,
	"operation" text NOT NULL,
	"vendor" text NOT NULL,
	"http_request_count" integer NOT NULL,
	"extract_url_units" integer DEFAULT 0 NOT NULL,
	"cost_kind" "cost_kind" NOT NULL,
	"usd_decimal" numeric(12, 6) NOT NULL,
	"rate_card_version" text,
	"latency_ms" integer,
	CONSTRAINT "usage_events_request_id_unique" UNIQUE("request_id")
);
--> statement-breakpoint
ALTER TABLE "job_queue" ADD CONSTRAINT "job_queue_run_id_research_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."research_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_runs" ADD CONSTRAINT "research_runs_source_task_artifact_id_provider_artifacts_id_fk" FOREIGN KEY ("source_task_artifact_id") REFERENCES "public"."provider_artifacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_runs" ADD CONSTRAINT "research_runs_parent_run_id_research_runs_id_fk" FOREIGN KEY ("parent_run_id") REFERENCES "public"."research_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_events" ADD CONSTRAINT "run_events_run_id_research_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."research_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_run_id_research_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."research_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "budget_reservations_scope_idx" ON "budget_reservations" USING btree ("scope_type","scope_id","status");--> statement-breakpoint
CREATE INDEX "job_queue_ready_idx" ON "job_queue" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX "job_queue_lease_idx" ON "job_queue" USING btree ("status","lease_until");--> statement-breakpoint
CREATE INDEX "provider_artifacts_kind_hash_idx" ON "provider_artifacts" USING btree ("kind","content_hash");--> statement-breakpoint
CREATE INDEX "research_runs_status_created_idx" ON "research_runs" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "run_events_run_created_idx" ON "run_events" USING btree ("run_id","created_at");--> statement-breakpoint
CREATE INDEX "usage_events_run_idx" ON "usage_events" USING btree ("run_id");