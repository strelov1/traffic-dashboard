import type { CategoryTotal, Detection } from './api/traffic'
import { DetectionForm } from './components/DetectionForm'
import { FilterControls } from './components/FilterControls'
import { TotalsChart } from './components/TotalsChart'
import { countryChartKey, PERIOD_LABELS, vehicleTypeChartKey, type Filter } from './filters'
import { useAsync, type AsyncState } from './useAsync'
import { useUrlFilter } from './useUrlFilter'

type Props = {
  loadByCountry: (filter: Filter) => Promise<CategoryTotal[]>
  loadByVehicleType: (filter: Filter) => Promise<CategoryTotal[]>
  record: (detection: Detection) => Promise<void>
}

export function App({ loadByCountry, loadByVehicleType, record }: Props) {
  const [filter, select] = useUrlFilter()

  // Each chart is keyed by what its own request depends on. The country chart
  // takes no country, so it holds still while the reader changes one.
  const [byCountry, reloadByCountry] = useAsync(countryChartKey(filter), () =>
    loadByCountry(filter),
  )
  const [byVehicleType, reloadByVehicleType] = useAsync(vehicleTypeChartKey(filter), () =>
    loadByVehicleType(filter),
  )

  return (
    <div className="page">
      <header className="page__header">
        <div className="page__title">
          <h1>Traffic</h1>
          <a
            className="source"
            href="https://github.com/strelov1/traffic-dashboard"
            target="_blank"
            rel="noreferrer"
          >
            Source
          </a>
        </div>
        <p className="headline">
          <span className="headline__value" data-testid="total-events">
            {headline(byCountry, filter.country)}
          </span>
          <span className="headline__label">vehicles detected</span>
          {/* The number is never shown without its scope. A total that ignored
              the controls beside it would be a claim the reader cannot check. */}
          <span className="headline__scope" data-testid="headline-scope">
            {scopeOf(filter)}
          </span>
        </p>
        <FilterControls
          filter={filter}
          countries={countriesOf(byCountry, filter)}
          onChange={select}
        />
      </header>

      <main>
        <div className="grid">
          <TotalsChart title="By plate country" state={byCountry} onRetry={reloadByCountry} />
          <TotalsChart title="By vehicle type" state={byVehicleType} onRetry={reloadByVehicleType} />
        </div>

        {/* Below the grid rather than in it: the grid is auto-fit, so a third
            child would resolve to three tracks and shrink both charts at the
            width where they read best.

            Both charts re-read on a success, through the reload each already
            has. The recorded detection is counted by the next read — the
            current hour is served live — so the number moves, which is the only
            thing this control demonstrates that `curl` does not. */}
        <DetectionForm
          record={record}
          onRecorded={() => {
            reloadByCountry()
            reloadByVehicleType()
          }}
        />
      </main>
    </div>
  )
}

/**
 * Derived from the aggregate already on hand rather than fetched. One more
 * endpoint for a number the page can add up itself would be one more thing to
 * keep consistent — and, with a country chosen, one more chance for the
 * headline and the chart to have been fetched at different moments.
 *
 * A chosen country with no entry counts zero, which is the truth: the country
 * aggregate lists every country with traffic in this period, so an absence
 * there is an absence of traffic rather than missing data.
 */
function headline(state: AsyncState<CategoryTotal[]>, country: string | undefined): string {
  if (state.status !== 'loaded') {
    return '—'
  }

  const counted =
    country === undefined ? state.value : state.value.filter((entry) => entry.label === country)

  return counted.reduce((running, entry) => running + entry.total, 0).toLocaleString('en')
}

/**
 * The countries the current period actually reported, plus whichever one is
 * selected. A country that arrived in a link and has no traffic in this period
 * still has to appear, or the control would read "All countries" while the
 * chart beside it showed one — the exact disagreement the URL exists to avoid.
 */
function countriesOf(state: AsyncState<CategoryTotal[]>, filter: Filter): string[] {
  const reported = state.status === 'loaded' ? state.value.map((entry) => entry.label) : []

  return filter.country === undefined || reported.includes(filter.country)
    ? reported
    : [...reported, filter.country]
}

function scopeOf(filter: Filter): string {
  const period = PERIOD_LABELS[filter.period]

  return filter.country === undefined ? period : `${period} · ${filter.country}`
}
