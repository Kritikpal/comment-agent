// API shapes for the video registry (contract v1.2) and analysis runs (v1.3). Shared by the API and UI.
import type { AnalysisReport, CommentAnalysisDto } from "./types.ts"

export const FETCH_STATUSES = ["PENDING", "FETCHING", "READY", "FAILED"] as const
export type FetchStatus = (typeof FETCH_STATUSES)[number]

export const COMMENT_LIMIT_PER_FETCH_MIN = 15
export const COMMENT_LIMIT_PER_FETCH_MAX = 500
export const COMMENT_LIMIT_PER_FETCH_DEFAULT = 100
export const NOTES_MAX = 1000
export const VIDEOS_PAGE_SIZE_DEFAULT = 20
export const VIDEOS_PAGE_SIZE_MAX = 100
export const COMMENTS_PAGE_SIZE_DEFAULT = 50
export const COMMENTS_PAGE_SIZE_MAX = 100

export interface VideoDto {
  id: string
  youtube_video_id: string
  url: string
  title: string | null
  channel_title: string | null
  thumbnail_url: string | null
  product: { name: string; category: string | null }
  notes: string | null
  /** Most comments pulled per fetch, newest first. */
  comment_limit: number
  comment_count: number
  fetch: {
    status: FetchStatus
    started_at: string | null
    last_fetched_at: string | null
    /** Every comment published after this instant is stored (null before the first fetch). */
    complete_through: string | null
    /** Set when the last fetch hit the per-fetch limit and left a gap; says how to fill it. */
    note: string | null
    error: { code: string; message: string } | null
  }
  created_at: string
  updated_at: string
}

export interface VideoListResponse {
  items: VideoDto[]
  page: number
  page_size: number
  total: number
  total_pages: number
}

export const RUN_STATUSES = ["PENDING", "RUNNING", "READY", "FAILED"] as const
export type RunStatus = (typeof RUN_STATUSES)[number]

export interface AnalysisRunDto {
  id: string
  video_id: string
  status: RunStatus
  model: string
  analyzer_version: string
  /** Comments that needed classifying when the run started (already-classified ones are reused). */
  comments_total: number
  comments_classified: number
  /** Comments whose batch failed twice; they're retried by the next run. */
  comments_failed: number
  tokens_in: number
  tokens_out: number
  created_at: string
  finished_at: string | null
  error: { code: string; message: string } | null
  /** Set once the run is READY. */
  report: AnalysisReport | null
}

export interface LatestAnalysisResponse {
  /** The most recent run in any state, for progress. */
  current: AnalysisRunDto | null
  /** The most recent READY run, whose report the page shows. */
  report: AnalysisRunDto | null
}

export interface CommentDto {
  id: string
  text: string
  author_name: string | null
  like_count: number
  reply_count: number
  published_at: string
  youtube_updated_at: string | null
  fetched_at: string
  /** Classification by the current analyzer, or null if not analyzed yet (or edited since). */
  analysis: CommentAnalysisDto | null
}

export interface CommentListResponse {
  items: CommentDto[]
  /** Pass back as `cursor` for the next (older) page; null on the last page. */
  next_cursor: string | null
}

export interface CreateVideoRequest {
  video_url: string
  product: { name: string; category?: string }
  notes?: string
  comment_limit?: number
}

export interface UpdateVideoRequest {
  product?: { name?: string; category?: string | null }
  notes?: string | null
  comment_limit?: number
}
