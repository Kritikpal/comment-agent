import { ArrowRight } from "lucide-react"
import type { AspectMention } from "@/lib/types"
import { capitalize, type EvidenceRequest } from "./meta"

const MAX_ROWS = 6

type Props = {
  complaints: AspectMention[]
  praised: AspectMention[]
  onEvidence: (evidence: EvidenceRequest) => void
}

export function FeedbackRanks({ complaints, praised, onEvidence }: Props) {
  return (
    <section aria-label="Product feature feedback" className="grid gap-14 lg:grid-cols-2 lg:gap-16">
      <RankList
        title="What customers flag"
        kind="Complaint"
        empty="No product complaints in the analyzed comments."
        color="var(--negative)"
        items={complaints}
        onEvidence={onEvidence}
      />
      <RankList
        title="What customers praise"
        kind="Praised feature"
        empty="No praised features in the analyzed comments."
        color="var(--positive)"
        items={praised}
        onEvidence={onEvidence}
      />
    </section>
  )
}

type RankListProps = {
  title: string
  kind: string
  empty: string
  color: string
  items: AspectMention[]
  onEvidence: (evidence: EvidenceRequest) => void
}

function RankList({ title, kind, empty, color, items, onEvidence }: RankListProps) {
  const top = items.slice(0, MAX_ROWS)
  const max = Math.max(...top.map((i) => i.mentions), 1)
  const totalMentions = items.reduce((sum, i) => sum + i.mentions, 0)
  const headingId = `${kind.replace(/\s+/g, "-").toLowerCase()}-heading`

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-baseline justify-between gap-4 border-b pb-4">
        <h2 id={headingId} className="font-display text-4xl leading-none">
          {title}
        </h2>
        <p className="text-sm text-muted-foreground tabular-nums">
          {items.length} aspects · {totalMentions} mentions
        </p>
      </div>

      {top.length === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ol aria-labelledby={headingId} className="flex flex-col">
          {top.map((item, index) => (
            <li key={item.aspect}>
              <button
                type="button"
                onClick={() =>
                  onEvidence({
                    title: `${kind}: ${capitalize(item.aspect)}`,
                    description: `${item.mentions} mention${item.mentions === 1 ? "" : "s"} across ${item.comment_ids.length} comment${item.comment_ids.length === 1 ? "" : "s"}.`,
                    commentIds: item.comment_ids,
                  })
                }
                className="group grid w-full grid-cols-[1.75rem_7.5rem_minmax(0,1fr)_2.5rem_1rem] items-center gap-3 rounded-lg px-2 py-3 text-left transition-colors hover:bg-card focus-visible:bg-card focus-visible:outline-2 focus-visible:outline-ring"
              >
                <span className="font-mono text-xs text-muted-foreground tabular-nums">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="truncate text-base font-medium">{capitalize(item.aspect)}</span>
                <span className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <span
                    className="block h-full rounded-full"
                    style={{ width: `${(item.mentions / max) * 100}%`, background: color }}
                  />
                </span>
                <span className="text-right font-display text-2xl leading-none tabular-nums">
                  {item.mentions}
                  <span className="sr-only"> mentions, view evidence</span>
                </span>
                <ArrowRight
                  className="size-4 text-muted-foreground opacity-0 transition-[opacity,transform] duration-200 group-hover:translate-x-0.5 group-hover:text-primary group-hover:opacity-100 group-focus-visible:opacity-100"
                  aria-hidden
                />
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
