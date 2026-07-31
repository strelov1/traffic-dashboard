import { describe, expect, it } from 'vitest'

import { fetchHealth } from './health'

function respondWith(status: number, body: unknown): typeof fetch {
  return () =>
    Promise.resolve(new Response(JSON.stringify(body), { status, headers: contentTypeJson }))
}

const contentTypeJson = { 'content-type': 'application/json' }

describe('fetchHealth', () => {
  it('reports ok when the API says the database is up', async () => {
    const fetchImpl = respondWith(200, { data: { status: 'ok', database: 'up' } })

    await expect(fetchHealth('http://api', fetchImpl)).resolves.toEqual({ kind: 'ok' })
  })

  it('reports degraded when the API answers 503', async () => {
    const fetchImpl = respondWith(503, { data: { status: 'degraded', database: 'down' } })

    await expect(fetchHealth('http://api', fetchImpl)).resolves.toEqual({ kind: 'degraded' })
  })

  it('reports unreachable when the request fails', async () => {
    const fetchImpl = () => Promise.reject(new TypeError('Failed to fetch'))

    await expect(fetchHealth('http://api', fetchImpl)).resolves.toEqual({ kind: 'unreachable' })
  })

  it('reports unreachable when the API answers with an unexpected body', async () => {
    const fetchImpl = respondWith(200, { data: { status: 'fine' } })

    await expect(fetchHealth('http://api', fetchImpl)).resolves.toEqual({ kind: 'unreachable' })
  })

  it('reports unreachable when the API answers with something that is not JSON', async () => {
    const fetchImpl = () => Promise.resolve(new Response('<html>502 Bad Gateway</html>'))

    await expect(fetchHealth('http://api', fetchImpl)).resolves.toEqual({ kind: 'unreachable' })
  })

  it('requests the health path on the configured origin', async () => {
    const seen: string[] = []
    const fetchImpl: typeof fetch = (input) => {
      seen.push(input instanceof Request ? input.url : input.toString())

      return Promise.resolve(
        new Response(JSON.stringify({ data: { status: 'ok', database: 'up' } }), {
          headers: contentTypeJson,
        }),
      )
    }

    await fetchHealth('http://api:3000', fetchImpl)

    expect(seen).toEqual(['http://api:3000/api/health'])
  })
})
