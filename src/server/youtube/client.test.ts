// Run: npm test  (node --test with built-in TypeScript type stripping)
import assert from "node:assert/strict"
import { test } from "node:test"
import { ApiError } from "../errors.ts"
import { fetchTopLevelComments, fetchVideoDetails, type FetchLike } from "./client.ts"

function thread(id: string, text: string, extra: Record<string, unknown> = {}) {
  return {
    snippet: {
      totalReplyCount: 2,
      topLevelComment: {
        id,
        snippet: {
          textDisplay: text,
          authorDisplayName: "@viewer",
          likeCount: 3,
          publishedAt: "2026-01-02T03:04:05Z",
          updatedAt: "2026-01-02T03:04:05Z",
          ...extra,
        },
      },
    },
  }
}

function fakeFetch(pages: unknown[], status = 200): { fetch: FetchLike; urls: URL[] } {
  const urls: URL[] = []
  let call = 0
  return {
    urls,
    fetch: async (url) => {
      urls.push(new URL(url))
      return Response.json(pages[call++] ?? { items: [] }, { status })
    },
  }
}

function errorBody(reason: string, domain = "youtube.commentThread") {
  return { error: { code: 403, message: "secret upstream detail", errors: [{ reason, domain }] } }
}

async function rejectsWith(promise: Promise<unknown>, code: string) {
  await assert.rejects(promise, (e: unknown) => e instanceof ApiError && e.code === code)
}

test("requests top-level comments by relevance as plain text", async () => {
  const f = fakeFetch([{ items: [thread("a1", "Great phone")] }])
  const { comments, exhausted } = await fetchTopLevelComments("vid123", 15, { apiKey: "k", fetch: f.fetch })
  assert.equal(exhausted, true, "no nextPageToken means the video ran out")
  const params = f.urls[0].searchParams
  assert.equal(f.urls[0].origin + f.urls[0].pathname, "https://www.googleapis.com/youtube/v3/commentThreads")
  assert.equal(params.get("videoId"), "vid123")
  assert.equal(params.get("part"), "snippet")
  assert.equal(params.get("order"), "relevance")
  assert.equal(params.get("textFormat"), "plainText")
  assert.equal(params.get("maxResults"), "15")
  assert.deepEqual(comments, [
    {
      youtube_comment_id: "a1",
      text: "Great phone",
      author_name: "@viewer",
      like_count: 3,
      reply_count: 2,
      published_at: "2026-01-02T03:04:05Z",
      updated_at: null,
    },
  ])
})

test("follows nextPageToken until the limit and skips malformed or empty comments", async () => {
  const f = fakeFetch([
    { items: [thread("a1", "one"), thread("bad", "   "), { snippet: {} }], nextPageToken: "p2" },
    { items: [thread("a2", "two"), thread("a3", "three")], nextPageToken: "p3" },
  ])
  const { comments, exhausted } = await fetchTopLevelComments("vid123", 2, { apiKey: "k", fetch: f.fetch })
  assert.deepEqual(comments.map((c) => c.youtube_comment_id), ["a1", "a2"])
  assert.equal(exhausted, false, "stopped at the limit while YouTube still had pages")
  assert.equal(f.urls[1].searchParams.get("pageToken"), "p2")
  assert.equal(f.urls[1].searchParams.get("maxResults"), "1")
  assert.equal(f.urls.length, 2)
})

test("a missing publish date is stored as null, not a fake date", async () => {
  const f = fakeFetch([{ items: [thread("a1", "hi", { publishedAt: undefined })] }])
  const {
    comments: [comment],
  } = await fetchTopLevelComments("vid123", 15, { apiKey: "k", fetch: f.fetch })
  assert.equal(comment.published_at, null)
})

