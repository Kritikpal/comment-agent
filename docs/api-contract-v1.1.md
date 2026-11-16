# Product Feedback Intelligence — API Contract v1.1

> **Superseded.** `POST /api/v1/videos/analyze` was removed in [v1.3](api-contract-v1.3.md). The classification enums and report fields below still apply; analysis now runs per stored video.


Status: **agreed, not implemented**. Supersedes "Prototype API & LLM Schemas (LOCKED v1.0)".
Backend: Next.js route handlers (Node runtime) + LangChain JS + Groq. No database in this version.

## Changes from v1.0

| Change | Why |
|---|---|
| `results[].text` is **required** and full-length | Evidence table and sheet show the original comment. |
| `results[].comment_id` is a **server-assigned short ID** (`C001`, `C002`, …) | YouTube IDs are ~26 chars and break the ID chips; short IDs are cheaper and safer through the LLM. |
| New `total_fetched` | Lets the UI tell "video has fewer comments" apart from "some comments failed to classify". |
| New `analytics.ai_summary_comment_ids` | The server, not the UI, decides which comments ground the AI summary. |
| Error envelope defined | v1.0 had none. |

---

## `POST /api/v1/videos/analyze`

Synchronous. Fetches the video's comments from YouTube, classifies them with Groq, aggregates
deterministically, and writes a summary. Expected latency 5–15 s.

### Request

```jsonc
{
  "video_url": "https://youtube.com/watch?v=abc123",
  "comment_limit": 100,
  "product": {
    "name": "Samsung Galaxy S25",
    "category": "Smartphone"
  }
}
```

| Field | Type | Rules |
|---|---|---|
| `video_url` | string | Public YouTube URL: `youtube.com/watch?v=`, `youtu.be/`, `/shorts/`, `/embed/`, `/live/`. Video ID `[\w-]{3,20}`. |
| `comment_limit` | integer | 15–100 inclusive. |
| `product.name` | string | Required, trimmed, 1–120 chars. |
| `product.category` | string | Optional, ≤120 chars. |

The server re-runs the same validation the form uses (`validateRequest` in `src/lib/analytics.ts`).

### Response `200`

```jsonc
{
  "video_id": "abc123",
  "total_fetched": 32,
  "total_analyzed": 30,
  "analytics": {
    "sentiment": { "positive": 13, "negative": 10, "neutral": 5, "mixed": 2 },
    "top_complaints": [
      { "aspect": "battery", "mentions": 4, "comment_ids": ["C001", "C004", "C026", "C029"] }
    ],
    "top_positive_features": [
      { "aspect": "camera", "mentions": 4, "comment_ids": ["C001", "C005", "C013", "C031"] }
    ],
    "purchase_interest": { "considering": 6, "ready_to_buy": 2 },
    "customer_questions": [
      { "question": "Where can I buy this phone?", "comment_ids": ["C002"] }
    ],
    "ai_summary": "Customers praise the camera and display, while battery and heating are the main concerns.",
    "ai_summary_comment_ids": ["C001", "C003", "C004", "C005"]
  },
  "results": [
    {
      "comment_id": "C001",
      "text": "Camera is amazing but battery is terrible",
      "sentiment": "mixed",
      "tone": "critical",
      "intents": ["praise", "complaint"],
      "feedback": [
        { "aspect": "camera", "sentiment": "positive", "detail": "Amazing camera" },
        { "aspect": "battery", "sentiment": "negative", "detail": "Poor battery life" }
      ],
      "purchase_intent": "none",
      "questions": []
    }
  ]
}
```

#### Top level

| Field | Type | Meaning |
|---|---|---|
| `video_id` | string | Parsed from `video_url`. |
| `total_fetched` | integer | Top-level comments pulled from YouTube. `≤ comment_limit`. |
| `total_analyzed` | integer | Comments with a valid classification. `= results.length ≤ total_fetched`. |
| `analytics` | object | See below. Computed from `results` only. |
| `results` | array | One entry per classified comment, in fetch order. |

#### `analytics`

| Field | Type | Source |
|---|---|---|
| `sentiment` | `Record<Sentiment, int>` | Code. All four keys always present; values sum to `total_analyzed`. |
| `top_complaints` | `AspectMention[]` | Code. Every `feedback` item with `sentiment: "negative"`, grouped by lowercased aspect, sorted by `mentions` desc then aspect asc. **Full list, never truncated.** |
| `top_positive_features` | `AspectMention[]` | Code. Same, for `sentiment: "positive"`. |
| `purchase_interest` | `{ considering: int, ready_to_buy: int }` | Code. Count of `results[].purchase_intent`. |
| `customer_questions` | `CustomerQuestion[]` | Code. All `results[].questions`, de-duplicated case-insensitively. |
| `ai_summary` | string | LLM. 1–2 sentences, ≤300 chars. |
| `ai_summary_comment_ids` | string[] | Code. See "Summary grounding". Sorted, unique. |

