// Shared by the API and the UI. Contracts: docs/api-contract-v1.2.md (videos) and v1.3 (analysis).

export const SENTIMENTS = ["positive", "negative", "neutral", "mixed"] as const
export const TONES = [
  "appreciative",
  "excited",
  "frustrated",
  "critical",
  "curious",
  "sarcastic",
  "neutral",
] as const
export const INTENTS = [
  "praise",
  "complaint",
  "question",
  "suggestion",
  "request",
  "other",
] as const
export const PURCHASE_INTENTS = ["none", "considering", "ready_to_buy"] as const

export type Sentiment = (typeof SENTIMENTS)[number]
export type Tone = (typeof TONES)[number]
export type Intent = (typeof INTENTS)[number]
export type PurchaseIntent = (typeof PURCHASE_INTENTS)[number]

export interface FeedbackItem {
  aspect: string
  sentiment: Sentiment
  detail: string
}

/** One comment's classification, without the comment ID. */
export interface CommentAnalysisDto {
  sentiment: Sentiment
  tone: Tone
  intents: Intent[]
  feedback: FeedbackItem[]
  purchase_intent: PurchaseIntent
  questions: string[]
}

/** What the classifier returns for one comment. */
export interface CommentClassification extends CommentAnalysisDto {
  comment_id: string
}

export interface AspectMention {
  aspect: string
  /** Feedback items about this aspect. */
  mentions: number
  /** Unique comments behind it (at most 100 in a report). */
  comment_ids: string[]
}

export interface CustomerQuestion {
  question: string
  comment_ids: string[]
}

/** The report snapshot stored on a finished analysis run. Every number comes from SQL, never the LLM. */
export interface AnalysisReport {
  total_analyzed: number
  sentiment: Record<Sentiment, number>
  tone: Record<Tone, number>
  purchase_interest: { considering: number; ready_to_buy: number }
  /** Up to 50 aspects each, most mentioned first. */
  top_complaints: AspectMention[]
  top_positive_features: AspectMention[]
  /** Up to 50 distinct questions, most asked first. */
  customer_questions: CustomerQuestion[]
  ai_summary: string
  /** Comments behind the aspects the summary used. Computed in code, never by the LLM. */
  ai_summary_comment_ids: string[]
}

export const ERROR_CODES = [
  "INVALID_REQUEST",
  "VIDEO_NOT_FOUND",
  "COMMENTS_DISABLED",
  "NO_COMMENTS",
  "RATE_LIMITED",
  "UPSTREAM_ERROR",
  "UPSTREAM_TIMEOUT",
  "NOT_FOUND",
  "VIDEO_EXISTS",
  "FETCH_IN_PROGRESS",
  "ANALYSIS_IN_PROGRESS",
] as const

export type ErrorCode = (typeof ERROR_CODES)[number]

/** Body of every non-2xx response. `fields` only on INVALID_REQUEST. */
export interface ApiErrorBody {
  error: {
    code: ErrorCode
    message: string
    fields?: Partial<Record<"video_url" | "comment_limit" | "product_name" | "product_category" | "notes", string>>
    /** VIDEO_EXISTS only: the ID of the video already registered for that URL. */
    video_id?: string
  }
}
