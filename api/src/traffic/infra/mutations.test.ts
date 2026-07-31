import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { startMigratedPostgres, type MigratedPostgres } from '../../testing/postgres.js'
import { eventsAt, trafficEvents } from '../../testing/traffic-events.js'
import type { TrafficRepository } from '../ports.js'
import { createTrafficRepository } from './postgres-repository.js'

const UNKNOWN_ID = '999999'

// Stated rather than taken from the clock: this suite asserts that a correction
// leaves the instant alone, so it has to know what the instant was.
const RECORDED_AT = new Date('2026-07-01T08:15:00Z')

describe('traffic mutations', () => {
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

  async function recordOne(): Promise<string> {
    await repository.insertMany(eventsAt(RECORDED_AT, ['AE', 'car', 1]))

    const [row] = await postgres.database.query(
      z.object({ id: z.string() }),
      'select id from traffic_events limit 1',
    )

    if (!row) {
      throw new Error('the event that was just recorded is missing')
    }

    return row.id
  }

  describe('updateEvent', () => {
    it('applies only the fields it was given', async () => {
      const id = await recordOne()

      const updated = await repository.updateEvent(id, { plateCountry: 'SA' })

      expect(updated).toEqual({
        id,
        occurredAt: RECORDED_AT,
        plateCountry: 'SA',
        vehicleType: 'car',
      })
    })

    it('can correct the vehicle type alone', async () => {
      const id = await recordOne()

      const updated = await repository.updateEvent(id, { vehicleType: 'truck' })

      expect(updated?.vehicleType).toBe('truck')
      expect(updated?.plateCountry).toBe('AE')
    })

    it('answers with nothing for an id that does not exist', async () => {
      await expect(repository.updateEvent(UNKNOWN_ID, { plateCountry: 'SA' })).resolves.toBeUndefined()
    })

    it('lets the database reject a correction its constraints forbid', async () => {
      const id = await recordOne()

      await expect(
        // @ts-expect-error not a known class; the constraint is the last defence
        repository.updateEvent(id, { vehicleType: 'hovercraft' }),
      ).rejects.toThrow(/check constraint/i)
    })
  })

  describe('deleteEvent', () => {
    it('removes the event and reports that it did', async () => {
      const id = await recordOne()

      await expect(repository.deleteEvent(id)).resolves.toBe(true)
      await expect(repository.countEvents()).resolves.toBe(0)
    })

    it('reports that nothing was removed for an id that does not exist', async () => {
      await expect(repository.deleteEvent(UNKNOWN_ID)).resolves.toBe(false)
    })

    it('leaves other events alone', async () => {
      await repository.insertMany(trafficEvents(['AE', 'car', 2]))
      const id = await recordOne()

      await repository.deleteEvent(id)

      await expect(repository.countEvents()).resolves.toBe(2)
    })
  })
})
