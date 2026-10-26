import { fileURLToPath, pathToFileURL } from "node:url";
import { defineConfig, devices } from "@playwright/test";

const root = fileURLToPath(new URL(".", import.meta.url));
export const E2E_BASE_URL = "http://127.0.0.1:3100";

/** Fixture-mode, keyless, zero-network env for next dev and every worker the E2E suite spawns. Never log it. */
export const E2E_ENV = {
  BASISGUARD_MODE: "fixture",
  DATABASE_URL: "postgres://basisguard:basisguard@127.0.0.1:5432/basisguard_test",
  BASISGUARD_RATE_CARD: `${root}config/rate-cards/parallel-2026-10-17.json`,
  NEXT_TELEMETRY_DISABLED: "1",
  NODE_OPTIONS: `--import ${pathToFileURL(`${root}tests/setup/network-deny.mjs`).href}`,
  // Runtime canary (tests/e2e/network-deny.spec.ts): each hooked process self-tests and keeps <pid>.json
  // fresh here while it runs. Fixed path (every process evaluating this config must agree); global setup
  // empties it, and live processes re-write their marker within a second.
  BASISGUARD_NETWORK_DENY_CANARY_DIR: `${root}node_modules/.cache/basisguard-e2e-network-deny`,
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
  use: { baseURL: E2E_BASE_URL, trace: "retain-on-failure" },
  projects: [
    {
      name: "chromium",
      testIgnore: ["**/visual.spec.ts", "**/a11y.spec.ts"],
      use: { ...devices["Desktop Chrome"] },
    },
    { name: "visual", testMatch: "**/visual.spec.ts", use: { ...devices["Desktop Chrome"] } },
    {
      name: "a11y",
      testMatch: "**/a11y.spec.ts",
      use: { ...devices["Desktop Chrome"], reducedMotion: "reduce" },
    },
  ],
  webServer: {
    command: "pnpm exec next dev -H 127.0.0.1 -p 3100",
    cwd: `${root}frontend`,
    url: `${E2E_BASE_URL}/runs`,
    env: e2eEnv(),
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
