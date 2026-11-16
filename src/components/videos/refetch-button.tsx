"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { LoaderCircle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { apiRequest, ApiRequestError } from "@/lib/api-client"
import { formatCount } from "@/lib/format"
import type { VideoDto } from "@/lib/video-types"

type Props = { videoId: string; commentCount: number; isFetching: boolean }

export function RefetchButton({ videoId, commentCount, isFetching }: Props) {
  const router = useRouter()
  const [isBusy, setIsBusy] = useState(false)
  const [result, setResult] = useState<{ tone: "ok" | "error"; text: string } | null>(null)

  async function handleClick() {
    setIsBusy(true)
    setResult(null)
    try {
      const video = await apiRequest<VideoDto>(`/api/v1/videos/${videoId}/refetch`, { method: "POST" })
      if (video.fetch.status === "FAILED") {
        setResult({ tone: "error", text: video.fetch.error?.message ?? "The fetch failed." })
      } else if (video.fetch.note) {
        setResult({ tone: "error", text: `Fetched, but incomplete: ${video.fetch.note}` })
      } else {
        const added = video.comment_count - commentCount
        setResult({
          tone: "ok",
          text: added > 0 ? `${formatCount(added)} new comment${added === 1 ? "" : "s"} stored.` : "No new comments since the last fetch.",
        })
      }
      router.refresh()
    } catch (error) {
      setResult({ tone: "error", text: error instanceof ApiRequestError ? error.message : "Refetch failed. Please try again." })
    } finally {
      setIsBusy(false)
    }
  }

  const busy = isBusy || isFetching
  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button onClick={handleClick} disabled={busy}>
        {busy ? <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden /> : <RefreshCw aria-hidden />}
        {busy ? "Fetching…" : "Refetch comments"}
      </Button>
      <p role="status" aria-live="polite" className={result?.tone === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
        {result?.text}
      </p>
    </div>
  )
}
