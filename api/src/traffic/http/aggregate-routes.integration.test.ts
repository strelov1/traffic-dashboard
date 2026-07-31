import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buildServer } from '../../platform/server.js'
import { startMigratedPostgres, type MigratedPostgres } from '../../testing/postgres.js'
import { eventsAt } from '../../testing/traffic-events.js'
import { createTrafficRepository } from '../infra/postgres-repository.js'

// Drives the built server against real Postgres: a route registered on the
// wrong path, or a repository never wired in, passes every stubbed suite. It is
// also the only place the server's own ajv settings are in force, which is what
// decides whether an unexpected query parameter is refused or quietly dropped.
describe('traffic aggregates against Postgres', () => {
  let postgres: MigratedPostgres
  let server: FastifyInstance

  // Fixed instants rather than "now": a period filter can only be exercised
  // against events whose hour is known. Nothing refreshes the aggregate in this
  // suite, so these sit in its live tail exactly as a recent detection would.
  const EARLIER = new Date('2026-03-04T11:30:00Z')
  const LATER = new Date('2026-03-04T13:30:00Z')

  beforeAll(async () => {
    postgres = await startMigratedPostgres()

    const repository = createTrafficRepository(postgres.database)
    await repository.insertMany([
      ...eventsAt(EARLIER, ['SA', 'bus', 1]),
      ...eventsAt(LATER, ['AE', 'car', 3]),
    ])

    server = buildServer(
      { database: postgres.database, webOrigin: 'http://localhost:5173' },
      { logger: false },
    )
    await server.ready()
  })

  afterAll(async () => {
    await server.close()
    await postgres.stop()
  })

  const get = (url: string) => server.inject({ method: 'GET', url })

  it('serves totals per plate country', async () => {
    const response = await get('/api/traffic/by-country')

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      data: [
        { plateCountry: 'AE', total: 3 },
        { plateCountry: 'SA', total: 1 },
      ],
      period: {},
    })
  })

  it('serves totals per vehicle type', async () => {
    const response = await get('/api/traffic/by-vehicle-type')

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      data: [
        { vehicleType: 'car', total: 3 },
        { vehicleType: 'bus', total: 1 },
      ],
      period: {},
    })
  })

  it('counts only the events inside a bounded period', async () => {
    const response = await get(
      '/api/traffic/by-country?from=2026-03-04T13:00:00Z&to=2026-03-04T14:00:00Z',
    )

    expect(response.json()).toEqual({
      data: [{ plateCountry: 'AE', total: 3 }],
      period: { from: '2026-03-04T13:00:00.000Z', to: '2026-03-04T14:00:00.000Z' },
    })
  })

  it('widens a sub-hour bound outward, so the answer covers what was asked for', async () => {
    // 13:30 is the instant the later events carry. Rounded inward the period
    // would begin at 14:00 and report nothing, and that answer would be
    // indistinguishable from an hour with no traffic in it.
    const response = await get('/api/traffic/by-country?from=2026-03-04T13:30:00Z')

    expect(response.json()).toEqual({
      data: [{ plateCountry: 'AE', total: 3 }],
      period: { from: '2026-03-04T13:00:00.000Z' },
    })
  })

  it('narrows the vehicle-type aggregate to one plate country', async () => {
    const response = await get('/api/traffic/by-vehicle-type?country=SA')

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ data: [{ vehicleType: 'bus', total: 1 }], period: {} })
  })

  it('answers a country nothing was detected from with an empty aggregate', async () => {
    const response = await get('/api/traffic/by-vehicle-type?country=QA')

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ data: [], period: {} })
  })

  it('answers a period entirely in the future with an empty aggregate', async () => {
    const response = await get('/api/traffic/by-country?from=2099-01-01T00:00:00Z')

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ data: [], period: { from: '2099-01-01T00:00:00.000Z' } })
  })

  it('answers a period entirely before the earliest event the same way', async () => {
    const response = await get('/api/traffic/by-vehicle-type?to=2020-01-01T00:00:00Z')

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ data: [], period: { to: '2020-01-01T00:00:00.000Z' } })
  })

  describe('input the schema refuses', () => {
    it('refuses a bound that is not a date-time', async () => {
      const response = await get('/api/traffic/by-country?from=yesterday')

      expect(response.statusCode).toBe(400)
      expect(errorOf(response)).toMatch(/from/)
    })

    it('refuses a bound with no zone offset, so no request depends on a server zone', async () => {
      const response = await get('/api/traffic/by-country?from=2026-03-04T13:00:00')

      expect(response.statusCode).toBe(400)
      expect(errorOf(response)).toMatch(/from/)
    })

    it('refuses a country that is not two uppercase letters', async () => {
      const response = await get('/api/traffic/by-vehicle-type?country=ae')

      expect(response.statusCode).toBe(400)
      expect(errorOf(response)).toMatch(/country/)
    })

    it('refuses a country on the by-country aggregate rather than ignoring it', async () => {
      // Dropping it silently would answer an unfiltered aggregate to a caller
      // who asked for a narrowed one, with nothing in the response to say so.
      // Refusal is the contract here; ajv reports the rule, not the property,
      // and inventing a message for one parameter is not worth a formatter.
      const response = await get('/api/traffic/by-country?country=AE')

      expect(response.statusCode).toBe(400)
      expect(response.json()).not.toHaveProperty('data')
    })
  })
})

/** `inject`'s `json()` is `any`; naming the shape keeps assertions checked. */
function errorOf(response: { json: () => unknown }): unknown {
  return (response.json() as { error?: unknown }).error
}
