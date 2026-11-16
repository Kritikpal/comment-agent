import { aggregate, parseVideoId } from "./analytics.ts"
import type { AnalyzeRequest, AnalyzeResponse, CommentResult } from "./types"

// ponytail: fixed sample pool stands in for YouTube + Groq. Swap mockAnalyze for a
// fetch to POST /api/v1/videos/analyze when the FastAPI backend exists.
const SAMPLE_COMMENTS: CommentResult[] = [
  {
    comment_id: "C001",
    text: "Camera is amazing but battery is terrible",
    sentiment: "mixed",
    tone: "critical",
    intents: ["praise", "complaint"],
    feedback: [
      { aspect: "camera", sentiment: "positive", detail: "Amazing camera" },
      { aspect: "battery", sentiment: "negative", detail: "Poor battery life" },
    ],
    purchase_intent: "none",
    questions: [],
  },
  {
    comment_id: "C002",
    text: "Where can I buy this phone?",
    sentiment: "neutral",
    tone: "curious",
    intents: ["question"],
    feedback: [],
    purchase_intent: "considering",
    questions: ["Where can I buy this phone?"],
  },
  {
    comment_id: "C003",
    text: "Love the display quality!",
    sentiment: "positive",
    tone: "appreciative",
    intents: ["praise"],
    feedback: [{ aspect: "display", sentiment: "positive", detail: "Good display quality" }],
    purchase_intent: "none",
    questions: [],
  },
  {
    comment_id: "C004",
    text: "Battery drains by 2pm with normal use. Really disappointed.",
    sentiment: "negative",
    tone: "frustrated",
    intents: ["complaint"],
    feedback: [{ aspect: "battery", sentiment: "negative", detail: "Drains by early afternoon" }],
    purchase_intent: "none",
    questions: [],
  },
  {
    comment_id: "C005",
    text: "The night shots in this video look unreal. Ordering one this weekend.",
    sentiment: "positive",
    tone: "excited",
    intents: ["praise"],
    feedback: [{ aspect: "camera", sentiment: "positive", detail: "Excellent night shots" }],
    purchase_intent: "ready_to_buy",
    questions: [],
  },
  {
    comment_id: "C006",
    text: "Does it have better battery life than the S24?",
    sentiment: "neutral",
    tone: "curious",
    intents: ["question"],
    feedback: [],
    purchase_intent: "considering",
    questions: ["Does it have better battery life than the S24?"],
  },
  {
    comment_id: "C007",
    text: "Gets noticeably hot after 20 minutes of gaming.",
    sentiment: "negative",
    tone: "critical",
    intents: ["complaint"],
    feedback: [{ aspect: "heating", sentiment: "negative", detail: "Heats up while gaming" }],
    purchase_intent: "none",
    questions: [],
  },
  {
    comment_id: "C008",
    text: "Price is way too high for a base model.",
    sentiment: "negative",
    tone: "critical",
    intents: ["complaint"],
    feedback: [{ aspect: "price", sentiment: "negative", detail: "Too expensive for a base model" }],
    purchase_intent: "none",
    questions: [],
  },
  {
    comment_id: "C009",
    text: "Display is gorgeous and the size is perfect for one hand.",
    sentiment: "positive",
    tone: "appreciative",
    intents: ["praise"],
    feedback: [
      { aspect: "display", sentiment: "positive", detail: "Gorgeous display" },
      { aspect: "design", sentiment: "positive", detail: "Comfortable one-hand size" },
    ],
    purchase_intent: "none",
    questions: [],
  },
  {
    comment_id: "C010",
    text: "Great, another $900 phone that is just last year's phone with new paint.",
    sentiment: "negative",
    tone: "sarcastic",
    intents: ["complaint"],
    feedback: [
      { aspect: "price", sentiment: "negative", detail: "High price for small changes" },
      { aspect: "design", sentiment: "negative", detail: "Too similar to last year" },
    ],
    purchase_intent: "none",
    questions: [],
  },
  {
    comment_id: "C011",
    text: "Is the camera good for low light?",
    sentiment: "neutral",
    tone: "curious",
    intents: ["question"],
    feedback: [],
    purchase_intent: "none",
    questions: ["Is the camera good for low light?"],
  },
  {
    comment_id: "C012",
    text: "Just upgraded from my S21 and the speed difference is huge.",
    sentiment: "positive",
    tone: "excited",
    intents: ["praise"],
    feedback: [{ aspect: "performance", sentiment: "positive", detail: "Much faster than older model" }],
    purchase_intent: "none",
    questions: [],
  },
  {
    comment_id: "C013",
    text: "Camera zoom is noticeably better than my old phone.",
    sentiment: "positive",
    tone: "appreciative",
    intents: ["praise"],
    feedback: [{ aspect: "camera", sentiment: "positive", detail: "Better zoom" }],
    purchase_intent: "none",
    questions: [],
  },
  {
    comment_id: "C014",
    text: "Please bring back the charger in the box.",
    sentiment: "negative",
    tone: "critical",
    intents: ["request", "complaint"],
    feedback: [{ aspect: "charging", sentiment: "negative", detail: "No charger included" }],
    purchase_intent: "none",
    questions: [],
  },
  {
    comment_id: "C015",
    text: "Battery is fine for me, lasts a full day.",
    sentiment: "positive",
    tone: "neutral",
    intents: ["praise"],
    feedback: [{ aspect: "battery", sentiment: "positive", detail: "Lasts a full day" }],
    purchase_intent: "none",
    questions: [],
  },
  {
    comment_id: "C016",
    text: "Would be perfect if it charged faster. 25W in 2025 is a joke.",
    sentiment: "mixed",
    tone: "frustrated",
    intents: ["suggestion", "complaint"],
    feedback: [{ aspect: "charging", sentiment: "negative", detail: "Slow 25W charging" }],
    purchase_intent: "none",
    questions: [],
  },
  {
    comment_id: "C017",
    text: "Thinking about switching from iPhone. Is One UI easy to get used to?",
    sentiment: "neutral",
    tone: "curious",
    intents: ["question"],
    feedback: [],
    purchase_intent: "considering",
    questions: ["Is One UI easy to get used to?"],
  },
  {
    comment_id: "C018",
    text: "The frame feels premium in hand.",
    sentiment: "positive",
    tone: "appreciative",
    intents: ["praise"],
    feedback: [{ aspect: "design", sentiment: "positive", detail: "Premium-feeling frame" }],
    purchase_intent: "none",
    questions: [],
  },
  {
    comment_id: "C019",
    text: "Seven years of software updates is the real selling point here.",
    sentiment: "positive",
    tone: "appreciative",
    intents: ["praise"],
    feedback: [{ aspect: "software", sentiment: "positive", detail: "Long update support" }],
    purchase_intent: "none",
    questions: [],
  },
  {
    comment_id: "C020",
    text: "Mine overheats while charging overnight. Is anyone else seeing this?",
    sentiment: "negative",
    tone: "frustrated",
    intents: ["complaint", "question"],
    feedback: [{ aspect: "heating", sentiment: "negative", detail: "Overheats while charging" }],
    purchase_intent: "none",
    questions: ["Is anyone else seeing this?"],
  },
  {
    comment_id: "C021",
    text: "Nice review, thanks!",
    sentiment: "neutral",
    tone: "appreciative",
    intents: ["other"],
    feedback: [],
    purchase_intent: "none",
    questions: [],
  },
  {
    comment_id: "C022",
    text: "Display brightness outdoors is incredible.",
    sentiment: "positive",
    tone: "excited",
    intents: ["praise"],
    feedback: [{ aspect: "display", sentiment: "positive", detail: "Bright outdoors" }],
    purchase_intent: "none",
    questions: [],
  },
  {
    comment_id: "C023",
    text: "Camera processing oversharpens skin. Portraits look fake.",
    sentiment: "negative",
    tone: "critical",
    intents: ["complaint"],
    feedback: [{ aspect: "camera", sentiment: "negative", detail: "Over-sharpened portraits" }],
    purchase_intent: "none",
    questions: [],
  },
  {
    comment_id: "C024",
    text: "Pre-ordered! Can't wait for delivery.",
    sentiment: "positive",
    tone: "excited",
    intents: ["other"],
    feedback: [],
    purchase_intent: "ready_to_buy",
    questions: [],
  },
  {
    comment_id: "C025",
    text: "Will there be a cheaper FE version later this year?",
    sentiment: "neutral",
    tone: "curious",
    intents: ["question"],
    feedback: [],
    purchase_intent: "considering",
    questions: ["Will there be a cheaper FE version later this year?"],
  },
  {
    comment_id: "C026",
    text: "Battery and heating issues again. Skipping this generation.",
    sentiment: "negative",
    tone: "frustrated",
    intents: ["complaint"],
    feedback: [
      { aspect: "battery", sentiment: "negative", detail: "Battery issues persist" },
      { aspect: "heating", sentiment: "negative", detail: "Heating issues persist" },
    ],
    purchase_intent: "none",
    questions: [],
  },
  {
    comment_id: "C027",
    text: "The AI features are gimmicky, nobody asked for this.",
    sentiment: "negative",
    tone: "sarcastic",
    intents: ["complaint"],
    feedback: [{ aspect: "software", sentiment: "negative", detail: "AI features feel gimmicky" }],
    purchase_intent: "none",
    questions: [],
  },
  {
    comment_id: "C028",
    text: "Smooth 120Hz and no lag at all. Best Android I've used.",
    sentiment: "positive",
    tone: "excited",
    intents: ["praise"],
    feedback: [
      { aspect: "performance", sentiment: "positive", detail: "No lag" },
      { aspect: "display", sentiment: "positive", detail: "Smooth 120Hz" },
    ],
    purchase_intent: "none",
    questions: [],
  },
  {
    comment_id: "C029",
    text: "They should add a bigger battery instead of making it thinner.",
    sentiment: "negative",
    tone: "critical",
    intents: ["suggestion"],
    feedback: [{ aspect: "battery", sentiment: "negative", detail: "Battery too small" }],
    purchase_intent: "none",
    questions: [],
  },
  {
    comment_id: "C030",
    text: "How much is it in India?",
    sentiment: "neutral",
    tone: "curious",
    intents: ["question"],
    feedback: [],
    purchase_intent: "considering",
    questions: ["How much is it in India?"],
  },
  {
    comment_id: "C031",
    text: "Camera is excellent for video, stabilisation is rock solid.",
    sentiment: "positive",
    tone: "appreciative",
    intents: ["praise"],
    feedback: [{ aspect: "camera", sentiment: "positive", detail: "Stable video" }],
    purchase_intent: "none",
    questions: [],
  },
  {
    comment_id: "C032",
    text: "Good phone, but the price makes it hard to recommend.",
    sentiment: "mixed",
    tone: "critical",
    intents: ["praise", "complaint"],
    feedback: [{ aspect: "price", sentiment: "negative", detail: "Hard to recommend at this price" }],
    purchase_intent: "none",
    questions: [],
  },
]

