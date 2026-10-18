import type { Policy } from "@basisguard/contracts";
import type { ClaimVerdict, FieldAction, RepairState } from "@/ui/types";
import type {
  BasisEntry,
  Citation,
  Claim,
  Evidence,
  RepairAttempt,
  ReviewEntry,
  RunEvent,
  RunView,
} from "@/ui/view-models";
import { hex64 } from "./helpers";

const FIXTURE_ORIGIN = "synthetic:ui-prototype";

/** PRD 3.3 terminal action for a final verdict. */
const ACTION_FOR_VERDICT: Record<ClaimVerdict, FieldAction> = {
  supported: "accept",
  insufficient_evidence: "abstain",
  evidence_unavailable: "abstain",
  contradicted: "review",
  verification_failed: "review",
  decomposition_failed: "review",
};

/** PRD 7.1 deterministic templates with `{company}`, `{as_of_date}` and `{value}` slots. */
function renderTemplate(pointer: string, company: string, asOf: string, value: string): string {
  if (pointer === "/official_website") return `As of ${asOf}, ${company} official website is ${value}`;
  if (pointer === "/headquarters") return `As of ${asOf}, ${company} is headquartered in ${value}`;
  if (pointer === "/founding_year") return `${company} was founded in ${value}`;
  if (pointer.startsWith("/founders/")) return `${value} is a founder of ${company}`;
  if (pointer === "/latest_funding/round") {
    return `As of ${asOf}, latest publicly announced financing round for ${company} is ${value}`;
  }
  if (pointer === "/latest_funding/amount_usd") {
    return `As of ${asOf}, amount of latest publicly announced financing round for ${company} is USD ${value}`;
  }
  if (pointer === "/latest_funding/announced_on") {
    return `As of ${asOf}, latest publicly announced financing round for ${company} was announced on ${value}`;
  }
  throw new Error(`No claim template for pointer ${pointer}`);
}

interface ClaimSpec {
  pointer: string;
  value: string;
  confidence: "low" | "medium" | "high";
  /** Initial verdict; null for baseline (not verified). */
  initial: ClaimVerdict | null;
  /** Excerpt the source returned. */
  excerpt: string;
  /** True when extraction failed, so no evidence row exists. */
  noEvidence?: boolean;
  explanation?: string;
  repair?: { state: RepairState; post?: ClaimVerdict; excerpt?: string };
  reviews?: ReviewEntry[];
}

interface RunSpec {
  id: string;
  slug: string;
  company: string;
  policy: Policy;
  processor: string;
  status: RunView["status"];
  errorCode: string | null;
  asOfDate: string;
  createdAt: string;
  taskSnapshot: boolean;
  /** Timestamp of the repair step; must fall inside the run timeline. */
  repairAt: string;
  providerCalls: number;
  extractUrlUnits: number;
  spendEstimatedUsd: string;
  spendReportedUsd: string | null;
  latencyMs: number | null;
  taskOutput: unknown;
  claims: ClaimSpec[];
  unanswered: string[];
  events: RunEvent[];
}

