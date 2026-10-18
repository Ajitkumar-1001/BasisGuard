import { fileURLToPath, pathToFileURL } from "node:url";
import { defineConfig, devices } from "@playwright/test";

const root = fileURLToPath(new URL(".", import.meta.url));

/** Fixture-mode, keyless, zero-network env for next dev and every worker the E2E suite spawns. Never log it. */
export const E2E_ENV = {
  BASISGUARD_MODE: "fixture",
  DATABASE_URL: "postgres://basisguard:basisguard@127.0.0.1:5432/basisguard_test",
  BASISGUARD_RATE_CARD: `${root}config/rate-cards/parallel-2026-10-17.json`,
  NEXT_TELEMETRY_DISABLED: "1",
  NODE_OPTIONS: `--import ${pathToFileURL(`${root}tests/setup/network-deny.mjs`).href}`,
};

/** process.env without upstream API keys, merged with E2E_ENV: E2E processes always run keyless. */
export function e2eEnv(extra: Record<string, string> = {}): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && k !== "PARALLEL_API_KEY" && k !== "OPENAI_API_KEY") env[k] = v;
  }
  return { ...env, ...E2E_ENV, ...extra };
}

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  globalSetup: "./tests/e2e/global-setup.ts",
  use: { baseURL: "http://127.0.0.1:3100", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm exec next dev -H 127.0.0.1 -p 3100",
    cwd: `${root}frontend`,
    url: "http://127.0.0.1:3100/runs",
    env: e2eEnv(),
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
