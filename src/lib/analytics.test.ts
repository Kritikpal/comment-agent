// Run: npm test
import assert from "node:assert/strict"
import { test } from "node:test"
import { parseVideoId, percent } from "./analytics.ts"

test("parseVideoId handles common YouTube URL shapes", () => {
  assert.equal(parseVideoId("https://youtube.com/watch?v=abc123"), "abc123")
  assert.equal(parseVideoId("www.youtube.com/watch?v=dQw4w9WgXcQ&t=10"), "dQw4w9WgXcQ")
  assert.equal(parseVideoId("https://youtu.be/dQw4w9WgXcQ"), "dQw4w9WgXcQ")
  assert.equal(parseVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ"), "dQw4w9WgXcQ")
  assert.equal(parseVideoId("https://vimeo.com/watch?v=abc123"), null)
  assert.equal(parseVideoId("https://youtube.com/watch"), null)
  assert.equal(parseVideoId(""), null)
})

test("percent rounds and never divides by zero", () => {
  assert.equal(percent(1, 3), 33)
  assert.equal(percent(5, 0), 0)
})
