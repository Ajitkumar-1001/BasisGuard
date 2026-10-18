import Parallel from "parallel-web";
import { ProviderError } from "../errors";
import { createParallelClient } from "./client";
import { mapUpstreamStatus } from "../status";
import { buildTaskRunCreateRequest, type TaskRunCreateRequest } from "../task-spec";
import type { ResearchProvider } from "../types";

export type ParallelLike = {
  taskRun: {
    create(p: TaskRunCreateRequest): Promise<{ run_id: string }>;
    retrieve(id: string): Promise<{ status: string }>;
    result(id: string, p: { timeout: number }): Promise<unknown>;
  };
};

export function mapSdkError(e: unknown): ProviderError {
  const msg = e instanceof Error ? e.message : String(e);
  if (e instanceof Parallel.AuthenticationError || e instanceof Parallel.PermissionDeniedError) return new ProviderError("provider_auth_error", msg, "no");
  if (e instanceof Parallel.BadRequestError || e instanceof Parallel.UnprocessableEntityError) return new ProviderError("provider_bad_request", msg, "no");
  if (e instanceof Parallel.RateLimitError) {
    const seconds = Number((e as { headers?: Headers }).headers?.get?.("retry-after"));
    return new ProviderError("provider_rate_limited", msg, "no", Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined);
  }
  // 5xx, timeouts, connection resets, unknown: the request may have been accepted upstream.
  return new ProviderError("provider_unavailable", msg, "unknown");
}

export function createParallelProvider(apiKey: string, client?: ParallelLike): ResearchProvider {
  // createParallelClient pins baseURL and sets maxRetries 0 (the worker owns retries, D-005).
  const c: ParallelLike = client ?? createParallelClient(apiKey, { timeoutMs: 60_000 });
  const call = async <T>(fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (e) {
      throw mapSdkError(e);
    }
  };
  return {
    async createStructuredTask(input) {
      const rawRequest = buildTaskRunCreateRequest(input);
      const run = await call(() => c.taskRun.create(rawRequest));
      return { providerRunId: run.run_id, rawRequest, rawResponse: run };
    },
    async getTaskStatus(id) {
      const run = await call(() => c.taskRun.retrieve(id));
      return mapUpstreamStatus(run.status);
    },
    async getTaskResult(id) {
      return { raw: await call(() => c.taskRun.result(id, { timeout: 30 })) };
    },
  };
}
