import type { FastifyInstance, FastifyReply } from 'fastify'

import { toEvent, type TrafficEvent } from '../domain/detection.js'
import { UnrepresentableInstant } from '../domain/instant.js'
import type { VehicleType } from '../domain/vehicle-type.js'
import type { TrafficRepository } from '../ports.js'
import { fields } from './fields.js'

const detectionFields = {
  plateCountry: fields.plateCountry,
  vehicleType: fields.vehicleType,
  occurredAt: fields.instant,
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

// The instant is absent on purpose. Events are stored partitioned by time and
// the storage will not move a row between partitions, so accepting it would
// mean answering 500 from a chunk's own constraint. A correction fixes what the
// camera read, not when it looked.
const correctionBody = {
  type: 'object',
  additionalProperties: false,
  // An empty body is a mistake, not a no-op: a caller who sent nothing meant
  // something, and should learn it did not arrive.
  minProperties: 1,
  properties: {
    plateCountry: detectionFields.plateCountry,
    vehicleType: detectionFields.vehicleType,
  },
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

// The one route that echoes a stored row back, which makes declaring it matter
// more here than anywhere else: without this, a column added to traffic_events
// reaches the caller the moment it is added to the RETURNING list.
const correctedResponse = {
  200: {
    type: 'object',
    additionalProperties: false,
    required: ['data'],
    properties: {
      data: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'occurredAt', 'plateCountry', 'vehicleType'],
        properties: {
          id: { type: 'string' },
          occurredAt: { type: 'string', format: 'date-time' },
          plateCountry: { type: 'string' },
          vehicleType: { type: 'string' },
        },
      },
    },
  },
} as const

type Detection = {
  plateCountry: string
  vehicleType: VehicleType
  occurredAt?: string
}

type Correction = Partial<Pick<Detection, 'plateCountry' | 'vehicleType'>>

export function registerIngestRoutes(
  server: FastifyInstance,
  repository: TrafficRepository,
): void {
  server.post<{ Body: { events: Detection[] } }>(
    '/api/traffic/events',
    { schema: { body: recordBody, response: recordedResponse } },
    async (request, reply) => {
      let events

      try {
        events = request.body.events.map(toEvent)
      } catch (error: unknown) {
        // The domain refuses the value; naming it a client error is this
        // layer's call, and it is one — the caller can fix the request.
        if (error instanceof UnrepresentableInstant) {
          return reply.code(400).send({ error: error.message })
        }

        throw error
      }

      const recorded = await repository.insertMany(events)

      await reply.code(201).send({ data: { recorded } })
    },
  )

  server.patch<{ Params: { id: string }; Body: Correction }>(
    '/api/traffic/events/:id',
    { schema: { params: idParams, body: correctionBody, response: correctedResponse } },
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

function toChange(body: Correction): Partial<TrafficEvent> {
  return {
    ...(body.plateCountry === undefined ? {} : { plateCountry: body.plateCountry }),
    ...(body.vehicleType === undefined ? {} : { vehicleType: body.vehicleType }),
  }
}
