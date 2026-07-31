import type { StoredTrafficEvent, TrafficEvent } from './domain/detection.js'
import type { CountryTotal, VehicleTypeTotal } from './domain/totals.js'

/**
 * What this slice needs from storage, stated by the slice rather than by
 * whatever Postgres happens to return.
 *
 * It lives beside the domain instead of inside it because it is a statement
 * about this application's needs, not about traffic. `http` names this file;
 * `infra` implements it; neither names the other.
 */
export type TrafficRepository = {
  insertMany: (events: TrafficEvent[]) => Promise<number>
  /**
   * Classification only. Moving an event between hours would leave the bucket it
   * came from counting a detection that is no longer there, and the reconcile
   * sees only where it landed. The transport already refuses the instant; the
   * contract says so too, rather than leaving the door shut only by convention.
   */
  updateEvent: (
    id: string,
    change: Partial<Pick<TrafficEvent, 'plateCountry' | 'vehicleType'>>,
  ) => Promise<StoredTrafficEvent | undefined>
  deleteEvent: (id: string) => Promise<boolean>
  countEvents: () => Promise<number>
  totalsByCountry: () => Promise<CountryTotal[]>
  totalsByVehicleType: () => Promise<VehicleTypeTotal[]>
}
