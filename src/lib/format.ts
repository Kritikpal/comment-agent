// Fixed locale and UTC so server-rendered and client-rendered text always match (no hydration drift).
const DATE_TIME = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
})
const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
const COUNT = new Intl.NumberFormat("en-US")
const COMPACT = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 })

export function formatDateTime(iso: string | null): string {
  return iso ? `${DATE_TIME.format(new Date(iso))} UTC` : "—"
}

export function formatDate(iso: string | null): string {
  return iso ? DATE.format(new Date(iso)) : "—"
}

export function formatCount(value: number): string {
  return COUNT.format(value)
}

/** 222698 → "222.7K"; exact value belongs in a title attribute. */
export function formatCompact(value: number): string {
  return COMPACT.format(value)
}
