import type { TrafficEvent } from '../traffic/domain/detection.js'
import type { VehicleType } from '../traffic/domain/vehicle-type.js'

type Spec = [plateCountry: string, vehicleType: VehicleType, count: number]

/**
 * Builds a batch from `[country, type, count]` triples, so a suite states the
 * shape of the data it needs rather than the loop that makes it.
 *
 * Stamped at the moment of the call, not a fixed date: events land in the live
 * window of the continuous aggregate, which is where a detection recorded by a
 * camera lands. A suite that means "recorded in the past" says so with `at`.
 */
export function trafficEvents(...spec: Spec[]): TrafficEvent[] {
  return eventsAt(new Date(), ...spec)
}

export function eventsAt(at: Date, ...spec: Spec[]): TrafficEvent[] {
  return spec.flatMap(([plateCountry, vehicleType, count]) =>
    Array.from({ length: count }, () => ({
      occurredAt: at,
      plateCountry,
      vehicleType,
    })),
  )
}
