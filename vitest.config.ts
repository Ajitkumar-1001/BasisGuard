import { defineConfig } from "vitest/config";

export const TEST_DATABASE_URL =
  "postgres://basisguard:basisguard@127.0.0.1:5432/basisguard_test";

export default defineConfig({
  test: {
    include: [
      "tests/unit/**/*.test.ts",
      "packages/*/**/*.test.ts",
      "apps/worker/**/*.test.ts",
      "frontend/src/server/**/*.test.ts",
      "scripts/**/*.test.ts",
    ],
    setupFiles: ["tests/setup/network-deny.mjs"],
    globalSetup: ["tests/setup/test-db.ts"],
    fileParallelism: false,
    env: {
      NODE_ENV: "test",
      BASISGUARD_MODE: "fixture",
      DATABASE_URL: TEST_DATABASE_URL,
    },
    coverage: {
      provider: "v8",
      include: ["packages/core/**", "packages/contracts/**"],
      exclude: ["**/*.test.ts", "**/index.ts"],
      thresholds: { lines: 80, branches: 80, functions: 80, statements: 80 },
    },
  },
});
