import { z } from 'zod'

import type { Database } from '../db.js'
import type { TrafficRepository } from './repository.js'

export type SeedOptions = {
  events: number
}

// Weights are expressed by repetition rather than by a cumulative-probability
// expression: the ratios stay readable, and the pick stays a single array index.
const PLATE_COUNTRY_POOL = ['AE', 'AE', 'AE', 'AE', 'AE', 'SA', 'SA', 'OM', 'QA', 'KW', 'BH']
const VEHICLE_TYPE_POOL = ['car', 'car', 'car', 'car', 'car', 'car', 'van', 'van', 'truck', 'bus', 'motorcycle', 'bicycle']

const SEED_DAYS = 30

// The refresh policy only ever materialises its trailing window, so history
// written in bulk is invisible to the aggregate until it is backfilled once.
// Without this the dashboard showed the last seven days of a thirty-day seed
// and reported a quarter of the traffic, with no error anywhere.
const BACKFILL = `call refresh_continuous_aggregate('traffic_hourly_totals', null, now() - interval '1 hour')`

const GENERATE = `
  insert into traffic_events (occurred_at, plate_country, vehicle_type)
  select
    now() - (random() * ($2::int * interval '1 day')),
    ($3::text[])[1 + floor(random() * array_length($3::text[], 1))::int],
    ($4::text[])[1 + floor(random() * array_length($4::text[], 1))::int]
  from generate_series(1, $1::int)
`

/**
 * Fills an empty table. Emptiness is the condition rather than a marker row: it
 * is the state the caller cares about, and it stays correct when events arrive
 * from somewhere other than this seed.
 */
export async function seedTrafficEvents(
  database: Database,
  repository: Pick<TrafficRepository, 'countEvents'>,
  options: SeedOptions,
): Promise<number> {
  if ((await repository.countEvents()) > 0) {
    return 0
  }

  await database.query(z.unknown(), GENERATE, [
    options.events,
    SEED_DAYS,
    PLATE_COUNTRY_POOL,
    VEHICLE_TYPE_POOL,
  ])

  await database.query(z.unknown(), BACKFILL)

  return repository.countEvents()
}
