// Run: npm test  — access-code check and session cookie token.
import assert from "node:assert/strict"
import { test } from "node:test"
import { isValidCode, isValidToken, sessionToken } from "./auth.ts"

test("accepts only the configured code", () => {
  assert.equal(isValidCode("secret-123", "secret-123"), true)
  assert.equal(isValidCode("  secret-123 ", "secret-123"), true)
  assert.equal(isValidCode("wrong", "secret-123"), false)
  assert.equal(isValidCode("", "secret-123"), false)
})

test("refuses everything when no code is configured", () => {
  assert.equal(isValidCode("", ""), false)
  assert.equal(isValidCode("anything", undefined), false)
  assert.equal(sessionToken(""), null)
  assert.equal(isValidToken("x", undefined), false)
})

test("session token validates and never equals the raw code", () => {
  const token = sessionToken("secret-123")!
  assert.notEqual(token, "secret-123")
  assert.equal(isValidToken(token, "secret-123"), true)
  assert.equal(isValidToken(token, "other-code"), false)
  assert.equal(isValidToken(undefined, "secret-123"), false)
})
