import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'

import type { Period } from '../domain/period.js'
import type { CountryTotal, VehicleTypeTotal } from '../domain/totals.js'
import type { TrafficRepository } from '../ports.js'
import { registerAggregateRoutes } from './aggregate-routes.js'

/** What the routes asked storage for, which is where the rounding shows up. */
type Read = { period: Period; plateCountry?: string }

let running: FastifyInstance | undefined

function serve(totals: { byCountry?: CountryTotal[]; byVehicleType?: VehicleTypeTotal[] } = {}) {
  const reads: { byCountry: Read[]; byVehicleType: Read[] } = { byCountry: [], byVehicleType: [] }

  const repository = {
    insertMany: () => Promise.reject(new Error('not used by these routes')),
    countEvents: () => Promise.reject(new Error('not used by these routes')),
    updateEvent: () => Promise.reject(new Error('not used by these routes')),
    deleteEvent: () => Promise.reject(new Error('not used by these routes')),
    totalsByCountry: (period) => {
      reads.byCountry.push({ period })

      return Promise.resolve(totals.byCountry ?? [])
    },
    totalsByVehicleType: (period, plateCountry) => {
      reads.byVehicleType.push({ period, ...(plateCountry === undefined ? {} : { plateCountry }) })

      return Promise.resolve(totals.byVehicleType ?? [])
    },
  } satisfies TrafficRepository

  const server = Fastify({ logger: false })
  registerAggregateRoutes(server, repository)
  running = server

  return { server, reads }
}

afterEach(async () => {
  await running?.close()
  running = undefined
})

describe('GET /api/traffic/by-country', () => {
  it('wraps the totals in the data envelope', async () => {
    const { server } = serve({
      byCountry: [
        { plateCountry: 'AE', total: 3 },
        { plateCountry: 'SA', total: 1 },
      ],
    })

    const response = await server.inject({ method: 'GET', url: '/api/traffic/by-country' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      data: [
        { plateCountry: 'AE', total: 3 },
        { plateCountry: 'SA', total: 1 },
      ],
      period: {},
    })
  })

  it('answers 200 with an empty array when nothing is recorded', async () => {
    const { server } = serve({ byCountry: [] })

    const response = await server.inject({ method: 'GET', url: '/api/traffic/by-country' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ data: [], period: {} })
  })

  it('serialises totals as numbers', async () => {
    const { server } = serve({ byCountry: [{ plateCountry: 'AE', total: 42 }] })

    const response = await server.inject({ method: 'GET', url: '/api/traffic/by-country' })

    expect(response.body).toContain('"total":42')
    expect(response.body).not.toContain('"42"')
  })

  it('drops a field the response contract does not declare', async () => {
    const { server } = serve({
      byCountry: [
        // Stands in for a column added to the table and picked up by a select:
        // the schema, not the query, decides what leaves the process.
        { plateCountry: 'AE', total: 3, internalNote: 'do not ship' } as CountryTotal,
      ],
    })

    const response = await server.inject({ method: 'GET', url: '/api/traffic/by-country' })

    expect(response.body).not.toContain('internalNote')
    expect(response.json()).toEqual({ data: [{ plateCountry: 'AE', total: 3 }], period: {} })
  })
})

describe('GET /api/traffic/by-vehicle-type', () => {
  it('wraps the totals in the data envelope', async () => {
    const { server } = serve({
      byVehicleType: [
        { vehicleType: 'car', total: 4 },
        { vehicleType: 'bus', total: 1 },
      ],
    })

    const response = await server.inject({ method: 'GET', url: '/api/traffic/by-vehicle-type' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      data: [
        { vehicleType: 'car', total: 4 },
        { vehicleType: 'bus', total: 1 },
      ],
      period: {},
    })
  })

  it('answers 200 with an empty array when nothing is recorded', async () => {
    const { server } = serve({ byVehicleType: [] })

    const response = await server.inject({ method: 'GET', url: '/api/traffic/by-vehicle-type' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ data: [], period: {} })
  })
})

