import { type ChildProcess, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createDb, type DbHandle } from "../../packages/db/src/client";
import { resetTestDatabase } from "../../packages/db/src/reset-test";
import { E2E_ENV, e2eEnv } from "../../playwright.config";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

/** Direct handle on basisguard_test (the client's guard re-checks current_database()). */
export async function openE2eDb(): Promise<DbHandle> {
  return createDb(E2E_ENV.DATABASE_URL, { nodeEnv: "test", mode: "fixture" });
}

/** Opens a DB handle and truncates every run table, so a spec file never depends on another's rows. */
export async function openResetDb(): Promise<DbHandle> {
  const h = await openE2eDb();
  await resetTestDatabase(h.db);
  return h;
}

export type WorkerProc = { child: ChildProcess; pid: number; output: () => string };

/**
 * Spawns `pnpm --filter @basisguard/worker start` in its own process group (pnpm -> tsx -> node), so a
 * group signal reaches the real worker. Resolves once the worker logs its start line; `pid` is the
 * worker's own process id parsed from that line.
 */
export async function startWorker(): Promise<WorkerProc> {
  const child = spawn("pnpm", ["--filter", "@basisguard/worker", "start"], {
    cwd: ROOT,
    env: e2eEnv({ NODE_ENV: "development" }),
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let buf = "";
  child.stdout?.on("data", (d: Buffer) => { buf += d.toString(); });
  child.stderr?.on("data", (d: Buffer) => { buf += d.toString(); });
  const pid = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`worker did not start in 60s:\n${buf}`)), 60_000);
    const check = () => {
      const m = /basisguard worker \S+:(\d+) started/.exec(buf);
      if (m) {
        clearTimeout(timer);
        resolve(Number(m[1]));
      }
    };
    child.stdout?.on("data", check);
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`worker exited early (code ${code}):\n${buf}`));
    });
  });
  return { child, pid, output: () => buf };
}

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

async function waitDead(pid: number, ms: number): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (!alive(pid)) return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return !alive(pid);
}

function signalGroup(w: WorkerProc, sig: NodeJS.Signals): void {
  try {
    process.kill(-w.child.pid!, sig);
  } catch {
    // group already gone
  }
}

/** Hard kill (no graceful shutdown) of the whole worker process group; throws if the worker survived. */
export async function killWorkerHard(w: WorkerProc): Promise<void> {
  signalGroup(w, "SIGKILL");
  if (!(await waitDead(w.pid, 5_000))) throw new Error(`worker pid ${w.pid} survived SIGKILL`);
}

/** Graceful stop (SIGTERM to the group), escalating to SIGKILL after 10 s. */
export async function stopWorker(w: WorkerProc): Promise<void> {
  signalGroup(w, "SIGTERM");
  if (!(await waitDead(w.pid, 10_000))) await killWorkerHard(w);
}
