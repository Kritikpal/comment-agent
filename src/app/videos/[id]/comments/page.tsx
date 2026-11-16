import { Suspense } from "react"
import Image from "next/image"
import Link from "next/link"
import { BarChart3, Pencil } from "lucide-react"
import { AppHeader } from "@/components/app-header"
import { Button, buttonVariants } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { CommentsList } from "@/components/videos/comments-list"
import { FetchStatusBadge } from "@/components/videos/fetch-status"
import { RefetchButton } from "@/components/videos/refetch-button"
import { VideoFormDialog } from "@/components/videos/video-form-dialog"
import { formatCount, formatDateTime } from "@/lib/format"
import { COMMENTS_PAGE_SIZE_DEFAULT, type VideoDto } from "@/lib/video-types"
import { analyzerVersion } from "@/server/analysis/config"
import { videoRepository } from "@/server/videos/deps"
import { STALE_FETCH_MS } from "@/server/videos/service"
import { loadVideoOrNotFound, videoLabel } from "../load-video"

export default function CommentsPage({ params }: PageProps<"/videos/[id]/comments">) {
  return (
    <div className="mx-auto flex w-full max-w-[1320px] flex-col px-4 pb-24 sm:px-8 lg:px-12">
      <Suspense fallback={<PageSkeleton />}>
        <CommentsContent params={params} />
      </Suspense>
    </div>
  )
}

async function CommentsContent({ params }: { params: PageProps<"/videos/[id]/comments">["params"] }) {
  const video = await loadVideoOrNotFound((await params).id)
  const firstPage = await videoRepository.listComments(video.id, null, COMMENTS_PAGE_SIZE_DEFAULT, analyzerVersion())

  return (
    <>
      <AppHeader trail={[{ label: "Videos", href: "/" }, { label: videoLabel(video) }, { label: "Comments" }]} />
      <VideoSummary video={video} />
      <section aria-labelledby="comments-heading" className="mt-14 flex flex-col gap-5">
        <div className="flex items-baseline justify-between gap-4 border-b pb-4">
          <h2 id="comments-heading" className="font-display text-4xl leading-none">
            Comments
          </h2>
          <p className="text-sm text-muted-foreground tabular-nums">{formatCount(video.comment_count)} stored</p>
        </div>
        {/* Keyed on the last fetch so a refetch restarts the list from the newest comment. */}
        <CommentsList
          key={video.fetch.last_fetched_at ?? "never"}
          videoId={video.id}
          initial={firstPage}
          total={video.comment_count}
        />
      </section>
    </>
  )
}

function VideoSummary({ video }: { video: VideoDto }) {
  const { fetch } = video
  return (
    <section aria-labelledby="video-heading" className="mt-6 flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="flex min-w-0 items-start gap-5">
          <div className="relative hidden aspect-video w-48 shrink-0 overflow-hidden rounded-xl bg-muted sm:block">
            {video.thumbnail_url && <Image src={video.thumbnail_url} alt="" fill sizes="192px" className="object-cover" priority />}
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <p className="text-sm text-muted-foreground">
              {video.product.name}
              {video.product.category && ` · ${video.product.category}`}
            </p>
            <h1 id="video-heading" className="font-display text-4xl leading-[1.02] text-balance sm:text-5xl">
              {videoLabel(video)}
            </h1>
            <p className="text-sm text-muted-foreground">
              {video.channel_title ?? "Channel unknown"} ·{" "}
              <a href={video.url} target="_blank" rel="noopener noreferrer" className="font-mono text-foreground underline decoration-border underline-offset-4 hover:decoration-primary">
                {video.youtube_video_id}
              </a>
            </p>
            {video.notes && <p className="max-w-2xl text-sm whitespace-pre-line text-muted-foreground">{video.notes}</p>}
          </div>
        </div>
        <div className="flex items-start gap-2">
          <VideoFormDialog
            mode="edit"
            video={video}
            trigger={
              <Button variant="outline">
                <Pencil aria-hidden />
                Edit details
              </Button>
            }
          />
          <Link href={`/videos/${video.id}/analyze`} className={buttonVariants({ variant: "outline" })}>
            <BarChart3 aria-hidden />
            Analyze
          </Link>
          <RefetchButton videoId={video.id} commentCount={video.comment_count} isFetching={isLiveFetch(video)} />
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-5 rounded-2xl border bg-card px-6 py-5 sm:grid-cols-4">
        <Stat label="Fetch status">
          <FetchStatusBadge status={fetch.status} className="text-base" />
        </Stat>
        <Stat label="Stored comments">
          <span className="font-display text-3xl leading-none tabular-nums">{formatCount(video.comment_count)}</span>
        </Stat>
        <Stat label="Per fetch">
          <span className="font-display text-3xl leading-none tabular-nums">{video.comment_limit}</span>
        </Stat>
        <Stat label="Last fetched">
          <span className="tabular-nums">{fetch.last_fetched_at ? formatDateTime(fetch.last_fetched_at) : "Never"}</span>
        </Stat>
        {fetch.status === "FETCHING" && !isLiveFetch(video) && (
          <div className="col-span-full rounded-lg bg-mixed/15 px-3 py-2 text-sm">
            This fetch stopped responding (the server may have restarted). Refetch to start it again.
          </div>
        )}
        {fetch.note && fetch.status !== "FAILED" && (
          <div className="col-span-full rounded-lg bg-mixed/15 px-3 py-2 text-sm">
            <span className="font-medium">Incomplete fetch:</span> {fetch.note}
          </div>
        )}
        {fetch.status === "FAILED" && fetch.error && (
          <div className="col-span-full rounded-lg bg-destructive/8 px-3 py-2 text-sm text-destructive">
            <span className="font-medium">Last fetch failed:</span> {fetch.error.message}{" "}
            <span className="font-mono text-xs opacity-80">({fetch.error.code})</span>
          </div>
        )}
      </dl>
    </section>
  )
}

/**
 * A FETCHING status older than the stale window is abandoned (e.g. a server restart) and the API
 * lets a refetch reclaim it, so the button must allow it too. Safe to read the clock: this runs per
 * request, after connection().
 */
function isLiveFetch(video: VideoDto): boolean {
  if (video.fetch.status !== "FETCHING" || !video.fetch.started_at) return false
  return Date.now() - Date.parse(video.fetch.started_at) < STALE_FETCH_MS
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

function PageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading comments" className="flex flex-col gap-8 pt-6">
      <Skeleton className="h-8 w-72" />
      <div className="flex gap-5">
        <Skeleton className="aspect-video w-48 rounded-xl" />
        <div className="flex flex-1 flex-col gap-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-4 w-56" />
        </div>
      </div>
      <Skeleton className="h-24 w-full rounded-2xl" />
      <Skeleton className="h-64 w-full rounded-2xl" />
    </div>
  )
}