test("YouTube errors map to contract codes without leaking YouTube's message", async () => {
  const original = console.error
  console.error = () => {}
  try {
    const cases: [unknown, number, string][] = [
      [errorBody("commentsDisabled"), 403, "COMMENTS_DISABLED"],
      [errorBody("videoNotFound"), 404, "VIDEO_NOT_FOUND"],
      [errorBody("forbidden"), 403, "VIDEO_NOT_FOUND"],
      // A refused key (API not enabled / restricted) is not a missing video.
      [errorBody("forbidden", "global"), 403, "UPSTREAM_ERROR"],
      [errorBody("quotaExceeded"), 403, "RATE_LIMITED"],
      [errorBody("keyInvalid"), 400, "UPSTREAM_ERROR"],
      [null, 500, "UPSTREAM_ERROR"],
    ]
    for (const [body, status, code] of cases) {
      const f = fakeFetch([body], status)
      await rejectsWith(fetchTopLevelComments("vid123", 15, { apiKey: "k", fetch: f.fetch }), code)
      await assert.rejects(
        fetchTopLevelComments("vid123", 15, { apiKey: "k", fetch: fakeFetch([body], status).fetch }),
        (e: unknown) => e instanceof ApiError && !e.message.includes("secret")
      )
    }
  } finally {
    console.error = original
  }
})

test("a slow YouTube becomes UPSTREAM_TIMEOUT", async () => {
  // AbortSignal.timeout's timer doesn't keep Node alive, so the fake holds the event loop open itself.
  const hang: FetchLike = (_url, init) =>
    new Promise((_resolve, reject) => {
      const keepAlive = setTimeout(() => {}, 5_000)
      init?.signal?.addEventListener("abort", () => {
        clearTimeout(keepAlive)
        reject(init.signal?.reason)
      })
    })
  await rejectsWith(fetchTopLevelComments("vid123", 15, { apiKey: "k", fetch: hang, timeoutMs: 20 }), "UPSTREAM_TIMEOUT")
})

test("an edit time is kept only when it differs from the publish time", async () => {
  const f = fakeFetch([{ items: [thread("a1", "edited", { updatedAt: "2026-02-01T00:00:00Z" })] }])
  const { comments } = await fetchTopLevelComments("vid123", 15, { apiKey: "k", fetch: f.fetch })
  assert.equal(comments[0].updated_at, "2026-02-01T00:00:00Z")
})

test("newest-first fetch stops at the first comment older than the newest stored one", async () => {
  const f = fakeFetch([
    {
      items: [
        thread("new2", "newest", { publishedAt: "2026-03-03T00:00:00Z" }),
        thread("new1", "same instant as stored", { publishedAt: "2026-03-01T00:00:00Z" }),
        thread("old", "already stored", { publishedAt: "2026-02-01T00:00:00Z" }),
      ],
      nextPageToken: "p2",
    },
  ])
  const result = await fetchTopLevelComments("vid123", 100, {
    apiKey: "k",
    fetch: f.fetch,
    order: "time",
    stopBefore: new Date("2026-03-01T00:00:00Z"),
  })
  assert.equal(f.urls[0].searchParams.get("order"), "time")
  assert.deepEqual(result.comments.map((c) => c.youtube_comment_id), ["new2", "new1"])
  assert.equal(result.exhausted, false)
  assert.equal(f.urls.length, 1, "no further pages once it reaches stored comments")
})

test("relevance order ignores stopBefore", async () => {
  const f = fakeFetch([{ items: [thread("old", "older", { publishedAt: "2020-01-01T00:00:00Z" })] }])
  const result = await fetchTopLevelComments("vid123", 15, { apiKey: "k", fetch: f.fetch, stopBefore: new Date("2026-01-01") })
  assert.equal(result.comments.length, 1)
})

test("fetchVideoDetails returns title, channel and medium thumbnail", async () => {
  const f = fakeFetch([
    {
      items: [
        {
          snippet: {
            title: "Pixel 9 review",
            channelTitle: "Tech Channel",
            thumbnails: { default: { url: "https://i.ytimg.com/vi/x/default.jpg" }, medium: { url: "https://i.ytimg.com/vi/x/mqdefault.jpg" } },
          },
        },
      ],
    },
  ])
  const details = await fetchVideoDetails("vid123", { apiKey: "k", fetch: f.fetch })
  assert.equal(f.urls[0].pathname, "/youtube/v3/videos")
  assert.equal(f.urls[0].searchParams.get("id"), "vid123")
  assert.deepEqual(details, {
    title: "Pixel 9 review",
    channel_title: "Tech Channel",
    thumbnail_url: "https://i.ytimg.com/vi/x/mqdefault.jpg",
  })
})

test("fetchVideoDetails: no items means the video doesn't exist", async () => {
  await rejectsWith(fetchVideoDetails("gone", { apiKey: "k", fetch: fakeFetch([{ items: [] }]).fetch }), "VIDEO_NOT_FOUND")
})
