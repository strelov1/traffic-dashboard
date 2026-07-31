import type { StoredTrafficEvent, TrafficEvent } from './domain/detection.js'
import type { Period } from './domain/period.js'
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
  /**
   * The period is required, not optional-with-a-default. Reading all of history
   * is a decision now, and a caller who forgets to narrow gets a compile error
   * rather than all-time totals under a filtered heading — a wrong answer that
   * looks entirely right. `UNBOUNDED` says "all of it" out loud.
   *
   * Bounds are expected on bucket boundaries; `toPeriod` is what puts them
   * there. A bound partway through an hour would drop the bucket containing it,
   * which is the under-reporting that rounding outward exists to prevent.
   */
  totalsByCountry: (period: Period) => Promise<CountryTotal[]>
  /**
   * Takes the plate country its counterpart does not. Narrowing the by-country
   * aggregate to one country leaves a single bar — a drill-down into a
   * different question, not a filter — so the asymmetry is declared here rather
   * than hidden behind a shared filter object that one of the two ignores.
   */
  totalsByVehicleType: (period: Period, plateCountry?: string) => Promise<VehicleTypeTotal[]>
}
