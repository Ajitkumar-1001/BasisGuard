import { expect, test } from "@playwright/test";
import type { DbHandle } from "../../packages/db/src/client";
import { openResetDb } from "./helpers";

// No worker: these tests only exercise the HTTP write path; created runs stay queued.
let handle: DbHandle;
test.beforeAll(async () => {
  handle = await openResetDb();
});
test.afterAll(async () => {
  await handle.close();
});

const body = (key: string, over: Record<string, unknown> = {}) => ({
  request_key: key, company_name: "API Corp", profile: "startup_facts_v1", policy: "baseline", as_of_date: "2026-10-17", ...over,
});

test("POST /api/runs idempotency contract over real HTTP", async ({ request }) => {
  const key = crypto.randomUUID();
  const a = await request.post("/api/runs", { data: body(key) });
  expect(a.status()).toBe(202);
  const b = await request.post("/api/runs", { data: body(key) });
  expect(b.status()).toBe(200);
  expect((await b.json()).runId).toBe((await a.json()).runId);
  const conflict = await request.post("/api/runs", { data: body(key, { company_name: "Changed" }) });
  expect(conflict.status()).toBe(409);
  expect((await conflict.json()).code).toBe("idempotency_conflict");
  expect((await request.post("/api/runs", { data: body(crypto.randomUUID(), { company_name: "A" }) })).status()).toBe(400);
  expect((await request.post("/api/runs", { data: body(crypto.randomUUID(), { policy: "verify" }) })).status()).toBe(422);
});

test("there is no retry endpoint", async ({ request }) => {
  const { runId } = await (await request.post("/api/runs", { data: body(crypto.randomUUID()) })).json();
  expect([404, 405]).toContain((await request.post(`/api/runs/${runId}/retry`)).status());
});
