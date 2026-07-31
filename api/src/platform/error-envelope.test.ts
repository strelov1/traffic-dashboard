import type { FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'

import { buildServer } from './server.js'
import { stubDatabase } from '../testing/stub-database.js'

/**
 * The composed server over a database whose every query rejects — the shape of
 * a production outage. The route harnesses elsewhere register routes on a bare
 * Fastify, which has no error handler of its own, so they cannot show what a
 * caller actually receives when a query fails.
 */
function serveOverFailingDatabase(): FastifyInstance {
  return buildServer(
    { database: stubDatabase(), webOrigin: 'http://localhost:5173' },
    { logger: false },
  )
}

let server: FastifyInstance | undefined

afterEach(async () => {
  await server?.close()
  server = undefined
})

describe('a failing query reaching a traffic route', () => {
  it.each([
    ['GET', '/api/traffic/by-country'],
    ['GET', '/api/traffic/by-vehicle-type'],
  ])('answers %s %s with the envelope and nothing else', async (method, url) => {
    server = serveOverFailingDatabase()

    const response = await server.inject({ method: method as 'GET', url })

    expect(response.statusCode).toBe(500)
    expect(response.json()).toEqual({ error: 'Internal Server Error' })
  })

  it('does not leak the driver message to the caller', async () => {
    server = serveOverFailingDatabase()

    const response = await server.inject({ method: 'GET', url: '/api/traffic/by-country' })

    // The stub's message stands in for what a real driver says: the host, the
    // user, and why authentication failed.
    expect(response.body).not.toMatch(/stub database/)
  })

  it('answers a failing write the same way', async () => {
    server = serveOverFailingDatabase()

    const response = await server.inject({
      method: 'POST',
      url: '/api/traffic/events',
      payload: { events: [{ plateCountry: 'AE', vehicleType: 'car' }] },
    })

    expect(response.statusCode).toBe(500)
    expect(response.json()).toEqual({ error: 'Internal Server Error' })
  })
})
