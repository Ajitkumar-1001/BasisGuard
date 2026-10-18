import { describe, expect, it } from "vitest";
import { ProviderError } from "./errors";
import { FixtureResearchProvider } from "./fixture-provider";

const input = (companyName: string) => ({ companyName, profileVersion: "startup_facts_v1" as const, asOfDate: "2026-10-17", processor: "base" as const, requestKey: "6f2c1c9e-1d7e-4c47-9a3a-1b1b6f0a9f11" });

describe("FixtureResearchProvider (stateless, zero network)", () => {
  it("completes the default scenario with the pinned fixture result", async () => {
    const p = new FixtureResearchProvider();
    const { providerRunId, rawRequest } = await p.createStructuredTask(input("Example Corp"));
    expect(rawRequest).toMatchObject({ processor: "base", metadata: { basisguard_request_key: input("x").requestKey } });
    expect(await p.getTaskStatus(providerRunId)).toEqual({ state: "completed", rawStatus: "completed" });
    const { raw } = await p.getTaskResult(providerRunId);
    expect(raw).toMatchObject({ run: { run_id: providerRunId }, output: { type: "json" } });
    expect(p.createCalls).toHaveLength(1);
  });

  it("is stateless across instances (worker restarts)", async () => {
    const { providerRunId } = await new FixtureResearchProvider().createStructuredTask(input("Example Corp"));
    expect((await new FixtureResearchProvider().getTaskStatus(providerRunId)).state).toBe("completed");
  });

  it("drives failure scenarios by company name", async () => {
    const p = new FixtureResearchProvider();
    await expect(p.createStructuredTask(input("Fixture Auth Error"))).rejects.toMatchObject({ code: "provider_auth_error", submitted: "no" });
    const failed = await p.createStructuredTask(input("Fixture Task Failure"));
    expect(await p.getTaskStatus(failed.providerRunId)).toEqual({ state: "failed", rawStatus: "failed", errorCode: "provider_task_failed" });
    const bad = await p.createStructuredTask(input("Fixture Bad Result"));
    expect((await p.getTaskResult(bad.providerRunId)).raw).toMatchObject({ output: { type: "text" } });
  });

  it("rejects provider run ids it did not mint", async () => {
    await expect(new FixtureResearchProvider().getTaskStatus("trun_real")).rejects.toBeInstanceOf(ProviderError);
  });
});
