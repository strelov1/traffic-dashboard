import type { CategoryTotal } from './api/traffic'
import { TotalsChart } from './components/TotalsChart'
import { useAsync } from './useAsync'

type Props = {
  loadByCountry: () => Promise<CategoryTotal[]>
  loadByVehicleType: () => Promise<CategoryTotal[]>
}

export function App({ loadByCountry, loadByVehicleType }: Props) {
  const byCountry = useAsync(loadByCountry)
  const byVehicleType = useAsync(loadByVehicleType)

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
        <h1>Traffic</h1>
        <p className="headline">
          <span className="headline__value" data-testid="total-events">
            {total === undefined ? '—' : total.toLocaleString('en')}
          </span>
          <span className="headline__label">vehicles detected</span>
        </p>
      </header>

      <main className="grid">
        <TotalsChart title="By plate country" state={byCountry} />
        <TotalsChart title="By vehicle type" state={byVehicleType} />
      </main>
    </div>
  )
}
