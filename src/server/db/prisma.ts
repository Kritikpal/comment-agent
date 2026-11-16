import { readFileSync } from "node:fs"
import { PrismaPg } from "@prisma/adapter-pg"
import pg from "pg"
import { PrismaClient } from "../../generated/prisma/client.ts"

// One client per server process, kept on globalThis so dev hot reloads don't open new pools.
// The cache remembers which generated PrismaClient class built it: after `prisma generate`
// (e.g. a migration added a column) the class changes and the stale client is replaced, instead
// of failing with "Unknown field … for select statement".
type CachedClient = { client: PrismaClient; clientClass: typeof PrismaClient }
const globalForPrisma = globalThis as typeof globalThis & {
  commentAgentPrisma?: CachedClient | PrismaClient
}

/** A dev process can still hold a bare client from before this cache recorded its class. */
function isTagged(value: CachedClient | PrismaClient | undefined): value is CachedClient {
  return typeof value === "object" && value !== null && "clientClass" in value
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"])

/**
 * Local databases connect without TLS. Remote ones (e.g. Supabase) always use TLS: verified against
 * DATABASE_CA_CERT (a PEM file path, e.g. Supabase's CA from the dashboard) when set, otherwise
 * encrypted without verifying the server certificate.
 */
export function sslFor(connectionString: string): pg.PoolConfig["ssl"] {
  const host = new URL(connectionString).hostname.replace(/^\[|\]$/g, "")
  if (LOCAL_HOSTS.has(host)) return undefined
  const caPath = process.env.DATABASE_CA_CERT
  return caPath ? { ca: readFileSync(caPath, "utf8"), rejectUnauthorized: true } : { rejectUnauthorized: false }
}

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error("DATABASE_URL is not set")
  const pool = new pg.Pool({
    connectionString,
    ssl: sslFor(connectionString),
    max: 5,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    // Client-side timeout: a stalled database fails fast instead of hanging requests. Server-side
    // statement/idle timeouts are left out: they're sent as startup parameters, which
    // transaction-mode poolers (Supabase on port 6543, PgBouncer) can reject.
    query_timeout: 10_000,
  })
  // Without a listener, an idle client dropped by Postgres is an uncaught error that kills the server.
  pool.on("error", (error) => console.error("[pg] idle client error", error.message))
  return new PrismaClient({ adapter: new PrismaPg(pool) })
}

/** Lazily created, so importing this module never connects (builds stay database-free). */
export function getPrisma(): PrismaClient {
  const cached = globalForPrisma.commentAgentPrisma
  if (isTagged(cached) && cached.clientClass === PrismaClient) return cached.client
  const stale = isTagged(cached) ? cached.client : cached
  if (stale) void stale.$disconnect().catch(() => undefined)
  const client = createClient()
  globalForPrisma.commentAgentPrisma = { client, clientClass: PrismaClient }
  return client
}
