"use client"

import { useState } from "react"
import { LoaderCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { apiRequest, ApiRequestError } from "@/lib/api-client"
import { SentimentTag } from "@/components/dashboard/sentiment-tag"
import { formatCompact, formatCount, formatDateTime } from "@/lib/format"
import { COMMENTS_PAGE_SIZE_DEFAULT, type CommentDto, type CommentListResponse } from "@/lib/video-types"

type Props = {
  videoId: string
  /** First page, rendered on the server. Older pages load through the API with the cursor. */
  initial: CommentListResponse
  total: number
}

export function CommentsList({ videoId, initial, total }: Props) {
  const [items, setItems] = useState<CommentDto[]>(initial.items)
  const [cursor, setCursor] = useState<string | null>(initial.next_cursor)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function loadMore() {
    if (!cursor) return
    setIsLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ cursor, limit: String(COMMENTS_PAGE_SIZE_DEFAULT) })
      const page = await apiRequest<CommentListResponse>(`/api/v1/videos/${videoId}/comments?${params}`)
      setItems((current) => [...current, ...page.items])
      setCursor(page.next_cursor)
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : "Couldn't load more comments.")
    } finally {
      setIsLoading(false)
    }
  }

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border bg-card px-6 py-16 text-center">
        <p className="font-display text-3xl leading-none">No comments stored</p>
        <p className="mt-2 text-sm text-muted-foreground">Refetch to pull the newest comments from YouTube.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto rounded-2xl border bg-card">
        <Table className="min-w-[1080px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-11 w-44 pl-5">Published</TableHead>
              <TableHead className="w-44">Author</TableHead>
              <TableHead>Comment</TableHead>
              <TableHead className="w-28">Sentiment</TableHead>
              <TableHead className="w-20 text-right">Likes</TableHead>
              <TableHead className="w-20 text-right">Replies</TableHead>
              <TableHead className="w-44">Edited</TableHead>
              <TableHead className="w-44 pr-5">Fetched</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((c) => (
              <TableRow key={c.id} className="align-top">
                <TableCell className="py-3 pl-5 text-muted-foreground tabular-nums">{formatDateTime(c.published_at)}</TableCell>
                <TableCell className="max-w-44 truncate py-3 font-medium" title={c.author_name ?? undefined}>
                  {c.author_name ?? <span className="text-muted-foreground">Unknown</span>}
                </TableCell>
                <TableCell className="py-3 text-[0.95rem] leading-relaxed whitespace-pre-line">{c.text}</TableCell>
                <TableCell className="py-3">
                  {c.analysis ? <SentimentTag sentiment={c.analysis.sentiment} /> : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="py-3 text-right tabular-nums" title={formatCount(c.like_count)}>
                  {formatCompact(c.like_count)}
                </TableCell>
                <TableCell className="py-3 text-right tabular-nums">{formatCount(c.reply_count)}</TableCell>
                <TableCell className="py-3 text-muted-foreground tabular-nums">
                  {c.youtube_updated_at ? formatDateTime(c.youtube_updated_at) : "—"}
                </TableCell>
                <TableCell className="py-3 pr-5 text-muted-foreground tabular-nums">{formatDateTime(c.fetched_at)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col items-center gap-2">
        <p className="text-sm text-muted-foreground tabular-nums">
          Showing {formatCount(items.length)} of {formatCount(total)}, newest first
        </p>
        {cursor && (
          <Button variant="outline" onClick={loadMore} disabled={isLoading}>
            {isLoading && <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />}
            {isLoading ? "Loading…" : "Load older comments"}
          </Button>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
