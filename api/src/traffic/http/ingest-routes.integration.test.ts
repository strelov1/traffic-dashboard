import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { buildServer } from '../../platform/server.js'
import { startMigratedPostgres, type MigratedPostgres } from '../../testing/postgres.js'

const DETECTION = { plateCountry: 'AE', vehicleType: 'car' }

describe('traffic ingest', () => {
  let postgres: MigratedPostgres
  let server: FastifyInstance

  beforeAll(async () => {
    postgres = await startMigratedPostgres()
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

  beforeEach(async () => {
    await postgres.database.query(z.unknown(), 'truncate traffic_events')
  })

  function record(events: unknown[]) {
    return server.inject({ method: 'POST', url: '/api/traffic/events', payload: { events } })
  }

  async function recordOne(): Promise<string> {
    await record([DETECTION])

    const [row] = await postgres.database.query(
      z.object({ id: z.string() }),
      'select id from traffic_events limit 1',
    )

    return row?.id ?? ''
  }

  describe('POST /api/traffic/events', () => {
    it('records a batch and reports the count', async () => {
      const response = await record([DETECTION, DETECTION, { ...DETECTION, plateCountry: 'SA' }])

      expect(response.statusCode).toBe(201)
      expect(response.json()).toEqual({ data: { recorded: 3 } })
    })

    it('makes the new events visible to the aggregates', async () => {
      await record([DETECTION, { ...DETECTION, plateCountry: 'SA' }])

      const totals = await server.inject({ method: 'GET', url: '/api/traffic/by-country' })

      // Matched rather than equalled: what the envelope carries besides the
      // data is the aggregate routes' contract, and asserting it here would
      // make every ingest test a second copy of it.
      expect(totals.json()).toMatchObject({
        data: [
          { plateCountry: 'AE', total: 1 },
          { plateCountry: 'SA', total: 1 },
        ],
      })
    })

    it('defaults the instant to the time of the request', async () => {
      const before = Date.now()

      await record([DETECTION])

      const [row] = await postgres.database.query(
        z.object({ occurredAt: z.date() }),
        'select occurred_at as "occurredAt" from traffic_events',
      )

      expect(row?.occurredAt.getTime()).toBeGreaterThanOrEqual(before - 1_000)
    })

    it('keeps the instant the caller sent', async () => {
      await record([{ ...DETECTION, occurredAt: '2026-01-02T03:04:05.000Z' }])

      const [row] = await postgres.database.query(
        z.object({ occurredAt: z.date() }),
        'select occurred_at as "occurredAt" from traffic_events',
      )

      expect(row?.occurredAt.toISOString()).toBe('2026-01-02T03:04:05.000Z')
    })

    it.each([
      ['an unknown vehicle type', { plateCountry: 'AE', vehicleType: 'hovercraft' }],
      ['a country name', { plateCountry: 'United Arab Emirates', vehicleType: 'car' }],
      ['a lowercase country', { plateCountry: 'ae', vehicleType: 'car' }],
      ['a missing vehicle type', { plateCountry: 'AE' }],
      ['an unknown field', { ...DETECTION, speed: 80 }],
    ])('rejects %s with 400 and records nothing', async (_case, detection) => {
      const response = await record([detection])

      expect(response.statusCode).toBe(400)
      expect(typeof response.json<{ error?: unknown }>().error).toBe('string')

      const [row] = await postgres.database.query(
        z.object({ total: z.coerce.number() }),
        'select count(*) as total from traffic_events',
      )
      expect(row?.total).toBe(0)
    })

    it('rejects an empty batch', async () => {
      expect((await record([])).statusCode).toBe(400)
    })

    // Not a malformed request. `23:59:60` is a legal RFC 3339 instant that ajv
    // admits and Postgres normalises happily; JavaScript's Date cannot hold a
    // leap second and yields an invalid value that reaches the driver as NaN.
    // The 400 is this system stating a limit of its own, which is still a
    // client error and still must not be a 500.
    it('rejects an instant it cannot represent, rather than failing in the driver', async () => {
      const response = await record([{ ...DETECTION, occurredAt: '2026-06-30T23:59:60Z' }])

      expect(response.statusCode).toBe(400)
      expect(response.json<{ error: string }>().error).toMatch(/occurredAt/)

      const [row] = await postgres.database.query(
        z.object({ total: z.coerce.number() }),
        'select count(*) as total from traffic_events',
      )
      expect(row?.total).toBe(0)
    })
  })

  describe('PATCH /api/traffic/events/:id', () => {
    it('applies only the fields it was given', async () => {
      const id = await recordOne()

      const response = await server.inject({
        method: 'PATCH',
        url: `/api/traffic/events/${id}`,
        payload: { plateCountry: 'SA' },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json<{ data: Record<string, unknown> }>().data).toMatchObject({
        id,
        plateCountry: 'SA',
        vehicleType: 'car',
      })
    })

    it('rejects a body carrying no fields', async () => {
      const id = await recordOne()

      const response = await server.inject({
        method: 'PATCH',
        url: `/api/traffic/events/${id}`,
        payload: {},
      })

      expect(response.statusCode).toBe(400)
    })

    it('refuses to rewrite the instant rather than attempting a move', async () => {
      const id = await recordOne()

      const response = await server.inject({
        method: 'PATCH',
        url: `/api/traffic/events/${id}`,
        payload: { occurredAt: '2026-01-02T03:04:05.000Z' },
      })

      expect(response.statusCode).toBe(400)
    })

    it('answers 404 for an id that does not exist', async () => {
      const response = await server.inject({
        method: 'PATCH',
        url: '/api/traffic/events/999999',
        payload: { plateCountry: 'SA' },
      })

      expect(response.statusCode).toBe(404)
    })
  })

  describe('DELETE /api/traffic/events/:id', () => {
    it('removes the event and answers 204 with no body', async () => {
      const id = await recordOne()

      const response = await server.inject({ method: 'DELETE', url: `/api/traffic/events/${id}` })

      expect(response.statusCode).toBe(204)
      expect(response.body).toBe('')
    })

    it('stops the aggregates counting it', async () => {
      const id = await recordOne()

      await server.inject({ method: 'DELETE', url: `/api/traffic/events/${id}` })
      const totals = await server.inject({ method: 'GET', url: '/api/traffic/by-country' })

      expect(totals.json()).toMatchObject({ data: [] })
    })

    it('answers 404 for an id that does not exist', async () => {
      const response = await server.inject({ method: 'DELETE', url: '/api/traffic/events/999999' })

      expect(response.statusCode).toBe(404)
    })

    it('rejects an id too large to be one, rather than letting Postgres overflow', async () => {
      const response = await server.inject({
        method: 'DELETE',
        url: '/api/traffic/events/99999999999999999999999',
      })

      expect(response.statusCode).toBe(400)
    })
  })
})
