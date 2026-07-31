/**
 * A stated instant that this runtime cannot hold.
 *
 * Carries no status code. Which HTTP answer this deserves is the transport's
 * question, and the domain does not have an opinion about HTTP.
 */
export class UnrepresentableInstant extends Error {
  constructor(field: string, value: string) {
    super(`${field} is not an instant this system can represent: ${value}`)
    this.name = 'UnrepresentableInstant'
  }
}

/**
 * A date-time format check is not a representability check. `23:59:60` is a
 * legal RFC 3339 instant, and Postgres normalises it without complaint, but
 * `Date` cannot hold a leap second — it yields an invalid value that survives
 * every type in the system and only fails at the driver, as `NaN`.
 *
 * The field is a parameter because three of them now carry an instant across
 * the boundary, and a caller who is told which one it was can fix the request.
 */
export function instantFrom(field: string, value: string): Date {
  const at = new Date(value)

  if (Number.isNaN(at.getTime())) {
    throw new UnrepresentableInstant(field, value)
  }

  return at
}
