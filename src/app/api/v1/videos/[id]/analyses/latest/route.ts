import { analysisHandlerDeps } from "@/server/analysis/deps"
import { handleLatestAnalysis } from "@/server/analysis/handlers"

const deps = analysisHandlerDeps(() => {
  throw new Error("not used for reads")
})

export async function GET(_request: Request, ctx: RouteContext<"/api/v1/videos/[id]/analyses/latest">): Promise<Response> {
  const { id } = await ctx.params
  return handleLatestAnalysis(id, deps)
}
