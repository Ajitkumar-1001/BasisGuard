import { handleCreateRun, handleListRuns } from "@/server/handlers";
import { withInternalErrors } from "@/server/http";
import { getRuntime } from "@/server/runtime";

export async function POST(request: Request) {
  return withInternalErrors(async () => handleCreateRun(request, await getRuntime()));
}

export async function GET(request: Request) {
  return withInternalErrors(async () => handleListRuns(new URL(request.url), await getRuntime()));
}
