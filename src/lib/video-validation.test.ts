// Run: npm test
import assert from "node:assert/strict"
import { test } from "node:test"
import { parseCreateVideo, parseUpdateVideo } from "./video-validation.ts"

test("create: trims, defaults comment_limit to 100, and turns empty optionals into null", () => {
  const { input, errors } = parseCreateVideo({
    video_url: "  https://youtu.be/dQw4w9WgXcQ ",
    product: { name: " Pixel 9 ", category: "" },
    notes: "   ",
  })
  assert.deepEqual(errors, {})
  assert.deepEqual(input, {
    url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    youtubeVideoId: "dQw4w9WgXcQ",
    productName: "Pixel 9",
    productCategory: null,
    notes: null,
    commentLimit: 100,
  })
})

test("create: reports every bad field, keyed like the form", () => {
  const { input, errors } = parseCreateVideo({
    video_url: "https://vimeo.com/1",
    product: { name: "", category: 7 },
    notes: "x".repeat(1001),
    comment_limit: 501,
  })
  assert.equal(input, null)
  assert.deepEqual(Object.keys(errors).sort(), ["comment_limit", "notes", "product_category", "product_name", "video_url"])
})

test("create: non-object bodies are rejected, not crashed on", () => {
  for (const body of [null, "x", 42, [1]]) assert.equal(parseCreateVideo(body).input, null)
})

test("update: only sent fields change; null clears optional text", () => {
  assert.deepEqual(parseUpdateVideo({ notes: null }).input, { notes: null })
  assert.deepEqual(parseUpdateVideo({ product: { category: "" } }).input, { productCategory: null })
  assert.deepEqual(parseUpdateVideo({ product: { name: " New " }, comment_limit: 15 }).input, {
    productName: "New",
    commentLimit: 15,
  })
})

test("update: URL changes, empty updates and bad values are refused", () => {
  assert.ok(parseUpdateVideo({ video_url: "https://youtu.be/abc123" }).errors.video_url)
  assert.equal(parseUpdateVideo({}).input, null)
  assert.ok(parseUpdateVideo({ product: { name: "  " } }).errors.product_name)
  assert.ok(parseUpdateVideo({ comment_limit: 14 }).errors.comment_limit)
})
