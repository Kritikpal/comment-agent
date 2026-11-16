export const RATE_LIMIT_WINDOW_MS = 60_000
export const RATE_LIMIT_MAX = 10
/** Hard cap on tracked clients, so rotating spoofed IPs can't grow memory without bound. */
export const MAX_TRACKED_CLIENTS = 10_000

// ponytail: in-memory fixed window, per server instance. Move to a shared store
// (Redis/Upstash) once the app runs on more than one instance.
const windows = new Map<string, { count: number; resetAt: number }>()
let lastPruneAt = 0

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number }

function makeRoom(now: number): void {
  if (windows.size < MAX_TRACKED_CLIENTS) return
  // Full scan at most once per window; otherwise evict the oldest entry (Map keeps insertion order).
  if (now - lastPruneAt >= RATE_LIMIT_WINDOW_MS) {
    lastPruneAt = now
    for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k)
  }
  if (windows.size >= MAX_TRACKED_CLIENTS) {
    const oldest = windows.keys().next().value
    if (oldest !== undefined) windows.delete(oldest)
  }
}

export function checkRateLimit(key: string, now: number = Date.now()): RateLimitResult {
  const current = windows.get(key)
  if (!current || current.resetAt <= now) {
    if (!current) makeRoom(now)
    windows.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return { ok: true }
  }
  if (current.count >= RATE_LIMIT_MAX) {
    return { ok: false, retryAfterSeconds: Math.ceil((current.resetAt - now) / 1000) }
  }
  windows.set(key, { count: current.count + 1, resetAt: current.resetAt })
  return { ok: true }
}

/** Number of clients currently tracked. Exposed for tests. */
export function trackedClients(): number {
  return windows.size
}

/**
 * Client IP for rate limiting. Prefers `x-real-ip` (set by Vercel and typical nginx configs),
 * then the last `x-forwarded-for` hop, which is the one the nearest proxy appended. The first hop
 * is client-controlled whenever a proxy appends rather than overwrites, so it is never used.
 * Without a proxy, every caller shares the "unknown" bucket.
 */
export function clientKey(headers: Headers): string {
  const realIp = headers.get("x-real-ip")?.trim()
  if (realIp) return realIp
  const lastHop = headers.get("x-forwarded-for")?.split(",").at(-1)?.trim()
  return lastHop || "unknown"
}
