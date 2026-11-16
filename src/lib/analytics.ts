const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
])
const VIDEO_ID = /^[\w-]{3,20}$/

/** Returns the video ID of a YouTube watch/shorts/embed/youtu.be URL, or null. */
export function parseVideoId(input: string): string | null {
  const raw = input.trim()
  if (!raw) return null
  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
  } catch {
    return null
  }
  if (!YOUTUBE_HOSTS.has(url.hostname.toLowerCase())) return null

  const [first, second] = url.pathname.split("/").filter(Boolean)
  const id =
    url.hostname === "youtu.be"
      ? first
      : first === "watch"
        ? url.searchParams.get("v")
        : first === "shorts" || first === "embed" || first === "live"
          ? second
          : null
  return id && VIDEO_ID.test(id) ? id : null
}

export function percent(part: number, total: number): number {
  return total === 0 ? 0 : Math.round((part / total) * 100)
}
