import { randomUUID } from "node:crypto";
import { CreateRunRequest, RunStatus, StoredRunInput } from "@basisguard/contracts";
import type { RuntimeConfig } from "@basisguard/core";
import { createRun, type Db, getRun, listRunEvents, listRuns, providerArtifacts, runSpend } from "@basisguard/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { apiError, withInternalErrors } from "./http";

export type WebRuntime = { config: RuntimeConfig; db: Db };
const Uuid = z.uuid();

/**
 * GET /api/runs query. Rule: reject, never clamp. `limit` must be an integer in 1..100 (default 50);
 * anything else (abc, 0, -1, 2.5, 1e9, 101, empty) is 400 invalid_request, so listRuns never sees > 100.
 */
export const ListRunsQuery = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    status: RunStatus.optional(),
  })
  .strict();

/** Read-only shape probe of a stored task_result artifact; anything else reads as null content/basis. */
const TaskResultShape = z.object({ output: z.object({ content: z.unknown(), basis: z.unknown() }).partial() });

export async function handleCreateRun(req: Request, rt: WebRuntime): Promise<Response> {
  return withInternalErrors(async () => {
    const requestId = randomUUID();
    // Checked before the body is read: replay never parses or writes.
    if (rt.config.mode === "replay") return apiError(403, "replay_read_only", "replay mode is read-only", requestId);
    let json: unknown;
    try {
      json = await req.json();
    } catch {
      return apiError(400, "invalid_request", "body must be JSON", requestId);
    }
    const parsed = CreateRunRequest.safeParse(json);
    if (!parsed.success) return apiError(400, "invalid_request", "request validation failed", requestId, parsed.error.issues);
    if (parsed.data.policy !== "baseline") {
      return apiError(422, "policy_unavailable", `policy ${parsed.data.policy} ships in Phase 2; use baseline`, requestId);
    }
    // parsed.data (defaults applied, money canonical) is what gets hashed and stored, never the raw body.
    const result = await createRun(rt.db, parsed.data, new Date());
    if (result.kind === "conflict") {
      return apiError(409, "idempotency_conflict", "request_key was already used with a different body", requestId);
    }
    return Response.json({ runId: result.runId, status: result.status }, { status: result.kind === "created" ? 202 : 200 });
  });
}

export async function handleListRuns(url: URL, rt: WebRuntime): Promise<Response> {
  return withInternalErrors(async () => {
    const requestId = randomUUID();
    const query = ListRunsQuery.safeParse({
      limit: url.searchParams.get("limit") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
    });
    if (!query.success) return apiError(400, "invalid_request", "invalid list query", requestId, query.error.issues);
    const runs = await listRuns(rt.db, { limit: query.data.limit, status: query.data.status });
    return Response.json({
      runs: runs.map((r) => ({
        id: r.id,
        status: r.status,
        errorCode: r.errorCode,
        policy: r.policyVersion,
        companyName: StoredRunInput.parse(r.inputJson).company_name,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  });
}

export async function handleGetRun(id: string, rt: WebRuntime): Promise<Response> {
  return withInternalErrors(async () => {
    const requestId = randomUUID();
    const run = Uuid.safeParse(id).success ? await getRun(rt.db, id) : undefined;
    if (!run) return apiError(404, "not_found", "run not found", requestId);
    const [artifact] = run.sourceTaskArtifactId
      ? await rt.db.select().from(providerArtifacts).where(eq(providerArtifacts.id, run.sourceTaskArtifactId))
      : [];
    const output = artifact ? TaskResultShape.safeParse(artifact.rawJson).data?.output : undefined;
    return Response.json({
      run: {
        id: run.id,
        status: run.status,
        errorCode: run.errorCode,
        policy: run.policyVersion,
        processor: run.providerProcessor,
        providerRunId: run.providerRunId,
        input: run.inputJson,
        createdAt: run.createdAt.toISOString(),
        completedAt: run.completedAt?.toISOString() ?? null,
        deadlineAt: run.deadlineAt.toISOString(),
      },
      taskArtifact: artifact
        ? {
            id: artifact.id,
            contentHash: artifact.contentHash,
            fixtureOrigin: artifact.fixtureOrigin,
            content: output?.content ?? null,
            basis: output?.basis ?? null,
          }
        : null,
      spend: await runSpend(rt.db, run.id),
    });
  });
}

export async function handleGetRunEvents(id: string, rt: WebRuntime): Promise<Response> {
  return withInternalErrors(async () => {
    const requestId = randomUUID();
    if (!Uuid.safeParse(id).success || !(await getRun(rt.db, id))) return apiError(404, "not_found", "run not found", requestId);
    const events = await listRunEvents(rt.db, id);
    return Response.json({
      events: events.map((e) => ({ id: e.id, type: e.eventType, details: e.detailsJson, createdAt: e.createdAt.toISOString() })),
    });
  });
}
