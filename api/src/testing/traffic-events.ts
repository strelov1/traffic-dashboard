import type { TrafficEvent } from '../traffic/repository.js'
import type { VehicleType } from '../traffic/vehicle-types.js'

type Spec = [plateCountry: string, vehicleType: VehicleType, count: number]

/** Builds a batch from `[country, type, count]` triples, so a suite states the shape of the data it needs rather than the loop that makes it. */
export function trafficEvents(...spec: Spec[]): TrafficEvent[] {
  return spec.flatMap(([plateCountry, vehicleType, count]) =>
    Array.from({ length: count }, () => ({
      occurredAt: new Date('2026-07-01T08:15:00Z'),
      plateCountry,
      vehicleType,
    })),
  )
}
