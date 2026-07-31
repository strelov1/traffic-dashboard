import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { z } from 'zod'

import { createDatabase, type Database } from '../platform/database.js'
import { migrateToLatest, MIGRATIONS_DIRECTORY } from '../platform/migrate.js'

// TimescaleDB is a Postgres extension, so the container behaves like Postgres;
// pointing the suites at the image the project ships keeps them honest.
export const POSTGRES_IMAGE = 'timescale/timescaledb:2.29.0-pg17'

export type MigratedPostgres = {
  container: StartedPostgreSqlContainer
  database: Database
  databaseUrl: string
  stop: () => Promise<void>
}

/** A throwaway Postgres with the project's own migrations already applied. */
export async function startMigratedPostgres(): Promise<MigratedPostgres> {
  const container = await new PostgreSqlContainer(POSTGRES_IMAGE).start()
  const databaseUrl = container.getConnectionUri()

  await migrateToLatest({ databaseUrl, directory: MIGRATIONS_DIRECTORY })

  const database = createDatabase(databaseUrl)

  // The refresh policy schedules a background job that fires soon after it is
  // registered and collides with a suite's own refresh. Suites drive refresh
  // explicitly instead; that the policy is registered with the right offsets is
  // asserted separately, on a container of its own.
  await database.query(
    z.unknown(),
    `select delete_job(job_id) from timescaledb_information.jobs
     where proc_name = 'policy_refresh_continuous_aggregate'`,
  )

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
