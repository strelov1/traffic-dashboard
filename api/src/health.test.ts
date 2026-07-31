import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buildServer } from './server.js'
import { stubDatabase } from './testing/stub-database.js'

describe('GET /api/health', () => {
  describe('when the database is reachable', () => {
    const server = buildServer(stubDatabase(() => true), { logger: false })

    beforeAll(() => server.ready())
    afterAll(() => server.close())

    it('answers 200', async () => {
      const response = await server.inject({ method: 'GET', url: '/api/health' })

      expect(response.statusCode).toBe(200)
    })

    it('reports both the process and the database in the data envelope', async () => {
      const response = await server.inject({ method: 'GET', url: '/api/health' })

      expect(response.json()).toEqual({ data: { status: 'ok', database: 'up' } })
    })
  })

  describe('when the database is unreachable', () => {
    const server = buildServer(stubDatabase(() => false), { logger: false })

    beforeAll(() => server.ready())
    afterAll(() => server.close())

    it('answers 503', async () => {
      const response = await server.inject({ method: 'GET', url: '/api/health' })

      expect(response.statusCode).toBe(503)
    })

    it('reports the failure as data rather than as an error', async () => {
      const response = await server.inject({ method: 'GET', url: '/api/health' })

      expect(response.json()).toEqual({ data: { status: 'degraded', database: 'down' } })
    })
  })

  describe('when the database becomes unreachable between requests', () => {
    let reachable = true
    const server = buildServer(
      stubDatabase(() => reachable),
      { logger: false },
    )

    beforeAll(() => server.ready())
    afterAll(() => server.close())

    it('re-checks rather than answering from a cached verdict', async () => {
      const first = await server.inject({ method: 'GET', url: '/api/health' })

      reachable = false

      const second = await server.inject({ method: 'GET', url: '/api/health' })

      expect(first.json()).toEqual({ data: { status: 'ok', database: 'up' } })
      expect(second.json()).toEqual({ data: { status: 'degraded', database: 'down' } })
    })
  })
})
