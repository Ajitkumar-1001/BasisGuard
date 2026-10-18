import { describe, expect, it, vi } from "vitest";

// Fake driver: the post-connect probe reports a forbidden database and closing the pool fails.
vi.mock("postgres", () => ({
  default: () => {
    const sql = async () => [{ current_database: "basisguard_bench" }];
    return Object.assign(sql, { end: async () => { throw new Error("end failed: socket already closed"); } });
  },
}));

const { createDb } = await import("./client");

describe("createDb guard path", () => {
  it("surfaces the guard error even when closing the pool also fails", async () => {
    await expect(createDb("postgres://fake", { nodeEnv: "test" })).rejects.toThrow(/refusing database "basisguard_bench"/);
  });
});
