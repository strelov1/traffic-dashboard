import { z } from 'zod'

/**
 * Both aggregates become the same shape here. The API names its categories for
 * the domain; a chart only needs a label and a magnitude, and that translation
 * belongs on this side of the boundary.
 */
export type CategoryTotal = {
  label: string
  total: number
}

/**
 * The classes the API accepts, copied from `api/src/traffic/domain/vehicle-type.ts`.
 *
 * A copy, because the web package cannot import server code and a workspace
 * package for six frozen strings would be more machinery than the list is. What
 * makes the copy safe is `traffic.test.ts`, which reads that module and fails
 * when the two stop agreeing — at the moment a class is added, rather than when
 * a reader picks an option the API refuses.
 */
export const VEHICLE_TYPES = ['car', 'van', 'truck', 'bus', 'motorcycle', 'bicycle'] as const

export type VehicleType = (typeof VEHICLE_TYPES)[number]

export type Detection = {
  plateCountry: string
  vehicleType: VehicleType
}

/**
 * The API refused the request itself — a value it will not accept, with its own
 * words for why. Distinguished from every other failure because only this one
 * says something true about what the reader typed, and so only this one may
 * mark a control invalid. A 5xx also carries a message; it is not about them.
 */
export class DetectionRejected extends Error {}

/** Instants, not a preset: resolving a preset is `filters.periodBounds`'s job. */
export type Bounds = {
  from?: string
  to?: string
}

/**
 * The period the response actually covers, after the API rounded the requested
 * range outward to the hour. Parsed here and then discarded.
 *
 * The API states it because a machine consumer cannot otherwise know what it
 * received. The dashboard is not that consumer: a reader who asked for the last
 * seven days and is shown "covering from 13:00 on the 24th" has been handed a
 * boundary they did not choose and cannot act on, so the controls state the
 * filter that was picked instead. Validating it keeps the seam honest — an API
 * that stopped stating the period fails at this line rather than silently.
 */
const period = z.object({ from: z.string().optional(), to: z.string().optional() })

const envelope = <T extends z.ZodType>(entry: T) => z.object({ data: z.array(entry), period })

const countryTotals = envelope(z.object({ plateCountry: z.string(), total: z.number() }))
const vehicleTypeTotals = envelope(z.object({ vehicleType: z.string(), total: z.number() }))

const recorded = z.object({ data: z.object({ recorded: z.number() }) })
const stated = z.object({ error: z.string() })

export function fetchTotalsByCountry(
  apiOrigin: string,
  bounds: Bounds,
  fetchImpl: typeof fetch = fetch,
): Promise<CategoryTotal[]> {
  return read(apiOrigin, '/api/traffic/by-country', bounds, fetchImpl, (body) =>
    countryTotals.parse(body).data.map(({ plateCountry, total }) => ({
      label: plateCountry,
      total,
    })),
  )
}

export function fetchTotalsByVehicleType(
  apiOrigin: string,
  filter: Bounds & { country?: string },
  fetchImpl: typeof fetch = fetch,
): Promise<CategoryTotal[]> {
  return read(apiOrigin, '/api/traffic/by-vehicle-type', filter, fetchImpl, (body) =>
    vehicleTypeTotals.parse(body).data.map(({ vehicleType, total }) => ({
      label: vehicleType,
      total,
    })),
  )
}

const EVENTS_PATH = '/api/traffic/events'

/**
 * Records one detection, and resolves only once the API says it stored it.
 *
 * No instant is sent: the API dates the detection by its own clock, and the
 * current hour is the one served live rather than materialised, so what was
 * just recorded is counted by the next read. That is the whole point of the
 * control — an instant the reader could choose would let them record something
 * that answers 201 and moves nothing.
 */
export async function recordDetection(
  apiOrigin: string,
  detection: Detection,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const response = await fetchImpl(`${apiOrigin}${EVENTS_PATH}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    // A batch of one. The endpoint takes a list because cameras deliver in
    // batches; this form has one detection and does not pretend otherwise.
    body: JSON.stringify({ events: [detection] }),
  })

  if (!response.ok) {
    throw await failureOf(response)
  }

  // Parsed rather than assumed: a 201 whose body is not the recorded envelope
  // would otherwise be reported to the reader as a stored detection.
  recorded.parse(await response.json())
}

async function failureOf(response: Response): Promise<Error> {
  const answered = `${EVENTS_PATH} answered ${String(response.status)}`
  const message = await statedError(response)

  // Only a 4xx is a verdict on the request. A 5xx carries a message too — the
  // API's deliberately opaque 'Internal Server Error' — and treating that as a
  // refusal would blame the reader's value for the server's failure.
  return response.status < 500 && message !== undefined
    ? new DetectionRejected(message)
    : new Error(message === undefined ? answered : `${answered}: ${message}`)
}

async function statedError(response: Response): Promise<string | undefined> {
  try {
    return stated.parse(await response.json()).error
  } catch {
    // A proxy in front of the API, or a crash before the error handler, answers
    // something that is not the envelope. The status is then all there is.
    return undefined
  }
}

// Rejects rather than returning an outcome: unlike the health check, a failure
// here has nothing to report, and the caller renders the state.
async function read(
  apiOrigin: string,
  path: string,
  parameters: Record<string, string | undefined>,
  fetchImpl: typeof fetch,
  parse: (body: unknown) => CategoryTotal[],
): Promise<CategoryTotal[]> {
  const response = await fetchImpl(`${apiOrigin}${path}${query(parameters)}`)

  if (!response.ok) {
    throw new Error(`${path} answered ${String(response.status)}`)
  }

  return parse(await response.json())
}

/**
 * An absent parameter is left out, not sent empty. `?to=` is a malformed
 * date-time as far as the API's schema is concerned, and saying nothing is
 * exactly what an unbounded side means.
 */
function query(parameters: Record<string, string | undefined>): string {
  const search = new URLSearchParams()

  for (const [name, value] of Object.entries(parameters)) {
    if (value !== undefined) {
      search.set(name, value)
    }
  }

  const encoded = search.toString()

  return encoded === '' ? '' : `?${encoded}`
}
