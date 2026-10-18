import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { acquireProbeLock, parseProbeArgs } from "./gate-a-probe-lib";

describe("gate-a probe args", () => {
  it("is unauthorized unless the explicit flag is present", () => {
    expect(parseProbeArgs([], "2026-10-17").authorized).toBe(false);
    expect(parseProbeArgs(["--authorize-paid-one-call"], "2026-10-17").authorized).toBe(true);
  });

  it("parses options with safe defaults", () => {
    const a = parseProbeArgs(["--company", "Stripe", "--domain", "stripe.com", "--timeout-minutes", "5"], "2026-10-17");
    expect(a).toMatchObject({ companyName: "Stripe", officialDomain: "stripe.com", asOfDate: "2026-10-17", processor: "base", timeoutMs: 300_000 });
    expect(parseProbeArgs([], "2026-10-17").timeoutMs).toBe(900_000);
  });

  it("rejects unknown processors, flags and missing values", () => {
    expect(() => parseProbeArgs(["--processor", "mega"], "2026-10-17")).toThrow(/processor/);
    expect(() => parseProbeArgs(["--yolo"], "2026-10-17")).toThrow(/unknown argument/);
    expect(() => parseProbeArgs(["--company"], "2026-10-17")).toThrow(/missing value/);
  });
});

describe("gate-a probe lock", () => {
  it("allows exactly one probe per lock directory", async () => {
    const dir = mkdtempSync(join(tmpdir(), "gate-a-"));
    await expect(acquireProbeLock(dir)).resolves.toMatch(/probe\.lock$/);
    await expect(acquireProbeLock(dir)).rejects.toThrow(/already ran/);
  });
});
