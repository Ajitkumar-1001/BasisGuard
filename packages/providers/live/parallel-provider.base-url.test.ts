import { afterEach, describe, expect, it, vi } from "vitest";

// Wrap the REAL SDK class only to observe the constructed instance; no request is ever made.
const instances = vi.hoisted(() => [] as { baseURL: string }[]);
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

const { createParallelProvider } = await import("./parallel-provider");

describe("live Parallel adapter base URL pinning", () => {
  const saved = process.env.PARALLEL_BASE_URL;
  afterEach(() => {
    if (saved === undefined) delete process.env.PARALLEL_BASE_URL;
    else process.env.PARALLEL_BASE_URL = saved;
  });

  it("ignores PARALLEL_BASE_URL so the API key cannot be redirected", () => {
    process.env.PARALLEL_BASE_URL = "https://evil.example.com";
    createParallelProvider("fake-key-not-real");
    expect(instances).toHaveLength(1);
    expect(instances[0]!.baseURL).toBe("https://api.parallel.ai");
  });
});
