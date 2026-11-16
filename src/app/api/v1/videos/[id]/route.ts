import { handleGetVideo, handleUpdateVideo } from "@/server/videos/handlers"
import { videoHandlerDeps } from "@/server/videos/deps"

export async function GET(_request: Request, ctx: RouteContext<"/api/v1/videos/[id]">): Promise<Response> {
  const { id } = await ctx.params
  return handleGetVideo(id, videoHandlerDeps)
}

export async function PATCH(request: Request, ctx: RouteContext<"/api/v1/videos/[id]">): Promise<Response> {
  const { id } = await ctx.params
  return handleUpdateVideo(request, id, videoHandlerDeps)
}
