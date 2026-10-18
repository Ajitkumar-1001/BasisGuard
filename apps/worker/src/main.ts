import { hostname } from "node:os";
import { loadRuntimeConfig } from "@basisguard/core";
import { createDb } from "@basisguard/db/runtime";
import { createProvider, FIXTURE_ORIGIN } from "@basisguard/providers";
import type { WorkerDeps } from "./acquire-task";
import { createStopper, runLoop, runOnce } from "./worker";

// Worker entrypoint (the only module with top-level side effects). No HTTP port, no listeners.
// Never log `config` or `databaseUrl`: they carry credentials.
const config = loadRuntimeConfig(process.env);
if (config.mode === "replay") {
  console.error("worker refuses to start in replay mode (read-only)");
  process.exit(1);
}
const handle = await createDb(config.databaseUrl, { mode: config.mode, nodeEnv: process.env.NODE_ENV });
const deps: WorkerDeps = {
  db: handle.db,
  provider: await createProvider(config),
  rateCard: config.rateCard.card,
  rateCardSha256: config.rateCard.sha256,
  vendor: config.mode === "live" ? "parallel" : "fixture:parallel",
  fixtureOrigin: config.mode === "fixture" ? FIXTURE_ORIGIN : null,
  pollDelayMs: config.mode === "live" ? 5_000 : 200,
};
const workerId = `${hostname()}:${process.pid}`;
const stopper = createStopper();
for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, stopper.stop);
console.log(`basisguard worker ${workerId} started (mode=${config.mode}, db=${handle.databaseName})`);
try {
  await runLoop({
    step: () => runOnce(deps, { workerId, leaseMs: 90_000 }),
    isStopping: stopper.isStopping,
    sleep: stopper.sleep, // cut short by SIGINT/SIGTERM
    onError: (err, failures, delayMs) => {
      console.error(`worker loop error name=${err.name} code=${err.code ?? "none"} consecutive=${failures}; retrying in ${delayMs}ms`);
    },
  });
} finally {
  await handle.close();
  console.log("basisguard worker stopped");
}
