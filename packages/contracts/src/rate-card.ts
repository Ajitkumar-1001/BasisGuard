import { z } from "zod";
import { Processor } from "./enums";
import { UsdDecimal } from "./money";

export const RateCard = z
  .object({
    version: z.string().regex(/^parallel-\d{4}-\d{2}-\d{2}$/),
    retrieved_at: z.iso.date(),
    currency: z.literal("USD"),
    source_urls: z.array(z.url()).min(1),
    task_usd_per_run: z.record(Processor, UsdDecimal),
    task_billing_note: z.string(),
    search_usd_per_request: z.object({ turbo: UsdDecimal, fast: UsdDecimal, basic: UsdDecimal, advanced: UsdDecimal }).strict(),
    search_included_results: z.number().int().positive(),
    search_additional_result_usd: UsdDecimal,
    extract_usd_per_url: UsdDecimal,
    judge: z
      .object({ vendor: z.literal("openai"), model: z.string().min(1), usd_upper_bound_per_call: UsdDecimal, verified: z.boolean() })
      .strict(),
    unknown_cost_behavior: z.literal("block"),
  })
  .strict();
export type RateCard = z.infer<typeof RateCard>;
