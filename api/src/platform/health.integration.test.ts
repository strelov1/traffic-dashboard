import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createDatabase, type Database } from './database.js'
import { POSTGRES_IMAGE } from '../testing/postgres.js'
import { buildServer } from './server.js'

// Drives the real pool through the real route, so a wiring mistake that every
// stubbed suite would pass still fails here.
describe('GET /api/health against Postgres', () => {
  let container: StartedPostgreSqlContainer
  let database: Database

  beforeAll(async () => {
    container = await new PostgreSqlContainer(POSTGRES_IMAGE).start()
    database = createDatabase(container.getConnectionUri())
  })

  afterAll(async () => {
    await database.close()
    await container.stop()
  })

  it('reports the database as up', async () => {
    const server = buildServer({ database, webOrigin: 'http://localhost:5173' }, { logger: false })
    await server.ready()

    const response = await server.inject({ method: 'GET', url: '/api/health' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ data: { status: 'ok', database: 'up' } })

    await server.close()
  })

  it('reports the database as down once it has stopped', async () => {
    await container.stop()

    const server = buildServer({ database, webOrigin: 'http://localhost:5173' }, { logger: false })
    await server.ready()

    const response = await server.inject({ method: 'GET', url: '/api/health' })

    expect(response.statusCode).toBe(503)
    expect(response.json()).toEqual({ data: { status: 'degraded', database: 'down' } })

    await server.close()
  })
})
