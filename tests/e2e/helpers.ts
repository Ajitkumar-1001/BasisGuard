import { type ChildProcess, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createDb, type DbHandle } from "../../packages/db/client";
import { resetTestDatabase } from "../../packages/db/reset-test";
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

/** startWorker failure; `pgid` is the (already SIGKILLed) process group, or null when nothing was spawned. */
export class WorkerStartError extends Error {
  constructor(message: string, readonly pgid: number | null) {
    super(message);
    this.name = "WorkerStartError";
  }
}

/**
 * Every worker group spawned in this Playwright process that has not exited yet. Safety net for paths that
 * skip a spec's own cleanup (test timeout, failed start): `killAllWorkers()` from afterAll and on exit.
 */
const live = new Set<ChildProcess>();

function killGroupNow(child: ChildProcess): void {
  if (child.pid === undefined) return;
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    // group already gone
  }
}

/** Synchronously SIGKILLs every tracked worker process group. Safe to call repeatedly. */
export function killAllWorkers(): void {
  for (const child of live) killGroupNow(child);
  live.clear();
}

process.on("exit", killAllWorkers);

/**
 * Spawns `pnpm --filter @basisguard/worker start` in its own process group (pnpm -> tsx -> node), so a
 * group signal reaches the real worker. Resolves once the worker logs its start line; `pid` is the
 * worker's own process id parsed from that line. On timeout or early exit the whole group is SIGKILLed
 * before rejecting, so a failed start never leaves a polling worker behind.
 */
export async function startWorker(opts: { startTimeoutMs?: number; command?: string } = {}): Promise<WorkerProc> {
  const startTimeoutMs = opts.startTimeoutMs ?? 60_000;
  const child = spawn(opts.command ?? "pnpm", ["--filter", "@basisguard/worker", "start"], {
    cwd: ROOT,
    env: e2eEnv({ NODE_ENV: "development" }),
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (child.pid === undefined) {
    // spawn failed (e.g. ENOENT): node reports it as an async 'error' event, which would otherwise be
    // unhandled and crash the Playwright worker.
    const cause = await new Promise<Error>((resolve) => child.once("error", resolve));
    throw new WorkerStartError(`failed to spawn worker: ${cause.message}`, null);
  }
  const pgid = child.pid;
  live.add(child);
  child.once("exit", () => live.delete(child));
  let buf = "";
  child.stdout?.on("data", (d: Buffer) => { buf += d.toString(); });
  child.stderr?.on("data", (d: Buffer) => { buf += d.toString(); });
  const pid = await new Promise<number>((resolve, reject) => {
    let settled = false;
    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      killGroupNow(child);
      reject(new WorkerStartError(message, pgid));
    };
    const timer = setTimeout(() => fail(`worker did not start in ${startTimeoutMs}ms:\n${buf}`), startTimeoutMs);
    const check = () => {
      const m = /basisguard worker \S+:(\d+) started/.exec(buf);
      if (m && !settled) {
        settled = true;
        clearTimeout(timer);
        resolve(Number(m[1]));
      }
    };
    child.stdout?.on("data", check);
    child.once("exit", (code) => fail(`worker exited early (code ${code}):\n${buf}`));
    child.once("error", (e) => fail(`worker process error: ${e.message}:\n${buf}`));
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
