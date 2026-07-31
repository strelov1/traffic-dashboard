import type { FastifyInstance } from 'fastify'

import type { TrafficRepository } from '../ports.js'

// Declared to Fastify rather than only asserted in tests: it serialises from
// the schema, so a column added to the table cannot reach a response body.
function totalsResponseSchema(category: string) {
  return {
    response: {
      200: {
        type: 'object',
        additionalProperties: false,
        required: ['data'],
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
        },
      },
    },
  }
}

export function registerAggregateRoutes(
  server: FastifyInstance,
  repository: TrafficRepository,
): void {
  server.get(
    '/api/traffic/by-country',
    { schema: totalsResponseSchema('plateCountry') },
    async () => ({ data: await repository.totalsByCountry() }),
  )

  server.get(
    '/api/traffic/by-vehicle-type',
    { schema: totalsResponseSchema('vehicleType') },
    async () => ({ data: await repository.totalsByVehicleType() }),
  )
}
