import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ConfigError, loadRateCard } from "./rate-card";

const pinned = fileURLToPath(new URL("../../../config/rate-cards/parallel-2026-10-17.json", import.meta.url));

describe("loadRateCard", () => {
  it("loads, validates and fingerprints the file bytes", () => {
    const { card, sha256 } = loadRateCard(pinned);
    expect(card.version).toBe("parallel-2026-10-17");
    expect(sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("throws ConfigError for missing, non-JSON or invalid files", () => {
    expect(() => loadRateCard("/nonexistent/card.json")).toThrow(ConfigError);
    const dir = mkdtempSync(join(tmpdir(), "rc-"));
    const notJson = join(dir, "x.json");
    writeFileSync(notJson, "{nope");
    expect(() => loadRateCard(notJson)).toThrow(ConfigError);
    const bad = join(dir, "bad.json");
    writeFileSync(bad, JSON.stringify({ version: "nope" }));
    expect(() => loadRateCard(bad)).toThrow(ConfigError);
  });
});
