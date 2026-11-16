# Product Feedback Intelligence — API Contract v1.3 (analysis runs)

Status: **implemented**. Adds LLM analysis on top of the [v1.2 video registry](api-contract-v1.2.md).
**Removes** v1.1's synchronous `POST /api/v1/videos/analyze`; the classification enums and report
fields from [v1.1](api-contract-v1.1.md) carry over.

Model: Groq through LangChain (`@langchain/groq`, structured output validated with zod). Configured by
`GROQ_API_KEY` and `GROQ_MODEL` (default `openai/gpt-oss-20b`, low reasoning effort).

| Method | Path | Rate limited | Purpose |
|---|---|---|---|
| `POST` | `/api/v1/videos/:id/analyses` | yes | Start a run; `202` immediately, work continues in the background |
| `GET` | `/api/v1/analyses/:runId` | no | Progress, then the report |
| `GET` | `/api/v1/videos/:id/analyses/latest` | no | Latest run (any state) and latest finished report |
| `GET` | `/api/v1/videos/:id/comments` | no | v1.2 endpoint, now with `analysis` per comment and filters |

## How a run works

1. **Claim.** One active (`PENDING`/`RUNNING`) run per video, enforced by a partial unique index. A run
   that stops sending heartbeats for 2 minutes is marked `FAILED` and a new one can start.
2. **Classify what's pending.** A comment is pending if it has no classification by the current
   analyzer version (prompt + model), or it was edited on YouTube after it was classified. Everything
   else is reused, so a re-run costs only new or edited comments.
3. **Batches.** 20 comments per call, 3 in flight; each comment's text is cut to 1,000 characters for the
   model. Results are checked against the batch's IDs. A batch that fails twice is skipped and counted
   (`comments_failed`); those comments are retried by the next run.
4. **Rate limits.** A Groq 429 pauses for the `retry-after` Groq sends (max 60 s per wait, 8 waits per
   call) and continues. Only if it never clears does the run fail with `RATE_LIMITED`; everything
   classified so far is kept.
5. **Report.** Aggregated in SQL from stored classifications (no comment rows loaded), then one model
   call writes the summary. Summary comment IDs are computed in code from the aspects the model names.

## Run object

```jsonc
{
  "id": "604e62ce-…",
  "video_id": "cd805794-…",
  "status": "READY",                    // PENDING | RUNNING | READY | FAILED
  "model": "openai/gpt-oss-20b",
  "analyzer_version": "classify-v1/openai/gpt-oss-20b",
  "comments_total": 81,                 // pending when the run started
  "comments_classified": 81,
  "comments_failed": 0,
  "tokens_in": 6639,
  "tokens_out": 5373,
  "created_at": "…",
  "finished_at": "…",
  "error": null,                        // { code, message } when FAILED
  "report": { /* Report, only when READY */ }
}
```

## Report

```jsonc
{
  "total_analyzed": 120,                // comments with a current classification
  "sentiment": { "positive": 19, "negative": 16, "neutral": 85, "mixed": 0 },
  "tone": { "appreciative": 14, "excited": 6, "frustrated": 13, "critical": 2, "curious": 5, "sarcastic": 2, "neutral": 78 },
  "purchase_interest": { "considering": 0, "ready_to_buy": 0 },
  "top_complaints":        [{ "aspect": "battery", "mentions": 4, "comment_ids": ["…"] }],  // ≤50, ids ≤100 each
  "top_positive_features": [{ "aspect": "camera",  "mentions": 3, "comment_ids": ["…"] }],
  "customer_questions":    [{ "question": "Price in India?", "comment_ids": ["…"] }],      // ≤50
  "ai_summary": "…",                    // ≤300 chars
  "ai_summary_comment_ids": ["…"]       // comments behind the aspects the summary names
}
```

## `POST /api/v1/videos/:id/analyses`

No body. **202** with the run (`PENDING`). **409 `ANALYSIS_IN_PROGRESS`** while another run is active.
**404** for unknown videos. **502 `UPSTREAM_ERROR`** if `GROQ_API_KEY` isn't set. Poll
`GET /api/v1/analyses/:runId` (the UI polls every 2 s).

A run fails with `NO_COMMENTS` when the video has no analyzed comments at the end (fetch comments first).

## `GET /api/v1/videos/:id/analyses/latest`

```jsonc
{ "current": Run | null,  // newest run in any state, for progress
  "report":  Run | null } // newest READY run; its `report` is what the page shows
```

## Comments: `analysis` and filters

Each comment now carries `analysis` (`{ sentiment, tone, intents, purchase_intent, feedback, questions }`)
from the current analyzer, or `null` if not analyzed yet or edited since.

| Query | Meaning |
|---|---|
| `sentiment=negative` | Only comments the current analyzer classified that way (cursor pages as before) |
| `q=battery` | Case-insensitive text search, ≤100 chars |
| `ids=a,b,c` | Those comments of this video (≤100 IDs), newest first, no paging; used by "View evidence" |

## Storage

- `comment_analyses`: primary key `(comment_id, analyzer_version)`, with `video_id` denormalized and an
  index on `(video_id, analyzer_version, sentiment)` for aggregation and the sentiment filter.
- `analysis_runs`: index on `(video_id, created_at desc)`; partial unique index on `video_id` for active runs.
- Changing `PROMPT_VERSION` (`src/server/analysis/config.ts`) or `GROQ_MODEL` makes every comment pending again.

## Errors added in v1.3

| Status | `code` | When |
|---|---|---|
| 409 | `ANALYSIS_IN_PROGRESS` | A run for this video is already active |
