import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { startMigratedPostgres, type MigratedPostgres } from '../../testing/postgres.js'
import { VEHICLE_TYPES } from '../domain/vehicle-type.js'
import type { TrafficRepository } from '../ports.js'
import { createTrafficRepository } from './postgres-repository.js'
import { backfillHourlyTotals, seedTrafficEvents } from './seed.js'

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

  // What the refresh policy does: materialise its trailing window and move the
  // watermark to the present. Anything older is then neither materialised nor
  // served live, so it vanishes from every total unless it was backfilled.
  async function runPolicyOnce(): Promise<void> {
    await postgres.database.query(
      z.unknown(),
      `call refresh_continuous_aggregate('traffic_hourly_totals',
         now() - interval '7 days', now() - interval '1 hour')`,
    )
  }

  async function materialisedTotal(): Promise<number> {
    const [row] = await postgres.database.query(
      z.object({ counted: z.coerce.number() }),
      'select coalesce(sum(total), 0) as counted from traffic_hourly_totals',
    )

    return row?.counted ?? 0
  }

  it('makes every seeded event visible through the aggregate, not just recent ones', async () => {
    await seedTrafficEvents(postgres.database, repository, { events: 5_000 })
    await backfillHourlyTotals(postgres.database)

    await runPolicyOnce()

    // The seed spreads events over a month; the policy only maintains a trailing
    // window, so without the backfill the older weeks are in the table and
    // absent from every total.
    expect(await materialisedTotal()).toBe(5_000)
  })

  // The reason the backfill is not part of the seed. A database the seed never
  // touched — because it was already populated, or because SEED_EVENTS was 0 —
  // still needs materialising once, and reads correctly until the policy first
  // moves the watermark and silently drops everything older than its window.
  it('materialises history the seed did not write', async () => {
    await postgres.database.query(
      z.unknown(),
      `insert into traffic_events (occurred_at, plate_country, vehicle_type)
       select now() - (n * interval '1 day'), 'AE', 'car' from generate_series(1, 20) as n`,
    )

    await backfillHourlyTotals(postgres.database)
    await runPolicyOnce()

    expect(await materialisedTotal()).toBe(20)
  })

  // Rows written into the aggregate's own storage. Asserting the totals are
  // unchanged would not distinguish "did nothing" from "rebuilt all thirty days
  // to the same numbers", and the claim being made is about cost.
  async function rowsWrittenIntoStorage(): Promise<number> {
    await postgres.database.query(z.unknown(), 'select pg_stat_force_next_flush()')

    const [row] = await postgres.database.query(
      z.object({ inserted: z.coerce.number() }),
      `select coalesce(sum(n_tup_ins), 0) as inserted
       from pg_stat_all_tables where schemaname = '_timescaledb_internal'`,
    )

    return row?.inserted ?? 0
  }

  it('writes nothing on a repeat run, because the invalidation log is empty', async () => {
    await seedTrafficEvents(postgres.database, repository, { events: 1_000 })
    await backfillHourlyTotals(postgres.database)

    const before = await rowsWrittenIntoStorage()
    await backfillHourlyTotals(postgres.database)

    expect(await rowsWrittenIntoStorage()).toBe(before)
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
