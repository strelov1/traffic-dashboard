import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { createDatabase, type Database } from '../../platform/database.js'
import { migrateToLatest, MIGRATIONS_DIRECTORY } from '../../platform/migrate.js'
import { POSTGRES_IMAGE } from '../../testing/postgres.js'

/**
 * A container of its own, because every other suite deletes the policy's job to
 * stop it colliding with an explicit refresh — which also deletes the thing this
 * suite is about. `testing/postgres.ts` promises exactly this test exists.
 *
 * These three numbers are the whole freshness contract, and nothing else fails
 * when they change: no type, no query, and no other assertion. `end_offset` in
 * particular is a whole bucket on purpose — a shorter one would materialise the
 * current hour and hide every detection recorded into it.
 */
describe('the continuous aggregate refresh policy as registered', () => {
  let container: StartedPostgreSqlContainer
  let database: Database

  beforeAll(async () => {
    container = await new PostgreSqlContainer(POSTGRES_IMAGE).start()
    await migrateToLatest({ databaseUrl: container.getConnectionUri(), directory: MIGRATIONS_DIRECTORY })
    database = createDatabase(container.getConnectionUri())
  }, 120_000)

  afterAll(async () => {
    await database.close()
    await container.stop()
  })

  it('is registered against the hourly totals, exactly once', async () => {
    const rows = await database.query(
      z.object({ hypertable: z.string() }),
      `select hypertable_name as hypertable from timescaledb_information.jobs
       where proc_name = 'policy_refresh_continuous_aggregate'`,
    )

    expect(rows).toHaveLength(1)
    expect(rows[0]?.hypertable).toContain('traffic_hourly_totals')
  })

  it('trails seven days, stops a whole bucket short of now, and runs every five minutes', async () => {
    const rows = await database.query(
      z.object({
        startOffset: z.string(),
        endOffset: z.string(),
        scheduleInterval: z.string(),
      }),
      `select (config->>'start_offset')::interval::text as "startOffset",
              (config->>'end_offset')::interval::text as "endOffset",
              schedule_interval::text as "scheduleInterval"
       from timescaledb_information.jobs
       where proc_name = 'policy_refresh_continuous_aggregate'`,
    )

    expect(rows).toEqual([
      {
        startOffset: '7 days',
        endOffset: '01:00:00',
        scheduleInterval: '00:05:00',
      },
    ])
  })
})
