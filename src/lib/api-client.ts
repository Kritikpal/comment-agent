import type { ApiErrorBody } from "./types"

/** A failed API call. `message` is safe to show the user; `fields` maps form inputs to errors. */
export class ApiRequestError extends Error {
  readonly status: number
  readonly code: string | null
  readonly fields: ApiErrorBody["error"]["fields"]
  readonly videoId: string | null

  constructor(status: number, body: Partial<ApiErrorBody> | null) {
    const error = body?.error
    super(error?.message || `Request failed (HTTP ${status}). Please try again.`)
    this.name = "ApiRequestError"
    this.status = status
    this.code = error?.code ?? null
    this.fields = error?.fields
    this.videoId = error?.video_id ?? null
  }
}

/** JSON request to this app's API. Throws ApiRequestError on any non-2xx or network failure. */
export async function apiRequest<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      method: init?.method ?? "GET",
      headers: init?.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    })
  } catch {
    throw new ApiRequestError(0, {
      error: { code: "UPSTREAM_ERROR", message: "Couldn't reach the server. Check your connection and try again." },
    })
  }
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) throw new ApiRequestError(response.status, body as Partial<ApiErrorBody> | null)
  return body as T
}
