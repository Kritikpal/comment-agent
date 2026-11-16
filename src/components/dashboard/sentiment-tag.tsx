import type { Sentiment } from "@/lib/types"
import { SENTIMENT_META } from "./meta"

export function SentimentTag({ sentiment }: { sentiment: Sentiment }) {
  const meta = SENTIMENT_META[sentiment]
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className="size-2 rounded-full" style={{ background: meta.color }} aria-hidden />
      {meta.label}
    </span>
  )
}
