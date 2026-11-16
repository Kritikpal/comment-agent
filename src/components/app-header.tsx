import Link from "next/link"
import { ChevronRight, Play } from "lucide-react"

export type Crumb = { label: string; href?: string }

type Props = {
  /** Path after the brand, e.g. Videos › Pixel 9 review › Comments. The last crumb is the current page. */
  trail?: Crumb[]
  /** Right-aligned slot (badges, primary action). */
  children?: React.ReactNode
}

export function AppHeader({ trail = [], children }: Props) {
  return (
    <header className="flex min-h-20 flex-wrap items-center justify-between gap-x-4 gap-y-2 py-6">
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2.5">
        <Link href="/" className="flex shrink-0 items-center gap-2.5 rounded-lg focus-visible:outline-2 focus-visible:outline-ring">
          <span className="grid size-8 place-items-center rounded-lg bg-[oklch(0.58_0.23_25)] text-white shadow-sm">
            <Play className="size-3.5 fill-current" aria-hidden />
          </span>
          <span className="text-sm font-semibold tracking-tight max-sm:sr-only">Product Feedback Intelligence</span>
        </Link>
        {trail.length > 0 && (
          <ol className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
            {trail.map((crumb, index) => {
              const isLast = index === trail.length - 1
              return (
                <li key={`${crumb.label}-${index}`} className="flex min-w-0 items-center gap-1.5">
                  <ChevronRight className="size-3.5 shrink-0 opacity-60" aria-hidden />
                  {crumb.href && !isLast ? (
                    <Link href={crumb.href} className="truncate transition-colors hover:text-foreground">
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className="truncate text-foreground" aria-current={isLast ? "page" : undefined}>
                      {crumb.label}
                    </span>
                  )}
                </li>
              )
            })}
          </ol>
        )}
      </nav>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </header>
  )
}
