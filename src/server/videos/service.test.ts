// Run: npm test  — the service with an in-memory repository and a fake YouTube.
import assert from "node:assert/strict"
import { test } from "node:test"
import type { CreateVideoInput } from "../../lib/video-validation.ts"
import type { VideoDto } from "../../lib/video-types.ts"
import { ApiError } from "../errors.ts"
import type { YouTubeComment } from "../youtube/client.ts"
import type { StorableComment, VideoRepository } from "./repository.ts"
import { createVideoService, nextProgress, STALE_FETCH_MS, type YouTubeGateway } from "./service.ts"

const NOW = new Date("2026-11-16T10:00:00Z")
const INPUT: CreateVideoInput = {
  url: "https://youtu.be/vid12345678",
  youtubeVideoId: "vid12345678",
  productName: "Pixel 9",
  productCategory: null,
  notes: null,
  commentLimit: 100,
}
const DETAILS = { title: "Review", channel_title: "Channel", thumbnail_url: null }

function comment(id: string, publishedAt: string | null = "2026-11-01T00:00:00Z"): YouTubeComment {
  return { youtube_comment_id: id, text: id, author_name: null, like_count: 0, reply_count: 0, published_at: publishedAt, updated_at: null }
}

function video(overrides: Partial<VideoDto> = {}): VideoDto {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    youtube_video_id: INPUT.youtubeVideoId,
    url: INPUT.url,
    title: null,
    channel_title: null,
    thumbnail_url: null,
    product: { name: "Pixel 9", category: null },
    notes: null,
    comment_limit: 100,
    comment_count: 0,
    fetch: { status: "PENDING", started_at: null, last_fetched_at: null, complete_through: null, note: null, error: null },
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
    ...overrides,
  }
}

/** Minimal in-memory stand-in for the Prisma repository. */
function memoryRepo(initial: VideoDto | null = null) {
  let current = initial
  const stored = new Map<string, StorableComment>()
  const calls: string[] = []
  const repo = {
    async getVideo() {
      return current
    },
    async createVideo() {
      calls.push("createVideo")
      current = video()
      return current
    },
    async startFetch(_id: string, now: Date, staleAfterMs: number) {
      calls.push("startFetch")
      if (!current) return null
      const started = current.fetch.started_at ? Date.parse(current.fetch.started_at) : 0
      if (current.fetch.status === "FETCHING" && now.getTime() - started < staleAfterMs) return null
      current = { ...current, fetch: { ...current.fetch, status: "FETCHING", started_at: now.toISOString() } }
      return current
    },
    async completeFetch(
      _id: string,
      comments: StorableComment[],
      details: typeof DETAILS,
      now: Date,
      progress: { fetchedThrough: Date | null; note: string | null }
    ) {
      calls.push("completeFetch")
      for (const c of comments) stored.set(c.youtube_comment_id, c)
      current = {
        ...current!,
        title: details.title,
        comment_count: stored.size,
        fetch: {
          status: "READY",
          started_at: null,
          last_fetched_at: now.toISOString(),
          complete_through: progress.fetchedThrough?.toISOString() ?? null,
          note: progress.note,
          error: null,
        },
      }
      return current
    },
    async failFetch(_id: string, code: string, message: string) {
      calls.push("failFetch")
      current = { ...current!, fetch: { ...current!.fetch, status: "FAILED", started_at: null, error: { code, message } } }
      return current
    },
  }
  return { repo: repo as unknown as VideoRepository, stored, calls, get: () => current }
}

function fakeYouTube(pages: YouTubeComment[][], details = DETAILS, flags = { exhausted: true, reachedStop: false }) {
  const seen: { limit: number; stopBefore: Date | null }[] = []
  let call = 0
  const youtube: YouTubeGateway = {
    async fetchDetails() {
      return details
    },
    async fetchNewComments(_id, limit, stopBefore) {
      seen.push({ limit, stopBefore })
      return { comments: pages[call++] ?? [], ...flags }
    },
  }
  return { youtube, seen }
}

test("create saves the video, fetches newest comments and marks it READY", async () => {
  const mem = memoryRepo()
  const yt = fakeYouTube([[comment("c1"), comment("c2")]])
  const result = await createVideoService({ repo: mem.repo, youtube: yt.youtube, now: () => NOW }).create(INPUT)
  assert.equal(result.fetch.status, "READY")
  assert.equal(result.comment_count, 2)
  assert.equal(result.title, "Review")
  assert.deepEqual(mem.calls, ["createVideo", "startFetch", "completeFetch"])
  assert.deepEqual(yt.seen, [{ limit: 100, stopBefore: null }])
})

test("create doesn't save a video YouTube says doesn't exist", async () => {
  const mem = memoryRepo()
  const youtube: YouTubeGateway = {
    async fetchDetails() {
      throw new ApiError("VIDEO_NOT_FOUND", "Video is private or doesn't exist.")
    },
    async fetchNewComments() {
      throw new Error("not reached")
    },
  }
  await assert.rejects(createVideoService({ repo: mem.repo, youtube }).create(INPUT), (e: unknown) => e instanceof ApiError && e.code === "VIDEO_NOT_FOUND")
  assert.deepEqual(mem.calls, [])
})

