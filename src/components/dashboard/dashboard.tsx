"use client"

import { useState } from "react"
import type { AnalysisReport } from "@/lib/types"
import { EvidenceSheet } from "./evidence-sheet"
import { EvidenceTable } from "./evidence-table"
import { FeedbackRanks } from "./feedback-ranks"
import type { EvidenceRequest } from "./meta"
import { ReportHeader, SentimentBand } from "./overview"
import { Signals } from "./signals"

type Props = {
  /** Registry video ID (UUID), for the comment API. */
  videoId: string
  youtubeVideoId: string
  product: { name: string; category: string | null }
  report: AnalysisReport
  /** When the report was produced. */
  analyzedAt: string | null
}

/** The analysis report for one video. Counts come from the stored snapshot; comments page in from the API. */
export function Dashboard({ videoId, youtubeVideoId, product, report, analyzedAt }: Props) {
  const [evidence, setEvidence] = useState<EvidenceRequest | null>(null)

  return (
    <>
      <div className="flex flex-col gap-20 lg:gap-24">
        <div className="flex flex-col gap-14">
          <ReportHeader product={product} youtubeVideoId={youtubeVideoId} report={report} analyzedAt={analyzedAt} onEvidence={setEvidence} />
          <SentimentBand report={report} />
        </div>
        <FeedbackRanks complaints={report.top_complaints} praised={report.top_positive_features} onEvidence={setEvidence} />
        <Signals report={report} onEvidence={setEvidence} />
        <EvidenceTable videoId={videoId} report={report} onEvidence={setEvidence} />
      </div>
      <EvidenceSheet evidence={evidence} videoId={videoId} onClose={() => setEvidence(null)} />
    </>
  )
}
