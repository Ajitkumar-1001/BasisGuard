import { z } from "zod";

/** Minimal structural check of an upstream TaskRunResult (SDK 1.3.5). Raw JSON is stored untouched elsewhere. */
export const TaskResultEnvelope = z
  .object({
    run: z.object({ run_id: z.string(), status: z.literal("completed") }).loose(),
    output: z
      .object({
        type: z.literal("json"),
        content: z.record(z.string(), z.unknown()),
        basis: z.array(
          z
            .object({
              field: z.string(),
              reasoning: z.string(),
              citations: z.array(z.object({ url: z.string(), excerpts: z.array(z.string()).nullish(), title: z.string().nullish() }).loose()).optional(),
              confidence: z.string().nullish(),
            })
            .loose(),
        ),
      })
      .loose(),
  })
  .loose();
export type TaskResultEnvelope = z.infer<typeof TaskResultEnvelope>;
