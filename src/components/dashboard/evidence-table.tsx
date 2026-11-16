"use client"

import { useState } from "react"
import { Search } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { CommentResult, Sentiment } from "@/lib/types"
import {
  INTENT_LABEL,
  PURCHASE_LABEL,
  SENTIMENT_META,
  SENTIMENT_ORDER,
  TONE_LABEL,
  type EvidenceRequest,
} from "./meta"
import { SentimentTag } from "./sentiment-tag"

const PAGE_SIZE = 10
type Filter = Sentiment | "all"

type Props = {
  results: CommentResult[]
  onEvidence: (evidence: EvidenceRequest) => void
}

function matches(result: CommentResult, filter: Filter, query: string): boolean {
  if (filter !== "all" && result.sentiment !== filter) return false
  if (!query) return true
  const haystack = [
    result.comment_id,
    result.text ?? "",
    ...result.feedback.map((f) => `${f.aspect} ${f.detail}`),
  ]
    .join(" ")
    .toLowerCase()
  return haystack.includes(query)
}

export function EvidenceTable({ results, onEvidence }: Props) {
  const [filter, setFilter] = useState<Filter>("all")
  const [query, setQuery] = useState("")
  const [isExpanded, setIsExpanded] = useState(false)

  const normalized = query.trim().toLowerCase()
  const filtered = results.filter((r) => matches(r, filter, normalized))
  const visible = isExpanded ? filtered : filtered.slice(0, PAGE_SIZE)
  const countFor = (s: Sentiment) => results.filter((r) => r.sentiment === s).length

  return (
    <section aria-labelledby="evidence-heading" className="flex flex-col gap-6">
      <div className="flex flex-col gap-5 border-b pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-1">
          <h2 id="evidence-heading" className="font-display text-4xl leading-none">
            Comment evidence
          </h2>
          <p className="text-sm text-muted-foreground">
            Every classified comment with its traceable ID. Select a row for the full record.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
            <TabsList className="h-9">
              <TabsTrigger value="all" className="px-2.5">
                All <span className="text-muted-foreground tabular-nums">{results.length}</span>
              </TabsTrigger>
              {SENTIMENT_ORDER.map((s) => (
                <TabsTrigger key={s} value={s} className="px-2.5">
                  {SENTIMENT_META[s].label}
                  <span className="text-muted-foreground tabular-nums">{countFor(s)}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="relative sm:w-56">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              type="search"
              placeholder="Search comments"
              aria-label="Search comments or aspects"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-9 bg-card pl-8"
            />
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table className="min-w-[860px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-24">ID</TableHead>
              <TableHead>Comment (from YouTube)</TableHead>
              <TableHead className="w-28">Sentiment</TableHead>
              <TableHead className="w-28">Tone</TableHead>
              <TableHead className="w-48">Intent</TableHead>
              <TableHead className="w-32">Purchase</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((r) => (
              <TableRow
                key={r.comment_id}
                className="cursor-pointer hover:bg-card"
                onClick={() => onEvidence({ title: `Comment ${r.comment_id}`, commentIds: [r.comment_id] })}
              >
                <TableCell>
                  <button
                    type="button"
                    className="rounded-md bg-secondary px-1.5 py-0.5 font-mono text-xs text-secondary-foreground focus-visible:outline-2 focus-visible:outline-ring"
                    onClick={(e) => {
                      e.stopPropagation()
                      onEvidence({ title: `Comment ${r.comment_id}`, commentIds: [r.comment_id] })
                    }}
                  >
                    {r.comment_id}
                  </button>
                </TableCell>
                <TableCell className="max-w-0 truncate text-[0.95rem]">
                  {r.text ?? <span className="text-muted-foreground italic">Text not in v1.0 response</span>}
                </TableCell>
                <TableCell>
                  <SentimentTag sentiment={r.sentiment} />
                </TableCell>
                <TableCell>{TONE_LABEL[r.tone]}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {r.intents.map((i) => (
                      <Badge key={i} variant="outline" className="font-normal">
                        {INTENT_LABEL[i]}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell className={r.purchase_intent === "none" ? "text-muted-foreground" : "font-medium text-primary"}>
                  {PURCHASE_LABEL[r.purchase_intent]}
                </TableCell>
              </TableRow>
            ))}
            {visible.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  No comments match this filter.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {filtered.length > PAGE_SIZE && (
        <Button variant="outline" className="self-center" onClick={() => setIsExpanded((v) => !v)}>
          {isExpanded ? "Show fewer" : `Show all ${filtered.length} comments`}
        </Button>
      )}
    </section>
  )
}
