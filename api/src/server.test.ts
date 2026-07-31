import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buildServer } from './server.js'

// Shaped like a driver failure, to assert that host, credentials, and driver
// internals never reach the response body.
const DRIVER_FAILURE =
  'connection to server at "db" (172.18.0.2), port 5432 failed: password authentication failed for user "derq"'

describe('error rendering', () => {
  const server = buildServer({ logger: false })

  beforeAll(async () => {
    server.get('/boom', () => {
      throw new Error(DRIVER_FAILURE)
    })

    await server.ready()
  })

  afterAll(async () => {
    await server.close()
  })

  it('renders an unknown route as 404 carrying only an error string', async () => {
    const response = await server.inject({ method: 'GET', url: '/api/nope' })
    const body = response.json<Record<string, unknown>>()

    expect(response.statusCode).toBe(404)
    expect(Object.keys(body)).toEqual(['error'])
    expect(typeof body['error']).toBe('string')
  })

  it('names the method and path in the 404 message', async () => {
    const response = await server.inject({ method: 'GET', url: '/api/nope' })

    expect(response.json<{ error: string }>().error).toContain('GET /api/nope')
  })

  it('renders an unhandled failure as 500 carrying only an error string', async () => {
    const response = await server.inject({ method: 'GET', url: '/boom' })
    const body = response.json<Record<string, unknown>>()

    expect(response.statusCode).toBe(500)
    expect(Object.keys(body)).toEqual(['error'])
    expect(typeof body['error']).toBe('string')
  })

  it('does not leak the underlying failure into the response', async () => {
    const response = await server.inject({ method: 'GET', url: '/boom' })

    expect(response.body).not.toContain('password')
    expect(response.body).not.toContain('172.18.0.2')
    expect(response.body).not.toContain(DRIVER_FAILURE)
  })

  it('does not leak a stack trace into the response', async () => {
    const response = await server.inject({ method: 'GET', url: '/boom' })

    expect(response.body).not.toContain('at ')
    expect(response.json<Record<string, unknown>>()).not.toHaveProperty('stack')
  })
})