// The rounding is the contract, so it is asserted twice over: on what storage
// was asked for, and on what the caller was told. Either alone would pass an
// implementation that rounded in one place and reported the other.
describe('the period a response covers', () => {
  it('states no bounds when none were given', async () => {
    const { server, reads } = serve()

    const response = await server.inject({ method: 'GET', url: '/api/traffic/by-country' })

    expect(response.json()).toMatchObject({ period: {} })
    expect(reads.byCountry).toEqual([{ period: {} }])
  })

  it('widens a start partway through an hour, and says it did', async () => {
    const { server, reads } = serve()

    const response = await server.inject({
      method: 'GET',
      url: '/api/traffic/by-country?from=2026-03-04T13:30:45.123Z',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ period: { from: '2026-03-04T13:00:00.000Z' } })
    expect(reads.byCountry).toEqual([{ period: { from: new Date('2026-03-04T13:00:00Z') } }])
  })

  it('widens an end partway through an hour to the following hour', async () => {
    const { server, reads } = serve()

    const response = await server.inject({
      method: 'GET',
      url: '/api/traffic/by-country?to=2026-03-04T13:00:00.001Z',
    })

    expect(response.json()).toMatchObject({ period: { to: '2026-03-04T14:00:00.000Z' } })
    expect(reads.byCountry).toEqual([{ period: { to: new Date('2026-03-04T14:00:00Z') } }])
  })

  it('leaves an end already on the hour alone', async () => {
    const { server } = serve()

    const response = await server.inject({
      method: 'GET',
      url: '/api/traffic/by-country?from=2026-03-04T12:00:00Z&to=2026-03-04T13:00:00Z',
    })

    expect(response.json()).toMatchObject({
      period: { from: '2026-03-04T12:00:00.000Z', to: '2026-03-04T13:00:00.000Z' },
    })
  })

  it('rounds to the UTC hour a bound falls in, not to the caller’s local one', async () => {
    // 08:15 at +05:30 is 02:45 UTC. Only an offset that is not a whole hour can
    // tell "rounded in UTC" apart from "rounded in whatever zone was written".
    const { server } = serve()

    const response = await server.inject({
      method: 'GET',
      url: `/api/traffic/by-country?from=${encodeURIComponent('2026-03-04T08:15:00+05:30')}`,
    })

    expect(response.json()).toMatchObject({ period: { from: '2026-03-04T02:00:00.000Z' } })
  })

  it('carries the period on the vehicle-type aggregate too', async () => {
    const { server, reads } = serve()

    const response = await server.inject({
      method: 'GET',
      url: '/api/traffic/by-vehicle-type?from=2026-03-04T13:30:00Z',
    })

    expect(response.json()).toMatchObject({ period: { from: '2026-03-04T13:00:00.000Z' } })
    expect(reads.byVehicleType).toEqual([{ period: { from: new Date('2026-03-04T13:00:00Z') } }])
  })

  it('answers an empty period with an empty aggregate rather than an error', async () => {
    const { server } = serve({ byCountry: [] })

    const response = await server.inject({
      method: 'GET',
      url: '/api/traffic/by-country?from=2026-03-04T13:00:00Z&to=2026-03-04T13:00:00Z',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      data: [],
      period: { from: '2026-03-04T13:00:00.000Z', to: '2026-03-04T13:00:00.000Z' },
    })
  })

  // The case above is the only one where equal bounds stay where they were
  // written, and it reads as the general rule until this one sits beside it.
  // Off the hour the same request is a whole hour of traffic under a period the
  // client never sent — which is exactly what `period` in the envelope is for.
  it('widens equal bounds inside an hour, and states the hour rather than the bounds sent', async () => {
    const { server, reads } = serve({ byCountry: [{ plateCountry: 'AE', total: 7 }] })

    const response = await server.inject({
      method: 'GET',
      url: '/api/traffic/by-country?from=2026-03-04T12:30:00Z&to=2026-03-04T12:30:00Z',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      data: [{ plateCountry: 'AE', total: 7 }],
      period: { from: '2026-03-04T12:00:00.000Z', to: '2026-03-04T13:00:00.000Z' },
    })
    expect(reads.byCountry).toEqual([
      { period: { from: new Date('2026-03-04T12:00:00Z'), to: new Date('2026-03-04T13:00:00Z') } },
    ])
  })
})

describe('narrowing the vehicle-type aggregate to a country', () => {
  it('passes the country to storage', async () => {
    const { server, reads } = serve()

    const response = await server.inject({
      method: 'GET',
      url: '/api/traffic/by-vehicle-type?country=AE',
    })

    expect(response.statusCode).toBe(200)
    expect(reads.byVehicleType).toEqual([{ period: {}, plateCountry: 'AE' }])
  })

  it('leaves the country absent when none was asked for', async () => {
    const { server, reads } = serve()

    await server.inject({ method: 'GET', url: '/api/traffic/by-vehicle-type' })

    expect(reads.byVehicleType).toEqual([{ period: {} }])
  })
})

// Refused by the route rather than by the schema, and refused before any query
// runs: the assertion on `reads` is what says so. A 400 raised after the read
// would still read 400 to a client while having scanned the table for nothing.
describe('a period the domain will not hold', () => {
  it('refuses a start later than its end, naming both bounds', async () => {
    const { server, reads } = serve()

    const response = await server.inject({
      method: 'GET',
      url: '/api/traffic/by-country?from=2026-03-04T12:00:00Z&to=2026-03-04T11:00:00Z',
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({
      error: 'from must not be later than to: from=2026-03-04T12:00:00Z, to=2026-03-04T11:00:00Z',
    })
    expect(reads.byCountry).toEqual([])
  })

  it('accepts a start equal to its end, which is empty rather than inverted', async () => {
    const { server, reads } = serve()

    const response = await server.inject({
      method: 'GET',
      url: '/api/traffic/by-vehicle-type?from=2026-03-04T12:00:00Z&to=2026-03-04T12:00:00Z',
    })

    expect(response.statusCode).toBe(200)
    expect(reads.byVehicleType).toHaveLength(1)
  })

  it('refuses a leap second, which ajv accepts and no instant can hold', async () => {
    const { server, reads } = serve()

    const response = await server.inject({
      method: 'GET',
      url: '/api/traffic/by-country?from=2026-03-04T23:59:60Z',
    })

    expect(response.statusCode).toBe(400)
    expect(errorOf(response)).toMatch(/^from is not an instant/)
    expect(reads.byCountry).toEqual([])
  })

  it('names the bound at fault when it is the end that cannot be held', async () => {
    const { server } = serve()

    const response = await server.inject({
      method: 'GET',
      url: '/api/traffic/by-country?to=2026-03-04T23:59:60Z',
    })

    expect(response.statusCode).toBe(400)
    expect(errorOf(response)).toMatch(/^to is not an instant/)
  })
})

/** `inject`'s `json()` is `any`; naming the shape keeps assertions checked. */
function errorOf(response: { json: () => unknown }): unknown {
  return (response.json() as { error?: unknown }).error
}
