import { describe, expect, it } from 'vitest'

import { fetchTotalsByCountry, fetchTotalsByVehicleType } from './traffic'

function respondWith(body: unknown, status = 200): typeof fetch {
  return () =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    )
}

describe('fetchTotalsByCountry', () => {
  it('unwraps the data envelope', async () => {
    const fetchImpl = respondWith({
      data: [
        { plateCountry: 'AE', total: 3 },
        { plateCountry: 'SA', total: 1 },
      ],
    })

    await expect(fetchTotalsByCountry('http://api', fetchImpl)).resolves.toEqual([
      { label: 'AE', total: 3 },
      { label: 'SA', total: 1 },
    ])
  })

  it('resolves to an empty list when nothing is recorded', async () => {
    await expect(fetchTotalsByCountry('http://api', respondWith({ data: [] }))).resolves.toEqual([])
  })

  it('rejects a body that does not match the contract', async () => {
    const fetchImpl = respondWith({ data: [{ plateCountry: 'AE', total: 'three' }] })

    await expect(fetchTotalsByCountry('http://api', fetchImpl)).rejects.toThrow()
  })

  it('rejects when the API answers with an error status', async () => {
    await expect(
      fetchTotalsByCountry('http://api', respondWith({ error: 'boom' }, 500)),
    ).rejects.toThrow()
  })

  it('requests the documented path', async () => {
    const seen: string[] = []
    const fetchImpl: typeof fetch = (input) => {
      seen.push(input instanceof Request ? input.url : input.toString())

      return respondWith({ data: [] })(input)
    }

    await fetchTotalsByCountry('http://api:3000', fetchImpl)

    expect(seen).toEqual(['http://api:3000/api/traffic/by-country'])
  })
})

describe('fetchTotalsByVehicleType', () => {
  it('unwraps the data envelope', async () => {
    const fetchImpl = respondWith({
      data: [
        { vehicleType: 'car', total: 4 },
        { vehicleType: 'bus', total: 1 },
      ],
    })

    await expect(fetchTotalsByVehicleType('http://api', fetchImpl)).resolves.toEqual([
      { label: 'car', total: 4 },
      { label: 'bus', total: 1 },
    ])
  })

  it('requests the documented path', async () => {
    const seen: string[] = []
    const fetchImpl: typeof fetch = (input) => {
      seen.push(input instanceof Request ? input.url : input.toString())

      return respondWith({ data: [] })(input)
    }

    await fetchTotalsByVehicleType('http://api:3000', fetchImpl)

    expect(seen).toEqual(['http://api:3000/api/traffic/by-vehicle-type'])
  })
})
