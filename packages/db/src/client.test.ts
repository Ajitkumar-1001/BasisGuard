import { describe, expect, it } from "vitest";
import { assertDatabaseAllowed, createDb } from "./client";

describe("database guard (checked after connect)", () => {
  it("refuses bench/dev under NODE_ENV=test or fixture mode", () => {
    expect(() => assertDatabaseAllowed("basisguard_bench", { nodeEnv: "test" })).toThrow(/refusing/);
    expect(() => assertDatabaseAllowed("basisguard_dev", { mode: "fixture" })).toThrow(/refusing/);
    expect(() => assertDatabaseAllowed("basisguard_test", { nodeEnv: "test", mode: "fixture" })).not.toThrow();
    expect(() => assertDatabaseAllowed("basisguard_bench", { mode: "live", nodeEnv: "production" })).not.toThrow();
  });

  it("refuses to open basisguard_bench from the test runner", async () => {
    const url = process.env.DATABASE_URL!.replace(/basisguard_test$/, "basisguard_bench");
    await expect(createDb(url, { nodeEnv: "test" })).rejects.toThrow(/refusing database "basisguard_bench"/);
  });
});
