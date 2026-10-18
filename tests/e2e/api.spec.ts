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

test("cross-origin and rebinding requests are refused over real HTTP, with no run created", async ({ request }) => {
  const key = crypto.randomUUID();
  const plain = await request.post("/api/runs", { headers: { "content-type": "text/plain" }, data: JSON.stringify(body(key)) });
  expect(plain.status()).toBe(415);
  expect((await plain.json()).code).toBe("unsupported_media_type");
  const crossSite = await request.post("/api/runs", { headers: { origin: "https://evil.example.com", "sec-fetch-site": "cross-site" }, data: body(key) });
  expect(crossSite.status()).toBe(403);
  expect((await crossSite.json()).code).toBe("forbidden_origin");
  const rebound = await request.get("/api/runs", { headers: { host: "evil.example.com:3100" } });
  expect(rebound.status()).toBe(403);
  expect((await rebound.json()).code).toBe("forbidden_origin");
  // None of the refused POSTs created the run: the key is still unused.
  expect((await request.post("/api/runs", { data: body(key) })).status()).toBe(202);
});
