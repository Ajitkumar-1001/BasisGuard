import { RuntimeMode } from "@basisguard/contracts";
import { ConfigError, loadRateCard, type LoadedRateCard } from "./rate-card";

type Common = { hosted: boolean; databaseUrl: string };
export type RuntimeConfig =
  | (Common & { mode: "live"; parallelApiKey: string; openaiApiKey: string; rateCard: LoadedRateCard })
  | (Common & { mode: "fixture"; rateCard: LoadedRateCard })
  | (Common & { mode: "replay" });

export function loadRuntimeConfig(env: Record<string, string | undefined>): RuntimeConfig {
  const mode = RuntimeMode.safeParse(env.BASISGUARD_MODE);
  if (!mode.success) throw new ConfigError("BASISGUARD_MODE must be exactly one of: live, fixture, replay");
  const hosted = env.HOSTED === "true";
  if (hosted && mode.data !== "replay") throw new ConfigError("HOSTED=true requires BASISGUARD_MODE=replay");
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) throw new ConfigError("DATABASE_URL is required");
  const common: Common = { hosted, databaseUrl };

  if (mode.data === "replay") return { ...common, mode: "replay" };

  if (mode.data === "live") {
    const missing = ["PARALLEL_API_KEY", "OPENAI_API_KEY"].filter((k) => !env[k]);
    if (missing.length) throw new ConfigError(`live mode refuses to start without ${missing.join(", ")}`);
  }
  const rateCardPath = env.BASISGUARD_RATE_CARD;
  if (!rateCardPath) throw new ConfigError(`${mode.data} mode requires BASISGUARD_RATE_CARD`);
  const rateCard = loadRateCard(rateCardPath);

  return mode.data === "live"
    ? { ...common, mode: "live", parallelApiKey: env.PARALLEL_API_KEY!, openaiApiKey: env.OPENAI_API_KEY!, rateCard }
    : { ...common, mode: "fixture", rateCard };
}
