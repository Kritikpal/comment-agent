"use client"

import { useState } from "react"
import { Info, Play, TriangleAlert } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { buildResponse, DEFAULT_REQUEST, mockAnalyze } from "@/lib/mock"
import type { AnalyzeRequest, AnalyzeResponse } from "@/lib/types"
import { cn } from "@/lib/utils"
import { AnalyzeForm } from "./analyze-form"
import { EvidenceSheet } from "./evidence-sheet"
import { EvidenceTable } from "./evidence-table"
import { FeedbackRanks } from "./feedback-ranks"
import type { EvidenceRequest } from "./meta"
import { ReportHeader, SentimentBand } from "./overview"
import { Signals } from "./signals"

const INITIAL_RESPONSE = buildResponse(DEFAULT_REQUEST)

export function Dashboard() {
  const [request, setRequest] = useState<AnalyzeRequest>(DEFAULT_REQUEST)
  const [response, setResponse] = useState<AnalyzeResponse>(INITIAL_RESPONSE)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [evidence, setEvidence] = useState<EvidenceRequest | null>(null)

  async function handleAnalyze(next: AnalyzeRequest) {
    setIsLoading(true)
    setError(null)
    try {
      const result = await mockAnalyze(next)
      setRequest(next)
      setResponse(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed. Nothing was changed.")
    } finally {
      setIsLoading(false)
    }
  }

  const isPartial = response.total_analyzed < request.comment_limit

  return (
    <div className="mx-auto flex w-full max-w-[1320px] flex-col px-4 pb-24 sm:px-8 lg:px-12">
      <header className="flex items-center justify-between gap-4 py-6">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-lg bg-[oklch(0.58_0.23_25)] text-white shadow-sm">
            <Play className="size-3.5 fill-current" aria-hidden />
          </span>
          <span className="text-sm font-semibold tracking-tight">Product Feedback Intelligence</span>
        </div>
        <Badge variant="outline" className="h-6 bg-card px-2.5 font-normal text-muted-foreground">
          Sample data
        </Badge>
      </header>

      <AnalyzeForm initial={DEFAULT_REQUEST} isLoading={isLoading} onSubmit={handleAnalyze} />

      <div className="mt-4 flex flex-col gap-3">
        {error && (
          <Alert variant="destructive">
            <TriangleAlert aria-hidden />
            <AlertTitle>Analysis failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {isPartial && (
          <Alert className="bg-card">
            <Info aria-hidden />
            <AlertTitle>
              {response.total_analyzed} of {request.comment_limit} requested comments were classified
            </AlertTitle>
            <AlertDescription>
              Only {response.total_analyzed} comments were available. Every count below covers those comments only.
            </AlertDescription>
          </Alert>
        )}
      </div>

      <main
        aria-busy={isLoading}
        className={cn(
          "mt-14 flex flex-col gap-20 transition-opacity duration-200 sm:mt-16 lg:gap-24",
          isLoading && "pointer-events-none opacity-40"
        )}
      >
        <div className="flex flex-col gap-14">
          <ReportHeader request={request} response={response} onEvidence={setEvidence} />
          <SentimentBand response={response} />
        </div>
        <FeedbackRanks
          complaints={response.analytics.top_complaints}
          praised={response.analytics.top_positive_features}
          onEvidence={setEvidence}
        />
        <Signals response={response} onEvidence={setEvidence} />
        <EvidenceTable key={response.video_id + response.total_analyzed} results={response.results} onEvidence={setEvidence} />
      </main>

      <footer className="mt-24 border-t pt-6 text-sm text-muted-foreground">
        Prototype on API contract v1.0. Sample comments stand in for YouTube and the classifier, so the
        product and video you enter do not change them.
      </footer>

      <EvidenceSheet evidence={evidence} results={response.results} onClose={() => setEvidence(null)} />
    </div>
  )
}
