import type { AnalysisReport, AspectMention, CommentClassification } from "../../lib/types.ts"
import type { AnalysisRunDto } from "../../lib/video-types.ts"
import { ApiError, toApiError } from "../errors.ts"
import { chunk, mapWithConcurrency } from "./batching.ts"
import { addUsage, clip, isRunLevel, NO_USAGE, toLlmError, type LlmUsage } from "./normalize.ts"

export const BATCH_SIZE = 20
export const CLASSIFY_CONCURRENCY = 3
/** Comments loaded per round: one batch for each concurrent worker. */
export const ROUND_SIZE = BATCH_SIZE * CLASSIFY_CONCURRENCY
/** Characters of each comment the model sees; the stored comment keeps its full text. */
export const LLM_TEXT_LIMIT = 1000
/** Top praised and top complaint aspects handed to the summarizer. */
export const SUMMARY_ASPECTS = 5
export const SUMMARY_MAX_CHARS = 300
/** A RUNNING run that hasn't written progress for this long is treated as abandoned. */
export const STALE_RUN_MS = 5 * 60_000
/** Waits for Groq's rate limit per call before the run gives up (each wait is at most a minute). */
export const MAX_RATE_LIMIT_WAITS = 8
const MAX_WAIT_S = 60
const SUMMARY_FALLBACK = "Summary unavailable for this analysis."

export interface ProductContext {
  name: string
  category: string | null
}

export interface ClassifyInput {
  comment_id: string
  text: string
}

export interface SummaryInput {
  product: ProductContext
  total_analyzed: number
  sentiment: AnalysisReport["sentiment"]
  purchase_interest: AnalysisReport["purchase_interest"]
  top_positive_features: Omit<AspectMention, "comment_ids">[]
  top_complaints: Omit<AspectMention, "comment_ids">[]
  question_count: number
}

export interface SummaryOutput {
  summary: string
  aspects_used: string[]
}

/** The language model behind classification and summary (Groq through LangChain in production). */
export interface Analyzer {
  model: string
  /** Prompt + model; classifications from another version are stale. */
  version: string
  classify(batch: ClassifyInput[], product: ProductContext): Promise<{ items: CommentClassification[]; usage: LlmUsage }>
  summarize(input: SummaryInput): Promise<{ output: SummaryOutput; usage: LlmUsage }>
}

export type ReportCounts = Omit<AnalysisReport, "ai_summary" | "ai_summary_comment_ids">

/** What the run needs from the database (see repository.ts). */
export interface RunStore {
  startRun(videoId: string, analyzer: { version: string; model: string }, now: Date, staleAfterMs: number): Promise<AnalysisRunDto>
  getProduct(videoId: string): Promise<ProductContext | null>
  markRunning(runId: string, total: number, now: Date): Promise<void>
  /** Comments with no current classification (never analyzed, older version, or edited since), excluding `skip`. */
  countPending(videoId: string, version: string): Promise<number>
  nextPending(videoId: string, version: string, skip: string[], take: number): Promise<ClassifyInput[]>
  saveClassifications(videoId: string, analyzer: { version: string; model: string }, items: CommentClassification[], now: Date): Promise<void>
  recordProgress(runId: string, delta: { classified: number; failed: number; usage: LlmUsage }, now: Date): Promise<void>
  /** Marks the run alive (used while waiting out a rate limit). */
  heartbeat(runId: string, now: Date): Promise<void>
  aggregate(videoId: string, version: string): Promise<ReportCounts>
  finishRun(runId: string, report: AnalysisReport, usage: LlmUsage, now: Date): Promise<void>
  failRun(runId: string, code: string, message: string, now: Date): Promise<void>
}

export interface RunDeps {
  store: RunStore
  analyzer: Analyzer
  now?: () => Date
  /** Injected so tests don't actually wait. */
  sleep?: (ms: number) => Promise<void>
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * Calls Groq, and on a 429 waits the time Groq asks for (keeping the run's heartbeat fresh) and tries
 * again, up to MAX_RATE_LIMIT_WAITS times. Runs are in the background, so waiting beats failing.
 */
async function withRateLimitWaits<T>(call: () => Promise<T>, onWait: () => Promise<void>, sleep: (ms: number) => Promise<void>): Promise<T> {
  for (let waits = 0; ; waits++) {
    try {
      return await call()
    } catch (error) {
      const failure = toLlmError(error)
      if (failure.code !== "RATE_LIMITED" || waits >= MAX_RATE_LIMIT_WAITS) throw failure
      await onWait()
      await sleep(Math.min(failure.retryAfterSeconds ?? 15, MAX_WAIT_S) * 1000)
      await onWait()
    }
  }
}

/** Claims a run for the video. Throws ANALYSIS_IN_PROGRESS if one is already active, NOT_FOUND for unknown videos. */
export async function startAnalysis(videoId: string, { store, analyzer, now = () => new Date() }: RunDeps): Promise<AnalysisRunDto> {
  if (!(await store.getProduct(videoId))) throw new ApiError("NOT_FOUND", "Video not found.")
  return store.startRun(videoId, analyzer, now(), STALE_RUN_MS)
}

type BatchOutcome = { items: CommentClassification[]; failedIds: string[]; usage: LlmUsage }

async function classifyBatch(
  batch: ClassifyInput[],
  product: ProductContext,
  analyzer: Analyzer,
  wait: <T>(call: () => Promise<T>) => Promise<T>
): Promise<BatchOutcome> {
  const input = batch.map((c) => ({ comment_id: c.comment_id, text: clip(c.text, LLM_TEXT_LIMIT) }))
  let usage = NO_USAGE
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const result = await wait(() => analyzer.classify(input, product))
      usage = addUsage(usage, result.usage)
      const done = new Set(result.items.map((c) => c.comment_id))
      // Comments the model skipped count as failed for this run; the next run picks them up again.
      return { items: result.items, failedIds: batch.filter((c) => !done.has(c.comment_id)).map((c) => c.comment_id), usage }
    } catch (error) {
      const failure = toLlmError(error)
      if (isRunLevel(failure)) throw failure
      if (attempt === 2) {
        console.warn(`[analysis] dropped a batch of ${batch.length} after a retry:`, failure.message)
        return { items: [], failedIds: batch.map((c) => c.comment_id), usage }
      }
    }
  }
  return { items: [], failedIds: batch.map((c) => c.comment_id), usage }
}

