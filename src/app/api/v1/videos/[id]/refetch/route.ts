import { handleRefetch } from "@/server/videos/handlers"
import { videoHandlerDeps } from "@/server/videos/deps"

export async function POST(request: Request, ctx: RouteContext<"/api/v1/videos/[id]/refetch">): Promise<Response> {
  const { id } = await ctx.params
  return handleRefetch(request, id, videoHandlerDeps)
}
