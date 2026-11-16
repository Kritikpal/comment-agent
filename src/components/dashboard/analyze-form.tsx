"use client"

import { useState, type FormEvent } from "react"
import { ArrowRight, LoaderCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  COMMENT_LIMIT_MAX,
  COMMENT_LIMIT_MIN,
  validateRequest,
  type RequestErrors,
} from "@/lib/analytics"
import type { AnalyzeRequest } from "@/lib/types"

type Props = {
  initial: AnalyzeRequest
  isLoading: boolean
  onSubmit: (request: AnalyzeRequest) => void
}

type FieldProps = {
  id: string
  label: string
  error?: string
  className?: string
  children: React.ReactNode
}

function Field({ id, label, error, className, children }: FieldProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-0.5 rounded-xl px-3.5 py-2.5 transition-colors focus-within:bg-muted hover:bg-muted/70",
        error && "bg-destructive/5 hover:bg-destructive/10 focus-within:bg-destructive/10",
        className
      )}
    >
      <Label htmlFor={id} className="text-xs font-normal whitespace-nowrap text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  )
}

const bareInput =
  "h-7 border-0 bg-transparent px-0 text-[0.95rem] shadow-none focus-visible:border-0 focus-visible:ring-0 aria-invalid:ring-0 dark:bg-transparent"

export function AnalyzeForm({ initial, isLoading, onSubmit }: Props) {
  const [videoUrl, setVideoUrl] = useState(initial.video_url)
  const [limit, setLimit] = useState(String(initial.comment_limit))
  const [name, setName] = useState(initial.product.name)
  const [category, setCategory] = useState(initial.product.category ?? "")
  const [errors, setErrors] = useState<RequestErrors>({})

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const request: AnalyzeRequest = {
      video_url: videoUrl.trim(),
      comment_limit: Number(limit),
      product: { name: name.trim(), ...(category.trim() && { category: category.trim() }) },
    }
    const found = validateRequest(request)
    setErrors(found)
    if (Object.keys(found).length === 0) onSubmit(request)
  }

  const messages = Object.values(errors).filter(Boolean)

  return (
    <form onSubmit={handleSubmit} noValidate aria-label="Analyze a product video">
      <div className="grid gap-1 rounded-2xl border bg-card p-1.5 shadow-[0_1px_0_oklch(0.2_0.03_285/0.04),0_12px_32px_-16px_oklch(0.2_0.03_285/0.18)] md:grid-cols-[minmax(0,1fr)_200px_160px_150px_auto]">
        <Field id="video_url" label="YouTube video URL" error={errors.video_url}>
          <Input
            id="video_url"
            inputMode="url"
            autoComplete="off"
            placeholder="https://youtube.com/watch?v=…"
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            aria-invalid={Boolean(errors.video_url)}
            className={bareInput}
          />
        </Field>
        <Field id="product_name" label="Product" error={errors.product_name}>
          <Input
            id="product_name"
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={Boolean(errors.product_name)}
            className={bareInput}
          />
        </Field>
        <Field id="product_category" label="Category (optional)" error={errors.product_category}>
          <Input
            id="product_category"
            maxLength={120}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className={bareInput}
          />
        </Field>
        <Field id="comment_limit" label={`Comments · ${COMMENT_LIMIT_MIN}–${COMMENT_LIMIT_MAX}`} error={errors.comment_limit}>
          <Input
            id="comment_limit"
            type="number"
            min={COMMENT_LIMIT_MIN}
            max={COMMENT_LIMIT_MAX}
            step={1}
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            aria-invalid={Boolean(errors.comment_limit)}
            className={cn(bareInput, "tabular-nums")}
          />
        </Field>
        <Button
          type="submit"
          disabled={isLoading}
          className="h-12 rounded-xl px-5 text-sm md:h-auto"
        >
          {isLoading ? (
            <>
              <LoaderCircle className="animate-spin" aria-hidden />
              Analyzing
            </>
          ) : (
            <>
              Analyze comments
              <ArrowRight aria-hidden />
            </>
          )}
        </Button>
      </div>
      {messages.length > 0 && (
        <ul role="alert" className="mt-3 flex flex-col gap-1 pl-2 text-sm text-destructive">
          {messages.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}
    </form>
  )
}
