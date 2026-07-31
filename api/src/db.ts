import pg from 'pg'
import { z } from 'zod'

export type Database = {
  query: <T>(shape: z.ZodType<T>, sql: string, params?: unknown[]) => Promise<T[]>
  isReachable: () => Promise<boolean>
  close: () => Promise<void>
}

export function createDatabase(databaseUrl: string): Database {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 2_000,
  })

  // Without a listener, a backend dropping an idle client crashes the process.
  pool.on('error', () => undefined)

  return {
    // A parameter, not a type argument: a generic would only be an assertion,
    // and a renamed column would reach the caller as undefined.
    query: async <T>(shape: z.ZodType<T>, sql: string, params?: unknown[]) => {
      const result = await pool.query(sql, params)
      const rows = z.array(shape).safeParse(result.rows)

      if (!rows.success) {
        throw new Error(`query returned rows of an unexpected shape: ${describeMismatch(rows.error)}`)
      }

      return rows.data
    },

    isReachable: async () => {
      try {
        await pool.query('select 1')

        return true
      } catch {
        return false
      }
    },

    close: () => pool.end(),
  }
}

function describeMismatch(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join('.') || '<row>'}: ${issue.message}`)
    .join('; ')
}
