import { z } from 'zod'

import type { Database } from '../db.js'
import { VEHICLE_TYPES, type VehicleType } from './vehicle-types.js'

export type TrafficEvent = {
  occurredAt: Date
  plateCountry: string
  vehicleType: VehicleType
}

export type CountryTotal = {
  plateCountry: string
  total: number
}

export type VehicleTypeTotal = {
  vehicleType: VehicleType
  total: number
}

export type TrafficRepository = {
  insertMany: (events: TrafficEvent[]) => Promise<number>
  countEvents: () => Promise<number>
  totalsByCountry: () => Promise<CountryTotal[]>
  totalsByVehicleType: () => Promise<VehicleTypeTotal[]>
}

const insertedId = z.object({ id: z.string() })

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

// The tie-break is part of the contract: without it, equal totals may swap
// between requests and a chart reorders for no reason the reader can see.
const TOTALS_BY_COUNTRY = `
  select plate_country as "plateCountry", count(*) as total
  from traffic_events
  group by plate_country
  order by total desc, plate_country asc
`

const TOTALS_BY_VEHICLE_TYPE = `
  select vehicle_type as "vehicleType", count(*) as total
  from traffic_events
  group by vehicle_type
  order by total desc, vehicle_type asc
`

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

    totalsByCountry: () => database.query(countryTotal, TOTALS_BY_COUNTRY),

    totalsByVehicleType: () => database.query(vehicleTypeTotal, TOTALS_BY_VEHICLE_TYPE),
  }
}
