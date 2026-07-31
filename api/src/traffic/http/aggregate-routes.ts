import type { FastifyInstance } from 'fastify'

import { UnrepresentableInstant } from '../domain/instant.js'
import { InvertedPeriod, toPeriod, type Period } from '../domain/period.js'
import type { TrafficRepository } from '../ports.js'
import { fields } from './fields.js'

// Declared to Fastify rather than only asserted in tests: it serialises from
// the schema, so a column added to the table cannot reach a response body.
//
// `period` is not decoration. The API rounds a requested range outward to the
// hour, so the period a response covers is not always the one that was asked
// for, and a contract that widens its input silently is one no client can hold
// to account. It is stated even when unbounded, as an empty object.
function totalsResponse(category: string) {
  return {
    200: {
      type: 'object',
      additionalProperties: false,
      required: ['data', 'period'],
      properties: {
        data: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: [category, 'total'],
            properties: {
              [category]: { type: 'string' },
              total: { type: 'integer' },
            },
          },
        },
        period: {
          type: 'object',
          additionalProperties: false,
          properties: { from: fields.instant, to: fields.instant },
        },
      },
    },
  }
}

const periodQuery = {
  type: 'object',
  // The server disables ajv's removeAdditional, so this refuses an unknown
  // parameter rather than dropping it. That is what makes `country` on the
  // by-country route an error instead of an unfiltered answer to a narrowed
  // question — and what turns a typo in a shared link into a message.
  additionalProperties: false,
  properties: { from: fields.instant, to: fields.instant },
} as const

// The by-country aggregate deliberately does not offer this. Narrowed to one
// country it is a single bar, which answers "how is this country's traffic
// composed" — and that question is what the vehicle-type aggregate is for.
const countryQuery = {
  ...periodQuery,
  properties: { ...periodQuery.properties, country: fields.plateCountry },
} as const

type PeriodQuery = { from?: string; to?: string }

/**
 * `toPeriod` throws, because an inverted range is not a value the domain can
 * hold. Which HTTP answer that deserves is this layer's call, and it is a 400 —
 * the same call the ingest route makes for an instant it cannot represent.
 *
 * Returned rather than rethrown so the refusal is answered before a read is
 * issued: a bad range never reaches the database at all.
 */
function readPeriod(query: PeriodQuery): { period: Period } | { refusal: string } {
  try {
    return { period: toPeriod(query) }
  } catch (error: unknown) {
    if (error instanceof UnrepresentableInstant || error instanceof InvertedPeriod) {
      return { refusal: error.message }
    }

    throw error
  }
}

export function registerAggregateRoutes(
  server: FastifyInstance,
  repository: TrafficRepository,
): void {
  server.get<{ Querystring: PeriodQuery }>(
    '/api/traffic/by-country',
    { schema: { querystring: periodQuery, response: totalsResponse('plateCountry') } },
    async (request, reply) => {
      const requested = readPeriod(request.query)

      if ('refusal' in requested) {
        return reply.code(400).send({ error: requested.refusal })
      }

      return { data: await repository.totalsByCountry(requested.period), period: requested.period }
    },
  )

  server.get<{ Querystring: PeriodQuery & { country?: string } }>(
    '/api/traffic/by-vehicle-type',
    { schema: { querystring: countryQuery, response: totalsResponse('vehicleType') } },
    async (request, reply) => {
      const requested = readPeriod(request.query)

      if ('refusal' in requested) {
        return reply.code(400).send({ error: requested.refusal })
      }

      return {
        data: await repository.totalsByVehicleType(requested.period, request.query.country),
        period: requested.period,
      }
    },
  )
}
