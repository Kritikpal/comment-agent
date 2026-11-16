import type {
  AnalyzeRequest,
  Analytics,
  AspectMention,
  CommentResult,
  CustomerQuestion,
  Sentiment,
  Tone,
} from "./types"

export const COMMENT_LIMIT_MIN = 15
export const COMMENT_LIMIT_MAX = 100
const PRODUCT_NAME_MAX = 120

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
])
const VIDEO_ID = /^[\w-]{3,20}$/

/** Returns the video ID of a YouTube watch/shorts/embed/youtu.be URL, or null. */
export function parseVideoId(input: string): string | null {
  const raw = input.trim()
  if (!raw) return null
  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
  } catch {
    return null
  }
  if (!YOUTUBE_HOSTS.has(url.hostname.toLowerCase())) return null

  const [first, second] = url.pathname.split("/").filter(Boolean)
  const id =
    url.hostname === "youtu.be"
      ? first
      : first === "watch"
        ? url.searchParams.get("v")
        : first === "shorts" || first === "embed" || first === "live"
          ? second
          : null
  return id && VIDEO_ID.test(id) ? id : null
}

export type RequestErrors = Partial<
  Record<"video_url" | "comment_limit" | "product_name" | "product_category", string>
>

export function validateRequest(req: AnalyzeRequest): RequestErrors {
  const errors: RequestErrors = {}
  if (!parseVideoId(req.video_url)) {
    errors.video_url = "Enter a public YouTube video URL (watch, youtu.be or shorts)."
  }
  if (
    !Number.isInteger(req.comment_limit) ||
    req.comment_limit < COMMENT_LIMIT_MIN ||
    req.comment_limit > COMMENT_LIMIT_MAX
  ) {
    errors.comment_limit = `Whole number from ${COMMENT_LIMIT_MIN} to ${COMMENT_LIMIT_MAX}.`
  }
  const name = req.product.name.trim()
  if (!name) errors.product_name = "Product name is required."
  else if (name.length > PRODUCT_NAME_MAX) errors.product_name = "Keep it under 120 characters."
  if ((req.product.category ?? "").length > PRODUCT_NAME_MAX) {
    errors.product_category = "Keep it under 120 characters."
  }
  return errors
}

function rankAspects(results: CommentResult[], sentiment: Sentiment): AspectMention[] {
  const byAspect = new Map<string, { mentions: number; ids: Set<string> }>()
  for (const r of results) {
    for (const f of r.feedback) {
      if (f.sentiment !== sentiment) continue
      const key = f.aspect.trim().toLowerCase()
      const entry = byAspect.get(key) ?? { mentions: 0, ids: new Set<string>() }
      entry.mentions += 1
      entry.ids.add(r.comment_id)
      byAspect.set(key, entry)
    }
  }
  return [...byAspect.entries()]
    .map(([aspect, e]) => ({ aspect, mentions: e.mentions, comment_ids: [...e.ids] }))
    .sort((a, b) => b.mentions - a.mentions || a.aspect.localeCompare(b.aspect))
}

function collectQuestions(results: CommentResult[]): CustomerQuestion[] {
  const byText = new Map<string, CustomerQuestion>()
  for (const r of results) {
    for (const q of r.questions) {
      const key = q.trim().toLowerCase()
      const entry = byText.get(key) ?? { question: q.trim(), comment_ids: [] }
      if (!entry.comment_ids.includes(r.comment_id)) entry.comment_ids.push(r.comment_id)
      byText.set(key, entry)
    }
  }
  return [...byText.values()]
}

/** Deterministic aggregation, same rules as the backend step 6 (no LLM arithmetic). */
export function aggregate(results: CommentResult[]): Omit<Analytics, "ai_summary"> {
  const sentiment: Record<Sentiment, number> = { positive: 0, negative: 0, neutral: 0, mixed: 0 }
  const purchase_interest = { considering: 0, ready_to_buy: 0 }
  for (const r of results) {
    sentiment[r.sentiment] += 1
    if (r.purchase_intent !== "none") purchase_interest[r.purchase_intent] += 1
  }
  return {
    sentiment,
    top_complaints: rankAspects(results, "negative"),
    top_positive_features: rankAspects(results, "positive"),
    purchase_interest,
    customer_questions: collectQuestions(results),
  }
}

/** Tone is not in the locked analytics block, so the dashboard counts it from results. */
export function countTones(results: CommentResult[]): Record<Tone, number> {
  const counts: Record<Tone, number> = {
    appreciative: 0,
    excited: 0,
    frustrated: 0,
    critical: 0,
    curious: 0,
    sarcastic: 0,
    neutral: 0,
  }
  for (const r of results) counts[r.tone] += 1
  return counts
}

export function percent(part: number, total: number): number {
  return total === 0 ? 0 : Math.round((part / total) * 100)
}
