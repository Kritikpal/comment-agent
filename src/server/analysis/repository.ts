import { Prisma, type PrismaClient } from "../../generated/prisma/client.ts"
import {
  PURCHASE_INTENTS,
  SENTIMENTS,
  TONES,
  type AnalysisReport,
  type AspectMention,
  type CommentClassification,
  type CustomerQuestion,
  type Sentiment,
  type Tone,
} from "../../lib/types.ts"
import type { AnalysisRunDto, LatestAnalysisResponse } from "../../lib/video-types.ts"
import { ApiError } from "../errors.ts"
import type { LlmUsage } from "./normalize.ts"
import { STALE_RUN_MS, type ClassifyInput, type ProductContext, type ReportCounts, type RunStore } from "./run.ts"

const ACTIVE: ("PENDING" | "RUNNING")[] = ["PENDING", "RUNNING"]

/** Aspects kept per polarity, questions kept, and comment IDs kept per aspect or question in a report. */
export const REPORT_ASPECTS = 50
export const REPORT_QUESTIONS = 50
export const REPORT_IDS_PER_ITEM = 100

const RUN_SELECT = {
  id: true,
  videoId: true,
  status: true,
  model: true,
  analyzerVersion: true,
  commentsTotal: true,
  commentsClassified: true,
  commentsFailed: true,
  tokensIn: true,
  tokensOut: true,
  report: true,
  errorCode: true,
  errorMessage: true,
  createdAt: true,
  finishedAt: true,
} satisfies Prisma.AnalysisRunSelect

type RunRow = Prisma.AnalysisRunGetPayload<{ select: typeof RUN_SELECT }>

export function toRunDto(r: RunRow): AnalysisRunDto {
  return {
    id: r.id,
    video_id: r.videoId,
    status: r.status,
    model: r.model,
    analyzer_version: r.analyzerVersion,
    comments_total: r.commentsTotal,
    comments_classified: r.commentsClassified,
    comments_failed: r.commentsFailed,
    tokens_in: r.tokensIn,
    tokens_out: r.tokensOut,
    created_at: r.createdAt.toISOString(),
    finished_at: r.finishedAt?.toISOString() ?? null,
    error: r.errorCode ? { code: r.errorCode, message: r.errorMessage ?? "" } : null,
    report: r.status === "READY" ? (r.report as unknown as AnalysisReport | null) : null,
  }
}

function hasCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === code
}

const zeroed = <K extends string>(keys: readonly K[]) => Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>

/** SQL fragment: comments of a video with no current classification (never analyzed, other version, or edited since). */
function pendingWhere(videoId: string, version: string): Prisma.Sql {
  return Prisma.sql`
    c.video_id = ${videoId}::uuid
    and not exists (
      select 1 from comment_analyses a
       where a.comment_id = c.id and a.analyzer_version = ${version}
         and (c.youtube_updated_at is null or a.analyzed_at >= c.youtube_updated_at))`
}

