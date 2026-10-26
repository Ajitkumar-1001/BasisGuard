/** Pure display formatters shared by the run inspector. Deterministic, so server and client output match. */

export const DASH = "—";

/** "2026-10-02T09:00:00Z" → "2026-10-02 09:00:00 UTC"; anything else is shown unchanged. */
export function formatAt(iso: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(?:\.\d+)?Z$/.exec(iso);
  return m ? `${m[1]} ${m[2]} UTC` : iso;
}

export function formatLatency(ms: number | null): string {
  if (ms === null) return DASH;
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

export function formatCount(n: number | null): string {
  return n === null ? DASH : String(n);
}

export function formatUsd(usd: string | null): string {
  return usd === null ? DASH : `$${usd}`;
}

/** Returns the URL only when it parses and uses https; citations are never linked otherwise. */
export function httpsUrl(url: string): string | null {
  try {
    return new URL(url).protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}
