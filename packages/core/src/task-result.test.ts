import { describe, expect, it } from "vitest";
import { TaskResultEnvelope } from "./task-result";

describe("TaskResultEnvelope", () => {
  const ok = { run: { run_id: "r", status: "completed", extra: 1 }, output: { type: "json", content: { a: 1 }, basis: [{ field: "a", reasoning: "x", citations: [{ url: "https://e.com", excerpts: null }], confidence: null, extra: true }], beta: 1 } };
  it("accepts a completed JSON result and keeps unknown upstream fields", () => {
    const parsed = TaskResultEnvelope.parse(ok);
    expect((parsed.run as Record<string, unknown>).extra).toBe(1);
  });
  it("rejects text outputs, missing basis and non-completed runs", () => {
    expect(TaskResultEnvelope.safeParse({ ...ok, output: { ...ok.output, type: "text", content: "x" } }).success).toBe(false);
    expect(TaskResultEnvelope.safeParse({ ...ok, output: { type: "json", content: {} } }).success).toBe(false);
    expect(TaskResultEnvelope.safeParse({ ...ok, run: { run_id: "r", status: "failed" } }).success).toBe(false);
  });
});
