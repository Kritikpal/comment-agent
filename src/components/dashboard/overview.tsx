import { ArrowUpRight, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { percent } from "@/lib/analytics"
import { formatDateTime } from "@/lib/format"
import type { AnalysisReport } from "@/lib/types"
import { SENTIMENT_META, SENTIMENT_ORDER, type EvidenceRequest } from "./meta"

type Props = {
  product: { name: string; category: string | null }
  youtubeVideoId: string
  report: AnalysisReport
  /** When the report was produced. */
  analyzedAt: string | null
  onEvidence: (evidence: EvidenceRequest) => void
}

export function ReportHeader({ product, youtubeVideoId, report, analyzedAt, onEvidence }: Props) {
  const { total_analyzed } = report
  const analytics = report
  const video_id = youtubeVideoId
  const evidenceIds = analytics.ai_summary_comment_ids

  return (
    <section aria-labelledby="product-heading" className="grid gap-10 lg:grid-cols-12 lg:gap-12">
      <div className="flex flex-col justify-end gap-5 lg:col-span-7">
        <p className="text-sm text-muted-foreground">
          Comment analysis{product.category ? ` · ${product.category}` : ""}
          {analyzedAt && ` · ${formatDateTime(analyzedAt)}`}
        </p>
        <h1
          id="product-heading"
          className="font-display text-6xl leading-[0.92] tracking-[-0.02em] text-balance sm:text-7xl xl:text-8xl"
        >
          {product.name}
        </h1>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
          <a
            href={`https://www.youtube.com/watch?v=${encodeURIComponent(video_id)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-mono text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-primary"
          >
            youtube.com/watch?v={video_id}
            <ArrowUpRight className="size-3.5" aria-hidden />
          </a>
          <span>
            <span className="font-medium text-foreground tabular-nums">{total_analyzed}</span> comments classified
          </span>
        </div>
      </div>

      <figure className="relative flex flex-col gap-5 border-l-2 border-primary pl-6 lg:col-span-5 lg:self-end">
        <figcaption className="flex items-center gap-2 text-sm font-medium text-primary">
          <Sparkles className="size-4" aria-hidden />
          AI insights summary
        </figcaption>
        <blockquote className="font-display text-3xl leading-[1.15] text-pretty xl:text-[2.4rem]">
          {analytics.ai_summary}
        </blockquote>
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span>Grounded in {evidenceIds.length} source comments.</span>
          {evidenceIds.length > 0 && (
            <Button
              variant="link"
              className="h-auto px-0"
              onClick={() =>
                onEvidence({
                  title: "AI summary evidence",
                  description: "Comments behind the aspects the summary mentions.",
                  commentIds: evidenceIds,
                })
              }
            >
              View evidence
            </Button>
          )}
        </div>
      </figure>
    </section>
  )
}

type BandProps = { report: AnalysisReport }

export function SentimentBand({ report }: BandProps) {
  const { total_analyzed } = report
  const analytics = report
  const interested = analytics.purchase_interest.considering + analytics.purchase_interest.ready_to_buy

  return (
    <section aria-labelledby="sentiment-heading" className="flex flex-col gap-6">
      <h2 id="sentiment-heading" className="sr-only">
        Sentiment distribution
      </h2>
      <div
        className="flex h-4 w-full gap-1 overflow-hidden rounded-full"
        role="img"
        aria-label={SENTIMENT_ORDER.map(
          (s) => `${SENTIMENT_META[s].label} ${analytics.sentiment[s]}`
        ).join(", ")}
      >
        {SENTIMENT_ORDER.filter((s) => analytics.sentiment[s] > 0).map((s) => (
          <div
            key={s}
            title={`${SENTIMENT_META[s].label}: ${analytics.sentiment[s]}`}
            className="h-full first:rounded-l-full last:rounded-r-full"
            style={{
              width: `${(analytics.sentiment[s] / Math.max(total_analyzed, 1)) * 100}%`,
              background: SENTIMENT_META[s].color,
            }}
          />
        ))}
      </div>

      <dl className="grid grid-cols-2 gap-y-8 sm:grid-cols-3 lg:grid-cols-6 lg:divide-x">
        <Stat label="Analyzed" value={total_analyzed} note="comments" />
        {SENTIMENT_ORDER.map((s) => (
          <Stat
            key={s}
            label={SENTIMENT_META[s].label}
            color={SENTIMENT_META[s].color}
            value={analytics.sentiment[s]}
            note={`${percent(analytics.sentiment[s], total_analyzed)}%`}
          />
        ))}
        <Stat
          label="Purchase interest"
          color="var(--primary)"
          value={interested}
          note={`${percent(interested, total_analyzed)}%`}
        />
      </dl>
    </section>
  )
}

type StatProps = { label: string; value: number; note: string; color?: string }

function Stat({ label, value, note, color }: StatProps) {
  return (
    <div className="flex flex-col gap-1.5 lg:px-6 lg:first:pl-0">
      <dt className="flex items-center gap-2 text-sm text-muted-foreground">
        {color && <span className="size-2 rounded-full" style={{ background: color }} aria-hidden />}
        {label}
      </dt>
      <dd className="flex items-baseline gap-2">
        <span className="font-display text-5xl leading-none tabular-nums">{value}</span>
        <span className="text-sm text-muted-foreground tabular-nums">{note}</span>
      </dd>
    </div>
  )
}
