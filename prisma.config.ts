import { defineConfig } from "prisma/config"

// Prisma 7 no longer reads .env on its own; the CLI needs the URLs from it.
try {
  process.loadEnvFile()
} catch {
  // No .env file: the URLs must come from the real environment.
}

// The CLI (migrate, introspection) needs a session-level connection: on Supabase that's DIRECT_URL
// (session pooler, port 5432), because the app's transaction pooler (6543) can't run migrations.
// Without DIRECT_URL (e.g. a local database), DATABASE_URL works for both.
const url = process.env.DIRECT_URL || process.env.DATABASE_URL
if (!url) throw new Error("Set DIRECT_URL or DATABASE_URL for the Prisma CLI")

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url },
})