/**
 * Runs a claimed analysis to completion. Never throws: failures are recorded on the run.
 * Classifications are saved round by round, so a failed or interrupted run keeps its progress and
 * the next run only classifies what's left.
 */
export async function executeAnalysis(
  runId: string,
  videoId: string,
  { store, analyzer, now = () => new Date(), sleep = realSleep }: RunDeps
): Promise<void> {
  const version = { version: analyzer.version, model: analyzer.model }
  const wait = <T>(call: () => Promise<T>) => withRateLimitWaits(call, () => store.heartbeat(runId, now()), sleep)
  let usage = NO_USAGE
  try {
    const product = await store.getProduct(videoId)
    if (!product) throw new ApiError("NOT_FOUND", "Video not found.")
    await store.markRunning(runId, await store.countPending(videoId, analyzer.version), now())

    const skip: string[] = []
    for (;;) {
      const pending = await store.nextPending(videoId, analyzer.version, skip, ROUND_SIZE)
      if (pending.length === 0) break
      const outcomes = await mapWithConcurrency(chunk(pending, BATCH_SIZE), CLASSIFY_CONCURRENCY, (batch) =>
        classifyBatch(batch, product, analyzer, wait)
      )
      const items = outcomes.flatMap((o) => o.items)
      const failed = outcomes.flatMap((o) => o.failedIds)
      const roundUsage = outcomes.reduce((sum, o) => addUsage(sum, o.usage), NO_USAGE)
      usage = addUsage(usage, roundUsage)
      if (items.length > 0) await store.saveClassifications(videoId, version, items, now())
      // Skip everything this run has handled, so each round sees only new comments and the loop always ends.
      skip.push(...pending.map((c) => c.comment_id))
      await store.recordProgress(runId, { classified: items.length, failed: failed.length, usage: roundUsage }, now())
    }

    const counts = await store.aggregate(videoId, analyzer.version)
    if (counts.total_analyzed === 0) {
      throw new ApiError("NO_COMMENTS", "There are no analyzed comments for this video. Fetch comments first, then run the analysis.")
    }
    const summary = await wait(() => summarize(counts, product, analyzer))
    usage = addUsage(usage, summary.usage)
    await store.finishRun(
      runId,
      { ...counts, ai_summary: cleanSummary(summary.output.summary), ai_summary_comment_ids: groundSummary(summary.output.aspects_used, counts) },
      summary.usage,
      now()
    )
  } catch (error) {
    const failure = toApiError(error)
    try {
      await store.failRun(runId, failure.code, failure.message, now())
    } catch (recordError) {
      // The run stays RUNNING and is reclaimed as stale; nothing else can be done here.
      console.error(`[analysis] could not record failure for run ${runId}`, recordError)
    }
  }
}

async function summarize(counts: ReportCounts, product: ProductContext, analyzer: Analyzer) {
  const strip = (list: AspectMention[]) => list.slice(0, SUMMARY_ASPECTS).map(({ aspect, mentions }) => ({ aspect, mentions }))
  return analyzer.summarize({
    product,
    total_analyzed: counts.total_analyzed,
    sentiment: counts.sentiment,
    purchase_interest: counts.purchase_interest,
    top_positive_features: strip(counts.top_positive_features),
    top_complaints: strip(counts.top_complaints),
    question_count: counts.customer_questions.length,
  })
}

/** Enforces the 300-character limit and never returns an empty summary. */
export function cleanSummary(summary: unknown): string {
  const text = typeof summary === "string" ? summary.trim() : ""
  if (!text) return SUMMARY_FALLBACK
  return Array.from(text).length <= SUMMARY_MAX_CHARS ? clip(text, SUMMARY_MAX_CHARS) : `${clip(text, SUMMARY_MAX_CHARS - 1).trimEnd()}…`
}

/** Only aspects that exist in the report count; their comment IDs back the summary (both polarities). */
export function groundSummary(aspectsUsed: unknown, counts: Pick<ReportCounts, "top_positive_features" | "top_complaints">): string[] {
  const names = Array.isArray(aspectsUsed) ? aspectsUsed.filter((a): a is string => typeof a === "string") : []
  const used = new Set(names.map((a) => a.trim().toLowerCase()))
  const ids = new Set<string>()
  for (const mention of [...counts.top_positive_features, ...counts.top_complaints]) {
    if (used.has(mention.aspect)) mention.comment_ids.forEach((id) => ids.add(id))
  }
  return [...ids].sort()
}
