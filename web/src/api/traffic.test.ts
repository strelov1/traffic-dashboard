import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  DetectionRejected,
  fetchTotalsByCountry,
  fetchTotalsByVehicleType,
  recordDetection,
  VEHICLE_TYPES,
} from './traffic'

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

describe('recordDetection', () => {
  const DETECTION = { plateCountry: 'AE', vehicleType: 'bus' } as const
  const RECORDED = { data: { recorded: 1 } }

  /** Records the request as well as the URL: this one carries a body. */
  function recordingRequests(body: unknown = RECORDED, status = 201) {
    const seen: { url: string; init: RequestInit | undefined }[] = []
    const fetchImpl: typeof fetch = (input, init) => {
      seen.push({ url: input instanceof Request ? input.url : input.toString(), init })

      return respondWith(body, status)(input)
    }

    return { seen, fetchImpl }
  }

  /** `undefined` for a body that was never a JSON string, which is a failure. */
  const sent = (init: RequestInit | undefined): unknown =>
    typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined

  it('posts one detection to the ingest endpoint as a batch of one', async () => {
    const { seen, fetchImpl } = recordingRequests()

    await recordDetection('http://api:3000', DETECTION, fetchImpl)

    const [request] = seen

    expect(request?.url).toBe('http://api:3000/api/traffic/events')
    expect(request?.init?.method).toBe('POST')
    expect(sent(request?.init)).toEqual({ events: [DETECTION] })
  })

  it('sends no instant, so the detection lands in the hour served live', async () => {
    const { seen, fetchImpl } = recordingRequests()

    await recordDetection('http://api:3000', DETECTION, fetchImpl)

    expect(sent(seen[0]?.init)).not.toHaveProperty('events.0.occurredAt')
  })

  it('rejects a success the API did not answer in the shape it declares', async () => {
    // A 201 whose body is not the recorded envelope would otherwise be reported
    // to the reader as a detection that was stored.
    const { fetchImpl } = recordingRequests({ data: {} })

    await expect(recordDetection('http://api', DETECTION, fetchImpl)).rejects.toThrow()
  })

  it('carries the API refusal back word for word', async () => {
    const message = 'body/events/0/plateCountry must match pattern "^[A-Z]{2}$"'
    const { fetchImpl } = recordingRequests({ error: message }, 400)

    await expect(recordDetection('http://api', DETECTION, fetchImpl)).rejects.toThrow(message)
  })

  it('names a refusal as one, so the form can mark the field the API refused', async () => {
    const { fetchImpl } = recordingRequests({ error: 'body/events/0/vehicleType ...' }, 400)

    await expect(recordDetection('http://api', DETECTION, fetchImpl)).rejects.toBeInstanceOf(
      DetectionRejected,
    )
  })

  it('does not call a server failure a refusal of the value', async () => {
    // A 500 answers `{"error":"Internal Server Error"}` — a message, but not one
    // about what the reader typed. Marking their country invalid for it would
    // be a guess presented as a fact.
    const { fetchImpl } = recordingRequests({ error: 'Internal Server Error' }, 500)

    await expect(recordDetection('http://api', DETECTION, fetchImpl)).rejects.not.toBeInstanceOf(
      DetectionRejected,
    )
  })
})

describe('VEHICLE_TYPES', () => {
  /**
   * Read from the API's own module rather than from a copy of its values, the
   * way `styles.test.ts` reads the stylesheet it asserts about. The web package
   * cannot import server code, so this is what keeps the control the reader
   * sees and the set the API accepts from drifting apart — and it fails at the
   * moment a class is added, which is when the fix is one line.
   */
  const DOMAIN_MODULE = resolve(process.cwd(), '../api/src/traffic/domain/vehicle-type.ts')

  function vehicleTypesTheApiAccepts(): string[] {
    const source = readFileSync(DOMAIN_MODULE, 'utf8')
    const declaration = /VEHICLE_TYPES = \[([^\]]*)\]/.exec(source)?.[1]

    if (declaration === undefined) {
      throw new Error(`${DOMAIN_MODULE} no longer declares VEHICLE_TYPES as a literal array`)
    }

    return [...declaration.matchAll(/'([^']+)'/g)].map(([, type]) => type ?? '')
  }

  it('offers exactly the classes the API accepts', () => {
    expect([...VEHICLE_TYPES]).toEqual(vehicleTypesTheApiAccepts())
  })
})
