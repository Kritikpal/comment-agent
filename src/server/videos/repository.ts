import type { Prisma, PrismaClient } from "../../generated/prisma/client.ts"
import type { CreateVideoInput, UpdateVideoInput } from "../../lib/video-validation.ts"
import type { FeedbackItem, Sentiment } from "../../lib/types.ts"
import type { CommentDto, CommentListResponse, VideoDto, VideoListResponse } from "../../lib/video-types.ts"
import { ApiError } from "../errors.ts"
import type { YouTubeComment, YouTubeVideoDetails } from "../youtube/client.ts"
import { encodeCursor, type CommentCursor } from "./cursor.ts"

const VIDEO_SELECT = {
  id: true,
  youtubeVideoId: true,
  url: true,
  title: true,
  channelTitle: true,
  thumbnailUrl: true,
  productName: true,
  productCategory: true,
  notes: true,
  commentLimit: true,
  commentCount: true,
  fetchStatus: true,
  fetchStartedAt: true,
  lastFetchedAt: true,
  fetchedThrough: true,
  lastFetchNote: true,
  lastErrorCode: true,
  lastErrorMessage: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.VideoSelect

/** Only the columns the comment list shows, plus the current analyzer's classification (loaded in one batched query). */
function commentSelect(analyzerVersion: string) {
  return {
    id: true,
    text: true,
    authorName: true,
    likeCount: true,
    replyCount: true,
    publishedAt: true,
    youtubeUpdatedAt: true,
    fetchedAt: true,
    analyses: {
      where: { analyzerVersion },
      take: 1,
      select: { sentiment: true, tone: true, intents: true, purchaseIntent: true, feedback: true, questions: true, analyzedAt: true },
    },
  } satisfies Prisma.CommentSelect
}

type VideoRow = Prisma.VideoGetPayload<{ select: typeof VIDEO_SELECT }>
type CommentRow = Prisma.CommentGetPayload<{ select: ReturnType<typeof commentSelect> }>

export interface CommentFilters {
  /** Only comments the current analyzer classified with this sentiment. */
  sentiment?: Sentiment
  /** Case-insensitive text search. */
  q?: string
}

/** A comment ready to store: YouTube data with a guaranteed publish time. */
export type StorableComment = YouTubeComment & { published_at: string }

/** How far a fetch got: the new watermark and an optional note about a gap. */
export interface FetchProgress {
  fetchedThrough: Date | null
  note: string | null
}

export function toVideoDto(v: VideoRow): VideoDto {
  return {
    id: v.id,
    youtube_video_id: v.youtubeVideoId,
    url: v.url,
    title: v.title,
    channel_title: v.channelTitle,
    thumbnail_url: v.thumbnailUrl,
    product: { name: v.productName, category: v.productCategory },
    notes: v.notes,
    comment_limit: v.commentLimit,
    comment_count: v.commentCount,
    fetch: {
      status: v.fetchStatus,
      started_at: v.fetchStartedAt?.toISOString() ?? null,
      last_fetched_at: v.lastFetchedAt?.toISOString() ?? null,
      complete_through: v.fetchedThrough?.toISOString() ?? null,
      note: v.lastFetchNote,
      error: v.lastErrorCode ? { code: v.lastErrorCode, message: v.lastErrorMessage ?? "" } : null,
    },
    created_at: v.createdAt.toISOString(),
    updated_at: v.updatedAt.toISOString(),
  }
}

function toCommentDto(c: CommentRow): CommentDto {
  const a = c.analyses[0]
  // A comment edited after it was classified shows as not analyzed until the next run.
  const current = a && (!c.youtubeUpdatedAt || a.analyzedAt >= c.youtubeUpdatedAt) ? a : null
  return {
    id: c.id,
    text: c.text,
    author_name: c.authorName,
    like_count: c.likeCount,
    reply_count: c.replyCount,
    published_at: c.publishedAt.toISOString(),
    youtube_updated_at: c.youtubeUpdatedAt?.toISOString() ?? null,
    fetched_at: c.fetchedAt.toISOString(),
    analysis: current
      ? {
          sentiment: current.sentiment,
          tone: current.tone,
          intents: current.intents,
          purchase_intent: current.purchaseIntent,
          feedback: current.feedback as unknown as FeedbackItem[],
          questions: current.questions,
        }
      : null,
  }
}

function hasCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === code
}

