import { instantFrom } from './instant.js'

/**
 * The stretch of time an aggregate covers, as `[from, to)`.
 *
 * Half-open rather than closed at both ends, so adjacent periods tile a
 * timeline without an hour falling in two of them, and so the arithmetic agrees
 * with the bucket's own: a detection at 13:00:00.000 belongs to the hour that
 * starts at 13:00, not to the one that ends there.
 *
 * Either bound may be absent, and an absent bound is unbounded on that side —
 * never a default the caller did not ask for and cannot see.
 */
export type Period = {
  readonly from?: Date
  readonly to?: Date
}

export const UNBOUNDED: Period = {}

/** A period whose start is after its end: an empty answer no client wanted. */
export class InvertedPeriod extends Error {
  constructor(from: string, to: string) {
    super(`from must not be later than to: from=${from}, to=${to}`)
    this.name = 'InvertedPeriod'
  }
}

// The grain of the published aggregate. Restated in migration 0004, which
// creates the hourly view, and in the repository's time_bucket calls; a
// disagreement between them shows up as a boundary test failing against
// Postgres rather than as a type error, which is why those tests exist.
const BUCKET_MS = 60 * 60 * 1000

/**
 * The only place an untrusted period becomes a domain value, which is why it
 * lives with the domain rather than with the transport that happens to call it.
 *
 * The parameter is structural for the same reason `toEvent`'s is: the wire's
 * encoding of an instant belongs to the wire, not to the domain.
 *
 * Order is judged on what the caller sent and rounding is applied after, so an
 * inverted range is named with the values that were actually written. Rounding
 * cannot invert a valid range — the start only ever moves back and the end only
 * ever forward — so nothing is refused on the strength of a boundary this
 * function moved.
 */
export function toPeriod(query: { from?: string; to?: string }): Period {
  const from = query.from === undefined ? undefined : instantFrom('from', query.from)
  const to = query.to === undefined ? undefined : instantFrom('to', query.to)

  if (from !== undefined && to !== undefined && from > to) {
    throw new InvertedPeriod(query.from ?? '', query.to ?? '')
  }

  return {
    ...(from === undefined ? {} : { from: floorToBucket(from) }),
    ...(to === undefined ? {} : { to: ceilToBucket(to) }),
  }
}

/**
 * Rounded outward, never inward: the answer then covers at least the period
 * that was asked for. Narrowing it instead would report less traffic than there
 * was, and nothing in the response would distinguish that from a quiet hour.
 *
 * Epoch milliseconds divide evenly into UTC hours, so this buckets in UTC —
 * which is the zone `time_bucket` uses on a timestamptz, and the reason a bound
 * written at +05:30 rounds to a UTC boundary rather than a local one.
 */
function floorToBucket(at: Date): Date {
  return new Date(Math.floor(at.getTime() / BUCKET_MS) * BUCKET_MS)
}

function ceilToBucket(at: Date): Date {
  return new Date(Math.ceil(at.getTime() / BUCKET_MS) * BUCKET_MS)
}
