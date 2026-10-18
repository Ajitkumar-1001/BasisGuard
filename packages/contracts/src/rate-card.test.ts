import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RateCard } from "./rate-card";

const path = new URL("../../../config/rate-cards/parallel-2026-10-17.json", import.meta.url);
const raw = () => JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;

describe("RateCard schema", () => {
  it("accepts the pinned 2026-10-17 card", () => {
    const card = RateCard.parse(raw());
    expect(card.task_usd_per_run.base).toBe("0.010");
    expect(card.search_usd_per_request.fast).toBe("0.001");
  });

  it("rejects float prices and missing processors", () => {
    expect(RateCard.safeParse({ ...raw(), extract_usd_per_url: 0.001 }).success).toBe(false);
    const card = raw();
    const tasks = { ...(card.task_usd_per_run as Record<string, string>) };
    delete tasks.ultra8x;
    expect(RateCard.safeParse({ ...card, task_usd_per_run: tasks }).success).toBe(false);
  });

  it("rejects unknown keys and non-block unknown-cost behaviour", () => {
    expect(RateCard.safeParse({ ...raw(), surprise: 1 }).success).toBe(false);
    expect(RateCard.safeParse({ ...raw(), unknown_cost_behavior: "allow" }).success).toBe(false);
  });
});
