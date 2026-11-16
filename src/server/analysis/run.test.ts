// Run: npm test — the analysis run with an in-memory store and a fake analyzer (no database, no Groq).
import assert from "node:assert/strict"
import { test } from "node:test"
import type { AnalysisReport, CommentClassification } from "../../lib/types.ts"
import type { AnalysisRunDto } from "../../lib/video-types.ts"
import { ApiError } from "../errors.ts"
import { BATCH_SIZE, cleanSummary, executeAnalysis, groundSummary, startAnalysis, type Analyzer, type ClassifyInput, type ReportCounts, type RunStore } from "./run.ts"

const VIDEO = "11111111-1111-4111-8111-111111111111"

function classification(id: string): CommentClassification {
  return { comment_id: id, sentiment: "positive", tone: "neutral", intents: ["praise"], feedback: [], purchase_intent: "none", questions: [] }
}

const COUNTS: ReportCounts = {
  total_analyzed: 0,
  sentiment: { positive: 0, negative: 0, neutral: 0, mixed: 0 },
  tone: { appreciative: 0, excited: 0, frustrated: 0, critical: 0, curious: 0, sarcastic: 0, neutral: 0 },
  purchase_interest: { considering: 0, ready_to_buy: 0 },
  top_complaints: [{ aspect: "battery", mentions: 3, comment_ids: ["c2", "c3"] }],
  top_positive_features: [{ aspect: "camera", mentions: 2, comment_ids: ["c1"] }, { aspect: "battery", mentions: 1, comment_ids: ["c4"] }],
  customer_questions: [],
}

/** In-memory store: `comments` are the video's stored comments; classified IDs persist across runs. */
function memoryStore(comments: string[]) {
  const classified = new Map<string, CommentClassification>()
  const runs = new Map<string, Partial<AnalysisRunDto> & { report?: AnalysisReport }>()
  const heartbeats: string[] = []
  const store: RunStore = {
    async getProduct(videoId) {
      return videoId === VIDEO ? { name: "Phone", category: null } : null
    },
    async startRun() {
      if ([...runs.values()].some((r) => r.status === "PENDING" || r.status === "RUNNING")) {
        throw new ApiError("ANALYSIS_IN_PROGRESS", "busy")
      }
      const id = `run-${runs.size + 1}`
      runs.set(id, { id, status: "PENDING", comments_classified: 0, comments_failed: 0, tokens_in: 0 })
      return { id, status: "PENDING" } as AnalysisRunDto
    },
    async markRunning(runId, total) {
      runs.set(runId, { ...runs.get(runId), status: "RUNNING", comments_total: total })
    },
    async countPending() {
      return comments.filter((c) => !classified.has(c)).length
    },
    async nextPending(_v, _ver, skip, take): Promise<ClassifyInput[]> {
      return comments
        .filter((c) => !classified.has(c) && !skip.includes(c))
        .slice(0, take)
        .map((c) => ({ comment_id: c, text: `text ${c}` }))
    },
    async saveClassifications(_v, _a, items) {
      for (const item of items) classified.set(item.comment_id, item)
    },
    async recordProgress(runId, delta) {
      const r = runs.get(runId)!
      runs.set(runId, {
        ...r,
        comments_classified: (r.comments_classified ?? 0) + delta.classified,
        comments_failed: (r.comments_failed ?? 0) + delta.failed,
        tokens_in: (r.tokens_in ?? 0) + delta.usage.input,
      })
    },
    async aggregate() {
      return { ...COUNTS, total_analyzed: classified.size }
    },
    async heartbeat(runId) {
      heartbeats.push(runId)
    },
    async finishRun(runId, report) {
      runs.set(runId, { ...runs.get(runId), status: "READY", report })
    },
    async failRun(runId, code, message) {
      runs.set(runId, { ...runs.get(runId), status: "FAILED", error: { code, message } })
    },
  }
  return { store, classified, runs, heartbeats }
}

function fakeAnalyzer(overrides: Partial<Analyzer> = {}): Analyzer & { batches: string[][] } {
  const batches: string[][] = []
  return {
    batches,
    model: "fake",
    version: "test/fake",
    async classify(batch) {
      batches.push(batch.map((c) => c.comment_id))
      return { items: batch.map((c) => classification(c.comment_id)), usage: { input: 10, output: 5 } }
    },
    async summarize() {
      return { output: { summary: "Camera praised, battery criticised.", aspects_used: ["camera", "Battery", "warp drive"] }, usage: { input: 1, output: 1 } }
    },
    ...overrides,
  }
}

const ids = (n: number) => Array.from({ length: n }, (_, i) => `c${i + 1}`)

const sleeps: number[] = []
const instantSleep = async (ms: number) => {
  sleeps.push(ms)
}

async function run(store: RunStore, analyzer: Analyzer) {
  const started = await startAnalysis(VIDEO, { store, analyzer })
  await executeAnalysis(started.id, VIDEO, { store, analyzer, sleep: instantSleep })
  return started.id
}

test("classifies every pending comment in batches of 20, then stores a grounded report", async () => {
  const mem = memoryStore(ids(45))
  const analyzer = fakeAnalyzer()
  const runId = await run(mem.store, analyzer)
  const r = mem.runs.get(runId)!
  assert.equal(r.status, "READY")
  assert.equal(r.comments_total, 45)
  assert.equal(r.comments_classified, 45)
  assert.deepEqual(analyzer.batches.map((b) => b.length), [BATCH_SIZE, BATCH_SIZE, 5])
  assert.equal(r.tokens_in, 30)
  assert.equal(r.report?.ai_summary, "Camera praised, battery criticised.")
  assert.deepEqual(r.report?.ai_summary_comment_ids, ["c1", "c2", "c3", "c4"], "camera + battery on both sides; invented aspect ignored")
})