`AspectMention = { aspect: string, mentions: int, comment_ids: string[] }` — `mentions` counts feedback
items, `comment_ids` is unique comments.
`CustomerQuestion = { question: string, comment_ids: string[] }`.

#### `results[]`

| Field | Type | Source |
|---|---|---|
| `comment_id` | string | Server. `C` + 3-digit index in fetch order (`C001`…`C100`). Stable within one response only. |
| `text` | string | YouTube, plain text, full length (up to 10,000 chars). |
| `sentiment` | `Sentiment` | LLM. Overall comment sentiment. |
| `tone` | `Tone` | LLM. Exactly one. |
| `intents` | `Intent[]` | LLM. At least one, unique. |
| `feedback` | `FeedbackItem[]` | LLM. Product-aspect opinions; may be empty. |
| `purchase_intent` | `PurchaseIntent` | LLM. Buying questions count as `considering`. |
| `questions` | string[] | LLM. Questions asked in the comment; may be empty. |

`FeedbackItem = { aspect: string, sentiment: Sentiment, detail: string }` — `aspect` is a short lowercase
noun (`battery`, `camera`), `detail` ≤ 80 chars.

#### Enums (unchanged from v1.0)

| Enum | Values |
|---|---|
| `Sentiment` | `positive`, `negative`, `neutral`, `mixed` |
| `Tone` | `appreciative`, `excited`, `frustrated`, `critical`, `curious`, `sarcastic`, `neutral` |
| `Intent` | `praise`, `complaint`, `question`, `suggestion`, `request`, `other` |
| `PurchaseIntent` | `none`, `considering`, `ready_to_buy` |

### Invariants (server guarantees)

1. Every ID in `analytics` (aspects, questions, `ai_summary_comment_ids`) exists in `results`.
2. `results` IDs are unique; the LLM cannot introduce IDs — unknown IDs in model output are discarded.
3. `analytics` is computed **after** failed batches are dropped.
4. All numbers in `analytics` come from code, never from the LLM.

### Partial results

- `total_fetched < comment_limit` → the video has fewer top-level comments than requested.
- `total_analyzed < total_fetched` → some classification batches failed twice and were dropped.
- `total_analyzed == 0` → not a 200; returns `502 UPSTREAM_ERROR`.

---

## Errors

Every non-200 response:

```jsonc
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "Comment limit must be a whole number from 15 to 100.",
    "fields": { "comment_limit": "Whole number from 15 to 100." }
  }
}
```

`fields` appears only on `400`; keys match the form's `RequestErrors`: `video_url`, `comment_limit`,
`product_name`, `product_category`. `message` is safe to show the user verbatim.

| Status | `code` | When |
|---|---|---|
| 400 | `INVALID_REQUEST` | Body is not JSON or fails validation. |
| 404 | `VIDEO_NOT_FOUND` | Video is private, deleted, or the ID does not exist. |
| 422 | `COMMENTS_DISABLED` | Video exists but comments are turned off. |
| 422 | `NO_COMMENTS` | Video has zero top-level comments. |
| 429 | `RATE_LIMITED` | Our per-IP limit, Groq rate limit, or YouTube quota. Sends `Retry-After`. |
| 502 | `UPSTREAM_ERROR` | YouTube or Groq failed after retry, or nothing could be classified. |
| 504 | `UPSTREAM_TIMEOUT` | Total time budget exceeded. |

---

## Server rules

### Comment fetching
- Top-level comments only, plain text. Ordering and reply handling: see Open items.
- IDs `C001…` assigned in fetch order before anything reaches the LLM.

### Classification input
- The LLM sees `{ comment_id, text }` with `text` trimmed to ~1,000 chars. The response carries the full text.
- Comment text is untrusted data: structured output only, no tools, so injected instructions can at most
  mislabel that one comment.

### Batch failure
- A batch that fails schema validation is retried once, then dropped (see Partial results).

### Summary grounding (`ai_summary_comment_ids`)
1. The summary call receives the aggregated analytics (not raw comments) and returns
   `{ summary, aspects_used: string[] }`.
2. The server keeps only `aspects_used` entries that exist in `top_positive_features` or `top_complaints`.
3. `ai_summary_comment_ids` = union of those aspects' `comment_ids`, de-duplicated and sorted.
   The LLM never picks comment IDs directly.

### Secrets and abuse
- `GROQ_API_KEY`, `YOUTUBE_API_KEY` are server-only env vars (never `NEXT_PUBLIC_`).
- Per-IP rate limit on this endpoint; each call spends YouTube quota and Groq tokens.

---

## Out of scope for v1.1

- Persistence, analysis history, `GET /analyses/:id`.
- Streaming progress (SSE). If added later, the final event carries this same response object.
- Health endpoint.
- `youtube_comment_id` / deep links to the comment on YouTube.

## Open items (settled in the pipeline design)

- Comment ordering (`relevance` vs `time`) and whether replies are included.
- Aspect normalization (`battery life` vs `battery`).
- Batch size, Groq concurrency, model choice.
