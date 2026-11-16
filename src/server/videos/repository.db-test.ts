// Repository against a real Postgres test database (never the dev database).
// Run: npm run test:db   (needs TEST_DATABASE_URL in .env and `prisma migrate deploy` applied to it)
import assert from "node:assert/strict"
import { after, before, beforeEach, test } from "node:test"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "../../generated/prisma/client.ts"
import type { CreateVideoInput } from "../../lib/video-validation.ts"
import { ApiError } from "../errors.ts"
import { decodeCursor } from "./cursor.ts"
import { createVideoRepository, type StorableComment } from "./repository.ts"

const url = process.env.TEST_DATABASE_URL
if (!url) throw new Error("TEST_DATABASE_URL is not set; refusing to run DB tests against an unknown database")

let queries: string[] = []
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }), log: [{ emit: "event", level: "query" }] })
// Data statements only; BEGIN/COMMIT around a $transaction aren't round trips worth counting here.
prisma.$on("query", (e) => {
  if (!/^\s*(BEGIN|COMMIT|ROLLBACK)\b/i.test(e.query)) queries.push(e.query)
})
const repo = createVideoRepository(() => prisma)

const DETAILS = { title: "A review", channel_title: "Channel", thumbnail_url: null }
const input = (n: number): CreateVideoInput => ({
  url: `https://youtu.be/vid${n}`,
  youtubeVideoId: `vid${String(n).padStart(8, "0")}`,
  productName: `Product ${n}`,
  productCategory: null,
  notes: null,
  commentLimit: 100,
})
const comment = (id: string, publishedAt: string, extra: Partial<StorableComment> = {}): StorableComment => ({
  youtube_comment_id: id,
  text: `text ${id}`,
  author_name: null,
  like_count: 1,
  reply_count: 0,
  published_at: publishedAt,
  updated_at: null,
  ...extra,
})

const NO_GAP = { fetchedThrough: null, note: null }

before(async () => {
  const db = (await prisma.$queryRaw<{ db: string }[]>`select current_database() as db`)[0].db
  assert.match(db, /test/, "TEST_DATABASE_URL must point at a test database")
})
beforeEach(async () => {
  await prisma.$executeRaw`truncate table comments, videos cascade`
  queries = []
})
after(() => prisma.$disconnect())

test("listVideos: newest first, page math, and exactly two queries however many rows", async () => {
  for (let i = 1; i <= 5; i++) await repo.createVideo(input(i), DETAILS)
  queries = []
  const page1 = await repo.listVideos(1, 2)
  assert.equal(queries.length, 2, `one findMany + one count, no per-row queries:\n${queries.join("\n")}`)
  assert.deepEqual(page1.items.map((v) => v.product.name), ["Product 5", "Product 4"])
  assert.deepEqual([page1.total, page1.total_pages], [5, 3])
  const page3 = await repo.listVideos(3, 2)
  assert.deepEqual(page3.items.map((v) => v.product.name), ["Product 1"])
  assert.equal((await repo.listVideos(9, 2)).items.length, 0)
})

test("createVideo: a duplicate YouTube ID is VIDEO_EXISTS carrying the existing id", async () => {
  const first = await repo.createVideo(input(1), DETAILS)
  await assert.rejects(repo.createVideo(input(1), DETAILS), (e: unknown) => e instanceof ApiError && e.code === "VIDEO_EXISTS" && e.videoId === first.id)
})

test("updateVideo: partial update; unknown id is NOT_FOUND", async () => {
  const v = await repo.createVideo(input(1), DETAILS)
  const updated = await repo.updateVideo(v.id, { notes: "hello", productCategory: "Phones" })
  assert.equal(updated.notes, "hello")
  assert.equal(updated.product.category, "Phones")
  assert.equal(updated.product.name, "Product 1", "untouched field kept")
  await assert.rejects(repo.updateVideo("00000000-0000-4000-8000-000000000000", { notes: "x" }), (e: unknown) => e instanceof ApiError && e.code === "NOT_FOUND")
})

test("startFetch: only one claim wins; a stale claim can be retaken", async () => {
  const v = await repo.createVideo(input(1), DETAILS)
  const now = new Date()
  const [a, b] = await Promise.all([repo.startFetch(v.id, now, 60_000), repo.startFetch(v.id, now, 60_000)])
  assert.equal([a, b].filter(Boolean).length, 1, "exactly one concurrent claim succeeds")
  assert.equal(await repo.startFetch(v.id, new Date(now.getTime() + 1_000), 60_000), null)
  assert.ok(await repo.startFetch(v.id, new Date(now.getTime() + 61_000), 60_000), "stale claim retaken")
})

