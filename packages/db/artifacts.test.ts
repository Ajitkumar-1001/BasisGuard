import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { insertArtifact } from "./artifacts";
import type { DbHandle } from "./client";
import { providerArtifacts } from "./schema";
import { openTestDb } from "./test-helpers";

let h: DbHandle;
beforeEach(async () => { if (h) await h.close(); h = await openTestDb(); });
afterAll(async () => { await h?.close(); });

describe("insertArtifact", () => {
  it("returns the same id for identical canonical content, even with different key order", async () => {
    const a = await insertArtifact(h.db, { kind: "task_result", raw: { x: 1, y: [1, 2] } });
    const b = await insertArtifact(h.db, { kind: "task_result", raw: { y: [1, 2], x: 1 } });
    expect(b.id).toBe(a.id);
    expect(b.contentHash).toBe(a.contentHash);
    expect([a.created, b.created]).toEqual([true, false]);
  });

  it("dedupes concurrent imports to one row", async () => {
    const raw = { concurrent: true };
    const results = await Promise.all(
      Array.from({ length: 5 }, () => h.db.transaction((tx) => insertArtifact(tx, { kind: "task_result", raw }))),
    );
    expect(new Set(results.map((r) => r.id)).size).toBe(1);
    expect(results.filter((r) => r.created)).toHaveLength(1);
  });

  it("keeps kinds separate", async () => {
    const a = await insertArtifact(h.db, { kind: "task_result", raw: { k: 1 } });
    const b = await insertArtifact(h.db, { kind: "task_request", raw: { k: 1 } });
    expect(a.id).not.toBe(b.id);
  });

  it("rejects non-JSON raw with TypeError before any row is written", async () => {
    await expect(insertArtifact(h.db, { kind: "task_result", raw: { x: undefined } })).rejects.toThrow(TypeError);
    expect(await h.db.select().from(providerArtifacts)).toHaveLength(0);
  });
});
