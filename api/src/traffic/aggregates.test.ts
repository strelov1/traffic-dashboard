import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { startMigratedPostgres, type MigratedPostgres } from '../testing/postgres.js'
import { trafficEvents } from '../testing/traffic-events.js'
import { createTrafficRepository, type TrafficRepository } from './repository.js'

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
      await expect(repository.totalsByCountry()).resolves.toEqual([])
    })

    it('counts every event for each country', async () => {
      await repository.insertMany(trafficEvents(['AE', 'car', 3], ['SA', 'car', 1]))

      await expect(repository.totalsByCountry()).resolves.toEqual([
        { plateCountry: 'AE', total: 3 },
        { plateCountry: 'SA', total: 1 },
      ])
    })

    it('orders the largest total first', async () => {
      await repository.insertMany(
        trafficEvents(['QA', 'car', 1], ['AE', 'car', 5], ['SA', 'car', 3]),
      )

      const totals = await repository.totalsByCountry()

      expect(totals.map((it) => it.plateCountry)).toEqual(['AE', 'SA', 'QA'])
    })

    it('breaks a tie by country so repeated requests agree', async () => {
      await repository.insertMany(trafficEvents(['SA', 'car', 2], ['AE', 'car', 2]))

      const first = await repository.totalsByCountry()
      const second = await repository.totalsByCountry()

      expect(first.map((it) => it.plateCountry)).toEqual(['AE', 'SA'])
      expect(second).toEqual(first)
    })

    it('returns totals as numbers, not the strings the driver hands back', async () => {
      await repository.insertMany(trafficEvents(['AE', 'car', 2]))

      const [entry] = await repository.totalsByCountry()

      expect(typeof entry?.total).toBe('number')
    })
  })

  describe('totalsByVehicleType', () => {
    it('is empty when nothing is recorded', async () => {
      await expect(repository.totalsByVehicleType()).resolves.toEqual([])
    })

    it('counts every event for each vehicle type', async () => {
      await repository.insertMany(trafficEvents(['AE', 'car', 4], ['AE', 'bus', 1]))

      await expect(repository.totalsByVehicleType()).resolves.toEqual([
        { vehicleType: 'car', total: 4 },
        { vehicleType: 'bus', total: 1 },
      ])
    })

    it('breaks a tie by vehicle type so repeated requests agree', async () => {
      await repository.insertMany(trafficEvents(['AE', 'van', 2], ['AE', 'bus', 2]))

      const totals = await repository.totalsByVehicleType()

      expect(totals.map((it) => it.vehicleType)).toEqual(['bus', 'van'])
    })

    it('reports only the types present in the data', async () => {
      await repository.insertMany(trafficEvents(['AE', 'truck', 1]))

      await expect(repository.totalsByVehicleType()).resolves.toEqual([
        { vehicleType: 'truck', total: 1 },
      ])
    })
  })
})