test("a second run only sends comments that weren't classified before", async () => {
  const comments = ids(25)
  const mem = memoryStore(comments)
  await run(mem.store, fakeAnalyzer())
  comments.push("new1", "new2")
  const second = fakeAnalyzer()
  const runId = await run(mem.store, second)
  assert.deepEqual(second.batches, [["new1", "new2"]])
  assert.equal(mem.runs.get(runId)?.comments_total, 2)
})

test("a batch that fails twice is skipped and counted; the rest still finish", async () => {
  const mem = memoryStore(ids(40))
  let calls = 0
  const analyzer = fakeAnalyzer({
    async classify(batch) {
      calls++
      if (batch[0].comment_id === "c21") throw new Error("bad json")
      return { items: batch.map((c) => classification(c.comment_id)), usage: { input: 0, output: 0 } }
    },
  })
  const original = console.warn
  console.warn = () => {}
  try {
    const runId = await run(mem.store, analyzer)
    const r = mem.runs.get(runId)!
    assert.equal(r.status, "READY")
    assert.equal(r.comments_classified, 20)
    assert.equal(r.comments_failed, 20)
    assert.equal(calls, 3, "first batch once, failing batch twice, then no infinite retry")
  } finally {
    console.warn = original
  }
})

test("comments the model leaves out count as failed, not as classified", async () => {
  const mem = memoryStore(ids(3))
  const analyzer = fakeAnalyzer({
    async classify(batch) {
      return { items: batch.slice(1).map((c) => classification(c.comment_id)), usage: { input: 0, output: 0 } }
    },
  })
  const r = mem.runs.get(await run(mem.store, analyzer))!
  assert.equal(r.comments_classified, 2)
  assert.equal(r.comments_failed, 1)
})

const rateLimited = (retryAfter: string) => Object.assign(new Error("429"), { status: 429, headers: new Headers({ "retry-after": retryAfter }) })

test("a Groq rate limit is waited out (for as long as Groq asks) and the run still completes", async () => {
  sleeps.length = 0
  const mem = memoryStore(ids(30))
  let call = 0
  const analyzer = fakeAnalyzer({
    async classify(batch) {
      call++
      if (call === 2 || call === 3) throw rateLimited("14")
      return { items: batch.map((c) => classification(c.comment_id)), usage: { input: 0, output: 0 } }
    },
  })
  const runId = await run(mem.store, analyzer)
  const r = mem.runs.get(runId)!
  assert.equal(r.status, "READY")
  assert.equal(mem.classified.size, 30)
  assert.deepEqual(sleeps, [14_000, 14_000], "waits the retry-after Groq sent")
  assert.equal(mem.heartbeats.length, 4, "a heartbeat before and after each wait keeps the run alive")
})

test("a rate limit that never clears fails the run after the wait budget, keeping earlier rounds", async () => {
  sleeps.length = 0
  const mem = memoryStore(ids(80))
  let call = 0
  const analyzer = fakeAnalyzer({
    async classify(batch) {
      call++
      if (call > 3) throw rateLimited("999")
      return { items: batch.map((c) => classification(c.comment_id)), usage: { input: 0, output: 0 } }
    },
  })
  const r = mem.runs.get(await run(mem.store, analyzer))!
  assert.equal(r.status, "FAILED")
  assert.equal(r.error?.code, "RATE_LIMITED")
  assert.equal(mem.classified.size, 60, "the first round (3 batches) was saved")
  assert.ok(sleeps.every((ms) => ms === 60_000), "a single wait is capped at a minute")
})

test("no stored comments: the run fails with NO_COMMENTS", async () => {
  const mem = memoryStore([])
  const r = mem.runs.get(await run(mem.store, fakeAnalyzer()))!
  assert.equal(r.status, "FAILED")
  assert.equal(r.error?.code, "NO_COMMENTS")
})

test("only one active run per video; unknown videos are NOT_FOUND", async () => {
  const mem = memoryStore(ids(1))
  await startAnalysis(VIDEO, { store: mem.store, analyzer: fakeAnalyzer() })
  await assert.rejects(startAnalysis(VIDEO, { store: mem.store, analyzer: fakeAnalyzer() }), (e: unknown) => e instanceof ApiError && e.code === "ANALYSIS_IN_PROGRESS")
  await assert.rejects(startAnalysis("other", { store: mem.store, analyzer: fakeAnalyzer() }), (e: unknown) => e instanceof ApiError && e.code === "NOT_FOUND")
})

test("comment text is trimmed to 1,000 characters for the model", async () => {
  const mem = memoryStore(["long"])
  mem.store.nextPending = async (_v, _ver, skip) => (skip.includes("long") ? [] : [{ comment_id: "long", text: "x".repeat(1500) }])
  let seen = 0
  await run(mem.store, fakeAnalyzer({
    async classify(batch) {
      seen = batch[0].text.length
      return { items: [classification("long")], usage: { input: 0, output: 0 } }
    },
  }))
  assert.equal(seen, 1000)
})

test("summaries are capped at 300 characters and never empty; grounding ignores unknown aspects", () => {
  assert.equal(cleanSummary("a".repeat(400)).length, 300)
  assert.equal(cleanSummary("   "), "Summary unavailable for this analysis.")
  assert.equal(cleanSummary(42), "Summary unavailable for this analysis.")
  assert.deepEqual(groundSummary(["nope", 7], COUNTS), [])
  assert.deepEqual(groundSummary(null, COUNTS), [])
})
