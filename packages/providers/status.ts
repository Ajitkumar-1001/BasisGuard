import type { ProviderRunStatus } from "./types";

export function mapUpstreamStatus(raw: string): ProviderRunStatus {
  switch (raw) {
    case "queued":
    case "running":
    case "cancelling":
      return { state: "pending", rawStatus: raw };
    case "completed":
      return { state: "completed", rawStatus: raw };
    case "action_required":
      return { state: "failed", rawStatus: raw, errorCode: "provider_action_required" };
    default:
      return { state: "failed", rawStatus: raw, errorCode: "provider_task_failed" };
  }
}
