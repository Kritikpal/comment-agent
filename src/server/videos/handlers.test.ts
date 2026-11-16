// Run: npm test  — HTTP behaviour of the video endpoints, with fake repository and service.
import assert from "node:assert/strict"
import { test } from "node:test"
import type { ApiErrorBody } from "../../lib/types.ts"
import type { VideoDto } from "../../lib/video-types.ts"
import { ApiError } from "../errors.ts"
import {
  handleCreateVideo,
  handleGetVideo,
  handleListComments,
  handleListVideos,
  handleRefetch,
  handleUpdateVideo,
  type VideoHandlerDeps,
} from "./handlers.ts"
import { encodeCursor } from "./cursor.ts"
import type { VideoRepository } from "./repository.ts"
import type { VideoService } from "./service.ts"

const ID = "11111111-1111-4111-8111-111111111111"
const VIDEO = { id: ID, comment_count: 3 } as VideoDto

let ip = 0
function req(path: string, init: { method?: string; body?: unknown } = {}): Request {
  return new Request(`http://localhost${path}`, {
    method: init.method ?? "GET",
    headers: { "x-real-ip": `10.20.0.${++ip}`, "Content-Type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
}

function deps(overrides: Partial<Record<keyof VideoRepository, unknown>> = {}, service: Partial<VideoService> = {}) {
  const calls: unknown[][] = []
  const repo = {
    async listVideos(page: number, size: number) {
      calls.push(["listVideos", page, size])
      return { items: [], page, page_size: size, total: 0, total_pages: 1 }
    },
    async getVideo(id: string) {
      calls.push(["getVideo", id])
      return id === ID ? VIDEO : null
    },
    async updateVideo(id: string, input: unknown) {
      calls.push(["updateVideo", id, input])
      return VIDEO
    },
    async listComments(id: string, cursor: unknown, limit: number, _version: string, filters: unknown) {
      calls.push(["listComments", id, cursor, limit, filters])
      return { items: [], next_cursor: null }
    },
    ...overrides,
  }
  const d: VideoHandlerDeps = {
    analyzerVersion: () => "test-v1",
    repo: repo as unknown as VideoRepository,
    service: () =>
      ({
        async create() {
          return VIDEO
        },
        async refetch() {
          return VIDEO
        },
        ...service,
      }) as VideoService,
  }
  return { d, calls }
}

async function errorOf(res: Response): Promise<ApiErrorBody["error"]> {
  return ((await res.json()) as ApiErrorBody).error
}

test("list: defaults to page 1 of 20 and validates paging params", async () => {
  const { d, calls } = deps()
  assert.equal((await handleListVideos(req("/api/v1/videos"), d)).status, 200)
  assert.deepEqual(calls[0], ["listVideos", 1, 20])
  await handleListVideos(req("/api/v1/videos?page=3&page_size=50"), d)
  assert.deepEqual(calls[1], ["listVideos", 3, 50])
  for (const q of ["page=0", "page=abc", "page_size=101", "page=1.5"]) {
    const res = await handleListVideos(req(`/api/v1/videos?${q}`), d)
    assert.equal(res.status, 400, q)
  }
})

test("create: 201 on success, 400 with field errors on bad input", async () => {
  const { d } = deps()
  const ok = await handleCreateVideo(req("/api/v1/videos", { method: "POST", body: { video_url: "https://youtu.be/dQw4w9WgXcQ", product: { name: "X" } } }), d)
  assert.equal(ok.status, 201)
  const bad = await handleCreateVideo(req("/api/v1/videos", { method: "POST", body: { video_url: "nope", product: {} } }), d)
  assert.equal(bad.status, 400)
  assert.deepEqual(Object.keys((await errorOf(bad)).fields ?? {}).sort(), ["product_name", "video_url"])
})

test("create: a duplicate URL is 409 with the existing video's id", async () => {
  const { d } = deps({}, {
    async create() {
      throw new ApiError("VIDEO_EXISTS", "This video has already been added.", { videoId: ID })
    },
  })
  const res = await handleCreateVideo(req("/api/v1/videos", { method: "POST", body: { video_url: "https://youtu.be/dQw4w9WgXcQ", product: { name: "X" } } }), d)
  assert.equal(res.status, 409)
  const error = await errorOf(res)
  assert.equal(error.code, "VIDEO_EXISTS")
  assert.equal(error.video_id, ID)
})

test("get: malformed and unknown IDs are 404 without touching the database for malformed ones", async () => {
  const { d, calls } = deps()
  assert.equal((await handleGetVideo("not-a-uuid", d)).status, 404)
  assert.equal(calls.length, 0)
  assert.equal((await handleGetVideo("22222222-2222-4222-8222-222222222222", d)).status, 404)
  assert.equal((await handleGetVideo(ID.toUpperCase(), d)).status, 200)
})

test("patch: validated partial update", async () => {
  const { d, calls } = deps()
  const ok = await handleUpdateVideo(req(`/api/v1/videos/${ID}`, { method: "PATCH", body: { notes: "hi" } }), ID, d)
  assert.equal(ok.status, 200)
  assert.deepEqual(calls[0], ["updateVideo", ID, { notes: "hi" }])
  const bad = await handleUpdateVideo(req(`/api/v1/videos/${ID}`, { method: "PATCH", body: { video_url: "https://youtu.be/x123" } }), ID, d)
  assert.equal(bad.status, 400)
})

test("comments: first page checks the video exists; later pages decode the cursor", async () => {
  const { d, calls } = deps()
  assert.equal((await handleListComments(req(`/api/v1/videos/${ID}/comments`), ID, d)).status, 200)
  assert.deepEqual(calls.map((c) => c[0]), ["getVideo", "listComments"])
  assert.equal(calls[1][3], 50)

  const cursor = encodeCursor({ publishedAt: new Date("2026-01-01T00:00:00Z"), id: "c9" })
  await handleListComments(req(`/api/v1/videos/${ID}/comments?cursor=${cursor}&limit=10`), ID, d)
  assert.deepEqual(calls[2], ["listComments", ID, { publishedAt: new Date("2026-01-01T00:00:00Z"), id: "c9" }, 10, { sentiment: undefined, q: undefined }])

  assert.equal((await handleListComments(req(`/api/v1/videos/${ID}/comments?cursor=garbage!`), ID, d)).status, 400)
  assert.equal((await handleListComments(req(`/api/v1/videos/${ID}/comments?limit=500`), ID, d)).status, 400)
  const missing = "33333333-3333-4333-8333-333333333333"
  assert.equal((await handleListComments(req(`/api/v1/videos/${missing}/comments`), missing, d)).status, 404)
})

test("refetch: FETCH_IN_PROGRESS is 409", async () => {
  const { d } = deps({}, {
    async refetch() {
      throw new ApiError("FETCH_IN_PROGRESS", "Comments are already being fetched for this video.")
    },
  })
  const res = await handleRefetch(req(`/api/v1/videos/${ID}/refetch`, { method: "POST" }), ID, d)
  assert.equal(res.status, 409)
  assert.equal((await errorOf(res)).code, "FETCH_IN_PROGRESS")
})

test("comments: sentiment and q filters are validated and passed through; ids fetches specific comments", async () => {
  const fetched: unknown[] = []
  const { d, calls } = deps({
    async getComments(id: string, ids: string[]) {
      fetched.push([id, ids])
      return []
    },
  })
  await handleListComments(req(`/api/v1/videos/${ID}/comments?sentiment=negative&q=%20battery%20`), ID, d)
  assert.deepEqual(calls.at(-1)?.[4], { sentiment: "negative", q: "battery" })
  assert.equal((await handleListComments(req(`/api/v1/videos/${ID}/comments?sentiment=angry`), ID, d)).status, 400)
  assert.equal((await handleListComments(req(`/api/v1/videos/${ID}/comments?q=${"x".repeat(101)}`), ID, d)).status, 400)

  const ok = await handleListComments(req(`/api/v1/videos/${ID}/comments?ids=a1,b2,a1`), ID, d)
  assert.equal(ok.status, 200)
  assert.deepEqual(fetched, [[ID, ["a1", "b2"]]], "deduplicated")
  assert.equal((await handleListComments(req(`/api/v1/videos/${ID}/comments?ids=${Array.from({ length: 101 }, (_, i) => "c" + i).join(",")}`), ID, d)).status, 400)
  assert.equal((await handleListComments(req(`/api/v1/videos/${ID}/comments?ids=bad%20id`), ID, d)).status, 400)
})
