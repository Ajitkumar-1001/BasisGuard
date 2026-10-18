import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadRuntimeConfig } from "./config";
import { ConfigError } from "./rate-card";

const RATE = fileURLToPath(new URL("../../../config/rate-cards/parallel-2026-10-17.json", import.meta.url));
const DB = "postgres://u:p@127.0.0.1:5432/basisguard_test";

describe("loadRuntimeConfig", () => {
  it("requires BASISGUARD_MODE to be exactly live|fixture|replay", () => {
    for (const mode of [undefined, "", "Live", "test", "fixture "]) {
      expect(() => loadRuntimeConfig({ BASISGUARD_MODE: mode, DATABASE_URL: DB })).toThrow(ConfigError);
    }
  });

  it("refuses HOSTED=true unless mode is replay", () => {
    expect(() => loadRuntimeConfig({ BASISGUARD_MODE: "fixture", HOSTED: "true", DATABASE_URL: DB, BASISGUARD_RATE_CARD: RATE })).toThrow(/HOSTED/);
    expect(() => loadRuntimeConfig({ BASISGUARD_MODE: "live", HOSTED: "true", DATABASE_URL: DB, BASISGUARD_RATE_CARD: RATE, PARALLEL_API_KEY: "k", OPENAI_API_KEY: "k" })).toThrow(/HOSTED/);
    expect(loadRuntimeConfig({ BASISGUARD_MODE: "replay", HOSTED: "true", DATABASE_URL: DB })).toMatchObject({ mode: "replay", hosted: true });
  });

  it("requires DATABASE_URL in every mode", () => {
    expect(() => loadRuntimeConfig({ BASISGUARD_MODE: "replay" })).toThrow(/DATABASE_URL/);
  });

  it("live refuses startup without both keys and a valid rate card, naming what is missing", () => {
    expect(() => loadRuntimeConfig({ BASISGUARD_MODE: "live", DATABASE_URL: DB, BASISGUARD_RATE_CARD: RATE })).toThrow(/PARALLEL_API_KEY, OPENAI_API_KEY/);
    expect(() => loadRuntimeConfig({ BASISGUARD_MODE: "live", DATABASE_URL: DB, PARALLEL_API_KEY: "k", OPENAI_API_KEY: "k" })).toThrow(/BASISGUARD_RATE_CARD/);
    expect(() => loadRuntimeConfig({ BASISGUARD_MODE: "live", DATABASE_URL: DB, PARALLEL_API_KEY: "k", OPENAI_API_KEY: "k", BASISGUARD_RATE_CARD: "/nope.json" })).toThrow(ConfigError);
    const ok = loadRuntimeConfig({ BASISGUARD_MODE: "live", DATABASE_URL: DB, PARALLEL_API_KEY: "pk", OPENAI_API_KEY: "ok", BASISGUARD_RATE_CARD: RATE });
    expect(ok).toMatchObject({ mode: "live", parallelApiKey: "pk", openaiApiKey: "ok" });
  });

  it("fixture and replay never carry API keys even if present in env", () => {
    const env = { DATABASE_URL: DB, BASISGUARD_RATE_CARD: RATE, PARALLEL_API_KEY: "leak", OPENAI_API_KEY: "leak" };
    for (const mode of ["fixture", "replay"]) {
      const cfg = loadRuntimeConfig({ ...env, BASISGUARD_MODE: mode });
      expect(JSON.stringify(cfg)).not.toContain("leak");
    }
  });

  it("fixture requires a rate card (budget paths are exercised); replay does not", () => {
    expect(() => loadRuntimeConfig({ BASISGUARD_MODE: "fixture", DATABASE_URL: DB })).toThrow(/BASISGUARD_RATE_CARD/);
    expect(loadRuntimeConfig({ BASISGUARD_MODE: "replay", DATABASE_URL: DB }).mode).toBe("replay");
  });
});
