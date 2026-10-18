import { afterEach, describe, expect, it, vi } from "vitest";

// Wrap the REAL SDK class only to observe the constructed instance; no request is ever made.
const instances = vi.hoisted(() => [] as { baseURL: string; maxRetries: number; timeout: number }[]);
vi.mock("parallel-web", async (importOriginal) => {
  const real = await importOriginal<typeof import("parallel-web")>();
  class Spy extends real.default {
    constructor(opts?: ConstructorParameters<typeof real.default>[0]) {
      super(opts);
      instances.push(this);
    }
  }
  return { ...real, default: Spy };
});

const { createParallelClient, PARALLEL_BASE_URL } = await import("./client");

describe("createParallelClient (shared by the live adapter and the Gate A probe)", () => {
  const saved = process.env.PARALLEL_BASE_URL;
  afterEach(() => {
    instances.length = 0;
    if (saved === undefined) delete process.env.PARALLEL_BASE_URL;
    else process.env.PARALLEL_BASE_URL = saved;
  });

  it("pins the production base URL even when PARALLEL_BASE_URL points elsewhere", () => {
    process.env.PARALLEL_BASE_URL = "https://evil.example.com";
    createParallelClient("fake-key-not-real", { timeoutMs: 90_000 });
    expect(instances).toHaveLength(1);
    expect(PARALLEL_BASE_URL).toBe("https://api.parallel.ai");
    expect(instances[0]!.baseURL).toBe("https://api.parallel.ai");
  });

  it("always disables SDK retries (a retried POST /v1/tasks/runs would create a second paid Task)", () => {
    createParallelClient("fake-key-not-real", { timeoutMs: 90_000 });
    expect(instances[0]!.maxRetries).toBe(0);
    expect(instances[0]!.timeout).toBe(90_000);
  });
});
