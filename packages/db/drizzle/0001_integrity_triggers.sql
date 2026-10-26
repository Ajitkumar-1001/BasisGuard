CREATE FUNCTION basisguard_forbid_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only/immutable (% blocked)', TG_TABLE_NAME, TG_OP;
END $$;
--> statement-breakpoint
CREATE TRIGGER provider_artifacts_immutable BEFORE UPDATE OR DELETE ON provider_artifacts
  FOR EACH ROW EXECUTE FUNCTION basisguard_forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER run_events_append_only BEFORE UPDATE OR DELETE ON run_events
  FOR EACH ROW EXECUTE FUNCTION basisguard_forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER usage_events_append_only BEFORE UPDATE OR DELETE ON usage_events
  FOR EACH ROW EXECUTE FUNCTION basisguard_forbid_mutation();
--> statement-breakpoint
CREATE FUNCTION basisguard_run_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IN ('complete', 'needs_review', 'failed') AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'research_runs %: terminal status % cannot change to %', OLD.id, OLD.status, NEW.status;
  END IF;
  IF OLD.provider_run_id IS NOT NULL AND NEW.provider_run_id IS DISTINCT FROM OLD.provider_run_id THEN
    RAISE EXCEPTION 'research_runs %: provider_run_id is write-once', OLD.id;
  END IF;
  IF OLD.source_task_artifact_id IS NOT NULL AND NEW.source_task_artifact_id IS DISTINCT FROM OLD.source_task_artifact_id THEN
    RAISE EXCEPTION 'research_runs %: source_task_artifact_id is write-once', OLD.id;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER research_runs_guard BEFORE UPDATE ON research_runs
  FOR EACH ROW EXECUTE FUNCTION basisguard_run_guard();
