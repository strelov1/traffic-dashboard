import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { startMigratedPostgres, type MigratedPostgres } from '../../testing/postgres.js'
import { eventsAt, trafficEvents } from '../../testing/traffic-events.js'
import type { TrafficEvent } from '../domain/detection.js'
import { UNBOUNDED } from '../domain/period.js'
import type { TrafficRepository } from '../ports.js'
import { createTrafficRepository } from './postgres-repository.js'

const hour = (iso: string) => new Date(iso)

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

    await expect(repository.totalsByCountry(UNBOUNDED)).resolves.toEqual(await countedDirectly())
  })

  it('still matches after the materialised part has been refreshed', async () => {
    await postgres.database.query(
      z.unknown(),
      `insert into traffic_events (occurred_at, plate_country, vehicle_type)
       select now() - (n * interval '1 day'), 'AE', 'car' from generate_series(1, 5) as n`,
    )

    await postgres.database.query(z.unknown(), REFRESH)

    await expect(repository.totalsByCountry(UNBOUNDED)).resolves.toEqual(await countedDirectly())
  })

  it('counts a detection recorded now, even once older days are materialised', async () => {
    await postgres.database.query(
      z.unknown(),
      `insert into traffic_events (occurred_at, plate_country, vehicle_type)
       select now() - (n * interval '1 day'), 'AE', 'car' from generate_series(1, 5) as n`,
    )
    await postgres.database.query(z.unknown(), REFRESH)

    const before = await repository.totalsByCountry(UNBOUNDED)
    await repository.insertMany(trafficEvents(['AE', 'car', 1]))
    const after = await repository.totalsByCountry(UNBOUNDED)

    expect((after[0]?.total ?? 0) - (before[0]?.total ?? 0)).toBe(1)
  })

  it('splits totals by vehicle type from the same aggregate', async () => {
    await repository.insertMany(trafficEvents(['AE', 'car', 4], ['SA', 'bus', 1]))

    await expect(repository.totalsByVehicleType(UNBOUNDED)).resolves.toEqual([
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

    await expect(repository.totalsByCountry(UNBOUNDED)).resolves.toEqual([
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

    await expect(repository.totalsByCountry(UNBOUNDED)).resolves.toEqual([
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

    await expect(repository.totalsByCountry(UNBOUNDED)).resolves.toEqual([])
  })

  // The three below are the ones that matter. The test above passes without
  // exercising anything: its event is stamped now, so it lives in the live tail,
  // which real-time aggregation recomputes on every read. Only an event in an
  // already-materialised bucket can show whether a mutation reaches the totals.
  async function materialisedEventId(at: Date, ...spec: Parameters<typeof eventsAt>[1][]) {
    await repository.insertMany(eventsAt(at, ...spec))
    await postgres.database.query(z.unknown(), REFRESH)

    const [row] = await postgres.database.query(
      z.object({ id: z.string() }),
      'select id from traffic_events limit 1',
    )

    return row?.id ?? ''
  }

  it('stops counting a removed detection that was already materialised', async () => {
    const lastMonth = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const id = await materialisedEventId(lastMonth, ['AE', 'car', 2])

    await repository.deleteEvent(id)

    await expect(repository.totalsByCountry(UNBOUNDED)).resolves.toEqual([
      { plateCountry: 'AE', total: 1 },
    ])
  })

  it('moves a corrected detection between classes once materialised', async () => {
    const lastMonth = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const id = await materialisedEventId(lastMonth, ['AE', 'car', 2])

    await repository.updateEvent(id, { vehicleType: 'bus' })

    // Equal totals tie-break on the class name, so bus precedes car.
    await expect(repository.totalsByVehicleType(UNBOUNDED)).resolves.toEqual([
      { vehicleType: 'bus', total: 1 },
      { vehicleType: 'car', total: 1 },
    ])
  })

  // Written to catch a future-dated mutation dragging the watermark past the
  // present. It does NOT discriminate: it passes with the guard as `<` and with
  // it as `<>`, so refreshing an empty future bucket does not appear to move the
  // watermark here. Kept because the sequence is a real one and nothing else
  // covers it, but it is a characterisation test, not a regression test — the
  // failure it was written for is still unreproduced. Do not read a green run as
  // evidence that the guard is load-bearing.
  it('keeps counting the live tail after a future-dated detection is removed', async () => {
    const nextYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)

    await repository.insertMany(eventsAt(nextYear, ['AE', 'car', 1]))
    const [row] = await postgres.database.query(
      z.object({ id: z.string() }),
      'select id from traffic_events limit 1',
    )
    await repository.deleteEvent(row?.id ?? '')

    await repository.insertMany(trafficEvents(['SA', 'bus', 1]))

    await expect(repository.totalsByCountry(UNBOUNDED)).resolves.toEqual([
      { plateCountry: 'SA', total: 1 },
    ])
  })

  // The guard the fix must not trade away: reconciling a mutation must never
  // materialise the current bucket, or every detection recorded into that hour
  // afterwards falls below the watermark and is counted by neither side.
  it('keeps counting detections recorded into the current hour after one is corrected', async () => {
    await repository.insertMany(trafficEvents(['AE', 'car', 1]))

    const [row] = await postgres.database.query(
      z.object({ id: z.string() }),
      'select id from traffic_events limit 1',
    )
    await repository.updateEvent(row?.id ?? '', { vehicleType: 'bus' })

    await repository.insertMany(trafficEvents(['AE', 'car', 1]))

    await expect(repository.totalsByCountry(UNBOUNDED)).resolves.toEqual([
      { plateCountry: 'AE', total: 2 },
    ])
  })

  // The period predicate, read against buckets the aggregate has stored.
  //
  // A read is the union of the materialised buckets and a live scan of the
  // tail, and `aggregates.test.ts` exercises only the second half: its container
  // has never materialised anything, so `hour` there is recomputed from the
  // events on every read. The half below the watermark — the one the endpoints
  // are served from for all but the current hour — was covered by nothing.
  describe('a bounded period over materialised buckets', () => {
    /**
     * Materialises the buckets these events fall into, then removes the events
     * with SQL rather than through the repository, so no reconcile refresh runs.
     * Whatever a read returns afterwards can only have come from the
     * materialised side.
     *
     * That deletion is what keeps these tests from quietly becoming more
     * live-tail reads: without it, a refresh that stopped materialising would
     * leave every assertion below still passing, served by the events.
     */
    async function materialise(events: TrafficEvent[]): Promise<void> {
      await repository.insertMany(events)
      await postgres.database.query(z.unknown(), REFRESH)
      await postgres.database.query(z.unknown(), 'delete from traffic_events')
    }

    it('counts a bucket opening exactly on the instant the period starts', async () => {
      await materialise(eventsAt(hour('2026-03-04T13:00:00Z'), ['AE', 'car', 2]))

      await expect(
        repository.totalsByCountry({
          from: hour('2026-03-04T13:00:00Z'),
          to: hour('2026-03-04T14:00:00Z'),
        }),
      ).resolves.toEqual([{ plateCountry: 'AE', total: 2 }])
    })

    it('excludes a bucket opening exactly on the instant the period ends', async () => {
      await materialise([
        ...eventsAt(hour('2026-03-04T12:00:00Z'), ['AE', 'car', 2]),
        ...eventsAt(hour('2026-03-04T13:00:00Z'), ['SA', 'car', 5]),
      ])

      // Both are materialised and both are AE-or-SA, so the answer names which
      // bound each fell on: the 12:00 bucket counted, the 13:00 one belonging to
      // the period that starts where this one ends.
      await expect(
        repository.totalsByCountry({
          from: hour('2026-03-04T12:00:00Z'),
          to: hour('2026-03-04T13:00:00Z'),
        }),
      ).resolves.toEqual([{ plateCountry: 'AE', total: 2 }])
    })

    it('narrows a materialised period to one country', async () => {
      await materialise([
        ...eventsAt(hour('2026-03-04T13:00:00Z'), ['AE', 'car', 3], ['AE', 'bus', 1]),
        ...eventsAt(hour('2026-03-04T13:00:00Z'), ['SA', 'truck', 9]),
      ])

      await expect(
        repository.totalsByVehicleType(
          { from: hour('2026-03-04T13:00:00Z'), to: hour('2026-03-04T14:00:00Z') },
          'AE',
        ),
      ).resolves.toEqual([
        { vehicleType: 'car', total: 3 },
        { vehicleType: 'bus', total: 1 },
      ])
    })
  })
})
