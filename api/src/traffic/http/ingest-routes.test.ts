import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'

import type { StoredTrafficEvent } from '../domain/detection.js'
import type { TrafficRepository } from '../ports.js'
import { registerIngestRoutes } from './ingest-routes.js'

const STORED: StoredTrafficEvent = {
  id: '1',
  occurredAt: new Date('2026-01-02T03:04:05.000Z'),
  plateCountry: 'AE',
  vehicleType: 'car',
}

/**
 * A stub repository, because the property under test is what the route
 * *publishes*, not what the database stores. Fastify serialises from the
 * response schema, so the only way to see the schema working is to hand the
 * route a row carrying something the schema does not declare.
 */
function serve(updated: StoredTrafficEvent | undefined): FastifyInstance {
  const rejects = () => Promise.reject(new Error('not used by this test'))

  const repository = {
    insertMany: rejects,
    countEvents: rejects,
    deleteEvent: rejects,
    totalsByCountry: rejects,
    totalsByVehicleType: rejects,
    updateEvent: () => Promise.resolve(updated),
  } as unknown as TrafficRepository

  const server = Fastify({ logger: false })
  registerIngestRoutes(server, repository)

  return server
}

let server: FastifyInstance | undefined

afterEach(async () => {
  await server?.close()
  server = undefined
})

function patch(instance: FastifyInstance) {
  return instance.inject({
    method: 'PATCH',
    url: '/api/traffic/events/1',
    payload: { vehicleType: 'bus' },
  })
}

describe('PATCH /api/traffic/events/:id', () => {
  it('answers the corrected event in the data envelope', async () => {
    server = serve(STORED)

    const response = await patch(server)

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      data: {
        id: '1',
        occurredAt: '2026-01-02T03:04:05.000Z',
        plateCountry: 'AE',
        vehicleType: 'car',
      },
    })
  })

  // The one route that echoes a stored row back. Without a declared response
  // schema, a column added to traffic_events reaches the caller the moment it
  // joins the RETURNING list — the leak this route is the likeliest to spring.
  it('publishes only declared fields, whatever the row carries', async () => {
    server = serve({ ...STORED, cameraId: 'secret-camera-7' } as StoredTrafficEvent)

    const response = await patch(server)

    expect(response.json()).toEqual({
      data: {
        id: '1',
        occurredAt: '2026-01-02T03:04:05.000Z',
        plateCountry: 'AE',
        vehicleType: 'car',
      },
    })
    expect(response.body).not.toMatch(/cameraId|secret-camera/)
  })

  it('answers 404 when there is no such event', async () => {
    server = serve(undefined)

    const response = await patch(server)

    expect(response.statusCode).toBe(404)
    expect(response.json<{ error: string }>().error).toMatch(/1/)
  })
})
