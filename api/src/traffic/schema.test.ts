import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

import type { Database } from '../db.js'
import { startMigratedPostgres, type MigratedPostgres } from '../testing/postgres.js'
import { VEHICLE_TYPES } from './vehicle-types.js'

const INSERT = `
  insert into traffic_events (occurred_at, plate_country, vehicle_type)
  values ($1, $2, $3)
  returning id
`

const identity = z.object({ id: z.string() })

describe('traffic_events schema', () => {
  let postgres: MigratedPostgres
  let database: Database

  beforeAll(async () => {
    postgres = await startMigratedPostgres()
    database = postgres.database
  })

  afterAll(() => postgres.stop())

  it('stores an event and gives it an identity', async () => {
    const rows = await database.query(identity, INSERT, ['2026-07-01T08:15:00Z', 'AE', 'car'])

    expect(rows).toHaveLength(1)
  })

  it('treats two identical detections as distinct events', async () => {
    const first = await database.query(identity, INSERT, ['2026-07-01T08:15:00Z', 'AE', 'car'])
    const second = await database.query(identity, INSERT, ['2026-07-01T08:15:00Z', 'AE', 'car'])

    expect(first[0]?.id).not.toBe(second[0]?.id)
  })

  it.each(VEHICLE_TYPES)('accepts the vehicle type %s', async (vehicleType) => {
    const rows = await database.query(identity, INSERT, [
      '2026-07-01T08:15:00Z',
      'AE',
      vehicleType,
    ])

    expect(rows).toHaveLength(1)
  })

  it('rejects an unknown vehicle type', async () => {
    await expect(
      database.query(identity, INSERT, ['2026-07-01T08:15:00Z', 'AE', 'hovercraft']),
    ).rejects.toThrow(/check constraint/i)
  })

  it('rejects a country name in place of a code', async () => {
    await expect(
      database.query(identity, INSERT, [
        '2026-07-01T08:15:00Z',
        'United Arab Emirates',
        'car',
      ]),
    ).rejects.toThrow(/check constraint/i)
  })

  it('rejects a one-letter country rather than padding it', async () => {
    await expect(
      database.query(identity, INSERT, ['2026-07-01T08:15:00Z', 'A', 'car']),
    ).rejects.toThrow(/check constraint/i)
  })

  it('rejects a lowercase country code', async () => {
    await expect(
      database.query(identity, INSERT, ['2026-07-01T08:15:00Z', 'ae', 'car']),
    ).rejects.toThrow(/check constraint/i)
  })

  it.each([
    ['occurred_at', [null, 'AE', 'car']],
    ['plate_country', ['2026-07-01T08:15:00Z', null, 'car']],
    ['vehicle_type', ['2026-07-01T08:15:00Z', 'AE', null]],
  ])('rejects an event missing %s', async (_column, params) => {
    await expect(database.query(identity, INSERT, params)).rejects.toThrow(/not[- ]null/i)
  })

  it('stores the instant, not a wall clock reading', async () => {
    const [inserted] = await database.query(identity, INSERT, [
      '2026-07-01T08:15:00Z',
      'AE',
      'car',
    ])

    const rows = await database.query(
      z.object({ same: z.boolean() }),
      `
        select occurred_at = timestamptz '2026-07-01 12:15:00+04' as same
        from traffic_events where id = $1
      `,
      [inserted?.id],
    )

    expect(rows).toEqual([{ same: true }])
  })
})
