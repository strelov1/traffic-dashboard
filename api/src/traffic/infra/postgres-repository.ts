import { z } from 'zod'

import type { Database } from '../../platform/database.js'
import { VEHICLE_TYPES } from '../domain/vehicle-type.js'
import type { TrafficRepository } from '../ports.js'

const eventId = z.object({ id: z.string() })

const removedEvent = z.object({ id: z.string(), occurredAt: z.date() })

const olderBucket = z.object({ older: z.boolean() })

// count(*) is a bigint, which pg returns as a string so that values beyond
// 2^53 keep their precision. Coerced here rather than cast in SQL, where ::int
// would overflow instead of losing precision.
const total = z.object({ total: z.coerce.number().int().nonnegative() })

const countryTotal = z.object({
  plateCountry: z.string(),
  total: z.coerce.number().int().nonnegative(),
})

const vehicleTypeTotal = z.object({
  vehicleType: z.enum(VEHICLE_TYPES),
  total: z.coerce.number().int().nonnegative(),
})

// Read from the maintained hourly totals rather than the events: the cost is the
// number of buckets times the number of categories, not the size of the table.
//
// The tie-break is part of the contract: without it, equal totals may swap
// between requests and a chart reorders for no reason the reader can see.
const TOTALS_BY_COUNTRY = `
  select plate_country as "plateCountry", sum(total)::bigint as total
  from traffic_hourly_totals
  group by plate_country
  order by total desc, plate_country asc
`

const TOTALS_BY_VEHICLE_TYPE = `
  select vehicle_type as "vehicleType", sum(total)::bigint as total
  from traffic_hourly_totals
  group by vehicle_type
  order by total desc, vehicle_type asc
`

const storedEvent = z.object({
  id: z.string(),
  occurredAt: z.date(),
  plateCountry: z.string(),
  vehicleType: z.enum(VEHICLE_TYPES),
})

// coalesce so an absent field keeps its stored value: one statement covers
// every subset of a partial correction.
const UPDATE_EVENT = `
  update traffic_events set
    plate_country = coalesce($2, plate_country),
    vehicle_type = coalesce($3, vehicle_type)
  where id = $1
  returning id, occurred_at as "occurredAt",
            plate_country as "plateCountry", vehicle_type as "vehicleType"
`

const DELETE_EVENT =
  'delete from traffic_events where id = $1 returning id, occurred_at as "occurredAt"'

// Strictly older, not merely different. A bucket in the FUTURE is also "not the
// current one", and materialising it would drag the watermark past the present:
// every later read would be served from the materialised side alone, with the
// live tail — the last hour of detections — counted by nothing. A mistyped year
// followed by the DELETE that corrects it is all it takes.
const IS_OLDER_BUCKET = `
  select time_bucket('1 hour', $1::timestamptz) < time_bucket('1 hour', now()) as older
`

// Reconciles one bucket with the events under it.
//
// Real-time aggregation only ever ADDS rows newer than the watermark. It cannot
// subtract a removed detection or re-classify a corrected one, so a mutation
// below the watermark is invisible to every later read until the bucket is
// rebuilt — and the refresh policy only ever revisits its trailing window.
//
// The range is computed from the event's own instant, in SQL: bucket boundaries
// were computed with the database's clock, and a skewed container clock must not
// be what decides which hour gets materialised.
const REFRESH_BUCKET = `
  call refresh_continuous_aggregate(
    'traffic_hourly_totals',
    time_bucket('1 hour', $1::timestamptz),
    time_bucket('1 hour', $1::timestamptz) + interval '1 hour'
  )
`

const INSERT_MANY = `
  insert into traffic_events (occurred_at, plate_country, vehicle_type)
  select * from unnest($1::timestamptz[], $2::text[], $3::text[])
  returning id
`

export type RepositoryOptions = {
  /**
   * Reported rather than raised. By the time a reconcile can fail the mutation
   * has committed, and answering failure for a write that succeeded would be a
   * worse answer than a total the refresh policy may still repair.
   */
  onReconcileFailure?: (error: unknown) => void
}

/**
 * Rebuilds the hourly bucket containing `occurredAt`, but only when that bucket
 * is strictly older than the one containing the present.
 *
 * Neither exception is an optimisation. Materialising the current bucket moves
 * the watermark to the end of this hour, and every detection recorded into the
 * same hour afterwards then falls below it — counted by neither the materialised
 * side nor the live tail. Migration 0004 gives this as the reason `end_offset`
 * is a whole bucket; the same reasoning applies to refreshing on demand. A
 * bucket in the future is worse still: it would drag the watermark past the
 * present and leave the live tail counted by nothing at all.
 *
 * Deciding on "is this the current bucket" rather than on the policy's trailing
 * window keeps that seven-day number in the migration that declares it, and
 * needs nothing but the event's own instant. The cost is refreshing a few
 * buckets the policy would have reached anyway; the gain is that a correction is
 * visible to the next read instead of up to a schedule interval later.
 */
async function reconcileBucket(
  database: Database,
  occurredAt: Date,
  onFailure: (error: unknown) => void,
): Promise<void> {
  try {
    const [bucket] = await database.query(olderBucket, IS_OLDER_BUCKET, [occurredAt])

    // Only a definite yes materialises. The current bucket is served live and
    // needs no refresh; a future one must not be touched at all.
    if (bucket?.older !== true) {
      return
    }

    await database.query(z.unknown(), REFRESH_BUCKET, [occurredAt])
  } catch (error: unknown) {
    onFailure(error)
  }
}

export function createTrafficRepository(
  database: Database,
  options: RepositoryOptions = {},
): TrafficRepository {
  const onReconcileFailure =
    options.onReconcileFailure ??
    ((error: unknown) => {
      console.error('failed to reconcile the hourly totals', error)
    })

  return {
    insertMany: async (events) => {
      if (events.length === 0) {
        return 0
      }

      const rows = await database.query(eventId, INSERT_MANY, [
        events.map((it) => it.occurredAt),
        events.map((it) => it.plateCountry),
        events.map((it) => it.vehicleType),
      ])

      return rows.length
    },

    countEvents: async () => {
      const rows = await database.query(total, 'select count(*) as total from traffic_events')

      return rows[0]?.total ?? 0
    },

    updateEvent: async (id, change) => {
      const rows = await database.query(storedEvent, UPDATE_EVENT, [
        id,
        change.plateCountry ?? null,
        change.vehicleType ?? null,
      ])

      const updated = rows[0]

      if (updated === undefined) {
        return undefined
      }

      await reconcileBucket(database, updated.occurredAt, onReconcileFailure)

      return updated
    },

    deleteEvent: async (id) => {
      const [removed] = await database.query(removedEvent, DELETE_EVENT, [id])

      if (removed === undefined) {
        return false
      }

      await reconcileBucket(database, removed.occurredAt, onReconcileFailure)

      return true
    },

    totalsByCountry: () => database.query(countryTotal, TOTALS_BY_COUNTRY),

    totalsByVehicleType: () => database.query(vehicleTypeTotal, TOTALS_BY_VEHICLE_TYPE),
  }
}
