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

const parseOrigin = (value: string): URL | null => {
  try {
    return new URL(value);
  } catch {
    return null; // e.g. the opaque Origin "null"
  }
};

/** The dev server binds 127.0.0.1 only; these are the only Host names a legitimate local client sends. */
const LOCAL_HOSTNAMES = new Set(["127.0.0.1", "localhost"]);
const SAME_ORIGIN_FETCH_SITES = new Set(["same-origin", "none"]);

/**
 * Header-only guard for every /api route, checked before any body read or DB access. There is no auth
 * (by design), and binding 127.0.0.1 does not stop a browser on the same machine from sending requests,
 * so (a live-mode forged run reserves budget and makes a paid upstream create):
 * - every route: Host must be a loopback name (blocks DNS rebinding) → 403 forbidden_origin;
 * - state-changing routes: Content-Type must be application/json, which a cross-site page cannot send
 *   without a CORS preflight the server never approves → 415 unsupported_media_type; Origin, when sent,
 *   must equal this Host's origin, and Sec-Fetch-Site, when sent, must be same-origin or none → 403.
 * Header-less local clients (curl, Playwright's request API) pass: browsers always send Origin on POST.
 */
export function guardApiRequest(req: Request, requestId: string, o: { stateChanging: boolean }): Response | null {
  const self = parseOrigin(`http://${req.headers.get("host") ?? new URL(req.url).host}`);
  if (!self || !LOCAL_HOSTNAMES.has(self.hostname)) return apiError(403, "forbidden_origin", "request host is not allowed", requestId);
  if (!o.stateChanging) return null;

  const mediaType = (req.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  if (mediaType !== "application/json") {
    return apiError(415, "unsupported_media_type", "content-type must be application/json", requestId);
  }
  const origin = req.headers.get("origin");
  if (origin !== null && parseOrigin(origin)?.origin !== self.origin) {
    return apiError(403, "forbidden_origin", "cross-origin requests are not allowed", requestId);
  }
  const site = req.headers.get("sec-fetch-site");
  if (site !== null && !SAME_ORIGIN_FETCH_SITES.has(site)) {
    return apiError(403, "forbidden_origin", "cross-site requests are not allowed", requestId);
  }
  return null;
}
