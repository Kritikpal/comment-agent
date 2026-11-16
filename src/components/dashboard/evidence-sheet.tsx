"use client"

import { useEffect, useState } from "react"
import { LoaderCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { apiRequest, ApiRequestError } from "@/lib/api-client"
import { formatCompact, formatDateTime } from "@/lib/format"
import type { CommentDto, CommentListResponse } from "@/lib/video-types"
import { capitalize, INTENT_LABEL, PURCHASE_LABEL, SENTIMENT_META, TONE_LABEL, type EvidenceRequest } from "./meta"
import { SentimentTag } from "./sentiment-tag"

/** The comments endpoint returns at most this many IDs per request. */
const MAX_IDS = 100

type Props = {
  evidence: EvidenceRequest | null
  videoId: string
  onClose: () => void
}

type Loaded = { key: string; items: CommentDto[] } | { key: string; error: string }

export function EvidenceSheet({ evidence, videoId, onClose }: Props) {
  const ids = evidence?.commentIds.slice(0, MAX_IDS) ?? []
  const key = ids.join(",")
  const [loaded, setLoaded] = useState<Loaded | null>(null)

  useEffect(() => {
    if (!key) return
    let cancelled = false
    apiRequest<CommentListResponse>(`/api/v1/videos/${videoId}/comments?ids=${encodeURIComponent(key)}`)
      .then((page) => !cancelled && setLoaded({ key, items: page.items }))
      .catch((e) => !cancelled && setLoaded({ key, error: e instanceof ApiRequestError ? e.message : "Couldn't load the comments." }))
    return () => {
      cancelled = true
    }
  }, [key, videoId])

  const current = loaded?.key === key ? loaded : null
  const total = evidence?.commentIds.length ?? 0

  return (
    <Sheet open={evidence !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full gap-0 bg-background sm:max-w-xl">
        <SheetHeader className="gap-2 border-b p-6 pr-14">
          <SheetTitle className="font-display text-3xl leading-tight font-normal">{evidence?.title}</SheetTitle>
          <SheetDescription>
            {evidence?.description ? `${evidence.description} ` : ""}
            {total > MAX_IDS && `Showing ${MAX_IDS} of ${total}.`}
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-1 flex-col overflow-y-auto">
          {!current ? (
            <p className="flex items-center gap-2 p-6 text-sm text-muted-foreground" aria-busy="true">
              <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
              Loading comments…
            </p>
          ) : "error" in current ? (
            <p role="alert" className="p-6 text-sm text-destructive">
              {current.error}
            </p>
          ) : current.items.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">These comments are no longer stored.</p>
          ) : (
            <ol className="flex flex-col divide-y">
              {current.items.map((c) => (
                <li key={c.id} className="p-6">
                  <CommentRecord comment={c} />
                </li>
              ))}
            </ol>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function CommentRecord({ comment }: { comment: CommentDto }) {
  const a = comment.analysis
  return (
    <article className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="font-medium">{comment.author_name ?? "Unknown author"}</span>
        <span className="text-muted-foreground tabular-nums">{formatDateTime(comment.published_at)}</span>
        <span className="text-muted-foreground tabular-nums" title={`${comment.like_count} likes`}>
          {formatCompact(comment.like_count)} likes
        </span>
      </header>

      <blockquote className="font-display text-2xl leading-snug text-pretty">“{comment.text}”</blockquote>

      {!a ? (
        <p className="text-sm text-muted-foreground">Not analyzed by the current analyzer yet.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <SentimentTag sentiment={a.sentiment} />
            <span className="text-muted-foreground">{TONE_LABEL[a.tone]}</span>
            {a.purchase_intent !== "none" && <span className="font-medium text-primary">{PURCHASE_LABEL[a.purchase_intent]}</span>}
          </div>
          {a.feedback.length > 0 && (
            <ul className="flex flex-col gap-1.5 text-sm">
              {a.feedback.map((f) => (
                <li key={`${f.aspect}-${f.sentiment}`} className="flex items-baseline gap-2">
                  <span
                    className="size-2 shrink-0 translate-y-[-1px] rounded-full"
                    style={{ background: SENTIMENT_META[f.sentiment].color }}
                    aria-label={SENTIMENT_META[f.sentiment].label}
                  />
                  <span className="font-medium">{capitalize(f.aspect)}</span>
                  <span className="text-muted-foreground">{f.detail}</span>
                </li>
              ))}
            </ul>
          )}
          {a.questions.length > 0 && (
            <ul className="flex flex-col gap-1 border-l-2 border-primary/40 pl-3 text-sm">
              {a.questions.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-1">
            {a.intents.map((i) => (
              <Badge key={i} variant="outline" className="font-normal">
                {INTENT_LABEL[i]}
              </Badge>
            ))}
          </div>
        </>
      )}
    </article>
  )
}
