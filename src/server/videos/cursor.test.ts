// Run: npm test
import assert from "node:assert/strict"
import { test } from "node:test"
import { decodeCursor, encodeCursor } from "./cursor.ts"

test("a cursor round-trips", () => {
  const cursor = { publishedAt: new Date("2026-03-01T12:34:56.789Z"), id: "UgzKYksqeQ5gA3t0g0F4AaABAg" }
  assert.deepEqual(decodeCursor(encodeCursor(cursor)), cursor)
})

test("well-formed but crafted cursors are rejected instead of reaching Postgres", () => {
  const craft = (s: string) => Buffer.from(s).toString("base64url")
  assert.equal(decodeCursor(craft("+275760-09-13T00:00:00.000Z|abc")), null, "out-of-range year")
  assert.equal(decodeCursor(craft("2026-01-01|abc")), null, "not the exact ISO form we issue")
  assert.equal(decodeCursor(craft("2026-01-01T00:00:00.000Z|a\u0000b")), null, "NUL byte in id")
  assert.equal(decodeCursor(craft("2026-01-01T00:00:00.000Z|x'; drop table--")), null, "not a comment id")
})

test("anything the API didn't issue is rejected", () => {
  for (const bad of ["", "not base64!", Buffer.from("no-separator").toString("base64url"), Buffer.from("not-a-date|id").toString("base64url"), Buffer.from("2026-01-01T00:00:00Z|").toString("base64url"), "a".repeat(600)]) {
    assert.equal(decodeCursor(bad), null, bad)
  }
})
