# Product Feedback Intelligence — API Contract v1.2 (video registry)

Status: **implemented**. Adds the video registry on top of [v1.1](api-contract-v1.1.md); the analyze
endpoint and its contract are unchanged. Storage: Postgres through Prisma 7.

All endpoints share v1.1's error envelope `{ "error": { "code", "message", "fields"?, "video_id"? } }`,
the 8 KB body limit, and JSON in/out. `fields` keys match the form inputs.

| Method | Path | Rate limited | Purpose |
|---|---|---|---|
| `GET` | `/api/v1/videos` | no | Page of videos, newest first |
| `POST` | `/api/v1/videos` | yes | Register a video and run its first fetch |
| `GET` | `/api/v1/videos/:id` | no | One video |
| `PATCH` | `/api/v1/videos/:id` | no | Change metadata |
| `GET` | `/api/v1/videos/:id/comments` | no | Stored comments, newest first, cursor pages |
| `POST` | `/api/v1/videos/:id/refetch` | yes | Pull new comments from YouTube |

"Rate limited" endpoints spend YouTube quota and share the 10 requests/minute/IP limit.

## Video object

```jsonc
{
  "id": "3f6c…",                       // UUID
  "youtube_video_id": "dQw4w9WgXcQ",
  "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "title": "Rick Astley - Never Gonna Give You Up",   // from YouTube, refreshed on every fetch
  "channel_title": "Rick Astley",
  "thumbnail_url": "https://i.ytimg.com/vi/…/mqdefault.jpg",
  "product": { "name": "Pixel 9", "category": "Smartphone" },
  "notes": "Launch review",
  "comment_limit": 100,                // most comments pulled per fetch (15–500)
  "comment_count": 240,                // comments stored
  "fetch": {
    "status": "READY",                 // PENDING | FETCHING | READY | FAILED
    "started_at": null,
    "last_fetched_at": "2026-11-16T06:04:02.471Z",
    "error": null                      // { code, message } when status is FAILED
  },
  "created_at": "…",
  "updated_at": "…"
}
```

## `GET /api/v1/videos?page=1&page_size=20`

Page-number pagination. `page` ≥ 1 (default 1), `page_size` 1–100 (default 20).

```jsonc
{ "items": [Video], "page": 1, "page_size": 20, "total": 57, "total_pages": 3 }
```

## `POST /api/v1/videos`

```jsonc
{
  "video_url": "https://youtu.be/dQw4w9WgXcQ",   // required; watch, youtu.be, shorts, embed, live
  "product": { "name": "Pixel 9", "category": "Smartphone" },   // name required, ≤120 chars
  "notes": "Launch review",                       // optional, ≤1000 chars
  "comment_limit": 100                            // optional, 15–500, default 100
}
```

- Looks the video up on YouTube first. **404 `VIDEO_NOT_FOUND`** if it doesn't exist; nothing is saved.
- Saves the video, then runs the first fetch. Returns **201** with the video either way: if the
  comment fetch fails, `fetch.status` is `FAILED` with the reason.
- **409 `VIDEO_EXISTS`** if the video is already registered; `error.video_id` is the existing video.

## `PATCH /api/v1/videos/:id`

Any subset of `product.name`, `product.category`, `notes`, `comment_limit`. `null` or `""` clears
`category` and `notes`. The URL can't change (400). Unknown or malformed id: **404 `NOT_FOUND`**.

## `GET /api/v1/videos/:id/comments?cursor=…&limit=50`

Newest first by `published_at`, ties broken by comment id. `limit` 1–100 (default 50). Pass
`next_cursor` back as `cursor` for the next, older page; it is `null` on the last page. Cursors are
opaque; a malformed one is **400**. Comments fetched while you page appear above page one, never as
duplicates inside later pages.

```jsonc
{
  "items": [{
    "id": "UgzKYksqeQ5gA3t0g0F4AaABAg",   // YouTube comment id
    "text": "…",
    "author_name": "@viewer",
    "like_count": 108770,
    "reply_count": 523,
    "published_at": "2009-11-04T03:12:15.000Z",
    "youtube_updated_at": null,          // set only if the comment was edited
    "fetched_at": "2026-11-16T06:04:02.471Z"
  }],
  "next_cursor": "MjAwOS0xMS0wNFQwMzoxMjoxNS4wMDBafFVnektZa3Nx…"
}
```

## `POST /api/v1/videos/:id/refetch`

Pulls comments newest first and **stops at the first comment older than the newest one stored**,
so a refetch only downloads what's new (up to `comment_limit`). Comments that come back again get
their text, likes, replies and edit time refreshed. Title, channel and thumbnail are refreshed too.

- **200** with the video. Upstream failures are not errors here: they're recorded on the video
  (`fetch.status: "FAILED"`, `fetch.error`).
- **409 `FETCH_IN_PROGRESS`** while another fetch of the same video runs. A fetch stuck in
  `FETCHING` for over 2 minutes (e.g. after a crash) can be restarted.
- **404 `NOT_FOUND`** for unknown ids.

## Storage and query rules

- `videos` (unique `youtube_video_id`, index on `created_at desc, id desc`) and `comments`
  (primary key = YouTube comment id, index on `video_id, published_at desc, id desc`).
- The video list is two queries per page (rows + count). `comment_count` is stored on the video,
  so the list never counts or loads comments.
- Comment pages are a keyset query on the composite index, reading only the returned columns.
- A fetch writes all comments in one `INSERT … ON CONFLICT DO UPDATE` and updates the count and
  status in the same transaction.

## Errors added in v1.2

| Status | `code` | When |
|---|---|---|
| 404 | `NOT_FOUND` | No video with that id |
| 409 | `VIDEO_EXISTS` | The YouTube video is already registered (`error.video_id` set) |
| 409 | `FETCH_IN_PROGRESS` | A fetch for this video is already running |
