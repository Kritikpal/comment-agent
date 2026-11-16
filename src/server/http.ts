import { ApiError, errorResponse, toApiError } from "./errors.ts"
import { checkRateLimit, clientKey } from "./rate-limit.ts"

/** A valid request is a few hundred bytes; anything far larger is not worth buffering. */
export const MAX_BODY_BYTES = 8 * 1024

const TOO_LARGE = "Request body is too large."

export async function readJson(request: Request): Promise<unknown> {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    throw new ApiError("INVALID_REQUEST", TOO_LARGE)
  }
  // Content-Length can be absent (chunked), so check what was actually read too.
  const text = await request.text()
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) throw new ApiError("INVALID_REQUEST", TOO_LARGE)
  try {
    return JSON.parse(text)
  } catch {
    throw new ApiError("INVALID_REQUEST", "Request body must be JSON.")
  }
}

/** For endpoints that spend YouTube quota: 10 per minute per client. */
export function enforceRateLimit(request: Request): void {
  const limit = checkRateLimit(clientKey(request.headers))
  if (!limit.ok) {
    throw new ApiError("RATE_LIMITED", "Too many requests. Please wait a minute and try again.", {
      retryAfterSeconds: limit.retryAfterSeconds,
    })
  }
}

/** Runs a handler and turns any thrown error into the contract's error envelope. */
export async function respond(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run()
  } catch (error) {
    return errorResponse(toApiError(error))
  }
}
