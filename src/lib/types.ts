// Mirrors "Product Feedback Intelligence — Prototype API & LLM Schemas (LOCKED v1.0)".
// The only addition is the optional `text` on CommentResult (proposed v1.1, see README).

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

export interface AnalyzeRequest {
  video_url: string
  comment_limit: number
  product: { name: string; category?: string }
}

export interface FeedbackItem {
  aspect: string
  sentiment: Sentiment
  detail: string
}

export interface CommentResult {
  comment_id: string
  sentiment: Sentiment
  tone: Tone
  intents: Intent[]
  feedback: FeedbackItem[]
  purchase_intent: PurchaseIntent
  questions: string[]
  /** Proposed v1.1: original YouTube comment text. Absent in v1.0 responses. */
  text?: string
}

export interface AspectMention {
  aspect: string
  mentions: number
  comment_ids: string[]
}

export interface CustomerQuestion {
  question: string
  comment_ids: string[]
}

export interface Analytics {
  sentiment: Record<Sentiment, number>
  top_complaints: AspectMention[]
  top_positive_features: AspectMention[]
  purchase_interest: { considering: number; ready_to_buy: number }
  customer_questions: CustomerQuestion[]
  ai_summary: string
}

export interface AnalyzeResponse {
  video_id: string
  total_analyzed: number
  analytics: Analytics
  results: CommentResult[]
}
