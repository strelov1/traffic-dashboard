import cors from '@fastify/cors'
import Fastify, {
  type FastifyError,
  type FastifyInstance,
  type FastifyServerOptions,
} from 'fastify'

import type { Database } from './db.js'
import { registerHealthRoute } from './health.js'
import { registerIngestRoutes } from './traffic/ingest.js'
import { createTrafficRepository } from './traffic/repository.js'
import { registerTrafficRoutes } from './traffic/routes.js'

export type ServerDependencies = {
  database: Database
  webOrigin: string
}

export type ServerOptions = {
  logger?: FastifyServerOptions['logger']
}

export function buildServer(
  dependencies: ServerDependencies,
  options: ServerOptions = {},
): FastifyInstance {
  const server = Fastify({
    logger: options.logger ?? true,
    // Fastify defaults ajv to removeAdditional, which silently drops a field
    // whose name is a typo and answers 201 with the value gone. An ingest API
    // should say so instead.
    ajv: { customOptions: { removeAdditional: false } },
  })

  // Configured here rather than in a proxy, so the same rule holds whether the
  // project runs under Compose or as two dev servers.
  void server.register(cors, { origin: dependencies.webOrigin })

  registerHealthRoute(server, dependencies.database)
  // Derived, not injected: it is fully determined by the database.
  const traffic = createTrafficRepository(dependencies.database)
  registerTrafficRoutes(server, traffic)
  registerIngestRoutes(server, traffic)

  server.setNotFoundHandler((request, reply) => {
    void reply.code(404).send({ error: `Route ${request.method} ${request.url} not found` })
  })

  server.setErrorHandler((error: FastifyError, request, reply) => {
    const statusCode = error.statusCode ?? 500

    request.log.error({ err: error }, 'request failed')

    // A 5xx message can carry connection strings, credentials, and driver
    // internals; only a client's own error is safe to echo back.
    void reply
      .code(statusCode)
      .send({ error: statusCode >= 500 ? 'Internal Server Error' : error.message })
  })

  return server
}
