import { describe, expect, it } from "vitest";
import {
  EVALUATION_IDS,
  FIXTURE_RUN_IDS,
  getEvaluation,
  getFixtureRun,
  listEvaluations,
  listFixtureRuns,
} from "./index";
import type { Claim, RunView } from "../view-models";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MONEY = /^\d+\.\d{6}$/;
const HEX64 = /^[0-9a-f]{64}$/;

function collectUrls(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") {
    if (/^[a-z]+:\/\//i.test(value)) out.push(value);
  } else if (Array.isArray(value)) {
    value.forEach((v) => collectUrls(v, out));
  } else if (value && typeof value === "object") {
    Object.values(value).forEach((v) => collectUrls(v, out));
  }
  return out;
}

async function runs(): Promise<RunView[]> {
  return listFixtureRuns();
}

describe("fixture runs", () => {
  it("exposes five runs with valid unique v4 ids matching FIXTURE_RUN_IDS", async () => {
    const all = await runs();
    expect(all).toHaveLength(5);
    expect(new Set(all.map((r) => r.id)).size).toBe(5);
    for (const r of all) expect(r.id).toMatch(UUID_V4);
    expect([...FIXTURE_RUN_IDS].sort()).toEqual(all.map((r) => r.id).sort());
    for (const r of all) expect(await getFixtureRun(r.id)).toEqual(r);
    expect(await getFixtureRun("00000000-0000-4000-8000-000000000000")).toBeUndefined();
  });

  it("marks every run as synthetic fixture", async () => {
    for (const r of await runs()) {
      expect(r.source).toBe("fixture");
      expect(r.mode).toBe("fixture");
      expect(r.fixtureOrigin).toBe("synthetic:ui-prototype");
      expect(r.events.length).toBeGreaterThanOrEqual(4);
      expect(r.events.length).toBeLessThanOrEqual(8);
    }
  });

  it("references only evidence that exists in the run", async () => {
    for (const r of await runs()) {
      const ids = new Set(r.evidence.map((e) => e.id));
      for (const e of r.evidence) expect(e.contentHash).toMatch(HEX64);
      for (const c of r.claims) {
        for (const id of c.judgeEvidenceIds) expect(ids.has(id), `${r.company} ${c.pointer} judge ${id}`).toBe(true);
        for (const id of c.repair?.evidenceIds ?? []) expect(ids.has(id), `${r.company} ${c.pointer} repair ${id}`).toBe(true);
      }
    }
  });

  it("uses only https URLs on example.com hosts", async () => {
    for (const r of await runs()) {
      const urls = collectUrls(r);
      if (r.claims.length > 0) expect(urls.length).toBeGreaterThan(0);
      for (const u of urls) {
        const parsed = new URL(u);
        expect(parsed.protocol, u).toBe("https:");
        expect(parsed.hostname.endsWith("example.com"), u).toBe(true);
      }
    }
  });

  it("keeps baseline claims unverified with no verdict or action", async () => {
    const baseline = (await runs()).filter((r) => r.policy === "baseline");
    expect(baseline.length).toBeGreaterThan(0);
    for (const r of baseline) {
      expect(r.claims.length).toBeGreaterThan(0);
      for (const c of r.claims) {
        expect(c.fieldState).toBe("unverified");
        expect(c.initialVerdict).toBeNull();
        expect(c.finalVerdict).toBeNull();
        expect(c.action).toBeNull();
        expect(c.repair).toBeNull();
      }
    }
  });

  it("derives run status from field actions for checked policies", async () => {
    const checked = (await runs()).filter((r) => r.policy !== "baseline" && r.claims.length > 0);
    expect(checked.length).toBeGreaterThan(0);
    for (const r of checked) {
      const hasReview = r.claims.some((c) => c.action === "review");
      expect(r.status === "needs_review", r.company).toBe(hasReview);
      if (!hasReview) expect(r.status).toBe("complete");
    }
  });

  it("maps final verdicts to actions per PRD 3.3", async () => {
    const map: Record<string, Claim["action"]> = {
      contradicted: "review",
      verification_failed: "review",
      decomposition_failed: "review",
      supported: "accept",
      insufficient_evidence: "abstain",
      evidence_unavailable: "abstain",
    };
    for (const r of await runs()) {
      for (const c of r.claims) {
        if (c.finalVerdict === null) continue;
        expect(c.action, `${r.company} ${c.pointer}`).toBe(map[c.finalVerdict]);
      }
    }
  });

  it("covers the required scenarios", async () => {
    const byDomain: Record<string, RunView> = Object.fromEntries((await runs()).map((r) => [r.domain ?? "", r]));
    const nw = byDomain["northwind.example.com"]!;
    expect(nw.policy).toBe("verify_and_repair");
    expect(nw.status).toBe("needs_review");
    expect(nw.claims).toHaveLength(8);
    expect(nw.claims.find((c) => c.pointer === "/founding_year")?.repair?.state).toBe("succeeded");
    const lumen = byDomain["lumen.example.com"]!;
    expect(lumen.status).toBe("failed");
    expect(lumen.errorCode).toBe("provider_rate_limited");
    expect(lumen.claims).toHaveLength(0);
    const orchard = byDomain["orchard.example.com"]!;
    expect(orchard.status).toBe("researching");
    expect(orchard.latencyMs).toBeNull();
    expect(orchard.spendReportedUsd).toBeNull();
    const tamarack = byDomain["tamarack.example.com"]!;
    expect(tamarack.unanswered).toContain("/founding_year");
    expect((tamarack.taskOutput as Record<string, unknown>).founding_year).toBeNull();
  });

  it("formats money as 6-dp strings", async () => {
    for (const r of await runs()) {
      for (const v of [r.spendEstimatedUsd, r.spendReportedUsd]) if (v !== null) expect(v).toMatch(MONEY);
    }
    for (const e of await listEvaluations()) {
      expect(e.spendActualUsd).toMatch(MONEY);
      for (const s of e.spendAttributed) expect(s.usd).toMatch(MONEY);
    }
  });
});

