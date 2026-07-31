import type { VehicleType } from './vehicle-type.js'

/**
 * A vehicle passing a camera at a moment: the instant, the country that issued
 * its plate, its class. Stored at this grain and never as a pre-aggregated
 * count, because aggregation is one-way.
 */
export type TrafficEvent = {
  occurredAt: Date
  plateCountry: string
  vehicleType: VehicleType
}

export type StoredTrafficEvent = TrafficEvent & { id: string }

/**
 * A stated instant that this runtime cannot hold.
 *
 * Carries no status code. Which HTTP answer this deserves is the transport's
 * question, and the domain does not have an opinion about HTTP.
 */
export class UnrepresentableInstant extends Error {
  constructor(value: string) {
    super(`occurredAt is not an instant this system can represent: ${value}`)
    this.name = 'UnrepresentableInstant'
  }
}

/**
 * The only place untrusted input becomes a traffic event, which is why it lives
 * with the domain rather than with the transport that happens to call it — and
 * why the instant is checked once here instead of at each route.
 *
 * The parameter is structural on purpose. Naming it here would mean the domain
 * declaring a shape whose instant is an RFC 3339 *string* — HTTP's encoding
 * chosen for it — and a second ingress carrying an epoch would have to bend to
 * that or fork the type. The wire shape stays with the wire.
 */
export function toEvent(detection: {
  plateCountry: string
  vehicleType: VehicleType
  occurredAt?: string
}): TrafficEvent {
  return {
    // The detection happened when the camera saw it, not when the network
    // delivered it, so a caller's instant wins over the server's clock.
    occurredAt: detection.occurredAt === undefined ? new Date() : instantFrom(detection.occurredAt),
    plateCountry: detection.plateCountry,
    vehicleType: detection.vehicleType,
  }
}

/**
 * A date-time format check is not a representability check. `23:59:60` is a
 * legal RFC 3339 instant, and Postgres normalises it without complaint, but
 * `Date` cannot hold a leap second — it yields an invalid value that survives
 * every type in the system and only fails at the driver, as `NaN`.
 */
function instantFrom(value: string): Date {
  const at = new Date(value)

  if (Number.isNaN(at.getTime())) {
    throw new UnrepresentableInstant(value)
  }

  return at
}
