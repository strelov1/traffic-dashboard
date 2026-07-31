import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { startMigratedPostgres, type MigratedPostgres } from '../../testing/postgres.js'
import { trafficEvents } from '../../testing/traffic-events.js'
import type { TrafficRepository } from '../ports.js'
import { createTrafficRepository } from './postgres-repository.js'

describe('traffic_events as a hypertable', () => {
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

  it('is partitioned by the instant of the detection', async () => {
    const rows = await postgres.database.query(
      z.object({ column: z.string() }),
      `select d.column_name as column
       from timescaledb_information.dimensions d
       where d.hypertable_name = 'traffic_events'`,
    )

    expect(rows).toEqual([{ column: 'occurred_at' }])
  })

  it('spreads events across chunks by date', async () => {
    await postgres.database.query(
      z.unknown(),
      `insert into traffic_events (occurred_at, plate_country, vehicle_type)
       select now() - (n * interval '20 days'), 'AE', 'car'
       from generate_series(0, 5) as n`,
    )

    const rows = await postgres.database.query(
      z.object({ chunks: z.coerce.number() }),
      `select count(*) as chunks from timescaledb_information.chunks
       where hypertable_name = 'traffic_events'`,
    )

    expect(rows[0]?.chunks).toBeGreaterThan(1)
  })

  it('still addresses an event by its id alone', async () => {
    await repository.insertMany(trafficEvents(['AE', 'car', 1]))

    const [row] = await postgres.database.query(
      z.object({ id: z.string() }),
      'select id from traffic_events limit 1',
    )
    const id = row?.id ?? ''

    const updated = await repository.updateEvent(id, { plateCountry: 'SA' })

    expect(updated?.plateCountry).toBe('SA')
    await expect(repository.deleteEvent(id)).resolves.toBe(true)
  })
})
