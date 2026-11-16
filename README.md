# Product Feedback Intelligence — Dashboard

Next.js 16 + TypeScript + shadcn/ui (Base UI) + Recharts + Prisma 7 (Postgres). Track YouTube product
videos, store their comments, and analyze them.

```bash
npm install          # also runs `prisma generate`
npm run db:migrate   # apply migrations to DATABASE_URL (first run, and after schema changes)
npm run dev          # http://localhost:3000
npm test             # unit tests (node --test), no database needed
npm run test:db      # repository tests against TEST_DATABASE_URL
```

## Setup

`.env` (git-ignored):

| Variable | Example | Used for |
|---|---|---|
| `ACCESS_CODE` | any secret string | Required. Code entered on `/login` before the dashboard and API open. Without it nobody can sign in. |
| `GOOGLE_API_KEY` | `AIza…` | YouTube Data API v3. Required to add or refetch videos. |
| `DATABASE_URL` | Supabase transaction pooler (`…pooler.supabase.com:6543/postgres?pgbouncer=true`) or local `postgres://postgres:<password>@localhost:5432/comment_agent` | App database. |
| `DIRECT_URL` | Supabase session pooler (`…pooler.supabase.com:5432/postgres`) | Migrations (`npm run db:migrate` / `db:deploy`). Omit for a local database. |
| `DATABASE_CA_CERT` | `./supabase-ca.crt` | Optional. Supabase's CA certificate (Database settings → SSL) to verify the server; without it remote connections are encrypted but unverified. |
| `GROQ_API_KEY` | `gsk_…` | LLM analysis (Groq through LangChain). |
| `GROQ_MODEL` | `openai/gpt-oss-20b` | Optional. Changing it reclassifies every comment on the next run. |
| `TEST_DATABASE_URL` | `postgres://postgres:<password>@localhost:5432/comment_agent_test` | `npm run test:db` only. Tests truncate its tables, and refuse to run unless the database name contains "test". |

Create both databases once (`create database comment_agent;` and `create database comment_agent_test;`),
then `npm run db:migrate`, and for tests `DATABASE_URL=<test url> npx prisma migrate deploy`.
The Google Cloud project behind the key needs **YouTube Data API v3** enabled (and allowed in the
key's API restrictions, if any).

## Pages

| Route | What it shows |
|---|---|
| `/` | Videos table (page-number pagination). Add video, edit metadata, and links to Comments and Analyze. Empty state with a centred **Add new video** button. |
| `/videos/[id]/comments` | Video details, fetch status, every stored comment field, newest first with **Load older comments** (cursor pagination), and **Refetch comments**. |
| `/videos/[id]/analyze` | **Run analysis** with live progress, then the stored report: sentiment, tone, aspects praised and criticised, buying signals, questions, AI summary, and paged comment evidence. |

Pages render a static shell and stream database content inside `<Suspense>`; mutations call the API
and then `router.refresh()`.

## API

- Video registry: [contract v1.2](docs/api-contract-v1.2.md): list, create, get, update, comments, refetch.
- Analysis: [contract v1.3](docs/api-contract-v1.3.md): start a run, poll it, latest report, comment filters.

| Layer | Files | Job |
|---|---|---|
| Routes | `src/app/api/v1/videos/**/route.ts` | Bind App Router methods to handlers. |
| Handlers | `src/server/videos/handlers.ts`, `src/server/handler.ts` | HTTP only: params, validation, rate limit, error envelope (`src/server/http.ts`). |
| Service | `src/server/videos/service.ts` | Create and refetch: YouTube lookup, claim the fetch, store results or record the failure. |
| Repository | `src/server/videos/repository.ts` | Every Prisma query. |
| YouTube | `src/server/youtube/client.ts` | `videos.list` and `commentThreads.list` (relevance, or newest first stopping at stored comments). |
| Analysis | `src/server/analysis/` | `run.ts` executor (incremental, batched, waits out rate limits), `analyzer.ts` (LangChain + Groq), `repository.ts` (runs, upserts, SQL aggregation). Runs in the background via Next.js `after()`. |

### Fetching rules

- Each fetch pulls up to the video's `comment_limit` comments, newest first, and stops at the first
  comment older than the newest one already stored, so a refetch downloads only what's new.
- Comments that come back again get likes, replies, text and edit time refreshed.
- One fetch per video at a time (`409 FETCH_IN_PROGRESS`); a fetch stuck for over 2 minutes can be restarted.
- Upstream failures are stored on the video (`FAILED` plus the reason) and shown in the UI.

### Query rules

- Video list: 2 queries per page (rows + count); `comment_count` is stored, so no per-row counting.
- Comments: keyset pagination on `(published_at, id)` using the composite index, selecting only shown columns.
- Fetch writes are one `INSERT … ON CONFLICT DO UPDATE` plus count and status in one transaction.

### Not built yet

- A durable job queue: runs execute in-process after the response (`after()`); a server restart mid-run leaves it to be reclaimed after 2 minutes, with progress kept.
- The 504 time budget for a whole request (each YouTube call times out after 10 s).
- Deleting videos.
- Rate limiting is in-memory per server instance (10 per minute per IP on create, refetch and
  analyze). The client IP comes from `x-real-ip`, else the last `x-forwarded-for` hop; make sure your
  proxy sets it before deploying publicly.

## Contract notes

- Tone counts are derived from `results` because `analytics` has no tone block.
- The tone list follows the locked enum (the Notion mockup's "Suggestive/Other" tones are not in it).
- Summary grounding works by aspect name, so an aspect the summary mentions brings in both its
  praise and its complaint comments.
