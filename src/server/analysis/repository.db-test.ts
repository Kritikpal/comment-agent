// Analysis repository against the Postgres test database (never the dev database).
// Run: npm run test:db
import assert from "node:assert/strict"
import { after, before, beforeEach, test } from "node:test"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "../../generated/prisma/client.ts"
import type { CommentClassification } from "../../lib/types.ts"
import { ApiError } from "../errors.ts"
import { createVideoRepository } from "../videos/repository.ts"
import { createAnalysisRepository } from "./repository.ts"

const url = process.env.TEST_DATABASE_URL
if (!url) throw new Error("TEST_DATABASE_URL is not set; refusing to run DB tests against an unknown database")

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })
const videos = createVideoRepository(() => prisma)
const repo = createAnalysisRepository(() => prisma)
const V1 = { version: "test-v1", model: "fake" }
const DETAILS = { title: null, channel_title: null, thumbnail_url: null }

before(async () => {
  const db = (await prisma.$queryRaw<{ db: string }[]>`select current_database() as db`)[0].db
  assert.match(db, /test/, "TEST_DATABASE_URL must point at a test database")
})
beforeEach(() => prisma.$executeRaw`truncate table analysis_runs, comment_analyses, comments, videos cascade`)
after(() => prisma.$disconnect())

async function videoWith(n: number, youtubeId = "vid00000001") {
  const v = await videos.createVideo(
    { url: `https://www.youtube.com/watch?v=${youtubeId}`, youtubeVideoId: youtubeId, productName: "Phone", productCategory: "Phones", notes: null, commentLimit: 100 },
    DETAILS
  )
  const comments = Array.from({ length: n }, (_, i) => ({
    youtube_comment_id: `${youtubeId}-c${i + 1}`,
    text: `comment ${i + 1}`,
    author_name: null,
    like_count: 0,
    reply_count: 0,
    published_at: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(),
    updated_at: null,
  }))
  await videos.completeFetch(v.id, comments, DETAILS, new Date(), { fetchedThrough: null, note: null })
  return { id: v.id, commentIds: comments.map((c) => c.youtube_comment_id) }
}

const cls = (id: string, extra: Partial<CommentClassification> = {}): CommentClassification => ({
  comment_id: id,
  sentiment: "positive",
  tone: "excited",
  intents: ["praise"],
  feedback: [],
  purchase_intent: "none",
  questions: [],
  ...extra,
})

test("pending = never classified, other analyzer version, or edited since; oldest first; skip list honoured", async () => {
  const v = await videoWith(4)
  assert.equal(await repo.countPending(v.id, V1.version), 4)
  await repo.saveClassifications(v.id, V1, [cls(v.commentIds[0]), cls(v.commentIds[1])], new Date("2026-06-01T00:00:00Z"))
  assert.equal(await repo.countPending(v.id, V1.version), 2)
  assert.equal(await repo.countPending(v.id, "test-v2"), 4, "a new analyzer version reclassifies everything")

  // Edited on YouTube after classification → pending again.
  await prisma.comment.update({ where: { id: v.commentIds[0] }, data: { youtubeUpdatedAt: new Date("2026-07-01T00:00:00Z") } })
  const pending = await repo.nextPending(v.id, V1.version, [v.commentIds[3]], 10)
  assert.deepEqual(pending.map((p) => p.comment_id), [v.commentIds[0], v.commentIds[2]])
  assert.deepEqual(Object.keys(pending[0]).sort(), ["comment_id", "text"], "only id and text are read")
})

test("saveClassifications upserts every field and ignores comments of another video", async () => {
  const v = await videoWith(1)
  const other = await videoWith(1, "vid00000002")
  const id = v.commentIds[0]
  await repo.saveClassifications(v.id, V1, [cls(id), cls(other.commentIds[0])], new Date())
  await repo.saveClassifications(
    v.id,
    V1,
    [cls(id, { sentiment: "mixed", tone: "critical", intents: ["praise", "complaint"], feedback: [{ aspect: "battery", sentiment: "negative", detail: "dies" }], purchase_intent: "considering", questions: ["Price?"] })],
    new Date()
  )
  const rows = await prisma.commentAnalysis.findMany()
  assert.equal(rows.length, 1, "the other video's comment was not stored under this video")
  assert.equal(rows[0].sentiment, "mixed")
  assert.deepEqual(rows[0].intents, ["praise", "complaint"])
  assert.equal(rows[0].purchaseIntent, "considering")
  assert.deepEqual(rows[0].feedback, [{ aspect: "battery", sentiment: "negative", detail: "dies" }])
  assert.deepEqual(rows[0].questions, ["Price?"])
})

