import type { Intent, PurchaseIntent, Sentiment, Tone } from "@/lib/types"

/** Display order for sentiment: neutral stays its own category (spec §9). */
export const SENTIMENT_ORDER: Sentiment[] = ["positive", "negative", "mixed", "neutral"]

export const SENTIMENT_META: Record<Sentiment, { label: string; color: string }> = {
  positive: { label: "Positive", color: "var(--positive)" },
  negative: { label: "Negative", color: "var(--negative)" },
  mixed: { label: "Mixed", color: "var(--mixed)" },
  neutral: { label: "Neutral", color: "var(--neutral-sentiment)" },
}

export const TONE_LABEL: Record<Tone, string> = {
  appreciative: "Appreciative",
  excited: "Excited",
  frustrated: "Frustrated",
  critical: "Critical",
  curious: "Curious",
  sarcastic: "Sarcastic",
  neutral: "Neutral",
}

export const INTENT_LABEL: Record<Intent, string> = {
  praise: "Praise",
  complaint: "Complaint",
  question: "Question",
  suggestion: "Suggestion",
  request: "Request",
  other: "Other",
}

export const PURCHASE_LABEL: Record<PurchaseIntent, string> = {
  none: "No signal",
  considering: "Considering",
  ready_to_buy: "Ready to buy",
}

export function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1)
}

/** What the evidence sheet shows: a heading plus the comment IDs backing an insight. */
export interface EvidenceRequest {
  title: string
  description?: string
  commentIds: string[]
}
