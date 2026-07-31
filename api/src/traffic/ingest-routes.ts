import type { FastifyInstance, FastifyReply } from 'fastify'

import type { TrafficEvent, TrafficRepository } from './repository.js'
import { VEHICLE_TYPES, type VehicleType } from './vehicle-types.js'

// Restates the database's constraints so a client's mistake is a 400 that names
// the field, not a 500 carrying a check-constraint message. The database stays
// the last line of defence; this is the first, and only this one can explain
// itself to a caller.
const detectionFields = {
  plateCountry: { type: 'string', pattern: '^[A-Z]{2}$' },
  vehicleType: { type: 'string', enum: [...VEHICLE_TYPES] },
  occurredAt: { type: 'string', format: 'date-time' },
} as const

const recordBody = {
  type: 'object',
  additionalProperties: false,
  required: ['events'],
  properties: {
    events: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['plateCountry', 'vehicleType'],
        properties: detectionFields,
      },
    },
  },
} as const

const idParams = {
  type: 'object',
  required: ['id'],
  // Capped at 18 digits: beyond that Postgres raises a bigint overflow, which
  // would answer 500 for what is a malformed id. No table reaches 10^18 rows.
  properties: { id: { type: 'string', pattern: '^[0-9]{1,18}$' } },
} as const

const correctionBody = {
  type: 'object',
  additionalProperties: false,
  // An empty body is a mistake, not a no-op: a caller who sent nothing meant
  // something, and should learn it did not arrive.
  minProperties: 1,
  properties: detectionFields,
} as const

const recordedResponse = {
  201: {
    type: 'object',
    additionalProperties: false,
    required: ['data'],
    properties: {
      data: {
        type: 'object',
        additionalProperties: false,
        required: ['recorded'],
        properties: { recorded: { type: 'integer' } },
      },
    },
  },
} as const

type Detection = {
  plateCountry: string
  vehicleType: VehicleType
  occurredAt?: string
}

export function registerIngestRoutes(
  server: FastifyInstance,
  repository: TrafficRepository,
): void {
  server.post<{ Body: { events: Detection[] } }>(
    '/api/traffic/events',
    { schema: { body: recordBody, response: recordedResponse } },
    async (request, reply) => {
      const recorded = await repository.insertMany(request.body.events.map(toEvent))

      await reply.code(201).send({ data: { recorded } })
    },
  )

  server.patch<{ Params: { id: string }; Body: Partial<Detection> }>(
    '/api/traffic/events/:id',
    { schema: { params: idParams, body: correctionBody } },
    async (request, reply) => {
      const updated = await repository.updateEvent(request.params.id, toChange(request.body))

      if (!updated) {
        return noSuchEvent(reply, request.params.id)
      }

      await reply.send({ data: updated })
    },
  )

  server.delete<{ Params: { id: string } }>(
    '/api/traffic/events/:id',
    { schema: { params: idParams } },
    async (request, reply) => {
      const removed = await repository.deleteEvent(request.params.id)

      if (!removed) {
        return noSuchEvent(reply, request.params.id)
      }

      await reply.code(204).send()
    },
  )
}

async function noSuchEvent(reply: FastifyReply, id: string): Promise<void> {
  await reply.code(404).send({ error: `No event with id ${id}` })
}

function toEvent(detection: Detection): TrafficEvent {
  return {
    // The detection happened when the camera saw it, not when the network
    // delivered it, so a caller's instant wins over the server's clock.
    occurredAt: detection.occurredAt === undefined ? new Date() : new Date(detection.occurredAt),
    plateCountry: detection.plateCountry,
    vehicleType: detection.vehicleType,
  }
}

function toChange(body: Partial<Detection>): Partial<TrafficEvent> {
  return {
    ...(body.occurredAt === undefined ? {} : { occurredAt: new Date(body.occurredAt) }),
    ...(body.plateCountry === undefined ? {} : { plateCountry: body.plateCountry }),
    ...(body.vehicleType === undefined ? {} : { vehicleType: body.vehicleType }),
  }
}