export function createVideoRepository(getPrisma: () => PrismaClient) {
  return {
    /** Page-number pagination: one page plus the total, in two queries regardless of page size. */
    async listVideos(page: number, pageSize: number): Promise<VideoListResponse> {
      const prisma = getPrisma()
      const [rows, total] = await prisma.$transaction([
        prisma.video.findMany({
          select: VIDEO_SELECT,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.video.count(),
      ])
      return {
        items: rows.map(toVideoDto),
        page,
        page_size: pageSize,
        total,
        total_pages: Math.max(1, Math.ceil(total / pageSize)),
      }
    },

    async getVideo(id: string): Promise<VideoDto | null> {
      const row = await getPrisma().video.findUnique({ where: { id }, select: VIDEO_SELECT })
      return row ? toVideoDto(row) : null
    },

    async createVideo(input: CreateVideoInput, details: YouTubeVideoDetails): Promise<VideoDto> {
      const prisma = getPrisma()
      try {
        const row = await prisma.video.create({
          data: {
            youtubeVideoId: input.youtubeVideoId,
            url: input.url,
            title: details.title,
            channelTitle: details.channel_title,
            thumbnailUrl: details.thumbnail_url,
            productName: input.productName,
            productCategory: input.productCategory,
            notes: input.notes,
            commentLimit: input.commentLimit,
          },
          select: VIDEO_SELECT,
        })
        return toVideoDto(row)
      } catch (error) {
        if (!hasCode(error, "P2002")) throw error
        const existing = await prisma.video.findUnique({
          where: { youtubeVideoId: input.youtubeVideoId },
          select: { id: true },
        })
        throw new ApiError("VIDEO_EXISTS", "This video has already been added.", { videoId: existing?.id })
      }
    },

    async updateVideo(id: string, input: UpdateVideoInput): Promise<VideoDto> {
      try {
        const row = await getPrisma().video.update({
          where: { id },
          data: {
            productName: input.productName,
            productCategory: input.productCategory,
            notes: input.notes,
            commentLimit: input.commentLimit,
          },
          select: VIDEO_SELECT,
        })
        return toVideoDto(row)
      } catch (error) {
        if (hasCode(error, "P2025")) throw new ApiError("NOT_FOUND", "Video not found.")
        throw error
      }
    },

    /**
     * Claims the video for fetching in one conditional update, so two clicks can't start two
     * fetches. A fetch left FETCHING longer than `staleAfterMs` (e.g. after a crash) can be reclaimed.
     */
    async startFetch(id: string, now: Date, staleAfterMs: number): Promise<VideoDto | null> {
      const prisma = getPrisma()
      const { count } = await prisma.video.updateMany({
        where: {
          id,
          OR: [
            { fetchStatus: { not: "FETCHING" } },
            { fetchStartedAt: null },
            { fetchStartedAt: { lt: new Date(now.getTime() - staleAfterMs) } },
          ],
        },
        data: { fetchStatus: "FETCHING", fetchStartedAt: now },
      })
      if (count === 0) return null
      const row = await prisma.video.findUnique({ where: { id }, select: VIDEO_SELECT })
      return row ? toVideoDto(row) : null
    },

    /**
     * Stores a successful fetch in one transaction: a single INSERT … ON CONFLICT for all comments,
     * the new stored count, and the video's status and YouTube details.
     */
    async completeFetch(
      videoId: string,
      fetched: StorableComment[],
      details: YouTubeVideoDetails,
      now: Date,
      progress: FetchProgress
    ): Promise<VideoDto> {
      // ON CONFLICT can't touch the same row twice in one statement, and pages can overlap
      // when comments are posted mid-fetch, so keep the first copy of each ID.
      const comments = [...new Map(fetched.map((c) => [c.youtube_comment_id, c])).values()]
      const row = await getPrisma().$transaction(async (tx) => {
        if (comments.length > 0) {
          // Timestamps are passed as UTC ISO strings and cast to timestamp(3), matching how Prisma stores DateTime.
          await tx.$executeRaw`
            insert into comments (id, video_id, text, author_name, like_count, reply_count, published_at, youtube_updated_at, fetched_at)
            select t.id, ${videoId}::uuid, t.text, t.author, t.likes, t.replies, t.published, t.updated, ${now.toISOString()}::timestamp(3)
              from unnest(
                ${comments.map((c) => c.youtube_comment_id)}::text[],
                ${comments.map((c) => c.text)}::text[],
                ${comments.map((c) => c.author_name)}::text[],
                ${comments.map((c) => c.like_count)}::int[],
                ${comments.map((c) => c.reply_count)}::int[],
                ${comments.map((c) => c.published_at)}::timestamp(3)[],
                ${comments.map((c) => c.updated_at)}::timestamp(3)[]
              ) as t (id, text, author, likes, replies, published, updated)
            on conflict (id) do update
              set text = excluded.text,
                  author_name = excluded.author_name,
                  like_count = excluded.like_count,
                  reply_count = excluded.reply_count,
                  youtube_updated_at = excluded.youtube_updated_at,
                  fetched_at = excluded.fetched_at`
        }
        const commentCount = await tx.comment.count({ where: { videoId } })
        return tx.video.update({
          where: { id: videoId },
          data: {
            title: details.title,
            channelTitle: details.channel_title,
            thumbnailUrl: details.thumbnail_url,
            commentCount,
            fetchStatus: "READY",
            fetchStartedAt: null,
            lastFetchedAt: now,
            fetchedThrough: progress.fetchedThrough,
            lastFetchNote: progress.note,
            lastErrorCode: null,
            lastErrorMessage: null,
          },
          select: VIDEO_SELECT,
        })
      })
      return toVideoDto(row)
    },

    async failFetch(videoId: string, code: string, message: string): Promise<VideoDto> {
      const row = await getPrisma().video.update({
        where: { id: videoId },
        data: { fetchStatus: "FAILED", fetchStartedAt: null, lastErrorCode: code, lastErrorMessage: message },
        select: VIDEO_SELECT,
      })
      return toVideoDto(row)
    },

    /**
     * Newest first, keyset-paginated on (publishedAt, id); reads only the listed columns. Filters narrow
     * by the current classification's sentiment and by text, for the evidence table.
     */
    async listComments(
      videoId: string,
      cursor: CommentCursor | null,
      limit: number,
      analyzerVersion: string,
      filters: CommentFilters = {}
    ): Promise<CommentListResponse> {
      const rows = await getPrisma().comment.findMany({
        where: {
          videoId,
          ...(filters.sentiment && { analyses: { some: { analyzerVersion, sentiment: filters.sentiment } } }),
          ...(filters.q && { text: { contains: filters.q, mode: "insensitive" as const } }),
          ...(cursor && {
            OR: [
              { publishedAt: { lt: cursor.publishedAt } },
              { publishedAt: cursor.publishedAt, id: { lt: cursor.id } },
            ],
          }),
        },
        orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
        take: limit + 1,
        select: commentSelect(analyzerVersion),
      })
      const page = rows.slice(0, limit)
      const last = page.at(-1)
      const items = page.map(toCommentDto)
      return {
        // The sentiment filter matched the stored row; drop comments edited since, whose analysis is stale.
        items: filters.sentiment ? items.filter((c) => c.analysis?.sentiment === filters.sentiment) : items,
        next_cursor: rows.length > limit && last ? encodeCursor({ publishedAt: last.publishedAt, id: last.id }) : null,
      }
    },

    /** Specific comments of one video (evidence for an insight), newest first. At most 100 IDs. */
    async getComments(videoId: string, ids: string[], analyzerVersion: string): Promise<CommentDto[]> {
      const rows = await getPrisma().comment.findMany({
        where: { videoId, id: { in: ids } },
        orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
        select: commentSelect(analyzerVersion),
      })
      return rows.map(toCommentDto)
    },
  }
}

export type VideoRepository = ReturnType<typeof createVideoRepository>
