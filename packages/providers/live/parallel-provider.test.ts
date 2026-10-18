import { describe, expect, it, vi } from "vitest";

// Stand-in SDK so no real module (and no network) is touched. Error classes mirror parallel-web's.
vi.mock("parallel-web", () => {
  class APIError extends Error { constructor(public status?: number, public headers?: Headers) { super(`status ${status}`); } }
  class AuthenticationError extends APIError {}
  class PermissionDeniedError extends APIError {}
  class BadRequestError extends APIError {}
  class UnprocessableEntityError extends APIError {}
  class RateLimitError extends APIError {}
  class InternalServerError extends APIError {}
  class APIConnectionError extends APIError {}
  class APIConnectionTimeoutError extends APIConnectionError {}
  const Parallel = Object.assign(vi.fn(), {
    APIError, AuthenticationError, PermissionDeniedError, BadRequestError, UnprocessableEntityError,
    RateLimitError, InternalServerError, APIConnectionError, APIConnectionTimeoutError,
  });
  return { default: Parallel };
});

const { default: Parallel } = await import("parallel-web");
const { createParallelProvider, mapSdkError } = await import("./parallel-provider");
const P = Parallel as unknown as Record<string, new (...a: unknown[]) => Error>;

describe("live Parallel adapter", () => {
  it("constructs the SDK with maxRetries 0 (D-005) and a pinned base URL", () => {
    createParallelProvider("pk");
    expect(Parallel).toHaveBeenCalledWith(expect.objectContaining({ apiKey: "pk", maxRetries: 0, baseURL: "https://api.parallel.ai" }));
  });

  it("maps definitive rejections to submitted='no' and ambiguous failures to 'unknown'", () => {
    expect(mapSdkError(new P.AuthenticationError!(401))).toMatchObject({ code: "provider_auth_error", submitted: "no" });
    expect(mapSdkError(new P.PermissionDeniedError!(403))).toMatchObject({ code: "provider_auth_error", submitted: "no" });
    expect(mapSdkError(new P.BadRequestError!(400))).toMatchObject({ code: "provider_bad_request", submitted: "no" });
    expect(mapSdkError(new P.UnprocessableEntityError!(422))).toMatchObject({ code: "provider_bad_request", submitted: "no" });
    expect(mapSdkError(new P.RateLimitError!(429, new Headers({ "retry-after": "7" })))).toMatchObject({ code: "provider_rate_limited", submitted: "no", retryAfterMs: 7000 });
    expect(mapSdkError(new P.InternalServerError!(502))).toMatchObject({ code: "provider_unavailable", submitted: "unknown" });
    expect(mapSdkError(new P.APIConnectionTimeoutError!())).toMatchObject({ code: "provider_unavailable", submitted: "unknown" });
    expect(mapSdkError(new Error("weird"))).toMatchObject({ code: "provider_unavailable", submitted: "unknown" });
  });

  it("uses taskRun.create/retrieve/result with the built request", async () => {
    const client = {
      taskRun: {
        create: vi.fn().mockResolvedValue({ run_id: "trun_1", status: "queued" }),
        retrieve: vi.fn().mockResolvedValue({ run_id: "trun_1", status: "running" }),
        result: vi.fn().mockResolvedValue({ run: { run_id: "trun_1" }, output: { type: "json" } }),
      },
    };
    const p = createParallelProvider("pk", client);
    const out = await p.createStructuredTask({ companyName: "Example Corp", profileVersion: "startup_facts_v1", asOfDate: "2026-10-17", processor: "base", requestKey: "k" });
    expect(out.providerRunId).toBe("trun_1");
    expect(client.taskRun.create).toHaveBeenCalledWith(expect.objectContaining({ processor: "base", task_spec: expect.any(Object) }));
    expect(await p.getTaskStatus("trun_1")).toEqual({ state: "pending", rawStatus: "running" });
    await p.getTaskResult("trun_1");
    expect(client.taskRun.result).toHaveBeenCalledWith("trun_1", { timeout: 30 });
  });
});
