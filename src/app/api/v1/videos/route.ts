import { handleCreateVideo, handleListVideos } from "@/server/videos/handlers"
import { videoHandlerDeps } from "@/server/videos/deps"

export async function GET(request: Request): Promise<Response> {
  return handleListVideos(request, videoHandlerDeps)
}

export async function POST(request: Request): Promise<Response> {
  return handleCreateVideo(request, videoHandlerDeps)
}
