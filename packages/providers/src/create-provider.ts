import type { RuntimeConfig } from "@basisguard/core";
import { FixtureResearchProvider } from "./fixture-provider";
import type { ResearchProvider } from "./types";

export async function createProvider(config: RuntimeConfig): Promise<ResearchProvider> {
  switch (config.mode) {
    case "fixture":
      return new FixtureResearchProvider();
    case "live": {
      const { createParallelProvider } = await import("./live/parallel-provider"); // only path that loads parallel-web
      return createParallelProvider(config.parallelApiKey);
    }
    case "replay":
      throw new Error("replay mode is read-only and has no research provider");
  }
}
