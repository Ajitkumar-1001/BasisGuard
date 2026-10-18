import Parallel from "parallel-web";

/** The SDK's production URL. Pinned explicitly: an omitted baseURL makes the SDK read PARALLEL_BASE_URL from the environment. */
export const PARALLEL_BASE_URL = "https://api.parallel.ai";

/**
 * The only place the Parallel SDK client is constructed (live adapter and Gate A probe).
 * - baseURL pinned, so a stray PARALLEL_BASE_URL can never redirect the real API key.
 * - maxRetries 0: the SDK default (2) silently replays POST /v1/tasks/runs; retries are owned by the caller (D-005).
 */
export function createParallelClient(apiKey: string, o: { timeoutMs: number }): Parallel {
  return new Parallel({ apiKey, baseURL: PARALLEL_BASE_URL, maxRetries: 0, timeout: o.timeoutMs });
}
