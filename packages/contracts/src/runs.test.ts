import { describe, expect, it } from "vitest";
import { ApiErrorCode, CreateRunRequest, StoredRunInput } from "./runs";

const valid = {
  request_key: "6f2c1c9e-1d7e-4c47-9a3a-1b1b6f0a9f11",
  company_name: "Example Corp",
  profile: "startup_facts_v1",
  policy: "baseline",
};

describe("CreateRunRequest (FR-01)", () => {
  it("applies documented defaults", () => {
    expect(CreateRunRequest.parse(valid)).toMatchObject({
      processor: "base", max_provider_calls: 12, max_estimated_usd: "5.000000", deadline_minutes: 30,
    });
  });

  it("trims and bounds company_name to 2–120 chars", () => {
    expect(CreateRunRequest.parse({ ...valid, company_name: "  Ab  " }).company_name).toBe("Ab");
    expect(CreateRunRequest.safeParse({ ...valid, company_name: "A" }).success).toBe(false);
    expect(CreateRunRequest.safeParse({ ...valid, company_name: "x".repeat(121) }).success).toBe(false);
  });

  it("validates official_domain as a hostname and lowercases it", () => {
    expect(CreateRunRequest.parse({ ...valid, official_domain: "Example.COM" }).official_domain).toBe("example.com");
    for (const bad of ["https://example.com", "localhost", "exa mple.com", "-a.com", "a..com"]) {
      expect(CreateRunRequest.safeParse({ ...valid, official_domain: bad }).success).toBe(false);
    }
  });

  it("requires a real ISO calendar date when as_of_date is given", () => {
    expect(CreateRunRequest.safeParse({ ...valid, as_of_date: "2026-02-29" }).success).toBe(false);
    expect(CreateRunRequest.safeParse({ ...valid, as_of_date: "2026-13-01" }).success).toBe(false);
    expect(CreateRunRequest.safeParse({ ...valid, as_of_date: "2028-02-29" }).success).toBe(true);
  });

  it("caps spend and calls at the PRD defaults", () => {
    expect(CreateRunRequest.safeParse({ ...valid, max_estimated_usd: "5.000001" }).success).toBe(false);
    expect(CreateRunRequest.safeParse({ ...valid, max_estimated_usd: 5 }).success).toBe(false);
    expect(CreateRunRequest.safeParse({ ...valid, max_provider_calls: 13 }).success).toBe(false);
  });

  it("never throws on malformed max_estimated_usd and accepts the exact cap", () => {
    for (const bad of ["abc", "-1", "1e3", ""]) {
      expect(() => CreateRunRequest.safeParse({ ...valid, max_estimated_usd: bad })).not.toThrow();
      expect(CreateRunRequest.safeParse({ ...valid, max_estimated_usd: bad }).success).toBe(false);
    }
    expect(CreateRunRequest.safeParse({ ...valid, max_estimated_usd: "5.00" }).success).toBe(true);
  });

  it("canonicalizes max_estimated_usd to 6 decimal places", () => {
    for (const v of ["5", "5.0", "05.00"]) {
      expect(CreateRunRequest.parse({ ...valid, max_estimated_usd: v }).max_estimated_usd).toBe("5.000000");
    }
    expect(CreateRunRequest.parse(valid).max_estimated_usd).toBe("5.000000");
    const { request_key: _k, ...rest } = CreateRunRequest.parse(valid);
    expect(StoredRunInput.parse({ ...rest, as_of_date: "2026-10-17", max_estimated_usd: "5" }).max_estimated_usd).toBe("5.000000");
  });

  it("rejects unknown fields, unknown policies, profiles and non-UUID keys", () => {
    expect(CreateRunRequest.safeParse({ ...valid, extra: 1 }).success).toBe(false);
    expect(CreateRunRequest.safeParse({ ...valid, policy: "yolo" }).success).toBe(false);
    expect(CreateRunRequest.safeParse({ ...valid, profile: "other" }).success).toBe(false);
    expect(CreateRunRequest.safeParse({ ...valid, request_key: "abc" }).success).toBe(false);
  });

  it("StoredRunInput requires as_of_date and excludes request_key", () => {
    const { request_key: _k, ...rest } = CreateRunRequest.parse(valid);
    expect(StoredRunInput.safeParse(rest).success).toBe(false);
    expect(StoredRunInput.parse({ ...rest, as_of_date: "2026-10-17" }).as_of_date).toBe("2026-10-17");
  });
});

describe("ApiErrorCode", () => {
  it("includes payload_too_large for oversized request bodies (413)", () => {
    expect(ApiErrorCode.parse("payload_too_large")).toBe("payload_too_large");
  });
});