test("aggregate: counts, aspects by polarity with comment IDs, questions, all in SQL", async () => {
  const v = await videoWith(4)
  const [a, b, c, d] = v.commentIds
  await repo.saveClassifications(
    v.id,
    V1,
    [
      cls(a, { feedback: [{ aspect: "camera", sentiment: "positive", detail: "" }, { aspect: "battery", sentiment: "negative", detail: "" }], purchase_intent: "considering", questions: ["Price in India?"] }),
      cls(b, { sentiment: "negative", tone: "frustrated", feedback: [{ aspect: "Battery ", sentiment: "negative", detail: "" }], questions: ["price in india?"] }),
      cls(c, { sentiment: "neutral", tone: "curious", purchase_intent: "ready_to_buy" }),
      cls(d, { feedback: [{ aspect: "camera", sentiment: "positive", detail: "" }] }),
    ],
    new Date()
  )
  await repo.saveClassifications(v.id, { version: "old", model: "x" }, [cls(a, { sentiment: "negative" })], new Date())

  const r = await repo.aggregate(v.id, V1.version)
  assert.equal(r.total_analyzed, 4, "other analyzer versions don't count")
  assert.deepEqual(r.sentiment, { positive: 2, negative: 1, neutral: 1, mixed: 0 })
  assert.equal(r.tone.excited, 2)
  assert.equal(r.tone.frustrated, 1)
  assert.deepEqual(r.purchase_interest, { considering: 1, ready_to_buy: 1 })
  assert.deepEqual(r.top_complaints, [{ aspect: "battery", mentions: 2, comment_ids: [a, b].sort() }])
  assert.deepEqual(r.top_positive_features, [{ aspect: "camera", mentions: 2, comment_ids: [a, d].sort() }])
  assert.equal(r.customer_questions.length, 1, "questions are grouped case-insensitively")
  assert.deepEqual(r.customer_questions[0].comment_ids, [a, b].sort())
})

test("runs: one active run per video, stale runs are reclaimed, progress and report round-trip", async () => {
  const v = await videoWith(1)
  const t0 = new Date("2026-11-16T10:00:00Z")
  const run = await repo.startRun(v.id, V1, t0, 60_000)
  await assert.rejects(repo.startRun(v.id, V1, new Date(t0.getTime() + 1_000), 60_000), (e: unknown) => e instanceof ApiError && e.code === "ANALYSIS_IN_PROGRESS")

  await repo.markRunning(run.id, 7, t0)
  await repo.recordProgress(run.id, { classified: 5, failed: 1, usage: { input: 100, output: 40 } }, t0)
  const mid = await repo.getRun(run.id)
  assert.deepEqual([mid?.status, mid?.comments_total, mid?.comments_classified, mid?.comments_failed, mid?.tokens_in], ["RUNNING", 7, 5, 1, 100])
  assert.equal(mid?.report, null, "no report until READY")

  // No heartbeat for over a minute: a new run reclaims the video.
  const second = await repo.startRun(v.id, V1, new Date(t0.getTime() + 61_000), 60_000)
  assert.equal((await repo.getRun(run.id))?.status, "FAILED")

  const report = { ...(await repo.aggregate(v.id, V1.version)), ai_summary: "ok", ai_summary_comment_ids: [] }
  await repo.finishRun(second.id, report, { input: 1, output: 1 }, new Date())
  const latest = await repo.latest(v.id)
  assert.equal(latest.current?.id, second.id)
  assert.equal(latest.report?.id, second.id)
  assert.equal(latest.report?.report?.ai_summary, "ok")
})

test("a retired run can't be written to, and reading a dead run retires it", async () => {
  const v = await videoWith(1)
  const long_ago = new Date(Date.now() - 60 * 60_000)
  const run = await repo.startRun(v.id, V1, long_ago, 60_000)
  await repo.markRunning(run.id, 1, long_ago)

  const read = await repo.getRun(run.id)
  assert.equal(read?.status, "FAILED", "no heartbeat for an hour: retired on read")
  assert.equal(read?.error?.code, "UPSTREAM_TIMEOUT")

  await assert.rejects(repo.recordProgress(run.id, { classified: 1, failed: 0, usage: { input: 0, output: 0 } }, new Date()), (e: unknown) => e instanceof ApiError)
  await assert.rejects(repo.finishRun(run.id, {} as never, { input: 0, output: 0 }, new Date()), (e: unknown) => e instanceof ApiError)
  await repo.failRun(run.id, "OTHER", "ignored", new Date())
  assert.equal((await repo.getRun(run.id))?.error?.code, "UPSTREAM_TIMEOUT", "its recorded outcome is kept")
})
