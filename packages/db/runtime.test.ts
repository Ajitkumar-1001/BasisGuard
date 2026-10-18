import { describe, expect, it } from "vitest";
import pkg from "./package.json" with { type: "json" };
import * as full from "./index";
import * as runtime from "./runtime";

describe("@basisguard/db/runtime (bundle hygiene)", () => {
  it("is exported as a subpath and excludes migrate, reset-test and test-helpers", () => {
    expect(pkg.exports).toMatchObject({ ".": "./index.ts", "./runtime": "./runtime.ts" });
    for (const name of ["migrateDatabase", "resetTestDatabase", "openTestDb"]) {
      expect(full).toHaveProperty(name);
      expect(runtime).not.toHaveProperty(name);
    }
    for (const name of ["createDb", "createRun", "listRuns", "researchRuns", "providerArtifacts", "runSpend"]) {
      expect(runtime).toHaveProperty(name);
    }
  });
});
