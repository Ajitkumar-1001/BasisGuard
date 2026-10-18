import { randomUUID } from "node:crypto";
import type { ApiErrorCode } from "@basisguard/contracts";

export function apiError(status: number, code: ApiErrorCode, message: string, requestId: string, issues?: unknown): Response {
  return Response.json({ code, message, requestId, ...(issues ? { issues } : {}) }, { status });
}

/**
 * Turns any unexpected exception into a generic 500. The caught error is deliberately neither logged
 * nor echoed: DB/driver errors can carry the connection string (credentials).
 */
export async function withInternalErrors(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch {
    return apiError(500, "internal_error", "internal error", randomUUID());
  }
}
