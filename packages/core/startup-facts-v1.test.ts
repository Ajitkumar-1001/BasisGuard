import { describe, expect, it } from "vitest";
import { STARTUP_FACTS_V1_OUTPUT_SCHEMA as S } from "./startup-facts-v1";

const UNSUPPORTED = ["format", "pattern", "minLength", "maxLength", "minimum", "maximum", "minItems", "maxItems", "uniqueItems", "contains", "multipleOf", "propertyNames"];

function walk(node: unknown, visit: (o: Record<string, unknown>) => void): void {
  if (node && typeof node === "object") {
    visit(node as Record<string, unknown>);
    for (const v of Object.values(node)) walk(v, visit);
  }
}

describe("startup_facts_v1 output schema obeys Parallel task-spec rules", () => {
  it("has an object root with all properties required and no additional properties", () => {
    expect(S.type).toBe("object");
    expect([...S.required].sort()).toEqual(Object.keys(S.properties).sort());
    expect(S.additionalProperties).toBe(false);
    const fn = S.properties.latest_funding;
    expect([...fn.required].sort()).toEqual(Object.keys(fn.properties).sort());
    expect(fn.additionalProperties).toBe(false);
  });

  it("covers exactly the PRD §7.1 fields", () => {
    expect(Object.keys(S.properties).sort()).toEqual(
      ["company_name", "founders", "founding_year", "headquarters", "latest_funding", "official_website"],
    );
    expect(Object.keys(S.properties.latest_funding.properties).sort()).toEqual(["amount_usd", "announced_on", "round"]);
  });

  it("uses no unsupported keywords and stays under the 15,000-char spec limit", () => {
    walk(S, (o) => UNSUPPORTED.forEach((k) => expect(o).not.toHaveProperty(k)));
    expect(JSON.stringify(S).length).toBeLessThan(15_000);
  });
});
