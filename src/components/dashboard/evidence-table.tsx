"use client"

import { useEffect, useState } from "react"
import { LoaderCircle, Search } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { apiRequest, ApiRequestError } from "@/lib/api-client"
import { formatCount } from "@/lib/format"
import type { AnalysisReport, Sentiment } from "@/lib/types"
import type { CommentDto, CommentListResponse } from "@/lib/video-types"
import { INTENT_LABEL, PURCHASE_LABEL, SENTIMENT_META, SENTIMENT_ORDER, TONE_LABEL, type EvidenceRequest } from "./meta"
import { SentimentTag } from "./sentiment-tag"

const PAGE_SIZE = 20
const SEARCH_DELAY_MS = 300
type Filter = Sentiment | "all"

type Props = {
  videoId: string
  report: AnalysisReport
  onEvidence: (evidence: EvidenceRequest) => void
}

type Page = { key: string; items: CommentDto[]; cursor: string | null; error: string | null }

function pageUrl(videoId: string, filter: Filter, query: string, cursor: string | null): string {
  const params = new URLSearchParams({ limit: String(PAGE_SIZE) })
  if (filter !== "all") params.set("sentiment", filter)
  if (query) params.set("q", query)
  if (cursor) params.set("cursor", cursor)
  return `/api/v1/videos/${videoId}/comments?${params}`
}

/** Every stored comment with its classification, paged from the API; sentiment and text filters run in the database. */
export function EvidenceTable({ videoId, report, onEvidence }: Props) {
  const [filter, setFilter] = useState<Filter>("all")
  const [input, setInput] = useState("")
  const [query, setQuery] = useState("")
  const [page, setPage] = useState<Page | null>(null)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const key = `${filter}|${query}`

  useEffect(() => {
    const timer = setTimeout(() => setQuery(input.trim()), SEARCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [input])

  useEffect(() => {
    let cancelled = false
    apiRequest<CommentListResponse>(pageUrl(videoId, filter, query, null))
      .then((p) => !cancelled && setPage({ key, items: p.items, cursor: p.next_cursor, error: null }))
      .catch((e) => !cancelled && setPage({ key, items: [], cursor: null, error: e instanceof ApiRequestError ? e.message : "Couldn't load comments." }))
    return () => {
      cancelled = true
    }
  }, [videoId, filter, query, key])

  async function loadMore() {
    if (!page?.cursor) return
    setIsLoadingMore(true)
    try {
      const next = await apiRequest<CommentListResponse>(pageUrl(videoId, filter, query, page.cursor))
      setPage((p) => (p && p.key === key ? { ...p, items: [...p.items, ...next.items], cursor: next.next_cursor } : p))
    } catch (e) {
      setPage((p) => (p ? { ...p, error: e instanceof ApiRequestError ? e.message : "Couldn't load more comments." } : p))
    } finally {
      setIsLoadingMore(false)
    }
  }

  const current = page?.key === key ? page : null
  const open = (c: CommentDto) => onEvidence({ title: c.author_name ?? "Comment", commentIds: [c.id] })

  return (
    <section aria-labelledby="evidence-heading" className="flex flex-col gap-6">
      <div className="flex flex-col gap-5 border-b pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-1">
          <h2 id="evidence-heading" className="font-display text-4xl leading-none">
            Comment evidence
          </h2>
          <p className="text-sm text-muted-foreground">Every stored comment with its classification, newest first. Select a row for the full record.</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
            <TabsList className="h-9">
              <TabsTrigger value="all" className="px-2.5">
                All
              </TabsTrigger>
              {SENTIMENT_ORDER.map((s) => (
                <TabsTrigger key={s} value={s} className="px-2.5">
                  {SENTIMENT_META[s].label}
                  <span className="text-muted-foreground tabular-nums">{formatCount(report.sentiment[s])}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="relative sm:w-56">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              type="search"
              placeholder="Search comments"
              aria-label="Search comment text"
              maxLength={100}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="h-9 bg-card pl-8"
            />
          </div>
        </div>
      </div>

      <div className="overflow-x-auto" aria-busy={!current}>
        <Table className="min-w-[860px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Comment (from YouTube)</TableHead>
              <TableHead className="w-28">Sentiment</TableHead>
              <TableHead className="w-28">Tone</TableHead>
              <TableHead className="w-48">Intent</TableHead>
              <TableHead className="w-32">Purchase</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!current ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  <LoaderCircle className="mr-2 inline size-4 animate-spin align-[-3px] motion-reduce:animate-none" aria-hidden />
                  Loading comments…
                </TableCell>
              </TableRow>
            ) : current.items.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  {current.error ?? "No comments match this filter."}
                </TableCell>
              </TableRow>
            ) : (
              current.items.map((c) => (
                <TableRow
                  key={c.id}
                  tabIndex={0}
                  className="cursor-pointer hover:bg-card focus-visible:bg-card focus-visible:outline-2 focus-visible:outline-ring"
                  onClick={() => open(c)}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), open(c))}
                >
                  <TableCell className="max-w-0 truncate text-[0.95rem]" title={c.text}>
                    {c.text}
                  </TableCell>
                  {c.analysis ? (
                    <>
                      <TableCell>
                        <SentimentTag sentiment={c.analysis.sentiment} />
                      </TableCell>
                      <TableCell>{TONE_LABEL[c.analysis.tone]}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {c.analysis.intents.map((i) => (
                            <Badge key={i} variant="outline" className="font-normal">
                              {INTENT_LABEL[i]}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className={c.analysis.purchase_intent === "none" ? "text-muted-foreground" : "font-medium text-primary"}>
                        {PURCHASE_LABEL[c.analysis.purchase_intent]}
                      </TableCell>
                    </>
                  ) : (
                    <TableCell colSpan={4} className="text-muted-foreground">
                      Not analyzed yet. Run the analysis to include it.
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {current?.cursor && (
        <Button variant="outline" className="self-center" onClick={loadMore} disabled={isLoadingMore}>
          {isLoadingMore && <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />}
          {isLoadingMore ? "Loading…" : "Load more"}
        </Button>
      )}
      {current?.error && current.items.length > 0 && (
        <p role="alert" className="self-center text-sm text-destructive">
          {current.error}
        </p>
      )}
    </section>
  )
}
