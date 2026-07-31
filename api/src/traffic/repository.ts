import { z } from 'zod'

import type { Database } from '../db.js'
import type { VehicleType } from './vehicle-types.js'

export type TrafficEvent = {
  occurredAt: Date
  plateCountry: string
  vehicleType: VehicleType
}

export type TrafficRepository = {
  insertMany: (events: TrafficEvent[]) => Promise<number>
  countEvents: () => Promise<number>
}

const insertedId = z.object({ id: z.string() })

// count(*) is a bigint, which pg returns as a string so that values beyond
// 2^53 keep their precision. Coerced here rather than cast in SQL, where ::int
// would overflow instead of losing precision.
const total = z.object({ total: z.coerce.number().int().nonnegative() })

const INSERT_MANY = `
  insert into traffic_events (occurred_at, plate_country, vehicle_type)
  select * from unnest($1::timestamptz[], $2::text[], $3::text[])
  returning id
`

export function createTrafficRepository(database: Database): TrafficRepository {
  return {
    insertMany: async (events) => {
      if (events.length === 0) {
        return 0
      }

      const rows = await database.query(insertedId, INSERT_MANY, [
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
  }
}
