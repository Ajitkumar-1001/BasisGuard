import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RateCard } from "./rate-card";

const path = new URL("../../../config/rate-cards/parallel-2026-10-17.json", import.meta.url);
const raw = () => JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;

describe("RateCard schema", () => {
  it("accepts the pinned 2026-10-17 card", () => {
    const card = RateCard.parse(raw());
    // Full tables (docs pricing 2026-10-17: per 1,000 successful runs / requests), so a tier typo fails here.
    expect(card.task_usd_per_run).toEqual({
      lite: "0.005", base: "0.010", core: "0.025", core2x: "0.050", pro: "0.100",
      ultra: "0.300", ultra2x: "0.600", ultra4x: "1.200", ultra8x: "2.400",
    });
    expect(card.search_usd_per_request).toEqual({ turbo: "0.001", fast: "0.001", basic: "0.005", advanced: "0.005" });
    expect(card.search_included_results).toBe(10);
    expect(card.search_additional_result_usd).toBe("0.001");
    expect(card.extract_usd_per_url).toBe("0.001");
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
