"use client"

import { Bar, BarChart, Label, LabelList, Pie, PieChart, XAxis, YAxis } from "recharts"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { countTones, percent } from "@/lib/analytics"
import { TONES, type AnalyzeResponse } from "@/lib/types"
import { PURCHASE_LABEL, TONE_LABEL, type EvidenceRequest } from "./meta"

type Props = {
  response: AnalyzeResponse
  onEvidence: (evidence: EvidenceRequest) => void
}

export function Signals({ response, onEvidence }: Props) {
  return (
    <section
      aria-label="Customer signals"
      className="grid gap-14 lg:grid-cols-12 lg:gap-0 lg:divide-x"
    >
      <ToneBreakdown response={response} />
      <PurchaseInterest response={response} />
      <CustomerQuestions response={response} onEvidence={onEvidence} />
    </section>
  )
}

function SectionTitle({ id, children, note }: { id: string; children: string; note?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h2 id={id} className="font-display text-3xl leading-none">
        {children}
      </h2>
      {note && <p className="text-sm text-muted-foreground">{note}</p>}
    </div>
  )
}

const toneConfig = { count: { label: "Comments", color: "var(--chart-1)" } } satisfies ChartConfig

function ToneBreakdown({ response }: { response: AnalyzeResponse }) {
  const counts = countTones(response.results)
  const data = TONES.map((tone) => ({ tone: TONE_LABEL[tone], count: counts[tone] })).sort(
    (a, b) => b.count - a.count
  )

  return (
    <div className="flex flex-col gap-6 lg:col-span-5 lg:pr-10">
      <SectionTitle id="tone-heading" note="How people say it, one tone per comment.">
        Tone
      </SectionTitle>
      <ChartContainer
        config={toneConfig}
        className="aspect-auto h-[260px] w-full"
        aria-labelledby="tone-heading"
      >
        <BarChart data={data} layout="vertical" margin={{ left: 0, right: 36, top: 0, bottom: 0 }} barCategoryGap={8}>
          <XAxis type="number" hide domain={[0, "dataMax"]} />
          <YAxis
            dataKey="tone"
            type="category"
            tickLine={false}
            axisLine={false}
            width={92}
            tick={{ fontSize: 13 }}
          />
          <ChartTooltip cursor={false} content={<ChartTooltipContent hideIndicator />} />
          <Bar dataKey="count" fill="var(--color-count)" radius={5} background={{ fill: "var(--muted)", radius: 5 }}>
            <LabelList
              dataKey="count"
              position="right"
              offset={10}
              className="fill-foreground font-medium tabular-nums"
              fontSize={13}
            />
          </Bar>
        </BarChart>
      </ChartContainer>
    </div>
  )
}

const purchaseConfig = {
  ready_to_buy: { label: PURCHASE_LABEL.ready_to_buy, color: "var(--chart-1)" },
  considering: { label: PURCHASE_LABEL.considering, color: "var(--chart-3)" },
  none: { label: PURCHASE_LABEL.none, color: "var(--muted)" },
} satisfies ChartConfig

function PurchaseInterest({ response }: { response: AnalyzeResponse }) {
  const { considering, ready_to_buy } = response.analytics.purchase_interest
  const total = response.total_analyzed
  const none = Math.max(total - considering - ready_to_buy, 0)
  const data = [
    { key: "ready_to_buy", value: ready_to_buy, fill: "var(--color-ready_to_buy)" },
    { key: "considering", value: considering, fill: "var(--color-considering)" },
    { key: "none", value: none, fill: "var(--color-none)" },
  ]
  const interested = considering + ready_to_buy

  return (
    <div className="flex flex-col gap-6 lg:col-span-3 lg:px-10">
      <SectionTitle id="purchase-heading" note="Buying questions count as considering.">
        Buying signals
      </SectionTitle>
      <ChartContainer config={purchaseConfig} className="mx-auto aspect-square h-[180px]" aria-labelledby="purchase-heading">
        <PieChart>
          <ChartTooltip cursor={false} content={<ChartTooltipContent nameKey="key" hideLabel />} />
          <Pie data={data} dataKey="value" nameKey="key" innerRadius={58} outerRadius={84} strokeWidth={3} stroke="var(--background)">
            <Label
              content={({ viewBox }) => {
                if (!viewBox || !("cx" in viewBox) || !("cy" in viewBox)) return null
                return (
                  <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                    <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) - 4} className="fill-foreground font-display text-4xl">
                      {interested}
                    </tspan>
                    <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) + 22} className="fill-muted-foreground text-xs">
                      interested
                    </tspan>
                  </text>
                )
              }}
            />
          </Pie>
        </PieChart>
      </ChartContainer>
      <dl className="flex flex-col gap-2.5 text-sm">
        {(["ready_to_buy", "considering"] as const).map((key) => {
          const value = response.analytics.purchase_interest[key]
          return (
            <div key={key} className="flex items-center justify-between gap-3">
              <dt className="flex items-center gap-2">
                <span className="size-2.5 rounded-sm" style={{ background: purchaseConfig[key].color }} aria-hidden />
                {PURCHASE_LABEL[key]}
              </dt>
              <dd className="tabular-nums">
                <span className="font-medium">{value}</span>
                <span className="text-muted-foreground"> · {percent(value, total)}%</span>
              </dd>
            </div>
          )
        })}
      </dl>
    </div>
  )
}

function CustomerQuestions({ response, onEvidence }: Props) {
  const questions = response.analytics.customer_questions

  return (
    <div className="flex flex-col gap-6 lg:col-span-4 lg:pl-10">
      <SectionTitle id="questions-heading" note={`${questions.length} asked in the comments.`}>
        Customer questions
      </SectionTitle>
      {questions.length === 0 ? (
        <p className="text-sm text-muted-foreground">No questions in the analyzed comments.</p>
      ) : (
        <ul aria-labelledby="questions-heading" className="flex flex-col divide-y">
          {questions.map((q) => (
            <li key={q.question} className="flex items-start justify-between gap-4 py-3 first:pt-0">
              <p className="text-[0.95rem] leading-snug text-pretty">{q.question}</p>
              <div className="flex shrink-0 gap-1">
                {q.comment_ids.map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() =>
                      onEvidence({ title: q.question, description: "Asked in this comment.", commentIds: [id] })
                    }
                    className="rounded-md bg-secondary px-1.5 py-0.5 font-mono text-xs text-secondary-foreground transition-colors hover:bg-primary hover:text-primary-foreground focus-visible:outline-2 focus-visible:outline-ring"
                    aria-label={`View comment ${id}`}
                  >
                    {id}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
