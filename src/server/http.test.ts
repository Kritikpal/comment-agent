// Run: npm test  — shared HTTP guards: body size, rate limiting, client IP.
import assert from "node:assert/strict"
import { test } from "node:test"
import { ApiError } from "./errors.ts"
import { enforceRateLimit, MAX_BODY_BYTES, readJson, respond } from "./http.ts"
import { checkRateLimit, clientKey, MAX_TRACKED_CLIENTS, RATE_LIMIT_MAX, trackedClients } from "./rate-limit.ts"

const body = (text: string, headers: Record<string, string> = {}) => new Request("http://localhost/x", { method: "POST", headers, body: text })

async function rejectsWithMessage(promise: Promise<unknown>, message: string) {
  await assert.rejects(promise, (e: unknown) => e instanceof ApiError && e.code === "INVALID_REQUEST" && e.message === message)
}

test("readJson parses JSON and refuses non-JSON", async () => {
  assert.deepEqual(await readJson(body('{"a":1}')), { a: 1 })
  await rejectsWithMessage(readJson(body("{oops")), "Request body must be JSON.")
})

test("readJson refuses bodies over the limit, with or without Content-Length", async () => {
  const huge = JSON.stringify({ x: "y".repeat(MAX_BODY_BYTES) })
  await rejectsWithMessage(readJson(body(huge)), "Request body is too large.")
  await rejectsWithMessage(readJson(body("{}", { "content-length": String(MAX_BODY_BYTES + 1) })), "Request body is too large.")
})

test("respond turns unexpected errors into a generic 502 without leaking details", async () => {
  const original = console.error
  console.error = () => {}
  try {
    const res = await respond(async () => {
      throw new Error("secret stack detail")
    })
    assert.equal(res.status, 502)
    const json = (await res.json()) as { error: { message: string } }
    assert.ok(!json.error.message.includes("secret"))
  } finally {
    console.error = original
  }
})

test("clientKey ignores a spoofable first x-forwarded-for hop", () => {
  assert.equal(clientKey(new Headers({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" })), "203.0.113.9")
  assert.equal(clientKey(new Headers({ "x-real-ip": "198.51.100.4", "x-forwarded-for": "6.6.6.6" })), "198.51.100.4")
  assert.equal(clientKey(new Headers()), "unknown")
})

test("enforceRateLimit allows RATE_LIMIT_MAX per minute per client, then 429 with Retry-After", async () => {
  const req = () => new Request("http://localhost/x", { headers: { "x-real-ip": "10.77.0.1" } })
  for (let i = 0; i < RATE_LIMIT_MAX; i++) enforceRateLimit(req())
  const res = await respond(async () => {
    enforceRateLimit(req())
    return new Response()
  })
  assert.equal(res.status, 429)
  assert.ok(Number(res.headers.get("Retry-After")) > 0)
  enforceRateLimit(new Request("http://localhost/x", { headers: { "x-real-ip": "10.77.0.2" } }))
})

test("the limiter tracks at most MAX_TRACKED_CLIENTS clients", () => {
  const now = Date.now()
  for (let i = 0; i < MAX_TRACKED_CLIENTS + 50; i++) checkRateLimit(`spoof-${i}`, now)
  assert.ok(trackedClients() <= MAX_TRACKED_CLIENTS)
})
