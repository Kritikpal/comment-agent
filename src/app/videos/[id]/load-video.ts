import { notFound } from "next/navigation"
import { connection } from "next/server"
import type { VideoDto } from "@/lib/video-types"
import { videoRepository } from "@/server/videos/deps"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The video for a /videos/[id]/… page, or the 404 page for unknown or malformed IDs. */
export async function loadVideoOrNotFound(id: string): Promise<VideoDto> {
  // Database reads are per request; this also keeps Prisma's random IDs out of prerendering.
  await connection()
  if (!UUID.test(id)) notFound()
  const video = await videoRepository.getVideo(id.toLowerCase())
  if (!video) notFound()
  return video
}

export function videoLabel(video: VideoDto): string {
  return video.title ?? video.product.name
}
