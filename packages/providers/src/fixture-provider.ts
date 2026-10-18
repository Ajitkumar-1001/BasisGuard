import fixtureResult from "./fixtures/task-result.startup-facts-v1.json";
import { ProviderError } from "./errors";
import { buildTaskRunCreateRequest } from "./task-spec";
import type { ProviderRunStatus, ResearchProvider, ResearchTaskInput } from "./types";

export const FIXTURE_ORIGIN = "hand-authored:parallel-web@1.3.5-types";

type Scenario = "ok" | "task_failed" | "bad_result";
const SCENARIO_BY_COMPANY: Record<string, Scenario | "create_auth_error"> = {
  "Fixture Task Failure": "task_failed",
  "Fixture Auth Error": "create_auth_error",
  "Fixture Bad Result": "bad_result",
};
const ID_RE = /^fx_(ok|task_failed|bad_result)_[0-9a-f-]{36}$/;

/** Deterministic and stateless (scenario encoded in the run id) so separate worker processes agree. Zero network. */
export class FixtureResearchProvider implements ResearchProvider {
  readonly createCalls: ResearchTaskInput[] = [];

  async createStructuredTask(input: ResearchTaskInput) {
    this.createCalls.push(input);
    const scenario = SCENARIO_BY_COMPANY[input.companyName] ?? "ok";
    if (scenario === "create_auth_error") throw new ProviderError("provider_auth_error", "fixture: 401 Unauthorized", "no");
    const providerRunId = `fx_${scenario}_${input.requestKey}`;
    const rawRequest = buildTaskRunCreateRequest(input);
    return { providerRunId, rawRequest, rawResponse: { run_id: providerRunId, status: "queued", is_active: true, processor: input.processor } };
  }

  async getTaskStatus(providerRunId: string): Promise<ProviderRunStatus> {
    return this.scenarioOf(providerRunId) === "task_failed"
      ? { state: "failed", rawStatus: "failed", errorCode: "provider_task_failed" }
      : { state: "completed", rawStatus: "completed" };
  }

  async getTaskResult(providerRunId: string) {
    const scenario = this.scenarioOf(providerRunId);
    const raw = structuredClone(fixtureResult) as { run: { run_id: string }; output: Record<string, unknown> };
    raw.run.run_id = providerRunId;
    if (scenario === "bad_result") raw.output = { type: "text", content: "unstructured", basis: [] };
    return { raw };
  }

  private scenarioOf(providerRunId: string): Scenario {
    const m = ID_RE.exec(providerRunId);
    if (!m) throw new ProviderError("provider_bad_request", `fixture provider did not mint run id ${providerRunId}`, "no");
    return m[1] as Scenario;
  }
}
