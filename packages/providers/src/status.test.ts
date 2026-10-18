import { describe, expect, it } from "vitest";
import { mapUpstreamStatus } from "./status";

describe("mapUpstreamStatus (decision D-004)", () => {
  it.each(["queued", "running", "cancelling"])("%s is pending", (s) =>
    expect(mapUpstreamStatus(s)).toEqual({ state: "pending", rawStatus: s }));
  it("completed is completed", () => expect(mapUpstreamStatus("completed")).toEqual({ state: "completed", rawStatus: "completed" }));
  it.each(["failed", "cancelled", "something_new"])("%s fails closed as provider_task_failed", (s) =>
    expect(mapUpstreamStatus(s)).toEqual({ state: "failed", rawStatus: s, errorCode: "provider_task_failed" }));
  it("action_required fails as provider_action_required", () =>
    expect(mapUpstreamStatus("action_required")).toEqual({ state: "failed", rawStatus: "action_required", errorCode: "provider_action_required" }));
});