function pointerLeaf(pointer: string): string {
  return pointer.slice(1).replace(/\//g, "-").replace(/_/g, "-");
}

/** One distinct URL per claim pointer, so each evidence URL maps to exactly one hash. */
function sourceUrl(slug: string, pointer: string): string {
  const leaf = pointerLeaf(pointer);
  return pointer.startsWith("/latest_funding")
    ? `https://news.example.com/${slug}-${leaf}`
    : `https://${slug}.example.com/${leaf}`;
}

function buildRun(spec: RunSpec): RunView {
  const checked = spec.policy !== "baseline";
  const evidence: Evidence[] = [];
  const nativeBasis: BasisEntry[] = [];
  const claims: Claim[] = [];

  spec.claims.forEach((c, index) => {
    const n = index + 1;
    const url = sourceUrl(spec.slug, c.pointer);
    const citation: Citation = { url, title: `${spec.company} source ${n}`, excerpt: c.excerpt };
    const evidenceId = `${spec.slug}-ev-${n}`;
    if (!c.noEvidence) {
      evidence.push({ id: evidenceId, url, excerpt: c.excerpt, contentHash: hex64(`${spec.slug}:${c.pointer}:initial`) });
    }

    let repair: RepairAttempt | null = null;
    if (c.repair) {
      const at = spec.repairAt;
      if (c.repair.state === "succeeded") {
        const repairId = `${spec.slug}-rp-${n}`;
        const repairUrl = `https://news.example.com/${spec.slug}-${pointerLeaf(c.pointer)}-followup`;
        evidence.push({
          id: repairId,
          url: repairUrl,
          excerpt: c.repair.excerpt ?? c.excerpt,
          contentHash: hex64(`${spec.slug}:${c.pointer}:repair`),
        });
        repair = {
          state: "succeeded",
          evidenceIds: [repairId],
          postVerdict: c.repair.post,
          bundleHash: hex64(`${spec.slug}:${c.pointer}:bundle`),
          at,
        };
      } else {
        repair = { state: c.repair.state, evidenceIds: [], at };
      }
    }

    const finalVerdict = checked ? (repair?.postVerdict ?? c.initial) : null;
    claims.push({
      id: `${spec.slug}-claim-${n}`,
      pointer: c.pointer,
      template: renderTemplate(c.pointer, spec.company, spec.asOfDate, c.value),
      originalValue: c.value,
      upstreamConfidence: c.confidence,
      citations: [citation],
      initialVerdict: checked ? c.initial : null,
      finalVerdict,
      action: finalVerdict ? ACTION_FOR_VERDICT[finalVerdict] : null,
      ...(checked ? {} : { fieldState: "unverified" as const }),
      judgeEvidenceIds: checked && !c.noEvidence ? [evidenceId] : [],
      ...(checked && c.explanation ? { judgeExplanation: c.explanation } : {}),
      repair,
      reviews: c.reviews ?? [],
    });
    nativeBasis.push({
      field: c.pointer,
      reasoning: `The research task cites ${url} for this value.`,
      citations: [citation],
      confidence: c.confidence,
    });
  });

  return {
    id: spec.id,
    source: "fixture",
    company: spec.company,
    domain: `${spec.slug}.example.com`,
    policy: spec.policy,
    processor: spec.processor,
    mode: "fixture",
    status: spec.status,
    errorCode: spec.errorCode,
    asOfDate: spec.asOfDate,
    createdAt: spec.createdAt,
    taskSnapshotHash: spec.taskSnapshot ? hex64(`${spec.slug}:task-snapshot`) : null,
    fixtureOrigin: FIXTURE_ORIGIN,
    providerCalls: spec.providerCalls,
    extractUrlUnits: spec.extractUrlUnits,
    spendEstimatedUsd: spec.spendEstimatedUsd,
    spendReportedUsd: spec.spendReportedUsd,
    latencyMs: spec.latencyMs,
    taskOutput: spec.taskOutput,
    nativeBasis,
    claims,
    unanswered: spec.unanswered,
    evidence,
    events: spec.events,
  };
}

const AS_OF = "2026-09-30";

const northwind = buildRun({
  id: "6f1c2a4e-3b7d-4e19-9a52-0c8d7e41b3a1",
  slug: "northwind",
  company: "Northwind Robotics",
  policy: "verify_and_repair",
  processor: "base",
  status: "needs_review",
  errorCode: null,
  asOfDate: AS_OF,
  createdAt: "2026-10-02T09:00:00Z",
  taskSnapshot: true,
  repairAt: "2026-10-02T09:14:00Z",
  providerCalls: 6,
  extractUrlUnits: 3,
  spendEstimatedUsd: "0.640000",
  spendReportedUsd: "0.587500",
  latencyMs: 214000,
  taskOutput: {
    company_name: "Northwind Robotics",
    official_website: "https://northwind.example.com",
    headquarters: "Pittsburgh, Pennsylvania, USA",
    founding_year: 2017,
    founders: ["Priya Raman", "Tomas Okafor"],
    latest_funding: { round: "Series B", amount_usd: 42000000, announced_on: "2026-03-12" },
  },
  unanswered: [],
  claims: [
    {
      pointer: "/official_website",
      value: "https://northwind.example.com",
      confidence: "high",
      initial: "supported",
      excerpt: "Northwind Robotics builds warehouse robots. Visit northwind.example.com.",
      explanation: "The excerpt names the company and the stated website.",
    },
    {
      pointer: "/headquarters",
      value: "Pittsburgh, Pennsylvania, USA",
      confidence: "high",
      initial: "supported",
      excerpt: "Our headquarters are in Pittsburgh, Pennsylvania.",
      explanation: "The excerpt states the headquarters location directly.",
    },
    {
      pointer: "/founding_year",
      value: "2017",
      confidence: "medium",
      initial: "insufficient_evidence",
      excerpt: "Northwind has been shipping robots for nearly a decade.",
      explanation: "The excerpt does not give a founding year.",
      repair: {
        state: "succeeded",
        post: "supported",
        excerpt: "Founded in 2017, Northwind Robotics opened its first plant in Pittsburgh.",
      },
    },
    {
      pointer: "/founders/0",
      value: "Priya Raman",
      confidence: "high",
      initial: "supported",
      excerpt: "Priya Raman co-founded Northwind Robotics.",
      explanation: "The excerpt names Priya Raman as a co-founder.",
    },
    {
      pointer: "/founders/1",
      value: "Tomas Okafor",
      confidence: "low",
      initial: "contradicted",
      excerpt: "Northwind was founded by Priya Raman and Elena Brandt.",
      explanation: "The excerpt lists a different second founder.",
      repair: { state: "not_eligible" },
      reviews: [
        {
          decision: "needs_followup",
          alias: "reviewer-a",
          at: "2026-10-02T11:30:00Z",
          rationale: "Another page lists Tomas Okafor as an early employee; confirm with a primary source.",
        },
      ],
    },
    {
      pointer: "/latest_funding/round",
      value: "Series B",
      confidence: "medium",
      initial: "evidence_unavailable",
      excerpt: "Funding announcement page could not be fetched.",
      noEvidence: true,
      explanation: "The cited page could not be extracted.",
      repair: { state: "budget_exhausted" },
    },
    {
      pointer: "/latest_funding/amount_usd",
      value: "42000000",
      confidence: "medium",
      initial: "supported",
      excerpt: "Northwind raised $42 million.",
      explanation: "The excerpt states a $42 million raise.",
    },
    {
      pointer: "/latest_funding/announced_on",
      value: "2026-03-12",
      confidence: "low",
      initial: "verification_failed",
      excerpt: "The announcement was published in March.",
      explanation: "The judge response failed schema validation twice.",
      repair: { state: "not_eligible" },
    },
  ],
  events: [
    { at: "2026-10-02T09:00:00Z", kind: "run.created", detail: "Run created with verify_and_repair policy." },
    { at: "2026-10-02T09:00:04Z", kind: "task.submitted", detail: "Research task submitted with the base processor." },
    { at: "2026-10-02T09:03:30Z", kind: "task.completed", detail: "Task output stored with 8 claim-bearing fields." },
    { at: "2026-10-02T09:03:41Z", kind: "verification.completed", detail: "Initial verdicts recorded for 8 claims." },
    { at: "2026-10-02T09:14:00Z", kind: "repair.attempted", detail: "Evidence repair succeeded for /founding_year; budget stopped /latest_funding/round." },
    { at: "2026-10-02T09:14:20Z", kind: "run.needs_review", detail: "2 fields need manual review." },
  ],
});

const halcyon = buildRun({
  id: "b3e8d5c0-7a42-4f6b-8d13-5e2a9c7f0d64",
  slug: "halcyon",
  company: "Halcyon Freight",
  policy: "verify",
  processor: "core",
  status: "complete",
  errorCode: null,
  asOfDate: AS_OF,
  createdAt: "2026-10-03T14:20:00Z",
  taskSnapshot: true,
  repairAt: "2026-10-03T14:22:55Z",
  providerCalls: 4,
  extractUrlUnits: 2,
  spendEstimatedUsd: "0.410000",
  spendReportedUsd: "0.395000",
  latencyMs: 158000,
  taskOutput: {
    company_name: "Halcyon Freight",
    official_website: "https://halcyon.example.com",
    headquarters: "Rotterdam, Netherlands",
    founding_year: 2014,
    founders: ["Marit de Vries"],
    latest_funding: { round: "Series C", amount_usd: 88000000, announced_on: "2026-05-20" },
  },
  unanswered: [],
  claims: [
    {
      pointer: "/official_website",
      value: "https://halcyon.example.com",
      confidence: "high",
      initial: "supported",
      excerpt: "Halcyon Freight: ocean and rail logistics. halcyon.example.com",
    },
    {
      pointer: "/headquarters",
      value: "Rotterdam, Netherlands",
      confidence: "medium",
      initial: "insufficient_evidence",
      excerpt: "Halcyon operates terminals across northern Europe.",
      explanation: "The excerpt does not name a headquarters.",
      repair: { state: "policy_disabled" },
    },
    {
      pointer: "/founding_year",
      value: "2014",
      confidence: "high",
      initial: "supported",
      excerpt: "Since 2014, Halcyon Freight has moved containers through Rotterdam.",
    },
    {
      pointer: "/founders/0",
      value: "Marit de Vries",
      confidence: "high",
      initial: "supported",
      excerpt: "Founder Marit de Vries started Halcyon Freight.",
    },
    {
      pointer: "/latest_funding/round",
      value: "Series C",
      confidence: "high",
      initial: "supported",
      excerpt: "Halcyon closed its Series C round.",
    },
    {
      pointer: "/latest_funding/amount_usd",
      value: "88000000",
      confidence: "medium",
      initial: "supported",
      excerpt: "The Series C totals $88 million.",
    },
    {
      pointer: "/latest_funding/announced_on",
      value: "2026-05-20",
      confidence: "medium",
      initial: "supported",
      excerpt: "Announced on 20 May 2026.",
    },
  ],
  events: [
    { at: "2026-10-03T14:20:00Z", kind: "run.created", detail: "Run created with verify policy." },
    { at: "2026-10-03T14:20:03Z", kind: "task.submitted", detail: "Research task submitted with the core processor." },
    { at: "2026-10-03T14:22:41Z", kind: "task.completed", detail: "Task output stored with 7 claim-bearing fields." },
    { at: "2026-10-03T14:22:55Z", kind: "verification.completed", detail: "6 claims supported, 1 without enough evidence." },
    { at: "2026-10-03T14:22:56Z", kind: "run.complete", detail: "No fields need review; 1 field abstained." },
  ],
});

const tamarack = buildRun({
  id: "0d9a7e12-c4b5-4a8e-b6f3-91d2e8a5c740",
  slug: "tamarack",
  company: "Tamarack Bio",
  policy: "baseline",
  processor: "lite",
  status: "complete",
  errorCode: null,
  asOfDate: AS_OF,
  createdAt: "2026-10-04T08:05:00Z",
  taskSnapshot: true,
  repairAt: "2026-10-04T08:06:04Z",
  providerCalls: 1,
  extractUrlUnits: 0,
  spendEstimatedUsd: "0.050000",
  spendReportedUsd: "0.047000",
  latencyMs: 61000,
  taskOutput: {
    company_name: "Tamarack Bio",
    official_website: "https://tamarack.example.com",
    headquarters: "Boston, Massachusetts, USA",
    founding_year: null,
    founders: ["Dana Whitfield"],
    latest_funding: { round: "Seed", amount_usd: 6500000, announced_on: "2026-01-14" },
  },
  unanswered: ["/founding_year"],
  claims: [
    {
      pointer: "/official_website",
      value: "https://tamarack.example.com",
      confidence: "high",
      initial: null,
      excerpt: "Tamarack Bio develops enzyme therapies.",
    },
    {
      pointer: "/headquarters",
      value: "Boston, Massachusetts, USA",
      confidence: "medium",
      initial: null,
      excerpt: "Tamarack Bio, Boston, MA.",
    },
    {
      pointer: "/founders/0",
      value: "Dana Whitfield",
      confidence: "medium",
      initial: null,
      excerpt: "Dana Whitfield, founder and CEO.",
    },
    {
      pointer: "/latest_funding/round",
      value: "Seed",
      confidence: "low",
      initial: null,
      excerpt: "Tamarack closed a seed round.",
    },
    {
      pointer: "/latest_funding/amount_usd",
      value: "6500000",
      confidence: "low",
      initial: null,
      excerpt: "The seed round was $6.5 million.",
    },
    {
      pointer: "/latest_funding/announced_on",
      value: "2026-01-14",
      confidence: "low",
      initial: null,
      excerpt: "Announced January 14.",
    },
  ],
  events: [
    { at: "2026-10-04T08:05:00Z", kind: "run.created", detail: "Run created with baseline policy." },
    { at: "2026-10-04T08:05:02Z", kind: "task.submitted", detail: "Research task submitted with the lite processor." },
    { at: "2026-10-04T08:06:03Z", kind: "task.completed", detail: "Task output stored; founding year was not found." },
    { at: "2026-10-04T08:06:04Z", kind: "run.complete", detail: "Baseline run complete; populated fields are unverified." },
  ],
});

const lumen = buildRun({
  id: "a47f03bd-9e61-4c2a-8f75-3b1d6e9a2c58",
  slug: "lumen",
  company: "Lumen Ledger",
  policy: "verify",
  processor: "core",
  status: "failed",
  errorCode: "provider_rate_limited",
  asOfDate: AS_OF,
  createdAt: "2026-10-05T16:45:00Z",
  taskSnapshot: false,
  repairAt: "2026-10-05T16:45:10Z",
  providerCalls: 1,
  extractUrlUnits: 0,
  spendEstimatedUsd: "0.050000",
  spendReportedUsd: "0.000000",
  latencyMs: 8200,
  taskOutput: null,
  claims: [],
  unanswered: [],
  events: [
    { at: "2026-10-05T16:45:00Z", kind: "run.created", detail: "Run created with verify policy." },
    { at: "2026-10-05T16:45:02Z", kind: "task.submitted", detail: "Research task submission sent to the provider." },
    { at: "2026-10-05T16:45:09Z", kind: "provider.error", detail: "Provider rejected the submission: rate limit reached." },
    { at: "2026-10-05T16:45:10Z", kind: "run.failed", detail: "Run failed with provider_rate_limited. Runs are never restarted." },
  ],
});

const orchard = buildRun({
  id: "e5c21b98-0f3a-4d77-a1e4-72b8c0d9f316",
  slug: "orchard",
  company: "Orchard Systems",
  policy: "verify_and_repair",
  processor: "base",
  status: "researching",
  errorCode: null,
  asOfDate: AS_OF,
  createdAt: "2026-10-06T10:30:00Z",
  taskSnapshot: false,
  repairAt: "2026-10-06T10:31:05Z",
  providerCalls: 1,
  extractUrlUnits: 0,
  spendEstimatedUsd: "0.100000",
  spendReportedUsd: null,
  latencyMs: null,
  taskOutput: null,
  claims: [],
  unanswered: [],
  events: [
    { at: "2026-10-06T10:30:00Z", kind: "run.created", detail: "Run created with verify_and_repair policy." },
    { at: "2026-10-06T10:30:03Z", kind: "task.submitted", detail: "Research task submitted with the base processor." },
    { at: "2026-10-06T10:30:05Z", kind: "run.researching", detail: "Waiting for the provider to finish the research task." },
    { at: "2026-10-06T10:31:05Z", kind: "poll.checked", detail: "Provider reports the task is still running." },
  ],
});

export const FIXTURE_RUNS: readonly RunView[] = [northwind, halcyon, tamarack, lumen, orchard];
