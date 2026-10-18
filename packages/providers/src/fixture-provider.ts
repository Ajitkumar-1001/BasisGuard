import fixtureResult from "./fixtures/task-result.startup-facts-v1.json";
import { ProviderError } from "./errors";
import { buildTaskRunCreateRequest } from "./task-spec";
import type { ProviderRunStatus, ResearchProvider, ResearchTaskInput } from "./types";

export const FIXTURE_ORIGIN = "hand-authored:parallel-web@1.3.5-types";

/**
 * How long a "Fixture Slow Task" run reports `pending` after its create. Gives E2E a deterministic
 * `researching` window (the worker sleeps its poll delay between status reads) for restart tests.
 */
export const FIXTURE_SLOW_PENDING_MS = 4_000;

type Scenario = "ok" | "task_failed" | "bad_result" | "slow";
const SCENARIO_BY_COMPANY: Record<string, Scenario | "create_auth_error"> = {
  "Fixture Task Failure": "task_failed",
  "Fixture Auth Error": "create_auth_error",
  "Fixture Bad Result": "bad_result",
  "Fixture Slow Task": "slow",
};
// slow ids carry their create time (epoch ms) so any process can tell when the pending window ends.
const ID_RE = /^fx_(?:(ok|task_failed|bad_result)|slow_(\d{1,16}))_[0-9a-f-]{36}$/;

/** Deterministic and stateless (scenario encoded in the run id) so separate worker processes agree. Zero network. */
export class FixtureResearchProvider implements ResearchProvider {
  readonly createCalls: ResearchTaskInput[] = [];
  private readonly now: () => number;

  constructor(o: { now?: () => number } = {}) {
    this.now = o.now ?? Date.now;
  }

  async createStructuredTask(input: ResearchTaskInput) {
    this.createCalls.push(input);
    const scenario = SCENARIO_BY_COMPANY[input.companyName] ?? "ok";
    if (scenario === "create_auth_error") throw new ProviderError("provider_auth_error", "fixture: 401 Unauthorized", "no");
    const providerRunId = scenario === "slow" ? `fx_slow_${this.now()}_${input.requestKey}` : `fx_${scenario}_${input.requestKey}`;
    const rawRequest = buildTaskRunCreateRequest(input);
    return { providerRunId, rawRequest, rawResponse: { run_id: providerRunId, status: "queued", is_active: true, processor: input.processor } };
  }

  async getTaskStatus(providerRunId: string): Promise<ProviderRunStatus> {
    const { scenario, mintedAtMs } = this.parse(providerRunId);
    if (scenario === "task_failed") return { state: "failed", rawStatus: "failed", errorCode: "provider_task_failed" };
    if (scenario === "slow" && this.now() < mintedAtMs + FIXTURE_SLOW_PENDING_MS) return { state: "pending", rawStatus: "running" };
    return { state: "completed", rawStatus: "completed" };
  }

  async getTaskResult(providerRunId: string) {
    const { scenario } = this.parse(providerRunId);
    const raw = structuredClone(fixtureResult) as { run: { run_id: string }; output: Record<string, unknown> };
    raw.run.run_id = providerRunId;
    if (scenario === "bad_result") raw.output = { type: "text", content: "unstructured", basis: [] };
    return { raw };
  }

  private parse(providerRunId: string): { scenario: Scenario; mintedAtMs: number } {
    const m = ID_RE.exec(providerRunId);
    if (!m) throw new ProviderError("provider_bad_request", `fixture provider did not mint run id ${providerRunId}`, "no");
    return m[2] !== undefined ? { scenario: "slow", mintedAtMs: Number(m[2]) } : { scenario: m[1] as Scenario, mintedAtMs: 0 };
  }
}
