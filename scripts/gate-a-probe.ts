// Phase 0 carve-out (PRD §0): the ONLY live call allowed outside the budgeted worker.
// One human-authorized Task create, hard timeout, conservative cost warning, result recorded under .gate-a/.
import { writeFile } from "node:fs/promises";
import { loadRateCard } from "@basisguard/core";
import { buildTaskRunCreateRequest } from "@basisguard/providers";
import { createParallelClient } from "@basisguard/providers/live/client";
import { acquireProbeLock, assertNoBaseUrlOverride, parseProbeArgs } from "./gate-a-probe-lib";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<number> {
  const args = parseProbeArgs(process.argv.slice(2), new Date().toISOString().slice(0, 10));
  if (!args.authorized) {
    console.error("Refusing: this makes ONE paid Parallel Task create. Re-run with --authorize-paid-one-call.");
    return 2;
  }
  try {
    assertNoBaseUrlOverride(process.env);
  } catch (e) {
    console.error((e as Error).message);
    return 2;
  }
  const apiKey = process.env.PARALLEL_API_KEY;
  if (!apiKey) { console.error("PARALLEL_API_KEY is not set."); return 2; }
  const { card, sha256 } = loadRateCard(process.env.BASISGUARD_RATE_CARD ?? "config/rate-cards/parallel-2026-10-17.json");
  const price = card.task_usd_per_run[args.processor];
  console.warn(`PAID CALL: 1 Task run, processor=${args.processor}, conservative max USD ${price} (rate card ${card.version}, sha256 ${sha256.slice(0, 12)}). Billed only if the run completes.`);

  // Pinned baseURL + maxRetries 0 (D-005); HTTP timeout must exceed result({ timeout: 60 }) s.
  const client = createParallelClient(apiKey, { timeoutMs: 90_000 });
  const request = buildTaskRunCreateRequest({
    companyName: args.companyName, officialDomain: args.officialDomain, profileVersion: "startup_facts_v1",
    asOfDate: args.asOfDate, processor: args.processor, requestKey: crypto.randomUUID(),
  });
  const statuses: unknown[] = [];
  const record: Record<string, unknown> = { startedAt: new Date().toISOString(), sdk: "parallel-web@1.3.5", rateCard: card.version, request, statuses };
  const deadline = Date.now() + args.timeoutMs;
  await acquireProbeLock(".gate-a"); // taken only once everything is built, immediately before the paid create
  try {
    const run = await client.taskRun.create(request);
    record.createResponse = run;
    for (;;) {
      if (Date.now() > deadline) throw new Error(`hard timeout after ${args.timeoutMs} ms`);
      const s = await client.taskRun.retrieve(run.run_id);
      statuses.push({ at: new Date().toISOString(), status: s.status, is_active: s.is_active });
      if (!s.is_active) break;
      await sleep(5_000);
    }
    record.result = await client.taskRun.result(run.run_id, { timeout: 60 });
    return 0;
  } catch (e) {
    record.error = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    return 1;
  } finally {
    const out = `.gate-a/probe-${Date.now()}.json`;
    await writeFile(out, JSON.stringify(record, null, 2));
    console.log(`Recorded probe request/response to ${out} (gitignored; contains third-party excerpts).`);
  }
}

process.exitCode = await main();
