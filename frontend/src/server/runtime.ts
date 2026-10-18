import "server-only";
import { loadRuntimeConfig } from "@basisguard/core";
import { createDb } from "@basisguard/db";
import type { WebRuntime } from "./handlers";

let runtime: Promise<WebRuntime> | undefined;

/**
 * Lazily validated once per server process; fails closed on bad mode/config. A failed init is not
 * cached, so the next request retries. Never log the config or the error: databaseUrl carries credentials.
 */
export function getRuntime(): Promise<WebRuntime> {
  runtime ??= (async () => {
    const config = loadRuntimeConfig(process.env);
    const { db } = await createDb(config.databaseUrl, { mode: config.mode, nodeEnv: process.env.NODE_ENV });
    return { config, db };
  })().catch((e: unknown) => {
    runtime = undefined;
    throw e;
  });
  return runtime;
}
