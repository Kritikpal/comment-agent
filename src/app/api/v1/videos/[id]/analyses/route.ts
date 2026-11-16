import { after } from "next/server"
import { analysisHandlerDeps } from "@/server/analysis/deps"
import { handleStartAnalysis } from "@/server/analysis/handlers"

const deps = analysisHandlerDeps((task) => after(task))

export async function POST(request: Request, ctx: RouteContext<"/api/v1/videos/[id]/analyses">): Promise<Response> {
  const { id } = await ctx.params
  return handleStartAnalysis(request, id, deps)
}
