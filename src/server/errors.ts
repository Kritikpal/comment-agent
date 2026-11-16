import type { ApiErrorBody, ErrorCode } from "../lib/types.ts"

const STATUS: Record<ErrorCode, number> = {
  INVALID_REQUEST: 400,
  VIDEO_NOT_FOUND: 404,
  COMMENTS_DISABLED: 422,
  NO_COMMENTS: 422,
  RATE_LIMITED: 429,
  UPSTREAM_ERROR: 502,
  UPSTREAM_TIMEOUT: 504,
  NOT_FOUND: 404,
  VIDEO_EXISTS: 409,
  FETCH_IN_PROGRESS: 409,
  ANALYSIS_IN_PROGRESS: 409,
}

interface ApiErrorOptions {
  fields?: ApiErrorBody["error"]["fields"]
  retryAfterSeconds?: number
  videoId?: string
}

/** A failure the client is allowed to see. `message` is shown to the user verbatim. */
export class ApiError extends Error {
  readonly code: ErrorCode
  readonly status: number
  readonly fields?: ApiErrorBody["error"]["fields"]
  readonly retryAfterSeconds?: number
  readonly videoId?: string

  constructor(code: ErrorCode, message: string, options: ApiErrorOptions = {}) {
    super(message)
    this.name = "ApiError"
    this.code = code
    this.status = STATUS[code]
    this.fields = options.fields
    this.retryAfterSeconds = options.retryAfterSeconds
    this.videoId = options.videoId
  }
}

/** Anything that is not an ApiError is an internal failure: log it, hide the details. */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error
  console.error("[api] unexpected failure", error)
  return new ApiError("UPSTREAM_ERROR", "Something went wrong. Please try again.")
}

export function errorResponse(error: ApiError): Response {
  const body: ApiErrorBody = {
    error: {
      code: error.code,
      message: error.message,
      ...(error.fields && { fields: error.fields }),
      ...(error.videoId && { video_id: error.videoId }),
    },
  }
  const headers = error.retryAfterSeconds ? { "Retry-After": String(error.retryAfterSeconds) } : undefined
  return Response.json(body, { status: error.status, headers })
}
