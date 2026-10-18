import { fileURLToPath } from "node:url";
import { loadRuntimeConfig } from "@basisguard/core";
import { describe, expect, it, vi } from "vitest";

// If anything in fixture/replay paths loads the SDK, this factory throws and the test fails.
vi.mock("parallel-web", () => { throw new Error("parallel-web must not be loaded in fixture/replay mode"); });

const { createProvider } = await import("./create-provider");
const { FixtureResearchProvider } = await import("./fixture-provider");
const RATE = fileURLToPath(new URL("../../../config/rate-cards/parallel-2026-10-17.json", import.meta.url));
const DB = "postgres://u:p@127.0.0.1:5432/basisguard_test";

describe("createProvider", () => {
  it("fixture mode returns the fixture adapter without loading parallel-web", async () => {
    const cfg = loadRuntimeConfig({ BASISGUARD_MODE: "fixture", DATABASE_URL: DB, BASISGUARD_RATE_CARD: RATE });
    expect(await createProvider(cfg)).toBeInstanceOf(FixtureResearchProvider);
  });

  it("replay mode has no provider at all", async () => {
    await expect(createProvider(loadRuntimeConfig({ BASISGUARD_MODE: "replay", DATABASE_URL: DB }))).rejects.toThrow(/replay/);
  });

  it("sanity: live mode does try to load parallel-web (proves the mock guards the right module)", async () => {
    const cfg = loadRuntimeConfig({ BASISGUARD_MODE: "live", DATABASE_URL: DB, BASISGUARD_RATE_CARD: RATE, PARALLEL_API_KEY: "k", OPENAI_API_KEY: "k" });
    // vitest wraps a throwing mock factory; the original message is on `cause`.
    const err = await createProvider(cfg).then(() => null, (e: unknown) => e as Error);
    expect(err).not.toBeNull();
    expect(`${err!.message} ${String((err as { cause?: unknown }).cause ?? "")}`).toMatch(/must not be loaded/);
  });
});
