import type { FastifyInstance } from 'fastify'

import type { Database } from './db.js'

export function registerHealthRoute(server: FastifyInstance, database: Database): void {
  server.get('/api/health', async (_request, reply) => {
    const reachable = await database.isReachable()

    // Checked per request: a cached verdict would keep answering "up" for
    // exactly as long as the outage this endpoint exists to reveal.
    const data = reachable
      ? { status: 'ok', database: 'up' }
      : { status: 'degraded', database: 'down' }

    await reply.code(reachable ? 200 : 503).send({ data })
  })
}
