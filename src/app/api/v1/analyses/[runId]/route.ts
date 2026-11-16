import { analysisHandlerDeps } from "@/server/analysis/deps"
import { handleGetRun } from "@/server/analysis/handlers"

const deps = analysisHandlerDeps(() => {
  throw new Error("not used for reads")
})

export async function GET(_request: Request, ctx: RouteContext<"/api/v1/analyses/[runId]">): Promise<Response> {
  const { runId } = await ctx.params
  return handleGetRun(runId, deps)
}
