import { STARTUP_FACTS_V1_OUTPUT_SCHEMA } from "@basisguard/core";
import type { ResearchTaskInput } from "./types";

/** Structural mirror of parallel-web TaskRunCreateParams (subset we send). Checked against the SDK type in live/ and the probe. */
export type TaskRunCreateRequest = {
  input: { company_name: string; official_domain?: string; as_of_date: string };
  processor: string;
  task_spec: { output_schema: { type: "json"; json_schema: Record<string, unknown> } };
  metadata: { basisguard_request_key: string; basisguard_profile: "startup_facts_v1" };
};

export function buildTaskRunCreateRequest(i: ResearchTaskInput): TaskRunCreateRequest {
  return {
    input: {
      company_name: i.companyName,
      ...(i.officialDomain ? { official_domain: i.officialDomain } : {}),
      as_of_date: i.asOfDate,
    },
    processor: i.processor,
    task_spec: { output_schema: { type: "json", json_schema: STARTUP_FACTS_V1_OUTPUT_SCHEMA } },
    metadata: { basisguard_request_key: i.requestKey, basisguard_profile: i.profileVersion },
  };
}
