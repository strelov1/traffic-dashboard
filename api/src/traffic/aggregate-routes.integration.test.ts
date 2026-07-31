import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buildServer } from '../server.js'
import { startMigratedPostgres, type MigratedPostgres } from '../testing/postgres.js'
import { trafficEvents } from '../testing/traffic-events.js'
import { createTrafficRepository } from './repository.js'

// Drives the built server against real Postgres: a route registered on the
// wrong path, or a repository never wired in, passes every stubbed suite.
describe('traffic aggregates against Postgres', () => {
  let postgres: MigratedPostgres
  let server: FastifyInstance

  beforeAll(async () => {
    postgres = await startMigratedPostgres()

    const repository = createTrafficRepository(postgres.database)
    await repository.insertMany(trafficEvents(['AE', 'car', 3], ['SA', 'bus', 1]))

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

  it('serves totals per plate country', async () => {
    const response = await server.inject({ method: 'GET', url: '/api/traffic/by-country' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      data: [
        { plateCountry: 'AE', total: 3 },
        { plateCountry: 'SA', total: 1 },
      ],
    })
  })

  it('serves totals per vehicle type', async () => {
    const response = await server.inject({ method: 'GET', url: '/api/traffic/by-vehicle-type' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      data: [
        { vehicleType: 'car', total: 3 },
        { vehicleType: 'bus', total: 1 },
      ],
    })
  })
})