export const SAMPLE_POOL_SIZE = SAMPLE_COMMENTS.length

export const DEFAULT_REQUEST: AnalyzeRequest = {
  video_url: "https://youtube.com/watch?v=abc123",
  comment_limit: 100,
  product: { name: "Samsung Galaxy S25", category: "Smartphone" },
}

function joinAspects(aspects: string[]): string {
  return aspects.length < 2 ? aspects.join("") : `${aspects.slice(0, -1).join(", ")} and ${aspects.at(-1)}`
}

function summarize(analytics: ReturnType<typeof aggregate>): string {
  const praised = analytics.top_positive_features.slice(0, 2).map((a) => a.aspect)
  const concerns = analytics.top_complaints.slice(0, 2).map((a) => a.aspect)
  if (!praised.length && !concerns.length) return "Not enough product feedback to summarize."
  const parts = [
    praised.length ? `Customers praise the ${joinAspects(praised)}` : "",
    concerns.length ? `${joinAspects(concerns)} ${concerns.length > 1 ? "are the main concerns" : "is the main concern"}` : "",
  ].filter(Boolean)
  const sentence = parts.join(", while ")
  return sentence.charAt(0).toUpperCase() + sentence.slice(1) + "."
}

export function buildResponse(req: AnalyzeRequest): AnalyzeResponse {
  const results = SAMPLE_COMMENTS.slice(0, req.comment_limit)
  const analytics = aggregate(results)
  return {
    video_id: parseVideoId(req.video_url) ?? "unknown",
    total_analyzed: results.length,
    analytics: { ...analytics, ai_summary: summarize(analytics) },
    results,
  }
}

const MOCK_LATENCY_MS = 900

export function mockAnalyze(req: AnalyzeRequest): Promise<AnalyzeResponse> {
  return new Promise((resolve) => setTimeout(() => resolve(buildResponse(req)), MOCK_LATENCY_MS))
}
