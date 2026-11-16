import { parseCreateVideo, parseUpdateVideo, type VideoFieldErrors } from "../../lib/video-validation.ts"
import {
  COMMENTS_PAGE_SIZE_DEFAULT,
  COMMENTS_PAGE_SIZE_MAX,
  VIDEOS_PAGE_SIZE_DEFAULT,
  VIDEOS_PAGE_SIZE_MAX,
} from "../../lib/video-types.ts"
import { SENTIMENTS, type Sentiment } from "../../lib/types.ts"
import { ApiError } from "../errors.ts"
import { enforceRateLimit, readJson, respond } from "../http.ts"
import { decodeCursor } from "./cursor.ts"
import type { VideoRepository } from "./repository.ts"
import type { VideoService } from "./service.ts"

export interface VideoHandlerDeps {
  repo: VideoRepository
  /** Lazily built: only create and refetch need YouTube credentials. */
  service: () => VideoService
  /** The analyzer version whose classifications comments are shown with. */
  analyzerVersion: () => string
}

const COMMENT_ID = /^[\w.-]{1,128}$/
const MAX_IDS = 100
const MAX_QUERY = 100

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Non-UUIDs can't exist, and Postgres would reject them as uuid input anyway. */
export function requireVideoId(id: string): string {
  if (!UUID.test(id)) throw new ApiError("NOT_FOUND", "Video not found.")
  return id.toLowerCase()
}

function intParam(params: URLSearchParams, name: string, fallback: number, min: number, max: number): number {
  const raw = params.get(name)
  if (raw === null || raw === "") return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new ApiError("INVALID_REQUEST", `${name} must be a whole number from ${min} to ${max}.`)
  }
  return value
}

function invalid(errors: VideoFieldErrors): ApiError {
  return new ApiError("INVALID_REQUEST", Object.values(errors)[0] ?? "Invalid request.", { fields: errors })
}

/** GET /api/v1/videos?page=1&page_size=20 */
export function handleListVideos(request: Request, deps: VideoHandlerDeps): Promise<Response> {
  return respond(async () => {
    const params = new URL(request.url).searchParams
    const page = intParam(params, "page", 1, 1, 100_000)
    const pageSize = intParam(params, "page_size", VIDEOS_PAGE_SIZE_DEFAULT, 1, VIDEOS_PAGE_SIZE_MAX)
    return Response.json(await deps.repo.listVideos(page, pageSize))
  })
}

/** POST /api/v1/videos — registers the video and runs its first fetch. */
export function handleCreateVideo(request: Request, deps: VideoHandlerDeps): Promise<Response> {
  return respond(async () => {
    enforceRateLimit(request)
    const { input, errors } = parseCreateVideo(await readJson(request))
    if (!input) throw invalid(errors)
    return Response.json(await deps.service().create(input), { status: 201 })
  })
}

/** GET /api/v1/videos/:id */
export function handleGetVideo(id: string, deps: VideoHandlerDeps): Promise<Response> {
  return respond(async () => {
    const video = await deps.repo.getVideo(requireVideoId(id))
    if (!video) throw new ApiError("NOT_FOUND", "Video not found.")
    return Response.json(video)
  })
}

/** PATCH /api/v1/videos/:id — metadata only; the URL is fixed. */
export function handleUpdateVideo(request: Request, id: string, deps: VideoHandlerDeps): Promise<Response> {
  return respond(async () => {
    const videoId = requireVideoId(id)
    const { input, errors } = parseUpdateVideo(await readJson(request))
    if (!input) throw invalid(errors)
    return Response.json(await deps.repo.updateVideo(videoId, input))
  })
}

/** GET /api/v1/videos/:id/comments?cursor=…&limit=50 — newest first, keyset pagination. */
/**
 * GET /api/v1/videos/:id/comments
 *   ?cursor=…&limit=50          newest first, keyset pages
 *   &sentiment=negative&q=text  evidence-table filters (sentiment by the current classification)
 *   ?ids=a,b,c                  specific comments (max 100), no paging
 */
export function handleListComments(request: Request, id: string, deps: VideoHandlerDeps): Promise<Response> {
  return respond(async () => {
    const videoId = requireVideoId(id)
    const params = new URL(request.url).searchParams
    const version = deps.analyzerVersion()

    const rawIds = params.get("ids")
    if (rawIds !== null) {
      const ids = [...new Set(rawIds.split(",").map((x) => x.trim()).filter(Boolean))]
      if (ids.length === 0 || ids.length > MAX_IDS || !ids.every((x) => COMMENT_ID.test(x))) {
        throw new ApiError("INVALID_REQUEST", `ids must be 1–${MAX_IDS} comment IDs, comma separated.`)
      }
      return Response.json({ items: await deps.repo.getComments(videoId, ids, version), next_cursor: null })
    }

    const rawSentiment = params.get("sentiment")
    if (rawSentiment !== null && !(SENTIMENTS as readonly string[]).includes(rawSentiment)) {
      throw new ApiError("INVALID_REQUEST", `sentiment must be one of ${SENTIMENTS.join(", ")}.`)
    }
    const q = params.get("q")?.trim() ?? ""
    if (q.length > MAX_QUERY) throw new ApiError("INVALID_REQUEST", `q must be at most ${MAX_QUERY} characters.`)
    const filters = { sentiment: (rawSentiment as Sentiment | null) ?? undefined, q: q || undefined }

    const limit = intParam(params, "limit", COMMENTS_PAGE_SIZE_DEFAULT, 1, COMMENTS_PAGE_SIZE_MAX)
    const rawCursor = params.get("cursor")
    const cursor = rawCursor ? decodeCursor(rawCursor) : null
    if (rawCursor && !cursor) throw new ApiError("INVALID_REQUEST", "Invalid cursor.")
    // Distinguish "no comments yet" from "no such video" without loading the video on every page.
    if (!cursor && !(await deps.repo.getVideo(videoId))) throw new ApiError("NOT_FOUND", "Video not found.")
    return Response.json(await deps.repo.listComments(videoId, cursor, limit, version, filters))
  })
}

/** POST /api/v1/videos/:id/refetch — 409 if a fetch is already running. */
export function handleRefetch(request: Request, id: string, deps: VideoHandlerDeps): Promise<Response> {
  return respond(async () => {
    enforceRateLimit(request)
    return Response.json(await deps.service().refetch(requireVideoId(id)))
  })
}
