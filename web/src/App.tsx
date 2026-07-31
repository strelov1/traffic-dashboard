import type { CategoryTotal } from './api/traffic'
import { TotalsChart } from './components/TotalsChart'
import { useAsync } from './useAsync'

type Props = {
  loadByCountry: () => Promise<CategoryTotal[]>
  loadByVehicleType: () => Promise<CategoryTotal[]>
}

export function App({ loadByCountry, loadByVehicleType }: Props) {
  const [byCountry, reloadByCountry] = useAsync(loadByCountry)
  const [byVehicleType, reloadByVehicleType] = useAsync(loadByVehicleType)

  // Summed from an aggregate already on hand rather than fetched: one more
  // endpoint for a number the page can add up itself would be one more thing
  // to keep consistent.
  const total =
    byCountry.status === 'loaded'
      ? byCountry.value.reduce((running, entry) => running + entry.total, 0)
      : undefined

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
            {total === undefined ? '—' : total.toLocaleString('en')}
          </span>
          <span className="headline__label">vehicles detected</span>
        </p>
      </header>

      <main className="grid">
        <TotalsChart title="By plate country" state={byCountry} onRetry={reloadByCountry} />
        <TotalsChart title="By vehicle type" state={byVehicleType} onRetry={reloadByVehicleType} />
      </main>
    </div>
  )
}
