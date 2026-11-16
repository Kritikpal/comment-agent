/** Keyset cursor for the comment list: the (publishedAt, id) of the last row on the page. */
export interface CommentCursor {
  publishedAt: Date
  id: string
}

export function encodeCursor(cursor: CommentCursor): string {
  return Buffer.from(`${cursor.publishedAt.toISOString()}|${cursor.id}`, "utf8").toString("base64url")
}

/** Returns null for anything that isn't a cursor this API issued. */
export function decodeCursor(value: string): CommentCursor | null {
  if (!/^[A-Za-z0-9_-]{1,512}$/.test(value)) return null
  const decoded = Buffer.from(value, "base64url").toString("utf8")
  const separator = decoded.indexOf("|")
  if (separator < 1) return null
  const iso = decoded.slice(0, separator)
  const publishedAt = new Date(iso)
  const id = decoded.slice(separator + 1)
  // Exact round-trip only: rejects out-of-range or odd dates Postgres would choke on (a 502),
  // and IDs that aren't YouTube comment IDs.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(iso)) return null
  if (Number.isNaN(publishedAt.getTime()) || publishedAt.toISOString() !== iso) return null
  if (!/^[\w.-]{1,128}$/.test(id)) return null
  return { publishedAt, id }
}
