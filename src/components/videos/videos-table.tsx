import Image from "next/image"
import Link from "next/link"
import { BarChart3, MessageSquareText, Pencil, Plus } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatCount, formatDate, formatDateTime } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { VideoDto, VideoListResponse } from "@/lib/video-types"
import { FetchStatusBadge } from "./fetch-status"
import { Pagination } from "./pagination"
import { VideoFormDialog } from "./video-form-dialog"

const COLUMNS = 6

export function VideosTable({ data }: { data: VideoListResponse }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto rounded-2xl border bg-card">
        <Table className="min-w-[920px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-11 pl-5">Video</TableHead>
              <TableHead>Product</TableHead>
              <TableHead className="text-right">Comments</TableHead>
              <TableHead>Fetch</TableHead>
              <TableHead>Added</TableHead>
              <TableHead className="pr-5 text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.length === 0 ? <EmptyRow /> : data.items.map((video) => <VideoRow key={video.id} video={video} />)}
          </TableBody>
        </Table>
      </div>
      <Pagination page={data.page} pageSize={data.page_size} total={data.total} totalPages={data.total_pages} />
    </div>
  )
}

function EmptyRow() {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={COLUMNS} className="py-20">
        <div className="mx-auto flex max-w-sm flex-col items-center gap-4 text-center whitespace-normal">
          <span className="grid size-12 place-items-center rounded-2xl bg-secondary text-secondary-foreground">
            <MessageSquareText className="size-5" aria-hidden />
          </span>
          <div className="flex flex-col gap-1.5">
            <p className="font-display text-3xl leading-none">No videos yet</p>
            <p className="text-sm text-muted-foreground">
              Add a YouTube product video and its newest comments are fetched and stored here.
            </p>
          </div>
          <VideoFormDialog
            mode="add"
            trigger={
              <Button size="lg" className="mt-1">
                <Plus aria-hidden />
                Add new video
              </Button>
            }
          />
        </div>
      </TableCell>
    </TableRow>
  )
}

function VideoRow({ video }: { video: VideoDto }) {
  const title = video.title ?? `youtube.com/watch?v=${video.youtube_video_id}`
  return (
    <TableRow className="group/row">
      {/* w-full + max-w-0: this column takes whatever width is left and truncates, instead of growing the table. */}
      <TableCell className="w-full max-w-0 py-3 pl-5">
        <div className="flex items-center gap-3.5">
          <div className="relative aspect-video w-24 shrink-0 overflow-hidden rounded-md bg-muted">
            {video.thumbnail_url && (
              <Image src={video.thumbnail_url} alt="" fill sizes="96px" className="object-cover" />
            )}
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <a
              href={video.url}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate font-medium decoration-border underline-offset-4 hover:underline"
              title={title}
            >
              {title}
            </a>
            <span className="truncate text-xs text-muted-foreground">
              {video.channel_title ?? "Channel unknown"} · <span className="font-mono">{video.youtube_video_id}</span>
            </span>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex max-w-[14rem] flex-col gap-0.5">
          <span className="truncate font-medium">{video.product.name}</span>
          <span className="truncate text-xs text-muted-foreground">{video.product.category ?? "No category"}</span>
        </div>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex flex-col items-end gap-0.5">
          <span className="font-display text-2xl leading-none tabular-nums">{formatCount(video.comment_count)}</span>
          <span className="text-xs text-muted-foreground tabular-nums">{video.comment_limit} per fetch</span>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex max-w-[15rem] flex-col gap-0.5">
          <FetchStatusBadge status={video.fetch.status} />
          {video.fetch.status === "FAILED" && video.fetch.error ? (
            <span className="truncate text-xs text-destructive/90" title={video.fetch.error.message}>
              {video.fetch.error.message}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">
              {video.fetch.last_fetched_at ? formatDateTime(video.fetch.last_fetched_at) : "Never fetched"}
            </span>
          )}
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground">{formatDate(video.created_at)}</TableCell>
      <TableCell className="pr-5">
        <div className="flex items-center justify-end gap-1.5">
          <Link href={`/videos/${video.id}/comments`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            <MessageSquareText aria-hidden />
            Comments
          </Link>
          <Link href={`/videos/${video.id}/analyze`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            <BarChart3 aria-hidden />
            Analyze
          </Link>
          <VideoFormDialog
            mode="edit"
            video={video}
            trigger={
              <Button variant="ghost" size="icon-sm" aria-label={`Edit ${video.product.name}`} className={cn("text-muted-foreground")}>
                <Pencil aria-hidden />
              </Button>
            }
          />
        </div>
      </TableCell>
    </TableRow>
  )
}
