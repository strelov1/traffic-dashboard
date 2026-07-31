import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { startMigratedPostgres, type MigratedPostgres } from '../testing/postgres.js'
import { createTrafficRepository, type TrafficRepository } from './repository.js'
import { seedTrafficEvents } from './seed.js'
import { VEHICLE_TYPES } from './vehicle-types.js'

const groupCount = z.object({ key: z.string(), total: z.coerce.number() })

describe('seedTrafficEvents', () => {
  let postgres: MigratedPostgres
  let repository: TrafficRepository

  beforeAll(async () => {
    postgres = await startMigratedPostgres()
    repository = createTrafficRepository(postgres.database)
  })

  afterAll(() => postgres.stop())

  beforeEach(async () => {
    await postgres.database.query(z.unknown(), 'truncate traffic_events')
  })

  it('writes exactly the requested number of events', async () => {
    const written = await seedTrafficEvents(postgres.database, repository, { events: 500 })

    expect(written).toBe(500)
    await expect(repository.countEvents()).resolves.toBe(500)
  })

  it('writes nothing when the table already holds events', async () => {
    await seedTrafficEvents(postgres.database, repository, { events: 100 })

    const written = await seedTrafficEvents(postgres.database, repository, { events: 100 })

    expect(written).toBe(0)
    await expect(repository.countEvents()).resolves.toBe(100)
  })

  it('spreads events over more than one country, unevenly', async () => {
    await seedTrafficEvents(postgres.database, repository, { events: 5_000 })

    const rows = await postgres.database.query(
      groupCount,
      `select plate_country as key, count(*) as total
       from traffic_events group by plate_country order by total desc`,
    )

    expect(rows.length).toBeGreaterThan(1)
    // Uniform data would make every bar the same height and would let a query
    // plan assume an even selectivity production never has.
    expect(rows[0]?.total).toBeGreaterThan((rows.at(-1)?.total ?? 0) * 2)
  })

  it('produces every vehicle type, with cars the most numerous', async () => {
    await seedTrafficEvents(postgres.database, repository, { events: 5_000 })

    const rows = await postgres.database.query(
      groupCount,
      `select vehicle_type as key, count(*) as total
       from traffic_events group by vehicle_type order by total desc`,
    )

    expect(rows.map((it) => it.key).sort()).toEqual([...VEHICLE_TYPES].sort())
    expect(rows[0]?.key).toBe('car')
  })

  it('spreads events over more than one day', async () => {
    await seedTrafficEvents(postgres.database, repository, { events: 5_000 })

    const rows = await postgres.database.query(
      z.object({ days: z.coerce.number() }),
      'select count(distinct date_trunc(\'day\', occurred_at)) as days from traffic_events',
    )

    expect(rows[0]?.days).toBeGreaterThan(1)
  })

  it('writes only events the constraints accept', async () => {
    await seedTrafficEvents(postgres.database, repository, { events: 1_000 })

    const rows = await postgres.database.query(
      z.object({ bad: z.coerce.number() }),
      `select count(*) as bad from traffic_events
       where plate_country !~ '^[A-Z]{2}$'`,
    )

    expect(rows[0]?.bad).toBe(0)
  })
})
