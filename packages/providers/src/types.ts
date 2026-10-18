import type { Processor } from "@basisguard/contracts";

export type ResearchTaskInput = {
  companyName: string;
  officialDomain?: string;
  profileVersion: "startup_facts_v1";
  asOfDate: string;
  processor: Processor;
  requestKey: string;
};

export type ProviderRunStatus =
  | { state: "pending"; rawStatus: string }
  | { state: "completed"; rawStatus: string }
  | { state: "failed"; rawStatus: string; errorCode: "provider_task_failed" | "provider_action_required" };

/** Application-owned interface (PRD §6.2), NOT the upstream wire schema. Search/Extract land in Phase 2/4. */
export interface ResearchProvider {
  createStructuredTask(input: ResearchTaskInput): Promise<{ providerRunId: string; rawRequest: unknown; rawResponse: unknown }>;
  getTaskStatus(providerRunId: string): Promise<ProviderRunStatus>;
  /** Untouched upstream TaskRunResult JSON. */
  getTaskResult(providerRunId: string): Promise<{ raw: unknown }>;
}
