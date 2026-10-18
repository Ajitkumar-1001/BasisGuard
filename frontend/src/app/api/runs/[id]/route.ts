import { handleGetRun } from "@/server/handlers";
import { withInternalErrors } from "@/server/http";
import { getRuntime } from "@/server/runtime";

export async function GET(_request: Request, ctx: RouteContext<"/api/runs/[id]">) {
  return withInternalErrors(async () => {
    const { id } = await ctx.params;
    return handleGetRun(id, await getRuntime());
  });
}
