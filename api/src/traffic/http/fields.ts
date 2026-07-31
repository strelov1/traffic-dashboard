import { VEHICLE_TYPES } from '../domain/vehicle-type.js'

/**
 * The wire's description of the values this slice accepts, in one place because
 * two routes now describe the same plate country and three fields now describe
 * the same instant. Repeating the pattern per route is how one of them ends up
 * accepting a lowercase country while the other does not.
 *
 * These restate the database's constraints so a client's mistake is a 400 that
 * names the field, not a 500 carrying a check-constraint message. The database
 * stays the last line of defence; this is the first, and only this one can
 * explain itself to a caller.
 */
export const fields = {
  plateCountry: { type: 'string', pattern: '^[A-Z]{2}$' },
  vehicleType: { type: 'string', enum: [...VEHICLE_TYPES] },
  /**
   * ajv's `date-time` requires a zone designator, which is the whole reason the
   * format is declared rather than a looser pattern: without it a bound would
   * be read in whatever zone the server happens to run in, and a filtered chart
   * would quietly disagree with itself across two deployments.
   */
  instant: { type: 'string', format: 'date-time' },
} as const
