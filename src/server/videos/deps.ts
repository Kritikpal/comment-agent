import { analyzerVersion } from "../analysis/config.ts"
import { getPrisma } from "../db/prisma.ts"
import { ApiError } from "../errors.ts"
import { fetchTopLevelComments, fetchVideoDetails } from "../youtube/client.ts"
import type { VideoHandlerDeps } from "./handlers.ts"
import { createVideoRepository } from "./repository.ts"
import { createVideoService, type VideoService } from "./service.ts"

export const videoRepository = createVideoRepository(getPrisma)

let service: VideoService | null = null

function videoService(): VideoService {
  const apiKey = process.env.GOOGLE_API_KEY
  if (!apiKey) throw new ApiError("UPSTREAM_ERROR", "YouTube isn't configured on the server (GOOGLE_API_KEY).")
  service ??= createVideoService({
    repo: videoRepository,
    youtube: {
      fetchDetails: (videoId) => fetchVideoDetails(videoId, { apiKey }),
      fetchNewComments: (videoId, limit, stopBefore) =>
        fetchTopLevelComments(videoId, limit, { apiKey, order: "time", stopBefore }),
    },
  })
  return service
}

/** Production wiring for the video API routes. */
export const videoHandlerDeps: VideoHandlerDeps = { repo: videoRepository, service: videoService, analyzerVersion }
