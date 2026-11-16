import { ApiError } from "../errors.ts"

const API_BASE = "https://www.googleapis.com/youtube/v3"
/** YouTube returns at most 100 threads per page. */
const PAGE_SIZE = 100
/** Safety stop for pagination: 5 pages covers the largest per-fetch limit (500). */
const MAX_PAGES = 5
export const YOUTUBE_TIMEOUT_MS = 10_000

export interface YouTubeComment {
  youtube_comment_id: string
  text: string
  author_name: string | null
  like_count: number
  reply_count: number
  /** ISO 8601 timestamp, or null when YouTube omits it. */
  published_at: string | null
  /** ISO 8601 timestamp of the last edit, or null. */
  updated_at: string | null
}

export interface YouTubeFetchResult {
  comments: YouTubeComment[]
  /** True only when YouTube reported no further pages, so the video has no more top-level comments. */
  exhausted: boolean
  /** Newest-first only: true when the fetch reached `stopBefore`, i.e. it connected to stored comments. */
  reachedStop: boolean
}

export interface YouTubeVideoDetails {
  title: string | null
  channel_title: string | null
  thumbnail_url: string | null
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>

export interface YouTubeClientOptions {
  apiKey: string
  fetch?: FetchLike
  timeoutMs?: number
}

export interface FetchCommentsOptions extends YouTubeClientOptions {
  /** "relevance" (YouTube's top comments) or "time" (newest first). Default "relevance". */
  order?: "relevance" | "time"
  /**
   * Newest-first only: stop at the first comment published before this instant, because
   * everything after it is already stored. Comments at exactly this instant are still returned.
   */
  stopBefore?: Date | null
}

interface ApiErrorPayload {
  error?: { message?: string; status?: string; errors?: { reason?: string; domain?: string }[] }
}

interface ListPage {
  items?: unknown[]
  nextPageToken?: string
}

/** Top-level comments for a video, at most `limit`. Replies are not included. */
export async function fetchTopLevelComments(
  videoId: string,
  limit: number,
  options: FetchCommentsOptions
): Promise<YouTubeFetchResult> {
  const fetchImpl = options.fetch ?? fetch
  const order = options.order ?? "relevance"
  const stopBefore = order === "time" ? (options.stopBefore?.getTime() ?? null) : null
  const comments: YouTubeComment[] = []
  let pageToken: string | undefined

  for (let page = 0; page < MAX_PAGES && comments.length < limit; page++) {
    const params = new URLSearchParams({
      part: "snippet",
      videoId,
      maxResults: String(Math.min(PAGE_SIZE, limit - comments.length)),
      order,
      textFormat: "plainText",
      key: options.apiKey,
    })
    if (pageToken) params.set("pageToken", pageToken)

    const body = await requestJson(fetchImpl, `${API_BASE}/commentThreads?${params}`, options.timeoutMs)
    for (const item of body.items ?? []) {
      const comment = toComment(item)
      if (!comment) continue
      if (stopBefore !== null && comment.published_at && Date.parse(comment.published_at) < stopBefore) {
        return { comments: comments.slice(0, limit), exhausted: false, reachedStop: true }
      }
      comments.push(comment)
    }
    pageToken = body.nextPageToken
    if (!pageToken) return { comments: comments.slice(0, limit), exhausted: true, reachedStop: false }
  }
  // Stopped because the limit (or the page cap) was reached while YouTube still had more pages.
  return { comments: comments.slice(0, limit), exhausted: false, reachedStop: false }
}

/** Title, channel and thumbnail. Throws VIDEO_NOT_FOUND when YouTube doesn't return the video. */
export async function fetchVideoDetails(videoId: string, options: YouTubeClientOptions): Promise<YouTubeVideoDetails> {
  const params = new URLSearchParams({ part: "snippet", id: videoId, key: options.apiKey })
  const body = await requestJson(options.fetch ?? fetch, `${API_BASE}/videos?${params}`, options.timeoutMs)
  const snippet = (body.items?.[0] as { snippet?: Record<string, unknown> } | undefined)?.snippet
  if (!snippet) throw new ApiError("VIDEO_NOT_FOUND", "Video is private or doesn't exist.")
  const thumbnails = snippet.thumbnails as Record<string, { url?: unknown }> | undefined
  const thumbnail = thumbnails?.medium?.url ?? thumbnails?.default?.url
  return {
    title: typeof snippet.title === "string" ? snippet.title : null,
    channel_title: typeof snippet.channelTitle === "string" ? snippet.channelTitle : null,
    thumbnail_url: typeof thumbnail === "string" ? thumbnail : null,
  }
}

async function requestJson(fetchImpl: FetchLike, url: string, timeoutMs = YOUTUBE_TIMEOUT_MS): Promise<ListPage> {
  let response: Response
  try {
    response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) })
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new ApiError("UPSTREAM_TIMEOUT", "YouTube took too long to respond. Please try again.")
    }
    // Message only: the request URL carries the API key and must never reach the logs.
    console.error("[youtube] request failed:", error instanceof Error ? error.message : "unknown error")
    throw new ApiError("UPSTREAM_ERROR", "Couldn't reach YouTube. Please try again.")
  }
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) throw toApiError(response.status, body as ApiErrorPayload | null)
  return (body ?? {}) as ListPage
}

