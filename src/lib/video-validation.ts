import { parseVideoId } from "./analytics.ts"
import {
  COMMENT_LIMIT_PER_FETCH_DEFAULT,
  COMMENT_LIMIT_PER_FETCH_MAX,
  COMMENT_LIMIT_PER_FETCH_MIN,
  NOTES_MAX,
} from "./video-types.ts"

const PRODUCT_MAX = 120

export type VideoFieldErrors = Partial<
  Record<"video_url" | "product_name" | "product_category" | "notes" | "comment_limit", string>
>

export interface CreateVideoInput {
  url: string
  youtubeVideoId: string
  productName: string
  productCategory: string | null
  notes: string | null
  commentLimit: number
}

export interface UpdateVideoInput {
  productName?: string
  productCategory?: string | null
  notes?: string | null
  commentLimit?: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** undefined = not sent, null = cleared, string = trimmed value. Non-strings are an error. */
function optionalText(value: unknown): string | null | undefined | false {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value !== "string") return false
  const text = value.trim()
  return text === "" ? null : text
}

function checkLimit(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return "Whole number."
  if (value < COMMENT_LIMIT_PER_FETCH_MIN || value > COMMENT_LIMIT_PER_FETCH_MAX) {
    return `Whole number from ${COMMENT_LIMIT_PER_FETCH_MIN} to ${COMMENT_LIMIT_PER_FETCH_MAX}.`
  }
  return null
}

function checkProductName(value: unknown): { name?: string; error?: string } {
  const name = typeof value === "string" ? value.trim() : ""
  if (!name) return { error: "Product name is required." }
  if (name.length > PRODUCT_MAX) return { error: `Keep it under ${PRODUCT_MAX} characters.` }
  return { name }
}

function checkOptional(value: unknown, max: number, label: string, errors: VideoFieldErrors, key: keyof VideoFieldErrors) {
  const text = optionalText(value)
  if (text === false) errors[key] = `${label} must be text.`
  else if (text && text.length > max) errors[key] = `Keep it under ${max} characters.`
  return text === false ? undefined : text
}

export function parseCreateVideo(body: unknown): { input: CreateVideoInput | null; errors: VideoFieldErrors } {
  const raw = isRecord(body) ? body : {}
  const product = isRecord(raw.product) ? raw.product : {}
  const errors: VideoFieldErrors = {}

  const url = typeof raw.video_url === "string" ? raw.video_url.trim() : ""
  const youtubeVideoId = parseVideoId(url)
  if (!youtubeVideoId) errors.video_url = "Enter a public YouTube video URL (watch, youtu.be or shorts)."

  const name = checkProductName(product.name)
  if (name.error) errors.product_name = name.error
  const category = checkOptional(product.category, PRODUCT_MAX, "Category", errors, "product_category")
  const notes = checkOptional(raw.notes, NOTES_MAX, "Notes", errors, "notes")

  const commentLimit = raw.comment_limit === undefined ? COMMENT_LIMIT_PER_FETCH_DEFAULT : raw.comment_limit
  const limitError = checkLimit(commentLimit)
  if (limitError) errors.comment_limit = limitError

  if (Object.keys(errors).length > 0 || !youtubeVideoId || !name.name) return { input: null, errors }
  return {
    input: {
      // Canonical link, never the raw input (which may lack a scheme or carry credentials).
      url: `https://www.youtube.com/watch?v=${youtubeVideoId}`,
      youtubeVideoId,
      productName: name.name,
      productCategory: category ?? null,
      notes: notes ?? null,
      commentLimit: commentLimit as number,
    },
    errors,
  }
}

/** Partial update: only fields present in the body change. The URL is never editable. */
export function parseUpdateVideo(body: unknown): { input: UpdateVideoInput | null; errors: VideoFieldErrors } {
  const raw = isRecord(body) ? body : {}
  const errors: VideoFieldErrors = {}
  const input: UpdateVideoInput = {}

  if (raw.video_url !== undefined) errors.video_url = "The video URL can't be changed. Add it as a new video instead."

  if (raw.product !== undefined) {
    if (!isRecord(raw.product)) {
      errors.product_name = "Product must be an object."
    } else {
      if (raw.product.name !== undefined) {
        const name = checkProductName(raw.product.name)
        if (name.error) errors.product_name = name.error
        else input.productName = name.name
      }
      if (raw.product.category !== undefined) {
        const category = checkOptional(raw.product.category, PRODUCT_MAX, "Category", errors, "product_category")
        if (category !== undefined) input.productCategory = category
      }
    }
  }
  if (raw.notes !== undefined) {
    const notes = checkOptional(raw.notes, NOTES_MAX, "Notes", errors, "notes")
    if (notes !== undefined) input.notes = notes
  }
  if (raw.comment_limit !== undefined) {
    const limitError = checkLimit(raw.comment_limit)
    if (limitError) errors.comment_limit = limitError
    else input.commentLimit = raw.comment_limit as number
  }

  if (Object.keys(errors).length > 0) return { input: null, errors }
  if (Object.keys(input).length === 0) return { input: null, errors: { product_name: "Nothing to update." } }
  return { input, errors }
}
