import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'

import type { CountryTotal, VehicleTypeTotal } from '../domain/totals.js'
import type { TrafficRepository } from '../ports.js'
import { registerAggregateRoutes } from './aggregate-routes.js'

function serve(totals: {
  byCountry?: CountryTotal[]
  byVehicleType?: VehicleTypeTotal[]
}): FastifyInstance {
  const repository = {
    insertMany: () => Promise.reject(new Error('not used by these routes')),
    countEvents: () => Promise.reject(new Error('not used by these routes')),
    updateEvent: () => Promise.reject(new Error('not used by these routes')),
    deleteEvent: () => Promise.reject(new Error('not used by these routes')),
    totalsByCountry: () => Promise.resolve(totals.byCountry ?? []),
    totalsByVehicleType: () => Promise.resolve(totals.byVehicleType ?? []),
  } satisfies TrafficRepository

  const server = Fastify({ logger: false })
  registerAggregateRoutes(server, repository)

  return server
}

let server: FastifyInstance | undefined

afterEach(async () => {
  await server?.close()
  server = undefined
})

describe('GET /api/traffic/by-country', () => {
  it('wraps the totals in the data envelope', async () => {
    server = serve({
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
    })
  })

  it('answers 200 with an empty array when nothing is recorded', async () => {
    server = serve({ byCountry: [] })

    const response = await server.inject({ method: 'GET', url: '/api/traffic/by-country' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ data: [] })
  })

  it('serialises totals as numbers', async () => {
    server = serve({ byCountry: [{ plateCountry: 'AE', total: 42 }] })

    const response = await server.inject({ method: 'GET', url: '/api/traffic/by-country' })

    expect(response.body).toContain('"total":42')
    expect(response.body).not.toContain('"42"')
  })

  it('drops a field the response contract does not declare', async () => {
    server = serve({
      byCountry: [
        // Stands in for a column added to the table and picked up by a select:
        // the schema, not the query, decides what leaves the process.
        { plateCountry: 'AE', total: 3, internalNote: 'do not ship' } as CountryTotal,
      ],
    })

    const response = await server.inject({ method: 'GET', url: '/api/traffic/by-country' })

    expect(response.body).not.toContain('internalNote')
    expect(response.json()).toEqual({ data: [{ plateCountry: 'AE', total: 3 }] })
  })
})

describe('GET /api/traffic/by-vehicle-type', () => {
  it('wraps the totals in the data envelope', async () => {
    server = serve({
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
    })
  })

  it('answers 200 with an empty array when nothing is recorded', async () => {
    server = serve({ byVehicleType: [] })

    const response = await server.inject({ method: 'GET', url: '/api/traffic/by-vehicle-type' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ data: [] })
  })
})
