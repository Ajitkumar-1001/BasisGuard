import { randomUUID } from "node:crypto";
import type { ApiErrorCode } from "@basisguard/contracts";

export function apiError(status: number, code: ApiErrorCode, message: string, requestId: string, issues?: unknown): Response {
  return Response.json({ code, message, requestId, ...(issues ? { issues } : {}) }, { status });
}

/** Only short identifier-like codes (e.g. ECONNREFUSED, SQLSTATE 08006) are logged; anything else is dropped. */
const SAFE_ERROR_CODE = /^[A-Za-z0-9_]{1,64}$/;

/**
 * Turns any unexpected exception into a generic 500. The error's message, stack and cause are never
 * logged or echoed: DB/driver errors can carry the connection string (credentials). Operators get one
 * structured line with only { requestId, errorName, errorCode? }, where requestId matches the 500 DTO.
 */
export async function withInternalErrors(
  fn: (requestId: string) => Promise<Response>,
  requestId: string = randomUUID(),
): Promise<Response> {
  try {
    return await fn(requestId);
  } catch (err: unknown) {
    const errorName = err instanceof Error ? err.name : typeof err;
    const code: unknown = typeof err === "object" && err !== null ? (err as { code?: unknown }).code : undefined;
    const errorCode = typeof code === "string" && SAFE_ERROR_CODE.test(code) ? code : undefined;
    console.error(JSON.stringify({ requestId, errorName, ...(errorCode ? { errorCode } : {}) }));
    return apiError(500, "internal_error", "internal error", requestId);
  }
}
