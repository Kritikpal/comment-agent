import { Suspense } from "react"
import { connection } from "next/server"
import { Plus } from "lucide-react"
import { AppHeader } from "@/components/app-header"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { VideoFormDialog } from "@/components/videos/video-form-dialog"
import { VideosTable } from "@/components/videos/videos-table"
import { VIDEOS_PAGE_SIZE_DEFAULT } from "@/lib/video-types"
import { videoRepository } from "@/server/videos/deps"

export default function VideosPage({ searchParams }: PageProps<"/">) {
  return (
    <div className="mx-auto flex w-full max-w-[1320px] flex-col px-4 pb-24 sm:px-8 lg:px-12">
      <AppHeader trail={[{ label: "Videos" }]} />
      <section aria-labelledby="videos-heading" className="mt-6 flex flex-col gap-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-2">
            <h1 id="videos-heading" className="font-display text-6xl leading-[0.95] tracking-[-0.02em] sm:text-7xl">
              Videos
            </h1>
            <p className="max-w-xl text-muted-foreground">
              Product videos you track. Each one stores its YouTube comments so you can read them, refetch new
              ones, and analyze what customers say.
            </p>
          </div>
          <VideoFormDialog
            mode="add"
            trigger={
              <Button>
                <Plus aria-hidden />
                Add video
              </Button>
            }
          />
        </div>
        <Suspense fallback={<TableSkeleton />}>
          <VideosSection searchParams={searchParams} />
        </Suspense>
      </section>
    </div>
  )
}

function pageFrom(value: string | string[] | undefined): number {
  const page = Number(Array.isArray(value) ? value[0] : value)
  return Number.isInteger(page) && page >= 1 ? page : 1
}

async function VideosSection({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  // Database reads are per request; this also keeps Prisma's random transaction IDs out of prerendering.
  await connection()
  const page = pageFrom((await searchParams).page)
  const data = await videoRepository.listVideos(page, VIDEOS_PAGE_SIZE_DEFAULT)
  return <VideosTable data={data} />
}

function TableSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border bg-card p-5" aria-busy="true" aria-label="Loading videos">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="aspect-video w-24 rounded-md" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/5" />
          </div>
          <Skeleton className="h-8 w-48" />
        </div>
      ))}
    </div>
  )
}
