export type ProviderErrorCode = "provider_auth_error" | "provider_rate_limited" | "provider_bad_request" | "provider_unavailable";

/** `submitted` says whether the upstream may have accepted the request: "no" is safe to retry/release, "unknown" is not. */
export class ProviderError extends Error {
  override name = "ProviderError";
  constructor(
    readonly code: ProviderErrorCode,
    message: string,
    readonly submitted: "no" | "unknown",
    readonly retryAfterMs?: number,
  ) {
    super(message);
  }
}