test("refetch stops at the watermark left by the last complete fetch", async () => {
  const mem = memoryRepo(video())
  const yt = fakeYouTube([[comment("c1", "2026-11-01T00:00:00Z")], [comment("c2", "2026-11-05T00:00:00Z")]])
  const service = createVideoService({ repo: mem.repo, youtube: yt.youtube, now: () => NOW })
  await service.refetch(video().id)
  const second = await service.refetch(video().id)
  assert.equal(yt.seen[1].stopBefore?.toISOString(), "2026-11-01T00:00:00.000Z")
  assert.equal(second.comment_count, 2)
})

test("comments without a publish time are not stored", async () => {
  const mem = memoryRepo(video())
  const yt = fakeYouTube([[comment("dated"), comment("undated", null)]])
  await createVideoService({ repo: mem.repo, youtube: yt.youtube, now: () => NOW }).refetch(video().id)
  assert.deepEqual([...mem.stored.keys()], ["dated"])
})

test("an upstream failure is recorded on the video, not thrown", async () => {
  const mem = memoryRepo(video())
  const youtube: YouTubeGateway = {
    async fetchDetails() {
      return DETAILS
    },
    async fetchNewComments() {
      throw new ApiError("COMMENTS_DISABLED", "Comments are turned off for this video.")
    },
  }
  const result = await createVideoService({ repo: mem.repo, youtube, now: () => NOW }).refetch(video().id)
  assert.equal(result.fetch.status, "FAILED")
  assert.deepEqual(result.fetch.error, { code: "COMMENTS_DISABLED", message: "Comments are turned off for this video." })
})

test("a second refetch while one is running gets FETCH_IN_PROGRESS; a stale one can be reclaimed", async () => {
  const running = video({
    fetch: { status: "FETCHING", started_at: NOW.toISOString(), last_fetched_at: null, complete_through: null, note: null, error: null },
  })
  const busy = createVideoService({ repo: memoryRepo(running).repo, youtube: fakeYouTube([]).youtube, now: () => NOW })
  await assert.rejects(busy.refetch(running.id), (e: unknown) => e instanceof ApiError && e.code === "FETCH_IN_PROGRESS")

  const later = new Date(NOW.getTime() + STALE_FETCH_MS + 1)
  const stale = createVideoService({ repo: memoryRepo(running).repo, youtube: fakeYouTube([[]]).youtube, now: () => later })
  assert.equal((await stale.refetch(running.id)).fetch.status, "READY")
})

test("refetching an unknown video is NOT_FOUND", async () => {
  const service = createVideoService({ repo: memoryRepo(null).repo, youtube: fakeYouTube([]).youtube })
  await assert.rejects(service.refetch("nope"), (e: unknown) => e instanceof ApiError && e.code === "NOT_FOUND")
})

const at = (iso: string) => ({ ...comment(iso), published_at: iso }) as StorableComment
const W = new Date("2026-11-01T00:00:00Z")

test("nextProgress: the first fetch sets the watermark to its newest comment", () => {
  const p = nextProgress(null, { comments: [], exhausted: false, reachedStop: false }, [at("2026-11-02T00:00:00Z"), at("2026-11-03T00:00:00Z")], 100)
  assert.deepEqual(p, { fetchedThrough: new Date("2026-11-03T00:00:00Z"), note: null })
})

test("nextProgress: reaching stored comments advances the watermark; nothing new keeps it", () => {
  const reached = { comments: [], exhausted: false, reachedStop: true }
  assert.deepEqual(nextProgress(W, reached, [at("2026-11-05T00:00:00Z")], 100), { fetchedThrough: new Date("2026-11-05T00:00:00Z"), note: null })
  assert.deepEqual(nextProgress(W, reached, [], 100), { fetchedThrough: W, note: null })
})

test("nextProgress: hitting the limit before stored comments keeps the watermark and explains the gap", () => {
  const p = nextProgress(W, { comments: [], exhausted: false, reachedStop: false }, [at("2026-11-09T00:00:00Z")], 50)
  assert.equal(p.fetchedThrough, W, "watermark unchanged, so a later fetch can still reach it")
  assert.match(p.note ?? "", /more than 50 new comments/i)
})

test("a gap is reported on the video and filled by a later refetch that reaches the watermark", async () => {
  const mem = memoryRepo(video({ fetch: { ...video().fetch, status: "READY", complete_through: W.toISOString() } }))
  const limited = createVideoService({ repo: mem.repo, youtube: fakeYouTube([[comment("n1", "2026-11-09T00:00:00Z")]], DETAILS, { exhausted: false, reachedStop: false }).youtube, now: () => NOW })
  const gap = await limited.refetch(video().id)
  assert.ok(gap.fetch.note)
  assert.equal(gap.fetch.complete_through, W.toISOString())

  const yt = fakeYouTube([[comment("n1", "2026-11-09T00:00:00Z"), comment("m1", "2026-11-04T00:00:00Z")]], DETAILS, { exhausted: false, reachedStop: true })
  const filled = await createVideoService({ repo: mem.repo, youtube: yt.youtube, now: () => NOW }).refetch(video().id)
  assert.equal(yt.seen[0].stopBefore?.toISOString(), W.toISOString(), "the refill still stops at the old watermark")
  assert.equal(filled.fetch.note, null)
  assert.equal(filled.fetch.complete_through, "2026-11-09T00:00:00.000Z")
})
