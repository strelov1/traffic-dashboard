import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'

import { createDatabase, type Database } from '../db.js'
import { migrateToLatest, MIGRATIONS_DIRECTORY } from '../migrate.js'

export type MigratedPostgres = {
  container: StartedPostgreSqlContainer
  database: Database
  databaseUrl: string
  stop: () => Promise<void>
}

/** A throwaway Postgres with the project's own migrations already applied. */
export async function startMigratedPostgres(): Promise<MigratedPostgres> {
  const container = await new PostgreSqlContainer('postgres:17-alpine').start()
  const databaseUrl = container.getConnectionUri()

  await migrateToLatest({ databaseUrl, directory: MIGRATIONS_DIRECTORY })

  const database = createDatabase(databaseUrl)

  return {
    container,
    database,
    databaseUrl,
    stop: async () => {
      await database.close()
      await container.stop()
    },
  }
}
