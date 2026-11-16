import { Suspense } from "react"
import type { Metadata } from "next"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { login } from "./actions"

export const metadata: Metadata = { title: "Sign in · Product Feedback Intelligence" }

type SearchParams = Promise<{ error?: string | string[] }>

export default function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-24">
      <Suspense fallback={<LoginForm hasError={false} />}>
        <LoginFormFromParams searchParams={searchParams} />
      </Suspense>
    </main>
  )
}

async function LoginFormFromParams({ searchParams }: { searchParams: SearchParams }) {
  return <LoginForm hasError={Boolean((await searchParams).error)} />
}

function LoginForm({ hasError }: { hasError: boolean }) {
  return (
    <form action={login} className="flex w-full max-w-sm flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-5xl leading-[0.95] tracking-[-0.02em]">Sign in</h1>
        <p className="text-muted-foreground">Enter the access code to open the dashboard.</p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="code">Access code</Label>
        <Input
          id="code"
          name="code"
          type="password"
          autoComplete="current-password"
          required
          autoFocus
          aria-invalid={hasError || undefined}
          aria-describedby={hasError ? "code-error" : undefined}
        />
        {hasError && (
          <p id="code-error" role="alert" className="text-sm text-destructive">
            That code is not right. Try again.
          </p>
        )}
      </div>
      <Button type="submit">Continue</Button>
    </form>
  )
}
