import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

import { runner } from 'node-pg-migrate'

// Resolved against this module's own location, in dist/ as much as in src/ —
// so the number of hops is a function of where this file sits. Both trees put
// it two levels below the package root: src/platform/ and dist/platform/.
// The test that applies this directory asserts the schema exists afterwards,
// because an empty or missing directory would otherwise be a successful run.
export const MIGRATIONS_DIRECTORY = fileURLToPath(new URL('../../migrations', import.meta.url))

export type MigrateOptions = {
  databaseUrl: string
  directory: string
  connectRetryForMs?: number
  connectRetryDelayMs?: number
}

const DEFAULT_RETRY_FOR_MS = 30_000
const DEFAULT_RETRY_DELAY_MS = 500

// Postgres accepts TCP connections before it will serve queries, so a container
// that is up is not yet a database that is ready.
const CONNECTION_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ETIMEDOUT',
  '57P03',
])

export async function migrateToLatest(options: MigrateOptions): Promise<void> {
  const retryForMs = options.connectRetryForMs ?? DEFAULT_RETRY_FOR_MS
  const retryDelayMs = options.connectRetryDelayMs ?? DEFAULT_RETRY_DELAY_MS
  const deadline = Date.now() + retryForMs

  for (;;) {
    try {
      await runner({
        databaseUrl: options.databaseUrl,
        dir: options.directory,
        direction: 'up',
        migrationsTable: 'pgmigrations',
        count: Number.POSITIVE_INFINITY,
        log: () => undefined,
      })

      return
    } catch (error: unknown) {
      // A broken migration will never succeed on retry; only an unreachable
      // database is worth waiting out.
      if (!isConnectionError(error) || Date.now() >= deadline) {
        throw error
      }

      await delay(retryDelayMs)
    }
  }
}

function isConnectionError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }

  const code: unknown = (error as { code?: unknown }).code

  return typeof code === 'string' && CONNECTION_ERROR_CODES.has(code)
}
