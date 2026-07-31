import { PERIOD_LABELS, PERIODS, type Filter, type PeriodChoice } from '../filters'

type Props = {
  filter: Filter
  /** Every country the current period reported, in the order the chart shows. */
  countries: string[]
  onChange: (filter: Filter) => void
}

const EVERY_COUNTRY = ''

/**
 * Two native selects rather than a widget. A select is keyboard-operable, is
 * labelled by the platform, and reads correctly to a screen reader without any
 * of that being this project's to get right.
 */
export function FilterControls({ filter, countries, onChange }: Props) {
  return (
    <div className="controls">
      <label className="control">
        <span className="control__label">Period</span>
        <select
          className="control__input"
          value={filter.period}
          onChange={(event) => {
            onChange({ ...filter, period: event.target.value as PeriodChoice })
          }}
        >
          {PERIODS.map((period) => (
            <option key={period} value={period}>
              {PERIOD_LABELS[period]}
            </option>
          ))}
        </select>
      </label>

      <label className="control">
        <span className="control__label">Country</span>
        <select
          className="control__input"
          value={filter.country ?? EVERY_COUNTRY}
          onChange={(event) => {
            const country = event.target.value

            onChange({
              period: filter.period,
              ...(country === EVERY_COUNTRY ? {} : { country }),
            })
          }}
        >
          <option value={EVERY_COUNTRY}>All countries</option>
          {countries.map((country) => (
            <option key={country} value={country}>
              {country}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
