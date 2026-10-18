import { handleGetRunEvents } from "@/server/handlers";
import { withInternalErrors } from "@/server/http";
import { getRuntime } from "@/server/runtime";

export async function GET(_request: Request, ctx: RouteContext<"/api/runs/[id]/events">) {
  return withInternalErrors(async () => {
    const { id } = await ctx.params;
    return handleGetRunEvents(id, await getRuntime());
  });
}
