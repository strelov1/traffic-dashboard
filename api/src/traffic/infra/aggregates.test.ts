import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { startMigratedPostgres, type MigratedPostgres } from '../../testing/postgres.js'
import { eventsAt, trafficEvents } from '../../testing/traffic-events.js'
import { UNBOUNDED } from '../domain/period.js'
import type { TrafficRepository } from '../ports.js'
import { createTrafficRepository } from './postgres-repository.js'

const hour = (iso: string) => new Date(iso)

describe('traffic aggregates', () => {
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

  describe('totalsByCountry', () => {
    it('is empty when nothing is recorded', async () => {
      await expect(repository.totalsByCountry(UNBOUNDED)).resolves.toEqual([])
    })

    it('counts every event for each country', async () => {
      await repository.insertMany(trafficEvents(['AE', 'car', 3], ['SA', 'car', 1]))

      await expect(repository.totalsByCountry(UNBOUNDED)).resolves.toEqual([
        { plateCountry: 'AE', total: 3 },
        { plateCountry: 'SA', total: 1 },
      ])
    })

    it('orders the largest total first', async () => {
      await repository.insertMany(
        trafficEvents(['QA', 'car', 1], ['AE', 'car', 5], ['SA', 'car', 3]),
      )

      const totals = await repository.totalsByCountry(UNBOUNDED)

      expect(totals.map((it) => it.plateCountry)).toEqual(['AE', 'SA', 'QA'])
    })

    it('breaks a tie by country so repeated requests agree', async () => {
      await repository.insertMany(trafficEvents(['SA', 'car', 2], ['AE', 'car', 2]))

      const first = await repository.totalsByCountry(UNBOUNDED)
      const second = await repository.totalsByCountry(UNBOUNDED)

      expect(first.map((it) => it.plateCountry)).toEqual(['AE', 'SA'])
      expect(second).toEqual(first)
    })

    it('returns totals as numbers, not the strings the driver hands back', async () => {
      await repository.insertMany(trafficEvents(['AE', 'car', 2]))

      const [entry] = await repository.totalsByCountry(UNBOUNDED)

      expect(typeof entry?.total).toBe('number')
    })
  })

  describe('totalsByVehicleType', () => {
    it('is empty when nothing is recorded', async () => {
      await expect(repository.totalsByVehicleType(UNBOUNDED)).resolves.toEqual([])
    })

    it('counts every event for each vehicle type', async () => {
      await repository.insertMany(trafficEvents(['AE', 'car', 4], ['AE', 'bus', 1]))

      await expect(repository.totalsByVehicleType(UNBOUNDED)).resolves.toEqual([
        { vehicleType: 'car', total: 4 },
        { vehicleType: 'bus', total: 1 },
      ])
    })

    it('breaks a tie by vehicle type so repeated requests agree', async () => {
      await repository.insertMany(trafficEvents(['AE', 'van', 2], ['AE', 'bus', 2]))

      const totals = await repository.totalsByVehicleType(UNBOUNDED)

      expect(totals.map((it) => it.vehicleType)).toEqual(['bus', 'van'])
    })

    it('reports only the types present in the data', async () => {
      await repository.insertMany(trafficEvents(['AE', 'truck', 1]))

      await expect(repository.totalsByVehicleType(UNBOUNDED)).resolves.toEqual([
        { vehicleType: 'truck', total: 1 },
      ])
    })
  })

  // The bucket boundary is where a wrong answer is cheapest to write and hardest
  // to see: every one of these passes against an off-by-one that shifts the
  // window by an hour, unless the events sit exactly on the edge being tested.
  describe('a bounded period', () => {
    it('counts only the buckets inside it', async () => {
      await repository.insertMany([
        ...eventsAt(hour('2026-03-04T11:30:00Z'), ['AE', 'car', 2]),
        ...eventsAt(hour('2026-03-04T13:30:00Z'), ['AE', 'car', 3]),
        ...eventsAt(hour('2026-03-04T15:30:00Z'), ['AE', 'car', 7]),
      ])

      await expect(
        repository.totalsByCountry({
          from: hour('2026-03-04T13:00:00Z'),
          to: hour('2026-03-04T14:00:00Z'),
        }),
      ).resolves.toEqual([{ plateCountry: 'AE', total: 3 }])
    })

    it('counts an event exactly on the hour in the period that starts on it', async () => {
      // 13:00:00.000 belongs to the 13:00 bucket, not to the one ending there.
      // A `>` for a `>=`, or a bucket assigned to the hour it ends, moves this
      // event to the wrong side of both boundaries at once.
      await repository.insertMany(eventsAt(hour('2026-03-04T13:00:00Z'), ['AE', 'car', 1]))

      await expect(
        repository.totalsByCountry({
          from: hour('2026-03-04T13:00:00Z'),
          to: hour('2026-03-04T14:00:00Z'),
        }),
      ).resolves.toEqual([{ plateCountry: 'AE', total: 1 }])
    })

    it('excludes an event on the hour at which the period ends', async () => {
      await repository.insertMany(eventsAt(hour('2026-03-04T13:00:00Z'), ['AE', 'car', 1]))

      await expect(
        repository.totalsByCountry({
          from: hour('2026-03-04T12:00:00Z'),
          to: hour('2026-03-04T13:00:00Z'),
        }),
      ).resolves.toEqual([])
    })

    it('excludes an event in the hour before the period starts', async () => {
      await repository.insertMany(eventsAt(hour('2026-03-04T13:00:00Z'), ['AE', 'car', 1]))

      await expect(
        repository.totalsByCountry({
          from: hour('2026-03-04T14:00:00Z'),
          to: hour('2026-03-04T15:00:00Z'),
        }),
      ).resolves.toEqual([])
    })

    it('does not double-count the hour two adjacent periods meet at', async () => {
      // The whole point of the half-open interval. With an inclusive end the two
      // halves sum to eight against a whole of five, and every client tiling a
      // timeline reports an hour of traffic twice.
      await repository.insertMany([
        ...eventsAt(hour('2026-03-04T12:30:00Z'), ['AE', 'car', 2]),
        ...eventsAt(hour('2026-03-04T13:30:00Z'), ['AE', 'car', 3]),
      ])

      const totalIn = async (from: string, to: string) =>
        (await repository.totalsByCountry({ from: hour(from), to: hour(to) }))[0]?.total ?? 0

      const earlier = await totalIn('2026-03-04T12:00:00Z', '2026-03-04T13:00:00Z')
      const later = await totalIn('2026-03-04T13:00:00Z', '2026-03-04T14:00:00Z')
      const whole = await totalIn('2026-03-04T12:00:00Z', '2026-03-04T14:00:00Z')

      expect(earlier).toBe(2)
      expect(later).toBe(3)
      expect(earlier + later).toBe(whole)
    })

    it('is empty for a period entirely in the future', async () => {
      await repository.insertMany(trafficEvents(['AE', 'car', 3]))

      const period = { from: hour('2099-01-01T00:00:00Z'), to: hour('2099-01-02T00:00:00Z') }

      await expect(repository.totalsByCountry(period)).resolves.toEqual([])
      await expect(repository.totalsByVehicleType(period)).resolves.toEqual([])
    })

    it('is empty for a period entirely before the earliest event', async () => {
      await repository.insertMany(eventsAt(hour('2026-03-04T13:00:00Z'), ['AE', 'car', 3]))

      const period = { from: hour('2020-01-01T00:00:00Z'), to: hour('2020-01-02T00:00:00Z') }

      await expect(repository.totalsByCountry(period)).resolves.toEqual([])
      await expect(repository.totalsByVehicleType(period)).resolves.toEqual([])
    })

    it('bounds one side only when only one bound is given', async () => {
      await repository.insertMany([
        ...eventsAt(hour('2026-03-04T11:30:00Z'), ['AE', 'car', 2]),
        ...eventsAt(hour('2026-03-04T13:30:00Z'), ['AE', 'car', 3]),
      ])

      await expect(
        repository.totalsByCountry({ from: hour('2026-03-04T13:00:00Z') }),
      ).resolves.toEqual([{ plateCountry: 'AE', total: 3 }])
      await expect(repository.totalsByCountry({ to: hour('2026-03-04T13:00:00Z') })).resolves.toEqual(
        [{ plateCountry: 'AE', total: 2 }],
      )
    })

    it('narrows the vehicle-type aggregate as well as the country one', async () => {
      await repository.insertMany([
        ...eventsAt(hour('2026-03-04T11:30:00Z'), ['AE', 'bus', 2]),
        ...eventsAt(hour('2026-03-04T13:30:00Z'), ['AE', 'car', 3]),
      ])

      await expect(
        repository.totalsByVehicleType({
          from: hour('2026-03-04T13:00:00Z'),
          to: hour('2026-03-04T14:00:00Z'),
        }),
      ).resolves.toEqual([{ vehicleType: 'car', total: 3 }])
    })
  })

  describe('totalsByVehicleType narrowed to a country', () => {
    it('counts only detections carrying that country’s plates', async () => {
      await repository.insertMany(
        trafficEvents(['AE', 'car', 3], ['AE', 'bus', 1], ['SA', 'car', 5], ['SA', 'truck', 2]),
      )

      await expect(repository.totalsByVehicleType(UNBOUNDED, 'AE')).resolves.toEqual([
        { vehicleType: 'car', total: 3 },
        { vehicleType: 'bus', total: 1 },
      ])
    })

    it('is an empty aggregate for a country nothing was detected from', async () => {
      // Not an error. There is no register of valid countries anywhere in the
      // system, so "no traffic from QA" and "QA is not a country we know" are
      // the same fact, and the true one is the empty answer.
      await repository.insertMany(trafficEvents(['AE', 'car', 3]))

      await expect(repository.totalsByVehicleType(UNBOUNDED, 'QA')).resolves.toEqual([])
    })

    it('applies the country and the period together', async () => {
      await repository.insertMany([
        ...eventsAt(hour('2026-03-04T11:30:00Z'), ['AE', 'bus', 4]),
        ...eventsAt(hour('2026-03-04T13:30:00Z'), ['AE', 'car', 3]),
        ...eventsAt(hour('2026-03-04T13:30:00Z'), ['SA', 'truck', 9]),
      ])

      await expect(
        repository.totalsByVehicleType(
          { from: hour('2026-03-04T13:00:00Z'), to: hour('2026-03-04T14:00:00Z') },
          'AE',
        ),
      ).resolves.toEqual([{ vehicleType: 'car', total: 3 }])
    })
  })
})
