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
