import { defineConfig, env } from "prisma/config"

// Prisma 7 no longer reads .env on its own; the CLI needs DATABASE_URL from it.
try {
  process.loadEnvFile()
} catch {
  // No .env file: DATABASE_URL must come from the real environment.
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: env("DATABASE_URL") },
})
