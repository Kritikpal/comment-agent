import { LoaderCircle } from "lucide-react"
import type { FetchStatus } from "@/lib/video-types"
import { cn } from "@/lib/utils"

const STATUS: Record<FetchStatus, { label: string; dot: string; text: string }> = {
  PENDING: { label: "Queued", dot: "bg-muted-foreground/50", text: "text-muted-foreground" },
  FETCHING: { label: "Fetching", dot: "", text: "text-primary" },
  READY: { label: "Ready", dot: "bg-positive", text: "text-foreground" },
  FAILED: { label: "Failed", dot: "bg-destructive", text: "text-destructive" },
}

export function FetchStatusBadge({ status, className }: { status: FetchStatus; className?: string }) {
  const meta = STATUS[status]
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm whitespace-nowrap", meta.text, className)}>
      {status === "FETCHING" ? (
        <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
      ) : (
        <span className={cn("size-2 rounded-full", meta.dot)} aria-hidden />
      )}
      {meta.label}
    </span>
  )
}
