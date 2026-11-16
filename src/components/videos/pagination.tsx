import Link from "next/link"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"
import { formatCount } from "@/lib/format"
import { cn } from "@/lib/utils"

type Props = { page: number; pageSize: number; total: number; totalPages: number }

/** Page numbers to show: first, last, and a window around the current page, with gaps as null. */
function pageWindow(page: number, totalPages: number): (number | null)[] {
  const pages = new Set([1, totalPages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= totalPages))
  const sorted = [...pages].sort((a, b) => a - b)
  return sorted.flatMap((p, i) => (i > 0 && p - sorted[i - 1] > 1 ? [null, p] : [p]))
}

const href = (page: number) => (page <= 1 ? "/" : `/?page=${page}`)

export function Pagination({ page, pageSize, total, totalPages }: Props) {
  if (total === 0) return null
  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)

  return (
    <nav aria-label="Video pages" className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
      <p className="tabular-nums">
        Showing <span className="text-foreground">{formatCount(from)}–{formatCount(to)}</span> of {formatCount(total)}
      </p>
      {totalPages > 1 && (
        <ul className="flex items-center gap-1">
          <li>
            <PageLink page={page - 1} disabled={page <= 1} label="Previous page">
              <ChevronLeft aria-hidden />
            </PageLink>
          </li>
          {pageWindow(page, totalPages).map((p, i) =>
            p === null ? (
              <li key={`gap-${i}`} aria-hidden className="px-1">
                …
              </li>
            ) : (
              <li key={p}>
                <PageLink page={p} current={p === page} label={`Page ${p}`}>
                  {p}
                </PageLink>
              </li>
            )
          )}
          <li>
            <PageLink page={page + 1} disabled={page >= totalPages} label="Next page">
              <ChevronRight aria-hidden />
            </PageLink>
          </li>
        </ul>
      )}
    </nav>
  )
}

type PageLinkProps = { page: number; label: string; current?: boolean; disabled?: boolean; children: React.ReactNode }

function PageLink({ page, label, current, disabled, children }: PageLinkProps) {
  const className = cn(
    buttonVariants({ variant: current ? "secondary" : "ghost", size: "icon-sm" }),
    "tabular-nums",
    disabled && "pointer-events-none opacity-40"
  )
  if (disabled) {
    return (
      <span className={className} aria-disabled="true" aria-label={label}>
        {children}
      </span>
    )
  }
  return (
    <Link href={href(page)} className={className} aria-label={label} aria-current={current ? "page" : undefined}>
      {children}
    </Link>
  )
}
