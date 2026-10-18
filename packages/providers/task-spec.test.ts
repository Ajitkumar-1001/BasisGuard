import { STARTUP_FACTS_V1_OUTPUT_SCHEMA } from "@basisguard/core";
import { describe, expect, it } from "vitest";
import { buildTaskRunCreateRequest } from "./task-spec";

const base = {
  companyName: "Example Corp", profileVersion: "startup_facts_v1", asOfDate: "2026-10-17",
  processor: "base", requestKey: "6f2c1c9e-1d7e-4c47-9a3a-1b1b6f0a9f11",
} as const;

describe("buildTaskRunCreateRequest", () => {
  it("builds the documented /v1/tasks/runs body", () => {
    expect(buildTaskRunCreateRequest({ ...base, officialDomain: "example.com" })).toEqual({
      input: { company_name: "Example Corp", official_domain: "example.com", as_of_date: "2026-10-17" },
      processor: "base",
      task_spec: { output_schema: { type: "json", json_schema: STARTUP_FACTS_V1_OUTPUT_SCHEMA } },
      metadata: { basisguard_request_key: base.requestKey, basisguard_profile: "startup_facts_v1" },
    });
  });

  it("omits official_domain when absent and stays under the 25,000-char total limit", () => {
    const req = buildTaskRunCreateRequest(base);
    expect(req.input).not.toHaveProperty("official_domain");
    expect(JSON.stringify(req).length).toBeLessThan(25_000);
  });
});
