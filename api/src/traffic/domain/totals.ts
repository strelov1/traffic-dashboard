import type { VehicleType } from './vehicle-type.js'

/**
 * What the two aggregates answer: a category and how many detections fall in
 * it. Ordering is part of the contract and belongs to the query, not the shape.
 */
export type CountryTotal = {
  plateCountry: string
  total: number
}

export type VehicleTypeTotal = {
  vehicleType: VehicleType
  total: number
}
