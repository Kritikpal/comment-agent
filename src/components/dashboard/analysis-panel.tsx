"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { LoaderCircle, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { apiRequest, ApiRequestError } from "@/lib/api-client"
import { formatCount, formatDateTime } from "@/lib/format"
import type { AnalysisRunDto } from "@/lib/video-types"

const POLL_MS = 2_000

type Props = {
  videoId: string
  /** The latest run in any state (from the server render). */
  current: AnalysisRunDto | null
  hasReport: boolean
  commentCount: number
}

const isActive = (run: AnalysisRunDto | null) => run?.status === "PENDING" || run?.status === "RUNNING"

/** "Run analysis" plus live progress. When a run ends, the page re-renders with the new report. */
export function AnalysisPanel({ videoId, current, hasReport, commentCount }: Props) {
  const router = useRouter()
  const [run, setRun] = useState<AnalysisRunDto | null>(current)
  const [isStarting, setIsStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const runId = run?.id
  const active = isActive(run)

  // Poll the run while it's active; refresh the server-rendered report once it finishes.
  useEffect(() => {
    if (!active || !runId) return
    const timer = setInterval(async () => {
      try {
        const next = await apiRequest<AnalysisRunDto>(`/api/v1/analyses/${runId}`)
        setRun(next)
        if (!isActive(next)) router.refresh()
      } catch {
        // Transient; the next tick retries.
      }
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [active, runId, router])

  async function start() {
    setIsStarting(true)
    setError(null)
    try {
      setRun(await apiRequest<AnalysisRunDto>(`/api/v1/videos/${videoId}/analyses`, { method: "POST" }))
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : "Couldn't start the analysis.")
    } finally {
      setIsStarting(false)
    }
  }

  const done = run ? run.comments_classified + run.comments_failed : 0
  const progress = run && run.comments_total > 0 ? Math.min(100, Math.round((done / run.comments_total) * 100)) : 0

  return (
    <section aria-label="Analysis" className="flex flex-col gap-4 rounded-2xl border bg-card px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1.5" aria-live="polite">
        {active && run ? (
          <>
            <p className="text-sm font-medium">
              {run.status === "PENDING" || run.comments_total === 0
                ? "Starting the analysis…"
                : `Classifying comments: ${formatCount(done)} of ${formatCount(run.comments_total)}`}
            </p>
            <div className="h-1.5 w-full max-w-md overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-xs text-muted-foreground">Comments classified before are reused; only new or edited ones go to the model.</p>
          </>
        ) : run?.status === "FAILED" ? (
          <p className="text-sm text-destructive">
            <span className="font-medium">Last analysis failed:</span> {run.error?.message ?? "Unknown error."}
            {run.comments_classified > 0 && ` ${formatCount(run.comments_classified)} comments were classified and are kept.`}
          </p>
        ) : run?.status === "READY" ? (
          <p className="text-sm text-muted-foreground">
            Analyzed {formatDateTime(run.finished_at)} with <span className="font-mono">{run.model}</span>
            {run.comments_total > 0 && ` · ${formatCount(run.comments_classified)} newly classified`}
            {run.comments_failed > 0 && ` · ${formatCount(run.comments_failed)} skipped (retried next run)`}
            {` · ${formatCount(run.tokens_in + run.tokens_out)} tokens`}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Not analyzed yet. {formatCount(commentCount)} stored comment{commentCount === 1 ? "" : "s"} will be classified.
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
      <Button onClick={start} disabled={active || isStarting || commentCount === 0} className="shrink-0">
        {active || isStarting ? <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden /> : <Sparkles aria-hidden />}
        {active ? "Analyzing…" : hasReport ? "Run analysis again" : "Run analysis"}
      </Button>
    </section>
  )
}
