/**
 * What the reader can narrow the dashboard to, and how that choice travels in
 * the URL. Kept out of the components because two of them read it, the API
 * client is parameterised by it, and it is the one piece of dashboard state
 * that has to survive a reload.
 */

/**
 * Relative presets rather than a date picker.
 *
 * A traffic dashboard is asked "what has been happening lately", and a free
 * picker would produce arbitrary instants that the API rounds to the hour
 * anyway — a disproportionate amount of interface for a page with two bar
 * charts. It also keeps the space of requests small, which is what a cache in
 * front of the aggregates would need and what the README says is missing today.
 */
export const PERIODS = ['24h', '7d', '30d', 'all'] as const

export type PeriodChoice = (typeof PERIODS)[number]

export type Filter = {
  period: PeriodChoice
  /** Absent means every country, which is not the same as any one of them. */
  country?: string
}

export const DEFAULT_FILTER: Filter = { period: 'all' }

export const PERIOD_LABELS: Record<PeriodChoice, string> = {
  '24h': 'Last 24 hours',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  all: 'All time',
}

const HOUR_MS = 60 * 60 * 1000

const PERIOD_HOURS: Record<PeriodChoice, number | undefined> = {
  '24h': 24,
  '7d': 24 * 7,
  '30d': 24 * 30,
  all: undefined,
}

// The same two-uppercase-letter rule the API and the database state. Restated
// here so a country from a stale link is dropped before it becomes a request
// the API would refuse.
const PLATE_COUNTRY = /^[A-Z]{2}$/

/**
 * Read defensively: the URL is user input, and a value this dashboard does not
 * offer falls back to the default rather than rendering an error. The controls
 * then show what is actually in effect, so the reader is never looking at a
 * chart whose filter disagrees with the control beside it.
 */
export function parseFilter(search: string): Filter {
  const parameters = new URLSearchParams(search)
  const period = parameters.get('period')
  const country = parameters.get('country')

  return {
    period: isPeriod(period) ? period : DEFAULT_FILTER.period,
    ...(country !== null && PLATE_COUNTRY.test(country) ? { country } : {}),
  }
}

/**
 * The preset travels, not the instants it resolves to. "The last seven days" is
 * what the reader chose; a link pinning yesterday's instants would answer a
 * question nobody asked when it is opened tomorrow.
 *
 * The default is omitted rather than spelled out, so an unfiltered view is a
 * bare URL and `?period=all` normalises to one on the next selection.
 */
export function toSearch(filter: Filter): string {
  const parameters = new URLSearchParams()

  if (filter.period !== DEFAULT_FILTER.period) {
    parameters.set('period', filter.period)
  }

  if (filter.country !== undefined) {
    parameters.set('country', filter.country)
  }

  const query = parameters.toString()

  return query === '' ? '' : `?${query}`
}

/**
 * Resolved at request time from the caller's clock, which is why `now` is a
 * parameter: the browser's clock only ever produces a *request*, and the
 * boundary that counts is the one the server rounds to and states back.
 *
 * The end is left open. "The last seven days" ends at whatever now happens to
 * be, and pinning it would drop a detection recorded while the request was in
 * flight — a bound the reader neither chose nor could notice.
 */
export function periodBounds(period: PeriodChoice, now: Date): { from?: string } {
  const hours = PERIOD_HOURS[period]

  return hours === undefined ? {} : { from: new Date(now.getTime() - hours * HOUR_MS).toISOString() }
}

/**
 * Each chart is keyed by what its own request depends on, and no more.
 *
 * The by-country aggregate does not take a country, so keying it on the whole
 * filter would blank it and re-fetch it every time the country changed, to
 * arrive at exactly the same bars.
 */
export function countryChartKey(filter: Filter): string {
  return filter.period
}

export function vehicleTypeChartKey(filter: Filter): string {
  return `${filter.period}|${filter.country ?? ''}`
}

function isPeriod(value: string | null): value is PeriodChoice {
  return PERIODS.some((period) => period === value)
}
