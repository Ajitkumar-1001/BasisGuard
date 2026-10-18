import { fileURLToPath } from "node:url";
import { loadRuntimeConfig } from "@basisguard/core";
import { type Db, type DbHandle, openTestDb, researchRuns } from "@basisguard/db";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { handleCreateRun, handleGetRun, handleGetRunEvents, handleListRuns, ListRunsQuery, type WebRuntime } from "./handlers";

const RATE = fileURLToPath(new URL("../../../config/rate-cards/parallel-2026-10-17.json", import.meta.url));
let h: DbHandle;
let rt: WebRuntime;
beforeEach(async () => {
  if (h) await h.close();
  h = await openTestDb();
  rt = { db: h.db, config: loadRuntimeConfig({ BASISGUARD_MODE: "fixture", DATABASE_URL: process.env.DATABASE_URL, BASISGUARD_RATE_CARD: RATE }) };
});
afterAll(async () => { await h?.close(); });

const body = (over: Record<string, unknown> = {}) => ({
  request_key: "6f2c1c9e-1d7e-4c47-9a3a-1b1b6f0a9f11", company_name: "Example Corp", profile: "startup_facts_v1", policy: "baseline", as_of_date: "2026-10-17", ...over,
});
const post = (b: unknown) => new Request("http://127.0.0.1/api/runs", { method: "POST", headers: { "content-type": "application/json" }, body: typeof b === "string" ? b : JSON.stringify(b) });

describe("POST /api/runs (FR-01)", () => {
  it("202 on create, 200 with the same run on replay of key+body, 409 on key reuse with a new body", async () => {
    const a = await handleCreateRun(post(body()), rt);
    expect(a.status).toBe(202);
    const ja = await a.json();
    expect(ja).toEqual({ runId: expect.any(String), status: "queued" });
    const b = await handleCreateRun(post(body()), rt);
    expect([b.status, await b.json()]).toEqual([200, ja]);
    const c = await handleCreateRun(post(body({ company_name: "Other" })), rt);
    expect(c.status).toBe(409);
    expect(await c.json()).toMatchObject({ code: "idempotency_conflict", requestId: expect.any(String) });
  });

  it("hashes the parsed body: max_estimated_usd '5' then '5.00' with the same key is 202 then 200 (same run)", async () => {
    const a = await handleCreateRun(post(body({ max_estimated_usd: "5" })), rt);
    expect(a.status).toBe(202);
    const ja = await a.json();
    const b = await handleCreateRun(post(body({ max_estimated_usd: "5.00" })), rt);
    expect([b.status, await b.json()]).toEqual([200, ja]);
  });

  it("concurrent double submit yields exactly one 202 and one 200 for the same run", async () => {
    const [x, y] = await Promise.all([handleCreateRun(post(body()), rt), handleCreateRun(post(body()), rt)]);
    expect([x.status, y.status].sort()).toEqual([200, 202]);
    expect(await h.db.select().from(researchRuns)).toHaveLength(1);
  });

  it("400 typed errors for malformed JSON and invalid fields", async () => {
    const bad = await handleCreateRun(post("{not json"), rt);
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ code: "invalid_request", requestId: expect.any(String) });
    const inv = await handleCreateRun(post(body({ company_name: "A" })), rt);
    expect(inv.status).toBe(400);
    expect(await inv.json()).toMatchObject({ code: "invalid_request", issues: expect.any(Array) });
  });

  it("422 policy_unavailable for checked policies until Phase 2 (D-002)", async () => {
    const r = await handleCreateRun(post(body({ policy: "verify" })), rt);
    expect(r.status).toBe(422);
    expect(await r.json()).toMatchObject({ code: "policy_unavailable" });
  });

  it("403 replay_read_only in replay mode with no database write", async () => {
    const replay: WebRuntime = { db: h.db, config: loadRuntimeConfig({ BASISGUARD_MODE: "replay", DATABASE_URL: process.env.DATABASE_URL }) };
    const r = await handleCreateRun(post(body()), replay);
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({ code: "replay_read_only" });
    expect(await h.db.select().from(researchRuns)).toHaveLength(0);
  });

  it("403 in replay mode is decided before the body is read", async () => {
    const replay: WebRuntime = { db: h.db, config: loadRuntimeConfig({ BASISGUARD_MODE: "replay", DATABASE_URL: process.env.DATABASE_URL }) };
    const req = post("{not json");
    expect((await handleCreateRun(req, replay)).status).toBe(403);
    expect(req.bodyUsed).toBe(false);
  });
});

