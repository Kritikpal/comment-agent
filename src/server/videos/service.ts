import type { CreateVideoInput } from "../../lib/video-validation.ts"
import type { VideoDto } from "../../lib/video-types.ts"
import { ApiError, toApiError } from "../errors.ts"
import type { YouTubeFetchResult, YouTubeVideoDetails } from "../youtube/client.ts"
import type { FetchProgress, StorableComment, VideoRepository } from "./repository.ts"

/** A FETCHING video older than this is treated as abandoned (e.g. the server restarted mid-fetch). */
export const STALE_FETCH_MS = 2 * 60_000

export interface YouTubeGateway {
  fetchDetails(youtubeVideoId: string): Promise<YouTubeVideoDetails>
  /** Newest first, stopping at comments published before `stopBefore` (already stored). */
  fetchNewComments(youtubeVideoId: string, limit: number, stopBefore: Date | null): Promise<YouTubeFetchResult>
}

export interface VideoServiceDeps {
  repo: VideoRepository
  youtube: YouTubeGateway
  now?: () => Date
}

/**
 * Where the watermark goes after a fetch. It only moves forward when the fetch connected to what was
 * already stored (or YouTube ran out of comments); otherwise newer comments were fetched but some in
 * between were not, so the watermark stays put and the next fetch can still reach and fill the gap.
 * The first fetch has nothing to connect to: its per-fetch limit just caps the backlog.
 */
export function nextProgress(
  watermark: Date | null,
  result: YouTubeFetchResult,
  stored: StorableComment[],
  limit: number
): FetchProgress {
  const newest = stored.reduce<Date | null>((max, c) => {
    const at = new Date(c.published_at)
    return !max || at > max ? at : max
  }, null)
  const caughtUp = watermark === null || result.reachedStop || result.exhausted
  if (caughtUp) {
    return { fetchedThrough: newest && (!watermark || newest > watermark) ? newest : watermark, note: null }
  }
  return {
    fetchedThrough: watermark,
    note:
      `More than ${limit} new comments were posted since the last complete fetch, so only the newest ${limit} were stored ` +
      `and some in between were skipped. Raise "Comments per fetch" and refetch to fill the gap.`,
  }
}

export function createVideoService({ repo, youtube, now = () => new Date() }: VideoServiceDeps) {
  /**
   * Fetches new comments for a video. Upstream failures are recorded on the video (FAILED with the
   * reason) rather than thrown, so the caller always gets the video's current state back.
   */
  async function refetch(id: string): Promise<VideoDto> {
    const video = await repo.startFetch(id, now(), STALE_FETCH_MS)
    if (!video) {
      if (!(await repo.getVideo(id))) throw new ApiError("NOT_FOUND", "Video not found.")
      throw new ApiError("FETCH_IN_PROGRESS", "Comments are already being fetched for this video.")
    }
    try {
      const watermark = video.fetch.complete_through ? new Date(video.fetch.complete_through) : null
      const [details, result] = await Promise.all([
        youtube.fetchDetails(video.youtube_video_id),
        youtube.fetchNewComments(video.youtube_video_id, video.comment_limit, watermark),
      ])
      const storable = result.comments.filter((c): c is StorableComment => c.published_at !== null)
      const progress = nextProgress(watermark, result, storable, video.comment_limit)
      return await repo.completeFetch(id, storable, details, now(), progress)
    } catch (error) {
      const failure = toApiError(error)
      return repo.failFetch(id, failure.code, failure.message)
    }
  }

  return {
    refetch,

    /**
     * Registers a video and runs its first fetch. The video must exist on YouTube to be saved;
     * if only the comment fetch fails, the video is kept with status FAILED.
     */
    async create(input: CreateVideoInput): Promise<VideoDto> {
      const details = await youtube.fetchDetails(input.youtubeVideoId)
      const video = await repo.createVideo(input, details)
      return refetch(video.id)
    },
  }
}

export type VideoService = ReturnType<typeof createVideoService>
