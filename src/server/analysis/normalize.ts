import type { CommentClassification, FeedbackItem, Intent } from "../../lib/types.ts"
import { ApiError } from "../errors.ts"

export const ASPECT_MAX = 40
export const DETAIL_MAX = 120
export const QUESTION_MAX = 300
export const FEEDBACK_ITEMS_MAX = 10
export const QUESTIONS_MAX = 5

/**
 * Cuts text to `max` characters without splitting an emoji, and drops lone surrogates and NUL, which
 * Postgres rejects in jsonb/text (one bad string would otherwise fail every future run).
 */
export function clip(text: string, max: number): string {
  return Array.from(text.toWellFormed().replace(/\u0000/g, "")).slice(0, max).join("")
}

export interface LlmUsage {
  input: number
  output: number
}

export const NO_USAGE: LlmUsage = { input: 0, output: 0 }

export function addUsage(a: LlmUsage, b: LlmUsage): LlmUsage {
  return { input: a.input + b.input, output: a.output + b.output }
}

/**
 * Tidies what the model returned (enums are already enforced by the schema): one entry per known
 * comment, lowercase single-spaced aspects, capped text, at least one intent, no duplicates.
 * Entries for IDs that weren't in the batch are dropped.
 */
export function normalizeClassifications(raw: CommentClassification[], batchIds: ReadonlySet<string>): CommentClassification[] {
  const seen = new Set<string>()
  const out: CommentClassification[] = []
  for (const c of raw) {
    if (!batchIds.has(c.comment_id) || seen.has(c.comment_id)) continue
    seen.add(c.comment_id)
    const feedback: FeedbackItem[] = []
    const aspects = new Set<string>()
    for (const f of c.feedback) {
      const aspect = clip(f.aspect.trim().toLowerCase().replace(/\s+/g, " "), ASPECT_MAX).trim()
      if (!aspect || aspects.has(`${aspect}|${f.sentiment}`)) continue
      if (feedback.length >= FEEDBACK_ITEMS_MAX) break
      aspects.add(`${aspect}|${f.sentiment}`)
      feedback.push({ aspect, sentiment: f.sentiment, detail: clip(f.detail.trim(), DETAIL_MAX) })
    }
    const intents = [...new Set<Intent>(c.intents)]
    out.push({
      comment_id: c.comment_id,
      sentiment: c.sentiment,
      tone: c.tone,
      intents: intents.length > 0 ? intents : ["other"],
      feedback,
      purchase_intent: c.purchase_intent,
      questions: [...new Set(c.questions.map((q) => clip(q.trim(), QUESTION_MAX)).filter(Boolean))].slice(0, QUESTIONS_MAX),
    })
  }
  return out
}

const DEFAULT_RETRY_AFTER_S = 15

/** Seconds to wait from a Groq 429: its retry-after header (Headers object or plain record), else a default. */
export function retryAfterSeconds(error: unknown): number {
  const headers = (error as { headers?: unknown })?.headers
  const raw =
    headers && typeof (headers as Headers).get === "function"
      ? (headers as Headers).get("retry-after")
      : (headers as Record<string, string> | undefined)?.["retry-after"]
  const seconds = Number(raw)
  return Number.isFinite(seconds) && seconds > 0 ? seconds : DEFAULT_RETRY_AFTER_S
}

/** Groq/LangChain errors → contract codes. Rate limits and timeouts end the run; the rest fail one batch. */
export function toLlmError(error: unknown): ApiError {
  if (error instanceof ApiError) return error
  const status = (error as { status?: unknown })?.status
  const name = error instanceof Error ? error.name : ""
  if (status === 429) {
    return new ApiError("RATE_LIMITED", "The Groq rate limit was reached. Progress is saved; run the analysis again in a minute.", {
      retryAfterSeconds: retryAfterSeconds(error),
    })
  }
  if (name === "TimeoutError" || name === "AbortError" || /timed? ?out/i.test(error instanceof Error ? error.message : "")) {
    return new ApiError("UPSTREAM_TIMEOUT", "Groq took too long to respond. Progress is saved; run the analysis again.")
  }
  if (status === 401 || status === 403) {
    console.error("[analysis] Groq rejected the API key", status)
    return new ApiError("UPSTREAM_ERROR", "The language model rejected the server's API key.")
  }
  return new ApiError("UPSTREAM_ERROR", "The language model returned an unusable answer.")
}

/** Errors that stop the whole run (retrying the next batch would fail the same way). */
export function isRunLevel(error: ApiError): boolean {
  return error.code === "RATE_LIMITED" || error.code === "UPSTREAM_TIMEOUT" || error.message.includes("API key")
}
