import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buildServer } from './server.js'
import { stubDatabase } from '../testing/stub-database.js'

const WEB_ORIGIN = 'http://localhost:5173'

describe('cross-origin access', () => {
  const server = buildServer(
    { database: stubDatabase(), webOrigin: WEB_ORIGIN },
    { logger: false },
  )

  beforeAll(() => server.ready())
  afterAll(() => server.close())

  it('lets the web origin read the response', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/health',
      headers: { origin: WEB_ORIGIN },
    })

    expect(response.headers['access-control-allow-origin']).toBe(WEB_ORIGIN)
  })

  it('answers the preflight for the web origin', async () => {
    const response = await server.inject({
      method: 'OPTIONS',
      url: '/api/health',
      headers: { origin: WEB_ORIGIN, 'access-control-request-method': 'GET' },
    })

    expect(response.statusCode).toBeLessThan(300)
    expect(response.headers['access-control-allow-origin']).toBe(WEB_ORIGIN)
  })

  it('never echoes the requesting origin back to it', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/health',
      headers: { origin: 'http://evil.example' },
    })

    // The allowed origin is stated, not reflected, so the browser refuses the
    // read. Echoing the requester is what turns CORS into an open door.
    expect(response.headers['access-control-allow-origin']).toBe(WEB_ORIGIN)
    expect(response.headers['access-control-allow-origin']).not.toBe('http://evil.example')
  })

  it('does not allow credentialed cross-origin requests', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/health',
      headers: { origin: WEB_ORIGIN },
    })

    expect(response.headers['access-control-allow-credentials']).toBeUndefined()
  })

  it('still serves a request that carries no origin', async () => {
    const response = await server.inject({ method: 'GET', url: '/api/health' })

    expect(response.statusCode).toBe(200)
  })
})
