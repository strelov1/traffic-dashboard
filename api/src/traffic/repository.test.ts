import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { startMigratedPostgres, type MigratedPostgres } from '../testing/postgres.js'
import { createTrafficRepository, type TrafficEvent, type TrafficRepository } from './repository.js'

function event(overrides: Partial<TrafficEvent> = {}): TrafficEvent {
  return {
    occurredAt: new Date('2026-07-01T08:15:00Z'),
    plateCountry: 'AE',
    vehicleType: 'car',
    ...overrides,
  }
}

describe('traffic repository', () => {
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

  it('counts nothing in an empty table', async () => {
    await expect(repository.countEvents()).resolves.toBe(0)
  })

  it('stores events and counts them', async () => {
    await repository.insertMany([event(), event({ plateCountry: 'SA' })])

    await expect(repository.countEvents()).resolves.toBe(2)
  })

  it('returns a count as a number rather than the string the driver hands back', async () => {
    await repository.insertMany([event()])

    const total = await repository.countEvents()

    // count(*) is a bigint, which pg returns as a string so values above 2^53
    // keep their precision. Unconverted, `total + 1` would be "11".
    expect(typeof total).toBe('number')
    expect(total + 1).toBe(2)
  })

  it('writes nothing for an empty batch', async () => {
    await expect(repository.insertMany([])).resolves.toBe(0)
    await expect(repository.countEvents()).resolves.toBe(0)
  })

  it('reports how many events it wrote', async () => {
    await expect(repository.insertMany([event(), event(), event()])).resolves.toBe(3)
  })

  it('preserves the instant it was given', async () => {
    const occurredAt = new Date('2026-07-01T08:15:00Z')

    await repository.insertMany([event({ occurredAt })])

    const rows = await postgres.database.query(
      z.object({ occurred_at: z.date() }),
      'select occurred_at from traffic_events',
    )

    expect(rows[0]?.occurred_at.toISOString()).toBe(occurredAt.toISOString())
  })

  it('lets the database reject an event the constraint forbids', async () => {
    await expect(
      // @ts-expect-error the type is not in VehicleType; the database is the
      // last line of defence when a caller reaches it through untyped input.
      repository.insertMany([event({ vehicleType: 'hovercraft' })]),
    ).rejects.toThrow(/check constraint/i)
  })

  it('writes a whole batch or none of it', async () => {
    await expect(
      repository.insertMany([
        event(),
        // @ts-expect-error deliberately invalid, to prove the batch is atomic
        event({ vehicleType: 'hovercraft' }),
      ]),
    ).rejects.toThrow()

    await expect(repository.countEvents()).resolves.toBe(0)
  })
})
