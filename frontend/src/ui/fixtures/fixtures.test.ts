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

function sum(c: Record<string, number>): number {
  return Object.values(c).reduce((a, b) => a + b, 0);
}

function micros(usd: string): number {
  const [whole, frac] = usd.split(".");
  return Number(whole) * 1_000_000 + Number(frac);
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
        expect(parsed.hostname === "example.com" || parsed.hostname.endsWith(".example.com"), u).toBe(true);
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

  it("keeps repair attempts coherent with verdicts and policy", async () => {
    const reviewOnly: (Claim["initialVerdict"])[] = ["contradicted", "verification_failed", "decomposition_failed"];
    let seen = 0;
    for (const r of await runs()) {
      for (const c of r.claims) {
        if (!c.repair) continue;
        seen += 1;
        const label = `${r.company} ${c.pointer}`;
        if (c.repair.state === "succeeded") {
          expect(c.repair.postVerdict, label).toBeDefined();
          expect(c.repair.bundleHash, label).toMatch(HEX64);
          expect(c.finalVerdict, label).toBe(c.repair.postVerdict);
          expect(c.repair.evidenceIds.length, label).toBeGreaterThan(0);
        } else {
          expect(c.repair.postVerdict, label).toBeUndefined();
          expect(c.finalVerdict, label).toBe(c.initialVerdict);
        }
        if (c.repair.state === "not_eligible") expect(reviewOnly, label).toContain(c.initialVerdict);
        if (c.repair.state === "policy_disabled") expect(r.policy, label).toBe("verify");
        if (reviewOnly.includes(c.initialVerdict)) expect(c.repair.state, label).toBe("not_eligible");
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it("places repair timestamps inside the run timeline", async () => {
    for (const r of await runs()) {
      const last = r.events[r.events.length - 1]!.at;
      for (const c of r.claims) {
        if (!c.repair) continue;
        expect(c.repair.at >= r.createdAt, `${r.company} ${c.pointer} after createdAt`).toBe(true);
        expect(c.repair.at <= last, `${r.company} ${c.pointer} before last event`).toBe(true);
      }
      const sorted = [...r.events].map((e) => e.at).sort();
      expect(r.events.map((e) => e.at)).toEqual(sorted);
      expect(r.events[0]!.at >= r.createdAt).toBe(true);
    }
  });

  it("maps each evidence URL to exactly one hash and excerpt", async () => {
    for (const r of await runs()) {
      const byUrl = new Map<string, string>();
      for (const e of r.evidence) {
        expect(byUrl.has(e.url), `${r.company} duplicate evidence url ${e.url}`).toBe(false);
        byUrl.set(e.url, e.contentHash);
      }
      // A claim with no evidence row (unavailable) must not share its URL with fetched evidence.
      for (const c of r.claims) {
        if (c.judgeEvidenceIds.length > 0 || c.repair?.evidenceIds.length) continue;
        if (r.policy === "baseline") continue;
        for (const cite of c.citations) expect(byUrl.has(cite.url), cite.url).toBe(false);
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

  it("keeps case rows internally consistent", async () => {
    for (const e of await listEvaluations()) {
      expect(e.cases.length).toBe(e.casesNatural + e.casesPerturbed);
      expect(e.cases.filter((c) => c.kind === "natural")).toHaveLength(e.casesNatural);
      expect(e.cases.filter((c) => c.kind === "perturbed")).toHaveLength(e.casesPerturbed);
      const seeded = new Set(["Northwind Robotics", "Halcyon Freight", "Tamarack Bio", "Lumen Ledger", "Orchard Systems"]);
      for (const c of e.cases) {
        expect(seeded.has(c.company), c.company).toBe(false);
        expect(sum(c.b), c.id).toBe(c.aUnverified);
        expect(sum(c.c), c.id).toBe(c.aUnverified);
        expect(c.c.accept).toBeGreaterThanOrEqual(c.b.accept);
        expect(c.c.abstain).toBeLessThanOrEqual(c.b.abstain);
        expect(c.c.review).toBe(c.b.review);
        expect(c.bInitialHash).toMatch(HEX64);
        expect(c.bInitialHash).toBe(c.cInitialHash);
        expect(c.cPostRepair).toMatch(HEX64);
        expect(c.cPostRepair).not.toBe(c.cInitialHash);
      }
      expect(new Set(e.cases.map((c) => c.bInitialHash)).size).toBe(e.cases.length);
      expect(e.snapshotHash).toMatch(HEX64);
      expect(e.manifestHash).toMatch(HEX64);
    }
  });

  it("keeps metric strata consistent with totals and case rows", async () => {
    for (const e of await listEvaluations()) {
      const fieldsByKind = (kind: "natural" | "perturbed") =>
        e.cases.filter((c) => c.kind === kind).reduce((n, c) => n + c.aUnverified, 0);
      for (const m of [...e.initialMetrics, ...e.repairMetrics]) {
        expect(m.natural.numerator + m.synthetic.numerator, m.label).toBe(m.numerator);
        expect(m.natural.denominator + m.synthetic.denominator, m.label).toBe(m.denominator);
        for (const s of [m, m.natural, m.synthetic]) expect(s.numerator).toBeLessThanOrEqual(s.denominator);
        expect(m.missingLabels).toBeGreaterThanOrEqual(0);
      }
      for (const m of e.initialMetrics) {
        expect(m.natural.denominator, m.label).toBe(fieldsByKind("natural"));
        expect(m.synthetic.denominator, m.label).toBe(fieldsByKind("perturbed"));
      }
      const accepted = e.initialMetrics.find((m) => m.label.startsWith("Fields accepted"))!;
      expect(accepted.numerator).toBe(e.cases.reduce((n, c) => n + c.b.accept, 0));
      const recovered = e.repairMetrics[0]!;
      expect(recovered.denominator).toBe(e.cases.reduce((n, c) => n + c.b.abstain, 0));
      // Label readiness: complete datasets have no missing labels.
      const pending = e.supportLabelsTotal - e.supportLabelsDone;
      for (const m of e.initialMetrics) expect(m.missingLabels).toBe(pending);
      for (const m of e.repairMetrics) expect(m.missingLabels).toBe(e.repairLabelQueue);
      expect(e.supportLabelsTotal).toBe(e.cases.reduce((n, c) => n + c.aUnverified, 0));
    }
  });

  it("separates actual from attributed spend per PRD 3.2", async () => {
    for (const e of await listEvaluations()) {
      const by = Object.fromEntries(e.spendAttributed.map((s) => [s.policy, micros(s.usd)]));
      expect(Object.keys(by).sort()).toEqual(["baseline", "verify", "verify_and_repair"]);
      expect(by.verify!).toBeGreaterThan(by.baseline!);
      expect(by.verify_and_repair!).toBeGreaterThanOrEqual(by.verify!);
      // Task acquired in dataset prep, so actual = judge + repair = attributed C - attributed A.
      expect(micros(e.spendActualUsd)).toBe(by.verify_and_repair! - by.baseline!);
    }
  });
});
