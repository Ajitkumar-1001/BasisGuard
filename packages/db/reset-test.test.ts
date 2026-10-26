import { describe, expect, it } from "vitest";
import type { Db } from "./client";
import { resetTestDatabase } from "./reset-test";

describe("resetTestDatabase guard", () => {
  it("refuses any database other than basisguard_test and never issues the TRUNCATE", async () => {
    for (const name of ["basisguard_dev", "basisguard_bench", "postgres"]) {
      const statements: unknown[] = [];
      // Deliberate test double: resetTestDatabase only calls execute; nothing connects to another database.
      const db = { execute: async (q: unknown) => { statements.push(q); return [{ d: name }]; } } as unknown as Db;
      await expect(resetTestDatabase(db)).rejects.toThrow(`resetTestDatabase refuses ${name}`);
      expect(statements).toHaveLength(1); // only the current_database() probe
    }
  });
});
