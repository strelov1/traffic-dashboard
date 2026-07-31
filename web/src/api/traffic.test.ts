import { describe, expect, it } from 'vitest'

import { fetchTotalsByCountry, fetchTotalsByVehicleType } from './traffic'

/** Every aggregate response carries the period it covered, so every stub does. */
function respondWith(body: unknown, status = 200): typeof fetch {
  return () =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    )
}

const empty = { data: [], period: {} }

/** Records the URLs asked for, which is where the query parameters show up. */
function recording(body: unknown = empty) {
  const seen: string[] = []
  const fetchImpl: typeof fetch = (input) => {
    seen.push(input instanceof Request ? input.url : input.toString())

    return respondWith(body)(input)
  }

  return { seen, fetchImpl }
}

describe('fetchTotalsByCountry', () => {
  it('unwraps the data envelope', async () => {
    const fetchImpl = respondWith({
      data: [
        { plateCountry: 'AE', total: 3 },
        { plateCountry: 'SA', total: 1 },
      ],
      period: {},
    })

    await expect(fetchTotalsByCountry('http://api', {}, fetchImpl)).resolves.toEqual([
      { label: 'AE', total: 3 },
      { label: 'SA', total: 1 },
    ])
  })

  it('resolves to an empty list when nothing is recorded', async () => {
    await expect(fetchTotalsByCountry('http://api', {}, respondWith(empty))).resolves.toEqual([])
  })

  it('rejects a body that does not match the contract', async () => {
    const fetchImpl = respondWith({ data: [{ plateCountry: 'AE', total: 'three' }], period: {} })

    await expect(fetchTotalsByCountry('http://api', {}, fetchImpl)).rejects.toThrow()
  })

  it('rejects a body that has stopped stating the period it covers', async () => {
    // Parsed rather than ignored. The dashboard does not render it, but a
    // response that quietly dropped it would mean the API had stopped saying
    // what it widened a range to, and that is worth failing over here.
    const fetchImpl = respondWith({ data: [] })

    await expect(fetchTotalsByCountry('http://api', {}, fetchImpl)).rejects.toThrow()
  })

  it('rejects when the API answers with an error status', async () => {
    await expect(
      fetchTotalsByCountry('http://api', {}, respondWith({ error: 'boom' }, 500)),
    ).rejects.toThrow()
  })

  it('requests the documented path', async () => {
    const { seen, fetchImpl } = recording()

    await fetchTotalsByCountry('http://api:3000', {}, fetchImpl)

    expect(seen).toEqual(['http://api:3000/api/traffic/by-country'])
  })

  it('sends the bounds it was given', async () => {
    const { seen, fetchImpl } = recording()

    await fetchTotalsByCountry(
      'http://api:3000',
      { from: '2026-03-04T13:00:00.000Z', to: '2026-03-05T13:00:00.000Z' },
      fetchImpl,
    )

    const url = new URL(seen[0] ?? '')

    expect(url.searchParams.get('from')).toBe('2026-03-04T13:00:00.000Z')
    expect(url.searchParams.get('to')).toBe('2026-03-05T13:00:00.000Z')
  })

  it('omits a bound it was not given rather than sending it empty', async () => {
    // `?to=` is a malformed date-time, and the API answers 400 for it. An
    // absent bound means unbounded, which is not something to spell out.
    const { seen, fetchImpl } = recording()

    await fetchTotalsByCountry('http://api:3000', { from: '2026-03-04T13:00:00.000Z' }, fetchImpl)

    expect(seen[0]).toBe('http://api:3000/api/traffic/by-country?from=2026-03-04T13%3A00%3A00.000Z')
  })
})

describe('fetchTotalsByVehicleType', () => {
  it('unwraps the data envelope', async () => {
    const fetchImpl = respondWith({
      data: [
        { vehicleType: 'car', total: 4 },
        { vehicleType: 'bus', total: 1 },
      ],
      period: {},
    })

    await expect(fetchTotalsByVehicleType('http://api', {}, fetchImpl)).resolves.toEqual([
      { label: 'car', total: 4 },
      { label: 'bus', total: 1 },
    ])
  })

  it('requests the documented path', async () => {
    const { seen, fetchImpl } = recording()

    await fetchTotalsByVehicleType('http://api:3000', {}, fetchImpl)

    expect(seen).toEqual(['http://api:3000/api/traffic/by-vehicle-type'])
  })

  it('sends the country alongside the bounds', async () => {
    const { seen, fetchImpl } = recording()

    await fetchTotalsByVehicleType(
      'http://api:3000',
      { from: '2026-03-04T13:00:00.000Z', country: 'AE' },
      fetchImpl,
    )

    const url = new URL(seen[0] ?? '')

    expect(url.searchParams.get('country')).toBe('AE')
    expect(url.searchParams.get('from')).toBe('2026-03-04T13:00:00.000Z')
  })

  it('omits the country when every country is wanted', async () => {
    const { seen, fetchImpl } = recording()

    await fetchTotalsByVehicleType('http://api:3000', { from: '2026-03-04T13:00:00.000Z' }, fetchImpl)

    expect(seen[0]).not.toContain('country')
  })
})
