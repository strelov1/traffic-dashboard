import pg from 'pg'

export type Database = {
  query: <T extends pg.QueryResultRow>(sql: string, params?: unknown[]) => Promise<T[]>
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
    query: async <T extends pg.QueryResultRow>(sql: string, params?: unknown[]) => {
      const result = await pool.query<T>(sql, params)

      return result.rows
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
