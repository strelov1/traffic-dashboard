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

const envelope = <T extends z.ZodType>(entry: T) => z.object({ data: z.array(entry) })

const countryTotals = envelope(z.object({ plateCountry: z.string(), total: z.number() }))
const vehicleTypeTotals = envelope(z.object({ vehicleType: z.string(), total: z.number() }))

export function fetchTotalsByCountry(
  apiOrigin: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CategoryTotal[]> {
  return read(apiOrigin, '/api/traffic/by-country', fetchImpl, (body) =>
    countryTotals.parse(body).data.map(({ plateCountry, total }) => ({
      label: plateCountry,
      total,
    })),
  )
}

export function fetchTotalsByVehicleType(
  apiOrigin: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CategoryTotal[]> {
  return read(apiOrigin, '/api/traffic/by-vehicle-type', fetchImpl, (body) =>
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
  fetchImpl: typeof fetch,
  parse: (body: unknown) => CategoryTotal[],
): Promise<CategoryTotal[]> {
  const response = await fetchImpl(`${apiOrigin}${path}`)

  if (!response.ok) {
    throw new Error(`${path} answered ${String(response.status)}`)
  }

  return parse(await response.json())
}
