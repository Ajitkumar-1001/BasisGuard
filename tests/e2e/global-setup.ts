import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { E2E_ENV, e2eEnv } from "../../playwright.config";

/**
 * Migrate + reset basisguard_test once. Deliberately starts NO worker: each spec file that needs one owns
 * its worker process(es) (see helpers.ts), so the restart spec can hard-kill its worker without a shared
 * worker racing it.
 */
export default async function globalSetup() {
  // Drop network-deny canary markers of earlier runs; live processes re-write theirs within a second.
  rmSync(E2E_ENV.BASISGUARD_NETWORK_DENY_CANARY_DIR, { recursive: true, force: true });
  execSync("pnpm --filter @basisguard/db migrate && pnpm --filter @basisguard/db reset-test", {
    env: e2eEnv({ NODE_ENV: "test" }),
    stdio: "inherit",
  });
}