describe("fixture evaluations", () => {
  it("exposes two evaluations matching EVALUATION_IDS", async () => {
    const all = await listEvaluations();
    expect(all).toHaveLength(2);
    for (const e of all) {
      expect(e.id).toMatch(UUID_V4);
      expect(await getEvaluation(e.id)).toEqual(e);
    }
    expect([...EVALUATION_IDS].sort()).toEqual(all.map((e) => e.id).sort());
    expect(await getEvaluation("nope")).toBeUndefined();
  });

  it("describes dataset v3 and v4-draft per the brief", async () => {
    const all = await listEvaluations();
    const v3 = all.find((e) => e.datasetVersion === "v3")!;
    expect(v3.status).toBe("complete");
    expect(v3.preview).toBe(false);
    expect(v3.cases).toHaveLength(3);
    expect(v3.cases.filter((c) => c.kind === "natural")).toHaveLength(2);
    expect(v3.cases.filter((c) => c.perturbation === "founder_swap")).toHaveLength(1);
    const v4 = all.find((e) => e.datasetVersion === "v4-draft")!;
    expect(v4.status).toBe("needs_review");
    expect(v4.preview).toBe(true);
    expect(v4.supportLabelsDone).toBe(14);
    expect(v4.supportLabelsTotal).toBe(21);
    expect(v4.repairLabelQueue).toBe(3);
  });

  it("gives B and C identical initial hashes per case and separates spend", async () => {
    for (const e of await listEvaluations()) {
      expect(e.snapshotHash).toMatch(HEX64);
      expect(e.manifestHash).toMatch(HEX64);
      for (const c of e.cases) {
        expect(c.bInitialHash).toMatch(HEX64);
        expect(c.bInitialHash).toBe(c.cInitialHash);
        expect(c.cPostRepair).toMatch(HEX64);
      }
      expect(e.spendAttributed.map((s) => s.policy).sort()).toEqual(["baseline", "verify", "verify_and_repair"]);
    }
  });
});
