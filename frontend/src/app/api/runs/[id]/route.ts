import { handleGetRun } from "@/server/handlers";
import { guardApiRequest, withInternalErrors } from "@/server/http";
import { getRuntime } from "@/server/runtime";

export async function GET(request: Request, ctx: RouteContext<"/api/runs/[id]">) {
  return withInternalErrors(async (requestId) => {
    const denied = guardApiRequest(request, requestId, { stateChanging: false });
    if (denied) return denied;
    const { id } = await ctx.params;
    return handleGetRun(id, await getRuntime());
  });
}