export function createAnalysisRepository(getPrisma: () => PrismaClient): RunStore & {
  getRun(runId: string): Promise<AnalysisRunDto | null>
  latest(videoId: string): Promise<LatestAnalysisResponse>
} {
  /** Fails active runs with no heartbeat for `staleAfterMs` (a dead process, or after() cut short). */
  async function failStale(where: Prisma.AnalysisRunWhereInput, now: Date, staleAfterMs: number): Promise<void> {
    await getPrisma().analysisRun.updateMany({
      where: { ...where, status: { in: ACTIVE }, heartbeatAt: { lt: new Date(now.getTime() - staleAfterMs) } },
      data: { status: "FAILED", errorCode: "UPSTREAM_TIMEOUT", errorMessage: "The run stopped responding. Run the analysis again; progress is kept.", finishedAt: now },
    })
  }

  /**
   * Writes to a run only while it's still active. If it was retired as stale (and maybe replaced),
   * the executor that owned it must stop: throwing here ends it without touching the new run.
   */
  async function updateActive(runId: string, data: Prisma.AnalysisRunUpdateManyMutationInput): Promise<void> {
    const { count } = await getPrisma().analysisRun.updateMany({ where: { id: runId, status: { in: ACTIVE } }, data })
    if (count === 0) throw new ApiError("UPSTREAM_TIMEOUT", "This run was stopped because it stopped responding.")
  }

  return {
    async getProduct(videoId) {
      const v = await getPrisma().video.findUnique({ where: { id: videoId }, select: { productName: true, productCategory: true } })
      return v ? ({ name: v.productName, category: v.productCategory } satisfies ProductContext) : null
    },

    /**
     * One active run per video, enforced by a partial unique index (see the migration). Abandoned runs
     * (no heartbeat for `staleAfterMs`) are failed first so they don't block a new one.
     */
    async startRun(videoId, analyzer, now, staleAfterMs) {
      const prisma = getPrisma()
      await failStale({ videoId }, now, staleAfterMs)
      try {
        const row = await prisma.analysisRun.create({
          data: { videoId, analyzerVersion: analyzer.version, model: analyzer.model, heartbeatAt: now, createdAt: now },
          select: RUN_SELECT,
        })
        return toRunDto(row)
      } catch (error) {
        if (hasCode(error, "P2002")) throw new ApiError("ANALYSIS_IN_PROGRESS", "An analysis is already running for this video.")
        throw error
      }
    },

    async markRunning(runId, total, now) {
      await updateActive(runId, { status: "RUNNING", commentsTotal: total, heartbeatAt: now })
    },

    async countPending(videoId, version) {
      const [row] = await getPrisma().$queryRaw<{ n: number }[]>`select count(*)::int as n from comments c where ${pendingWhere(videoId, version)}`
      return row?.n ?? 0
    },

    /** Oldest first, so a run that's cut short has covered a stable prefix. Reads only id and text. */
    async nextPending(videoId, version, skip, take): Promise<ClassifyInput[]> {
      return getPrisma().$queryRaw<ClassifyInput[]>`
        select c.id as comment_id, c.text from comments c
         where ${pendingWhere(videoId, version)} and c.id <> all(${skip}::text[])
         order by c.published_at, c.id
         limit ${take}`
    },

    /** All of a round's classifications in one INSERT … ON CONFLICT, as a single jsonb parameter. */
    async saveClassifications(videoId, analyzer, items, now) {
      const rows = items.map((c: CommentClassification) => ({
        comment_id: c.comment_id,
        sentiment: c.sentiment,
        tone: c.tone,
        intents: c.intents,
        purchase_intent: c.purchase_intent,
        feedback: c.feedback,
        questions: c.questions,
      }))
      await getPrisma().$executeRaw`
        insert into comment_analyses
          (comment_id, analyzer_version, video_id, sentiment, tone, intents, purchase_intent, feedback, questions, model, analyzed_at)
        select r.comment_id, ${analyzer.version}, ${videoId}::uuid,
               r.sentiment::"Sentiment", r.tone::"Tone",
               array(select jsonb_array_elements_text(r.intents))::"Intent"[],
               r.purchase_intent::"PurchaseIntent", r.feedback,
               array(select jsonb_array_elements_text(r.questions)),
               ${analyzer.model}, ${now.toISOString()}::timestamp(3)
          from jsonb_to_recordset(${JSON.stringify(rows)}::jsonb)
               as r (comment_id text, sentiment text, tone text, intents jsonb, purchase_intent text, feedback jsonb, questions jsonb)
          join comments c on c.id = r.comment_id and c.video_id = ${videoId}::uuid
        on conflict (comment_id, analyzer_version) do update
          set sentiment = excluded.sentiment, tone = excluded.tone, intents = excluded.intents,
              purchase_intent = excluded.purchase_intent, feedback = excluded.feedback, questions = excluded.questions,
              model = excluded.model, analyzed_at = excluded.analyzed_at`
    },

    async recordProgress(runId, delta, now) {
      await updateActive(runId, {
        commentsClassified: { increment: delta.classified },
        commentsFailed: { increment: delta.failed },
        tokensIn: { increment: delta.usage.input },
        tokensOut: { increment: delta.usage.output },
        heartbeatAt: now,
      })
    },

    async heartbeat(runId, now) {
      await updateActive(runId, { heartbeatAt: now })
    },

    /** The whole report in three grouped queries; no comment rows are loaded. */
    async aggregate(videoId, version): Promise<ReportCounts> {
      const prisma = getPrisma()
      const [counts, aspects, questions] = await Promise.all([
        prisma.$queryRaw<{ dim: "s" | "t" | "p"; k: string; n: number }[]>`
          select case when grouping(sentiment) = 0 then 's' when grouping(tone) = 0 then 't' else 'p' end as dim,
                 coalesce(sentiment::text, tone::text, purchase_intent::text) as k, count(*)::int as n
            from comment_analyses
           where video_id = ${videoId}::uuid and analyzer_version = ${version}
           group by grouping sets ((sentiment), (tone), (purchase_intent))`,
        prisma.$queryRaw<(AspectMention & { sentiment: Sentiment })[]>`
          select aspect, sentiment, mentions, comment_ids from (
            select lower(trim(f->>'aspect')) as aspect, f->>'sentiment' as sentiment, count(*)::int as mentions,
                   (array_agg(distinct a.comment_id))[1:${REPORT_IDS_PER_ITEM}] as comment_ids,
                   row_number() over (partition by f->>'sentiment' order by count(*) desc, lower(trim(f->>'aspect'))) as rank
              from comment_analyses a cross join lateral jsonb_array_elements(a.feedback) f
             where a.video_id = ${videoId}::uuid and a.analyzer_version = ${version}
               and f->>'sentiment' in ('positive', 'negative') and trim(coalesce(f->>'aspect', '')) <> ''
             group by 1, 2) ranked
           where rank <= ${REPORT_ASPECTS}
           order by mentions desc, aspect`,
        prisma.$queryRaw<CustomerQuestion[]>`
          select min(trim(q)) as question, (array_agg(distinct a.comment_id))[1:${REPORT_IDS_PER_ITEM}] as comment_ids
            from comment_analyses a cross join lateral unnest(a.questions) q
           where a.video_id = ${videoId}::uuid and a.analyzer_version = ${version} and trim(q) <> ''
           group by lower(trim(q))
           order by count(*) desc, min(trim(q))
           limit ${REPORT_QUESTIONS}`,
      ])

      const sentiment = zeroed(SENTIMENTS)
      const tone = zeroed(TONES)
      const purchase = zeroed(PURCHASE_INTENTS)
      for (const row of counts) {
        if (row.dim === "s") sentiment[row.k as Sentiment] = row.n
        else if (row.dim === "t") tone[row.k as Tone] = row.n
        else purchase[row.k as (typeof PURCHASE_INTENTS)[number]] = row.n
      }
      const list = (s: Sentiment) => aspects.filter((a) => a.sentiment === s).map(({ aspect, mentions, comment_ids }) => ({ aspect, mentions, comment_ids }))
      return {
        total_analyzed: SENTIMENTS.reduce((sum, s) => sum + sentiment[s], 0),
        sentiment,
        tone,
        purchase_interest: { considering: purchase.considering, ready_to_buy: purchase.ready_to_buy },
        top_complaints: list("negative"),
        top_positive_features: list("positive"),
        customer_questions: questions,
      }
    },

    async finishRun(runId, report, usage: LlmUsage, now) {
      await updateActive(runId, {
        status: "READY",
        report: report as unknown as Prisma.InputJsonValue,
        tokensIn: { increment: usage.input },
        tokensOut: { increment: usage.output },
        heartbeatAt: now,
        finishedAt: now,
      })
    },

    /** Only an active run can fail; a run already reclaimed as stale keeps its recorded outcome. */
    async failRun(runId, code, message, now) {
      await getPrisma().analysisRun.updateMany({
        where: { id: runId, status: { in: ACTIVE } },
        data: { status: "FAILED", errorCode: code, errorMessage: message, heartbeatAt: now, finishedAt: now },
      })
    },

    /** Reading a run also retires it if it stopped responding, so a dead run never locks the UI. */
    async getRun(runId) {
      await failStale({ id: runId }, new Date(), STALE_RUN_MS)
      const row = await getPrisma().analysisRun.findUnique({ where: { id: runId }, select: RUN_SELECT })
      return row ? toRunDto(row) : null
    },

    /** Latest run of any status plus latest READY run: two indexed lookups (after retiring a dead run). */
    async latest(videoId) {
      await failStale({ videoId }, new Date(), STALE_RUN_MS)
      const prisma = getPrisma()
      const [current, report] = await Promise.all([
        prisma.analysisRun.findFirst({ where: { videoId }, orderBy: { createdAt: "desc" }, select: RUN_SELECT }),
        prisma.analysisRun.findFirst({ where: { videoId, status: "READY" }, orderBy: { createdAt: "desc" }, select: RUN_SELECT }),
      ])
      return { current: current ? toRunDto(current) : null, report: report ? toRunDto(report) : null }
    },
  }
}

export type AnalysisRepository = ReturnType<typeof createAnalysisRepository>
