import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { E2E_BASE_URL, E2E_ENV } from "../../playwright.config";
import { killAllWorkers, startWorker, stopWorker } from "./helpers";

/**
 * Runtime canary: the network-deny hook is not just configured (NODE_OPTIONS) but loaded and active in the
 * processes that serve the E2E suite. With BASISGUARD_NETWORK_DENY_CANARY_DIR set, every process that loads
 * tests/setup/network-deny.mjs self-tests the patched connect and keeps `<pid>.json` fresh (with the ports
 * it listens on) while it runs. Global setup empties the directory, so markers of dead processes from
 * earlier runs are gone; a live process re-writes its marker within a second, hence the short polling.
 */
type Marker = { pid: number; denyActive: boolean; listening: number[] };

function markers(): Marker[] {
  const dir = E2E_ENV.BASISGUARD_NETWORK_DENY_CANARY_DIR;
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  const out: Marker[] = [];
  for (const n of names.filter((x) => x.endsWith(".json"))) {
    try {
      out.push(JSON.parse(readFileSync(join(dir, n), "utf8")) as Marker);
    } catch {
      // caught mid-rewrite; the next poll reads it
    }
  }
  return out;
}

async function pollMarkers(pick: (ms: Marker[]) => Marker[]): Promise<Marker[]> {
  const end = Date.now() + 10_000;
  for (;;) {
    const found = pick(markers());
    if (found.length > 0 || Date.now() > end) return found;
    await new Promise((r) => setTimeout(r, 200));
  }
}

test.afterAll(() => {
  killAllWorkers();
});

test("the next dev process serving the suite has the network-deny hook active", async ({ request }) => {
  expect((await request.get("/api/runs")).status()).toBe(200);
  const port = Number(new URL(E2E_BASE_URL).port);
  const servers = await pollMarkers((ms) => ms.filter((m) => m.listening.includes(port)));
  expect(servers.length, `no hooked process is listening on ${port}`).toBeGreaterThan(0);
  for (const m of servers) expect(m.denyActive).toBe(true);
});

test("a spawned worker process has the network-deny hook active", async () => {
  const w = await startWorker();
  try {
    const [m] = await pollMarkers((ms) => ms.filter((x) => x.pid === w.pid));
    expect(m, `worker pid ${w.pid} wrote no network-deny marker`).toBeDefined();
    expect(m!.denyActive).toBe(true);
  } finally {
    await stopWorker(w);
  }
});
