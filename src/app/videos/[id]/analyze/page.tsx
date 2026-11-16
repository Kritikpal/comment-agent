import { Suspense } from "react"
import { BarChart3 } from "lucide-react"
import { AppHeader } from "@/components/app-header"
import { AnalysisPanel } from "@/components/dashboard/analysis-panel"
import { Dashboard } from "@/components/dashboard/dashboard"
import { Skeleton } from "@/components/ui/skeleton"
import { analysisRepository } from "@/server/analysis/deps"
import { loadVideoOrNotFound, videoLabel } from "../load-video"

export default function AnalyzePage({ params }: PageProps<"/videos/[id]/analyze">) {
  return (
    <div className="mx-auto flex w-full max-w-[1320px] flex-col px-4 pb-24 sm:px-8 lg:px-12">
      <Suspense fallback={<PageSkeleton />}>
        <AnalyzeContent params={params} />
      </Suspense>
    </div>
  )
}

async function AnalyzeContent({ params }: { params: PageProps<"/videos/[id]/analyze">["params"] }) {
  const video = await loadVideoOrNotFound((await params).id)
  const { current, report } = await analysisRepository.latest(video.id)

  return (
    <>
      <AppHeader trail={[{ label: "Videos", href: "/" }, { label: videoLabel(video), href: `/videos/${video.id}/comments` }, { label: "Analyze" }]} />
      {/* Keyed on the run so the panel starts from fresh server data after each refresh. */}
      <AnalysisPanel
        key={current ? `${current.id}-${current.status}` : "none"}
        videoId={video.id}
        current={current}
        hasReport={report !== null}
        commentCount={video.comment_count}
      />
      <main className="mt-12">
        {report?.report ? (
          <Dashboard
            key={report.id}
            videoId={video.id}
            youtubeVideoId={video.youtube_video_id}
            product={video.product}
            report={report.report}
            analyzedAt={report.finished_at}
          />
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-20 text-center">
            <span className="grid size-12 place-items-center rounded-2xl bg-secondary text-secondary-foreground">
              <BarChart3 className="size-5" aria-hidden />
            </span>
            <p className="font-display text-3xl leading-none">No report yet</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Run the analysis to classify this video&apos;s comments with the language model and build the report:
              sentiment, the aspects customers praise and criticise, buying signals and their questions.
            </p>
          </div>
        )}
      </main>
    </>
  )
}

function PageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading analysis">
      <AppHeader trail={[{ label: "Videos", href: "/" }, { label: "Analyze" }]} />
      <Skeleton className="h-16 w-full rounded-2xl" />
      <Skeleton className="mt-12 h-48 w-full rounded-2xl" />
    </div>
  )
}
