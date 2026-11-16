"use client"

import { useState, type FormEvent, type ReactElement } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { LoaderCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { apiRequest, ApiRequestError } from "@/lib/api-client"
import { cn } from "@/lib/utils"
import {
  COMMENT_LIMIT_PER_FETCH_DEFAULT,
  COMMENT_LIMIT_PER_FETCH_MAX,
  COMMENT_LIMIT_PER_FETCH_MIN,
  NOTES_MAX,
  type VideoDto,
} from "@/lib/video-types"
import { parseCreateVideo, parseUpdateVideo, type VideoFieldErrors } from "@/lib/video-validation"

type Props = {
  mode: "add" | "edit"
  /** Required in edit mode. */
  video?: VideoDto
  /** The element that opens the dialog. */
  trigger: ReactElement
}

type FieldProps = { id: string; label: string; hint?: string; error?: string; children: React.ReactNode }

function Field({ id, label, hint, error, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      ) : (
        hint && <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  )
}

const textareaClass =
  "min-h-20 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm"

export function VideoFormDialog({ mode, video, trigger }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState(video?.url ?? "")
  const [name, setName] = useState(video?.product.name ?? "")
  const [category, setCategory] = useState(video?.product.category ?? "")
  const [notes, setNotes] = useState(video?.notes ?? "")
  const [limit, setLimit] = useState(String(video?.comment_limit ?? COMMENT_LIMIT_PER_FETCH_DEFAULT))
  const [errors, setErrors] = useState<VideoFieldErrors>({})
  const [formError, setFormError] = useState<{ message: string; existingId: string | null } | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  function reset() {
    setUrl(video?.url ?? "")
    setName(video?.product.name ?? "")
    setCategory(video?.product.category ?? "")
    setNotes(video?.notes ?? "")
    setLimit(String(video?.comment_limit ?? COMMENT_LIMIT_PER_FETCH_DEFAULT))
    setErrors({})
    setFormError(null)
  }

  function handleOpenChange(next: boolean) {
    if (isSaving) return
    if (next) reset()
    setOpen(next)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    const shared = {
      product: { name, category: category.trim() || (mode === "edit" ? null : undefined) },
      notes: notes.trim() || (mode === "edit" ? null : undefined),
      comment_limit: Number(limit),
    }
    const body = mode === "add" ? { ...shared, video_url: url } : shared
    const found = mode === "add" ? parseCreateVideo(body).errors : parseUpdateVideo(body).errors
    setErrors(found)
    if (Object.keys(found).length > 0) return

    setIsSaving(true)
    try {
      if (mode === "add") await apiRequest<VideoDto>("/api/v1/videos", { method: "POST", body })
      else await apiRequest<VideoDto>(`/api/v1/videos/${video?.id}`, { method: "PATCH", body })
      setOpen(false)
      router.refresh()
    } catch (error) {
      if (error instanceof ApiRequestError) {
        setErrors((error.fields ?? {}) as VideoFieldErrors)
        setFormError({ message: error.message, existingId: error.code === "VIDEO_EXISTS" ? error.videoId : null })
      } else {
        setFormError({ message: "Something went wrong. Please try again.", existingId: null })
      }
    } finally {
      setIsSaving(false)
    }
  }

  const isAdd = mode === "add"

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle className="font-display text-3xl font-normal">{isAdd ? "Add a video" : "Edit video details"}</DialogTitle>
            <DialogDescription>
              {isAdd
                ? "Paste a YouTube link and describe the product. The newest comments are fetched right away."
                : "Changes are saved straight away. The video link can't change; add a new video for a different link."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <Field id="video-url" label="YouTube URL" error={errors.video_url} hint={isAdd ? "watch, youtu.be or shorts link" : undefined}>
              <Input
                id="video-url"
                inputMode="url"
                autoComplete="off"
                placeholder="https://youtube.com/watch?v=…"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                readOnly={!isAdd}
                aria-invalid={Boolean(errors.video_url)}
                aria-describedby={errors.video_url ? "video-url-error" : undefined}
                className={cn(!isAdd && "bg-muted text-muted-foreground")}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]">
              <Field id="product-name" label="Product" error={errors.product_name}>
                <Input
                  id="product-name"
                  maxLength={120}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  aria-invalid={Boolean(errors.product_name)}
                />
              </Field>
              <Field id="product-category" label="Category (optional)" error={errors.product_category}>
                <Input
                  id="product-category"
                  maxLength={120}
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  aria-invalid={Boolean(errors.product_category)}
                />
              </Field>
            </div>
            <Field id="video-notes" label="Notes (optional)" error={errors.notes}>
              <textarea
                id="video-notes"
                maxLength={NOTES_MAX}
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                aria-invalid={Boolean(errors.notes)}
                className={textareaClass}
              />
            </Field>
            <Field
              id="comment-limit"
              label="Comments per fetch"
              error={errors.comment_limit}
              hint={`Newest first, ${COMMENT_LIMIT_PER_FETCH_MIN}–${COMMENT_LIMIT_PER_FETCH_MAX}. Each fetch stops at comments already stored.`}
            >
              <Input
                id="comment-limit"
                type="number"
                min={COMMENT_LIMIT_PER_FETCH_MIN}
                max={COMMENT_LIMIT_PER_FETCH_MAX}
                step={1}
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                aria-invalid={Boolean(errors.comment_limit)}
                className="w-32 tabular-nums"
              />
            </Field>
          </div>

          {formError && (
            <p role="alert" className="rounded-lg bg-destructive/8 px-3 py-2 text-sm text-destructive">
              {formError.message}
              {formError.existingId && (
                <>
                  {" "}
                  <Link href={`/videos/${formError.existingId}/comments`} className="font-medium underline underline-offset-4">
                    Open it
                  </Link>
                </>
              )}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving && <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />}
              {isSaving ? (isAdd ? "Adding and fetching…" : "Saving…") : isAdd ? "Add video" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