test("completeFetch: one upsert stores, updates likes on repeats, counts, and keeps exact UTC times", async () => {
  const v = await repo.createVideo(input(1), DETAILS)
  const t = new Date("2026-11-16T10:00:00.000Z")
  await repo.completeFetch(
    v.id,
    [comment("c1", "2026-01-01T05:06:07.123Z", { author_name: "@a", updated_at: "2026-01-02T00:00:00.000Z" }), comment("c2", "2026-01-02T00:00:00.000Z")],
    DETAILS,
    t,
    NO_GAP
  )
  const after = await repo.completeFetch(v.id, [comment("c2", "2026-01-02T00:00:00.000Z", { like_count: 99 }), comment("c3", "2026-01-03T00:00:00.000Z")], { ...DETAILS, title: "Renamed" }, t, {
    fetchedThrough: new Date("2026-01-03T00:00:00.000Z"),
    note: null,
  })
  assert.equal(after.comment_count, 3)
  assert.equal(after.title, "Renamed")
  assert.equal(after.fetch.status, "READY")
  assert.equal(after.fetch.last_fetched_at, t.toISOString())

  const { items } = await repo.listComments(v.id, null, 10, "v")
  assert.deepEqual(items.map((c) => c.id), ["c3", "c2", "c1"])
  assert.equal(items[1].like_count, 99, "repeat comment refreshed")
  const c1 = items[2]
  assert.equal(c1.published_at, "2026-01-01T05:06:07.123Z", "timestamps survive without a time-zone shift")
  assert.equal(c1.youtube_updated_at, "2026-01-02T00:00:00.000Z")
  assert.equal(c1.author_name, "@a")
  assert.equal(c1.fetched_at, t.toISOString())
  assert.equal(after.fetch.complete_through, "2026-01-03T00:00:00.000Z")
  assert.equal(after.fetch.note, null)
})

test("failFetch records the reason and clears the claim", async () => {
  const v = await repo.createVideo(input(1), DETAILS)
  await repo.startFetch(v.id, new Date(), 60_000)
  const failed = await repo.failFetch(v.id, "COMMENTS_DISABLED", "Comments are turned off for this video.")
  assert.equal(failed.fetch.status, "FAILED")
  assert.deepEqual(failed.fetch.error, { code: "COMMENTS_DISABLED", message: "Comments are turned off for this video." })
  assert.ok(await repo.startFetch(v.id, new Date(), 60_000), "can retry straight away")
})

test("listComments: keyset pages cover every comment once, ties broken by id", async () => {
  const v = await repo.createVideo(input(1), DETAILS)
  const same = "2026-05-05T00:00:00.000Z"
  const all = [
    comment("a", "2026-05-01T00:00:00.000Z"),
    comment("b", same),
    comment("c", same),
    comment("d", same),
    comment("e", "2026-05-09T00:00:00.000Z"),
  ]
  await repo.completeFetch(v.id, all, DETAILS, new Date(), NO_GAP)

  const seen: string[] = []
  let cursor: string | null = null
  let pages = 0
  do {
    const page = await repo.listComments(v.id, cursor ? decodeCursor(cursor) : null, 2, "v")
    seen.push(...page.items.map((c) => c.id))
    cursor = page.next_cursor
    pages++
  } while (cursor && pages < 10)
  assert.deepEqual(seen, ["e", "d", "c", "b", "a"])
  assert.equal(pages, 3)
})

test("listComments selects only the listed columns", async () => {
  const v = await repo.createVideo(input(1), DETAILS)
  queries = []
  await repo.listComments(v.id, null, 5, "v")
  // One page query plus one batched lookup of the current classification for those rows: no N+1.
  assert.equal(queries.length, 2, queries.join(" | "))
  const selectList = queries[0].split(/\sFROM\s/i)[0]
  for (const column of ["id", "text", "author_name", "like_count", "reply_count", "published_at", "youtube_updated_at", "fetched_at"]) {
    assert.match(selectList, new RegExp(`"${column}"`), column)
  }
  assert.doesNotMatch(selectList, /"video_id"/, "the video id is already known; not re-read per row")
  assert.match(queries[0], /LIMIT/i)
})

test("getComments returns only the requested comments of that video, newest first", async () => {
  const v = await repo.createVideo(input(1), DETAILS)
  const other = await repo.createVideo(input(2), DETAILS)
  await repo.completeFetch(v.id, [comment("x", "2026-01-01T00:00:00.000Z"), comment("y", "2026-02-01T00:00:00.000Z"), comment("z", "2026-03-01T00:00:00.000Z")], DETAILS, new Date(), NO_GAP)
  await repo.completeFetch(other.id, [comment("w", "2026-04-01T00:00:00.000Z")], DETAILS, new Date(), NO_GAP)
  const got = await repo.getComments(v.id, ["x", "y", "w"], "v")
  assert.deepEqual(got.map((c) => c.id), ["y", "x"], "w belongs to another video")
  assert.equal(got[0].analysis, null)
})

test("completeFetch: a comment repeated within one batch is stored once instead of failing the fetch", async () => {
  const v = await repo.createVideo(input(1), DETAILS)
  const dup = comment("same", "2026-03-01T00:00:00.000Z")
  const result = await repo.completeFetch(v.id, [dup, comment("other", "2026-03-02T00:00:00.000Z"), { ...dup, like_count: 7 }], DETAILS, new Date(), NO_GAP)
  assert.equal(result.comment_count, 2)
  assert.equal(result.fetch.status, "READY")
})

test("completeFetch stores the gap note and watermark", async () => {
  const v = await repo.createVideo(input(1), DETAILS)
  const w = new Date("2026-04-01T00:00:00.000Z")
  const result = await repo.completeFetch(v.id, [comment("z", "2026-04-09T00:00:00.000Z")], DETAILS, new Date(), { fetchedThrough: w, note: "gap" })
  assert.equal(result.fetch.complete_through, w.toISOString())
  assert.equal(result.fetch.note, "gap")
})
