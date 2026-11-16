// Run: npm test
import assert from "node:assert/strict"
import { test } from "node:test"
import type { CommentClassification } from "../../lib/types.ts"
import { clip, isRunLevel, normalizeClassifications, toLlmError } from "./normalize.ts"

const base: CommentClassification = {
  comment_id: "a",
  sentiment: "mixed",
  tone: "critical",
  intents: ["praise", "complaint", "praise"],
  feedback: [
    { aspect: "  Battery   Life ", sentiment: "negative", detail: "dies early" },
    { aspect: "battery life", sentiment: "negative", detail: "duplicate" },
    { aspect: "   ", sentiment: "positive", detail: "blank aspect" },
    { aspect: "Camera", sentiment: "positive", detail: "x".repeat(300) },
  ],
  purchase_intent: "none",
  questions: [" When is it out? ", "When is it out?", ""],
}

test("normalize: lowercases and dedupes aspects, caps text, dedupes intents and questions", () => {
  const [c] = normalizeClassifications([base], new Set(["a"]))
  assert.deepEqual(c.intents, ["praise", "complaint"])
  assert.deepEqual(c.feedback.map((f) => f.aspect), ["battery life", "camera"])
  assert.equal(c.feedback[1].detail.length, 120)
  assert.deepEqual(c.questions, ["When is it out?"])
})

test("normalize: drops IDs outside the batch and duplicates; empty intents become other", () => {
  const out = normalizeClassifications(
    [base, { ...base, comment_id: "zzz" }, { ...base, sentiment: "positive" }, { ...base, comment_id: "b", intents: [] }],
    new Set(["a", "b"])
  )
  assert.deepEqual(out.map((c) => c.comment_id), ["a", "b"])
  assert.equal(out[0].sentiment, "mixed", "first copy wins")
  assert.deepEqual(out[1].intents, ["other"])
})

test("toLlmError: 429 and timeouts stop the run; other failures only fail a batch", () => {
  assert.equal(toLlmError(Object.assign(new Error("x"), { status: 429 })).code, "RATE_LIMITED")
  assert.equal(toLlmError(Object.assign(new Error("Request timed out"), { name: "Error" })).code, "UPSTREAM_TIMEOUT")
  assert.ok(isRunLevel(toLlmError(Object.assign(new Error("x"), { status: 429 }))))
  const original = console.error
  console.error = () => {}
  try {
    assert.ok(isRunLevel(toLlmError(Object.assign(new Error("x"), { status: 401 }))), "a bad key fails every batch, so it stops the run")
  } finally {
    console.error = original
  }
  assert.ok(!isRunLevel(toLlmError(new Error("Failed to parse JSON"))))
})

test("clip never splits an emoji and removes what Postgres rejects", () => {
  const emoji = "\u{1F600}"
  assert.equal(clip("ab" + emoji + "cd", 3), "ab" + emoji, "counts the emoji as one character")
  assert.equal(clip("a\u0000b", 10), "ab", "NUL removed")
  assert.equal(clip("x\ud83dy", 10), "x\ufffdy", "lone surrogate replaced")
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(clip("q".repeat(299) + emoji + "zz", 300))))
})