/** Maps YouTube Data API errors onto the contract's error codes. Never echoes YouTube's message. */
function toApiError(status: number, body: ApiErrorPayload | null): ApiError {
  const reason = body?.error?.errors?.[0]?.reason
  // "forbidden" means a private video only when YouTube itself says so (domain youtube.*).
  // With domain "global" it is the API key being refused, e.g. YouTube Data API not enabled.
  const isYouTubeDomain = body?.error?.errors?.[0]?.domain?.startsWith("youtube.") ?? false
  switch (reason) {
    case "commentsDisabled":
      return new ApiError("COMMENTS_DISABLED", "Comments are turned off for this video.")
    case "videoNotFound":
      return new ApiError("VIDEO_NOT_FOUND", "Video is private or doesn't exist.")
    case "forbidden":
      if (isYouTubeDomain) return new ApiError("VIDEO_NOT_FOUND", "Video is private or doesn't exist.")
      break
    case "quotaExceeded":
    case "dailyLimitExceeded":
    case "rateLimitExceeded":
      return new ApiError("RATE_LIMITED", "The YouTube quota is used up for now. Please try again later.")
  }
  if (status === 404) return new ApiError("VIDEO_NOT_FOUND", "Video is private or doesn't exist.")
  if (status === 429) return new ApiError("RATE_LIMITED", "YouTube is rate limiting requests. Please try again later.")
  // Bad key, API not enabled, or a YouTube outage: details go to the server log only.
  console.error(`[youtube] HTTP ${status} reason=${reason ?? "unknown"}: ${body?.error?.message ?? "no message"}`)
  return new ApiError("UPSTREAM_ERROR", "Couldn't load data from YouTube. Please try again.")
}

function toComment(item: unknown): YouTubeComment | null {
  const thread = (item as { snippet?: { totalReplyCount?: unknown; topLevelComment?: { id?: unknown; snippet?: Record<string, unknown> } } })
    ?.snippet
  const top = thread?.topLevelComment
  const snippet = top?.snippet
  const text = typeof snippet?.textDisplay === "string" ? snippet.textDisplay.trim() : ""
  if (typeof top?.id !== "string" || !text) return null
  const publishedAt = typeof snippet?.publishedAt === "string" ? snippet.publishedAt : null
  const updatedAt = typeof snippet?.updatedAt === "string" ? snippet.updatedAt : null
  return {
    youtube_comment_id: top.id,
    text,
    author_name: typeof snippet?.authorDisplayName === "string" ? snippet.authorDisplayName : null,
    like_count: typeof snippet?.likeCount === "number" ? snippet.likeCount : 0,
    reply_count: typeof thread?.totalReplyCount === "number" ? thread.totalReplyCount : 0,
    published_at: publishedAt,
    // YouTube sets updatedAt = publishedAt for unedited comments; only keep a real edit time.
    updated_at: updatedAt && updatedAt !== publishedAt ? updatedAt : null,
  }
}
