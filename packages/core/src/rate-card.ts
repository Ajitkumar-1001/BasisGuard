import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { RateCard } from "@basisguard/contracts";

export class ConfigError extends Error {
  override name = "ConfigError";
}

export type LoadedRateCard = { card: RateCard; sha256: string; path: string };

export function loadRateCard(path: string): LoadedRateCard {
  let bytes: Buffer;
  let json: unknown;
  try {
    bytes = readFileSync(path);
    json = JSON.parse(bytes.toString("utf8"));
  } catch (e) {
    throw new ConfigError(`rate card not readable as JSON at ${path}: ${(e as Error).message}`);
  }
  const parsed = RateCard.safeParse(json);
  if (!parsed.success) throw new ConfigError(`rate card ${path} failed validation: ${parsed.error.message}`);
  return { card: parsed.data, sha256: createHash("sha256").update(bytes).digest("hex"), path };
}
