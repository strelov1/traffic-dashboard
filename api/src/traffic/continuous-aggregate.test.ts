import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { startMigratedPostgres, type MigratedPostgres } from '../testing/postgres.js'
import { eventsAt, trafficEvents } from '../testing/traffic-events.js'
import { createTrafficRepository, type TrafficRepository } from './repository.js'

// Refreshes the way the policy does: a whole bucket back, so the current bucket
// is never materialised. A refresh window is expanded to bucket boundaries, so
// a shorter offset would materialise the current hour and hide every detection
// recorded since — the failure the spike reproduced.
const REFRESH = `call refresh_continuous_aggregate('traffic_hourly_totals', null, now() - interval '1 hour')`

describe('hourly totals as a continuous aggregate', () => {
  let postgres: MigratedPostgres
  let repository: TrafficRepository

  beforeAll(async () => {
    postgres = await startMigratedPostgres()
    repository = createTrafficRepository(postgres.database)
  })

  afterAll(() => postgres.stop())

  beforeEach(async () => {
    await postgres.database.query(z.unknown(), 'truncate traffic_events')
    await postgres.database.query(z.unknown(), REFRESH)
  })

  async function countedDirectly(): Promise<{ plateCountry: string; total: number }[]> {
    return postgres.database.query(
      z.object({ plateCountry: z.string(), total: z.coerce.number() }),
      `select plate_country as "plateCountry", count(*) as total
       from traffic_events group by plate_country order by total desc, plate_country asc`,
    )
  }

  it('matches what counting the events directly would give', async () => {
    await repository.insertMany(trafficEvents(['AE', 'car', 5], ['SA', 'bus', 2]))

    await expect(repository.totalsByCountry()).resolves.toEqual(await countedDirectly())
  })

  it('still matches after the materialised part has been refreshed', async () => {
    await postgres.database.query(
      z.unknown(),
      `insert into traffic_events (occurred_at, plate_country, vehicle_type)
       select now() - (n * interval '1 day'), 'AE', 'car' from generate_series(1, 5) as n`,
    )

    await postgres.database.query(z.unknown(), REFRESH)

    await expect(repository.totalsByCountry()).resolves.toEqual(await countedDirectly())
  })

  it('counts a detection recorded now, even once older days are materialised', async () => {
    await postgres.database.query(
      z.unknown(),
      `insert into traffic_events (occurred_at, plate_country, vehicle_type)
       select now() - (n * interval '1 day'), 'AE', 'car' from generate_series(1, 5) as n`,
    )
    await postgres.database.query(z.unknown(), REFRESH)

    const before = await repository.totalsByCountry()
    await repository.insertMany(trafficEvents(['AE', 'car', 1]))
    const after = await repository.totalsByCountry()

    expect((after[0]?.total ?? 0) - (before[0]?.total ?? 0)).toBe(1)
  })

  it('splits totals by vehicle type from the same aggregate', async () => {
    await repository.insertMany(trafficEvents(['AE', 'car', 4], ['SA', 'bus', 1]))

    await expect(repository.totalsByVehicleType()).resolves.toEqual([
      { vehicleType: 'car', total: 4 },
      { vehicleType: 'bus', total: 1 },
    ])
  })

  it('does not count a detection landing in an already materialised hour', async () => {
    const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

    await repository.insertMany(eventsAt(lastWeek, ['AE', 'car', 1]))
    await postgres.database.query(z.unknown(), REFRESH)

    // Recorded late, into a day the aggregate has already summarised. It is in
    // the events and not in the totals until that day is refreshed again — the
    // bound the refresh policy's trailing window exists to set.
    await repository.insertMany(eventsAt(lastWeek, ['AE', 'car', 1]))

    await expect(repository.totalsByCountry()).resolves.toEqual([
      { plateCountry: 'AE', total: 1 },
    ])
    await expect(repository.countEvents()).resolves.toBe(2)
  })

  it('counts it once the trailing window is refreshed', async () => {
    const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

    await repository.insertMany(eventsAt(lastWeek, ['AE', 'car', 1]))
    await postgres.database.query(z.unknown(), REFRESH)
    await repository.insertMany(eventsAt(lastWeek, ['AE', 'car', 1]))

    await postgres.database.query(z.unknown(), REFRESH)

    await expect(repository.totalsByCountry()).resolves.toEqual([
      { plateCountry: 'AE', total: 2 },
    ])
  })

  it('stops counting a removed detection', async () => {
    await repository.insertMany(trafficEvents(['AE', 'car', 1]))

    const [row] = await postgres.database.query(
      z.object({ id: z.string() }),
      'select id from traffic_events limit 1',
    )
    await repository.deleteEvent(row?.id ?? '')

    await expect(repository.totalsByCountry()).resolves.toEqual([])
  })
})
