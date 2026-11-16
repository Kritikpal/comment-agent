"use client"

import { Badge } from "@/components/ui/badge"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import type { CommentResult } from "@/lib/types"
import {
  capitalize,
  INTENT_LABEL,
  PURCHASE_LABEL,
  SENTIMENT_META,
  TONE_LABEL,
  type EvidenceRequest,
} from "./meta"
import { SentimentTag } from "./sentiment-tag"

type Props = {
  evidence: EvidenceRequest | null
  results: CommentResult[]
  onClose: () => void
}

export function EvidenceSheet({ evidence, results, onClose }: Props) {
  const byId = new Map(results.map((r) => [r.comment_id, r]))
  const ids = evidence?.commentIds ?? []

  return (
    <Sheet open={evidence !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full gap-0 bg-background sm:max-w-xl">
        <SheetHeader className="gap-2 border-b p-6 pr-14">
          <SheetTitle className="font-display text-3xl leading-tight font-normal">
            {evidence?.title}
          </SheetTitle>
          <SheetDescription>
            {evidence?.description ? `${evidence.description} ` : ""}
            Source comment IDs: {ids.join(", ")}
          </SheetDescription>
        </SheetHeader>
        <ol className="flex flex-1 flex-col divide-y overflow-y-auto">
          {ids.map((id) => {
            const result = byId.get(id)
            return (
              <li key={id} className="p-6">
                {result ? (
                  <CommentRecord result={result} />
                ) : (
                  <p className="text-sm text-destructive">
                    <span className="font-mono">{id}</span> is referenced but missing from results.
                  </p>
                )}
              </li>
            )
          })}
        </ol>
      </SheetContent>
    </Sheet>
  )
}

function CommentRecord({ result }: { result: CommentResult }) {
  return (
    <article className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="rounded-md bg-secondary px-1.5 py-0.5 font-mono text-xs text-secondary-foreground">
          {result.comment_id}
        </span>
        <SentimentTag sentiment={result.sentiment} />
        <span className="text-muted-foreground">{TONE_LABEL[result.tone]}</span>
        {result.purchase_intent !== "none" && (
          <span className="font-medium text-primary">{PURCHASE_LABEL[result.purchase_intent]}</span>
        )}
      </header>

      {result.text ? (
        <blockquote className="font-display text-2xl leading-snug text-pretty">“{result.text}”</blockquote>
      ) : (
        <p className="text-sm text-muted-foreground italic">
          Comment text is not part of the v1.0 response. Look it up on YouTube by ID.
        </p>
      )}

      {result.feedback.length > 0 && (
        <ul className="flex flex-col gap-1.5 text-sm">
          {result.feedback.map((f) => (
            <li key={`${f.aspect}-${f.detail}`} className="flex items-baseline gap-2">
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

      {result.questions.length > 0 && (
        <ul className="flex flex-col gap-1 border-l-2 border-primary/40 pl-3 text-sm">
          {result.questions.map((q) => (
            <li key={q}>{q}</li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-1">
        {result.intents.map((i) => (
          <Badge key={i} variant="outline" className="font-normal">
            {INTENT_LABEL[i]}
          </Badge>
        ))}
      </div>
    </article>
  )
}
