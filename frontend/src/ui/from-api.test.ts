import { describe, expect, it } from "vitest";
import { fromApiDetail, type ApiRunDetail, type ApiRunEvent } from "./from-api";

function detail(over: Partial<ApiRunDetail> = {}, basis: unknown = []): ApiRunDetail {
  return {
    run: {
      id: "11111111-1111-4111-8111-111111111111",
      status: "complete",
      errorCode: null,
      policy: "baseline",
      processor: "base",
      providerRunId: "trun_1",
      input: { company_name: "Acme Corp", official_domain: "acme.example.com", as_of_date: "2026-10-01" },
      createdAt: "2026-10-01T09:00:00.000Z",
      completedAt: "2026-10-01T09:01:00.000Z",
      deadlineAt: "2026-10-01T09:30:00.000Z",
    },
    taskArtifact: { id: "a1", contentHash: "ab".repeat(32), fixtureOrigin: "hand-authored:x", content: { hq: "San Francisco" }, basis },
    spend: { usd: "0.010000", httpRequests: 3, byCostKind: { reported: 0, estimated: 3, unknown: 0 } },
    ...over,
  };
}

const events: ApiRunEvent[] = [{ id: "e1", type: "run.created", createdAt: "2026-10-01T09:00:00.000Z", details: { a: 1 } }];

describe("fromApiDetail", () => {
  it("maps a well-formed detail", () => {
    const basis = [
      {
        field: "headquarters",
        reasoning: "Because.",
        confidence: "high",
        citations: [{ url: "https://acme.example.com/about", title: "About", excerpts: ["We are in SF"] }],
      },
    ];
    const v = fromApiDetail(detail({}, basis), events);
    expect(v).toMatchObject({
      id: "11111111-1111-4111-8111-111111111111",
      source: "api",
      mode: null,
      company: "Acme Corp",
      domain: "acme.example.com",
      asOfDate: "2026-10-01",
      policy: "baseline",
      status: "complete",
      errorCode: null,
      createdAt: "2026-10-01T09:00:00.000Z",
      taskOutput: { hq: "San Francisco" },
      taskSnapshotHash: "ab".repeat(32),
      fixtureOrigin: "hand-authored:x",
      providerCalls: 3,
      spendEstimatedUsd: "0.010000",
      claims: [],
      evidence: [],
    });
    expect(v.nativeBasis).toEqual([
      {
        field: "headquarters",
        reasoning: "Because.",
        confidence: "high",
        citations: [{ url: "https://acme.example.com/about", title: "About", excerpt: "We are in SF" }],
      },
    ]);
    expect(v.events).toEqual([{ at: "2026-10-01T09:00:00.000Z", kind: "run.created", detail: '{"a":1}' }]);
  });

  it.each([null, "nope", 5, {}, [null, "x", { reasoning: "no field" }, { field: 3 }]])(
    "malformed basis %j yields no entries and never throws",
    (basis) => {
      expect(fromApiDetail(detail({}, basis), []).nativeBasis).toEqual([]);
    },
  );

  it("drops non-https citations and tolerates bad excerpts", () => {
    const basis = [
      {
        field: "f",
        citations: [
          { url: "http://insecure.example.com", title: "no" },
          { url: "https://ok.example.com", excerpts: "not-an-array" },
          { url: "https://ok2.example.com", title: "T", excerpts: [7] },
          null,
        ],
      },
    ];
    const [entry] = fromApiDetail(detail({}, basis), []).nativeBasis;
    expect(entry).toEqual({
      field: "f",
      reasoning: "",
      confidence: null,
      citations: [
        { url: "https://ok.example.com", title: "https://ok.example.com", excerpt: "" },
        { url: "https://ok2.example.com", title: "T", excerpt: "" },
      ],
    });
  });

  it("maps a missing task artifact to null output and empty basis", () => {
    const v = fromApiDetail(detail({ taskArtifact: null }), []);
    expect(v.taskOutput).toBeNull();
    expect(v.taskSnapshotHash).toBeNull();
    expect(v.fixtureOrigin).toBeNull();
    expect(v.nativeBasis).toEqual([]);
  });
});