describe("GET handlers", () => {
  it("returns run detail, 404 for unknown or malformed ids, and lists runs", async () => {
    const { runId } = await (await handleCreateRun(post(body()), rt)).json();
    const d = await handleGetRun(runId, rt);
    expect(d.status).toBe(200);
    expect(await d.json()).toMatchObject({ run: { id: runId, status: "queued", input: { company_name: "Example Corp" } }, taskArtifact: null, spend: { usd: "0.000000" } });
    expect((await handleGetRun("00000000-0000-4000-8000-000000000000", rt)).status).toBe(404);
    expect((await handleGetRun("not-a-uuid", rt)).status).toBe(404);
    const list = await (await handleListRuns(new URL("http://x/api/runs?limit=5"), rt)).json();
    expect(list.runs).toHaveLength(1);
    expect(list.runs[0]).toMatchObject({ id: runId, status: "queued", errorCode: null, policy: "baseline", companyName: "Example Corp" });
    expect((await handleListRuns(new URL("http://x/api/runs?status=bogus"), rt)).status).toBe(400);
    const queued = await (await handleListRuns(new URL("http://x/api/runs?status=queued"), rt)).json();
    expect(queued.runs).toHaveLength(1);
    const failed = await (await handleListRuns(new URL("http://x/api/runs?status=failed"), rt)).json();
    expect(failed.runs).toHaveLength(0);
  });

  it("GET handlers stay available in replay mode", async () => {
    const { runId } = await (await handleCreateRun(post(body()), rt)).json();
    const replay: WebRuntime = { db: h.db, config: loadRuntimeConfig({ BASISGUARD_MODE: "replay", DATABASE_URL: process.env.DATABASE_URL }) };
    expect((await handleGetRun(runId, replay)).status).toBe(200);
    expect((await handleListRuns(new URL("http://x/api/runs"), replay)).status).toBe(200);
    expect((await handleGetRunEvents(runId, replay)).status).toBe(200);
  });

  it("lists events for a run (run_created) and 404s for unknown or malformed ids", async () => {
    const { runId } = await (await handleCreateRun(post(body()), rt)).json();
    const r = await handleGetRunEvents(runId, rt);
    expect(r.status).toBe(200);
    const { events } = await r.json();
    expect(events).toEqual([{ id: expect.any(String), type: "run_created", details: expect.any(Object), createdAt: expect.any(String) }]);
    const unknown = await handleGetRunEvents("00000000-0000-4000-8000-000000000000", rt);
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toMatchObject({ code: "not_found", requestId: expect.any(String) });
    expect((await handleGetRunEvents("not-a-uuid", rt)).status).toBe(404);
  });
});

describe("list query validation (reject rule: out-of-range or non-integer limit is 400)", () => {
  it.each(["abc", "0", "-1", "2.5", "1e9", "101", ""])("limit=%s is 400 invalid_request with issues", async (limit) => {
    const r = await handleListRuns(new URL(`http://x/api/runs?limit=${limit}`), rt);
    expect(r.status).toBe(400);
    expect(await r.json()).toMatchObject({ code: "invalid_request", issues: expect.any(Array) });
  });

  it("defaults to 50, accepts 1..100, and never yields a limit above 100", () => {
    expect(ListRunsQuery.parse({})).toEqual({ limit: 50 });
    expect(ListRunsQuery.parse({ limit: "1" }).limit).toBe(1);
    expect(ListRunsQuery.parse({ limit: "100" }).limit).toBe(100);
    for (const limit of ["101", "1e9", "Infinity"]) expect(ListRunsQuery.safeParse({ limit }).success).toBe(false);
  });
});

describe("unexpected errors", () => {
  it("500 internal_error with a generic message, never the underlying error text", async () => {
    const secret = "postgres://basisguard:hunter2@127.0.0.1:5432/basisguard_test";
    const boom = () => { throw new Error(`connection failed: ${secret}`); };
    // Deliberate test double: only the methods the handlers reach need to exist, and each throws.
    const db = { transaction: boom, select: boom } as unknown as Db;
    const broken: WebRuntime = { db, config: rt.config };
    for (const res of [
      await handleCreateRun(post(body()), broken),
      await handleListRuns(new URL("http://x/api/runs"), broken),
      await handleGetRun("00000000-0000-4000-8000-000000000000", broken),
      await handleGetRunEvents("00000000-0000-4000-8000-000000000000", broken),
    ]) {
      expect(res.status).toBe(500);
      const text = await res.text();
      expect(JSON.parse(text)).toEqual({ code: "internal_error", message: "internal error", requestId: expect.any(String) });
      expect(text).not.toContain("hunter2");
    }
  });
});
