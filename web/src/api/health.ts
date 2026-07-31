import { z } from 'zod'

/**
 * Three outcomes, not two: a degraded API and an unreachable one point at
 * different faults, and the shell has to say which.
 */
export type HealthOutcome = { kind: 'ok' } | { kind: 'degraded' } | { kind: 'unreachable' }

const healthResponse = z.object({
  data: z.object({
    status: z.union([z.literal('ok'), z.literal('degraded')]),
    database: z.union([z.literal('up'), z.literal('down')]),
  }),
})

export async function fetchHealth(
  apiOrigin: string,
  fetchImpl: typeof fetch = fetch,
): Promise<HealthOutcome> {
  try {
    const response = await fetchImpl(`${apiOrigin}/api/health`)
    const body = healthResponse.parse(await response.json())

    return { kind: body.data.status === 'ok' ? 'ok' : 'degraded' }
  } catch {
    // A network failure and an answer we cannot read are the same thing to a
    // caller: the API did not tell us anything usable.
    return { kind: 'unreachable' }
  }
}
