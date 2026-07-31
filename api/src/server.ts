import cors from '@fastify/cors'
import Fastify, {
  type FastifyError,
  type FastifyInstance,
  type FastifyServerOptions,
} from 'fastify'

import type { Database } from './db.js'
import { registerHealthRoute } from './health.js'

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
  const server = Fastify({ logger: options.logger ?? true })

  // Configured here rather than in a proxy, so the same rule holds whether the
  // project runs under Compose or as two dev servers.
  void server.register(cors, { origin: dependencies.webOrigin })

  registerHealthRoute(server, dependencies.database)

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
