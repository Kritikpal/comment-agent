// Run: npm test  (node --test with built-in TypeScript type stripping)
import assert from "node:assert/strict"
import { test } from "node:test"
import { aggregate, parseVideoId, validateRequest } from "./analytics.ts"
import { buildResponse, DEFAULT_REQUEST } from "./mock.ts"

test("parseVideoId handles common YouTube URL shapes", () => {
  assert.equal(parseVideoId("https://youtube.com/watch?v=abc123"), "abc123")
  assert.equal(parseVideoId("www.youtube.com/watch?v=dQw4w9WgXcQ&t=10"), "dQw4w9WgXcQ")
  assert.equal(parseVideoId("https://youtu.be/dQw4w9WgXcQ"), "dQw4w9WgXcQ")
  assert.equal(parseVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ"), "dQw4w9WgXcQ")
  assert.equal(parseVideoId("https://vimeo.com/watch?v=abc123"), null)
  assert.equal(parseVideoId("https://youtube.com/watch"), null)
  assert.equal(parseVideoId(""), null)
})

test("validateRequest enforces the v1.0 input contract", () => {
  assert.deepEqual(validateRequest(DEFAULT_REQUEST), {})
  const bad = validateRequest({ video_url: "nope", comment_limit: 14, product: { name: " " } })
  assert.deepEqual(Object.keys(bad).sort(), ["comment_limit", "product_name", "video_url"])
  assert.ok(validateRequest({ ...DEFAULT_REQUEST, comment_limit: 100.5 }).comment_limit)
})

test("aggregate counts sentiment, aspects, intent and questions deterministically", () => {
  const a = aggregate(buildResponse({ ...DEFAULT_REQUEST, comment_limit: 15 }).results)
  assert.deepEqual(a.sentiment, { positive: 6, negative: 5, neutral: 3, mixed: 1 })
  assert.deepEqual(a.purchase_interest, { considering: 2, ready_to_buy: 1 })
  assert.deepEqual(a.top_complaints[0], { aspect: "battery", mentions: 2, comment_ids: ["C001", "C004"] })
  assert.equal(a.customer_questions.length, 3)
})

test("buildResponse never invents records beyond the sample pool", () => {
  const r = buildResponse(DEFAULT_REQUEST)
  assert.equal(r.total_analyzed, r.results.length)
  assert.equal(new Set(r.results.map((x) => x.comment_id)).size, r.results.length)
  const s = r.analytics.sentiment
  assert.equal(s.positive + s.negative + s.neutral + s.mixed, r.total_analyzed)
})
