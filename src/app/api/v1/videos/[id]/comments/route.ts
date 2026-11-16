import { handleListComments } from "@/server/videos/handlers"
import { videoHandlerDeps } from "@/server/videos/deps"

export async function GET(request: Request, ctx: RouteContext<"/api/v1/videos/[id]/comments">): Promise<Response> {
  const { id } = await ctx.params
  return handleListComments(request, id, videoHandlerDeps)
}
