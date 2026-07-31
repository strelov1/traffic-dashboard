import {
  Bar,
  BarChart,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import type { CategoryTotal } from '../api/traffic'
import type { AsyncState } from '../useAsync'

type Props = {
  title: string
  state: AsyncState<CategoryTotal[]>
  onRetry: () => void
}

const BAR_HEIGHT = 34

export function TotalsChart({ title, state, onRetry }: Props) {
  return (
    <section className="panel" aria-labelledby={headingId(title)}>
      <h2 id={headingId(title)}>{title}</h2>
      {renderBody(title, state, onRetry)}
    </section>
  )
}

function renderBody(title: string, state: AsyncState<CategoryTotal[]>, onRetry: () => void) {
  if (state.status === 'loading') {
    return (
      <p className="panel__note" role="status">
        Loading…
      </p>
    )
  }

  if (state.status === 'failed') {
    return (
      <div className="panel__failure">
        <p className="panel__note panel__note--failed" role="status">
          Could not load this chart: {state.reason}
        </p>
        {/* One retry per panel, each named after the chart it reloads: the
            visible word is the same on both, and a reader listing the page's
            controls would otherwise meet two identical buttons. */}
        <button
          type="button"
          className="panel__retry"
          aria-label={`Try again: ${title}`}
          onClick={onRetry}
        >
          Try again
        </button>
      </div>
    )
  }

  if (state.value.length === 0) {
    return (
      <p className="panel__note" role="status">
        No traffic recorded yet.
      </p>
    )
  }

  return <Bars totals={state.value} />
}

function Bars({ totals }: { totals: CategoryTotal[] }) {
  const sum = totals.reduce((running, entry) => running + entry.total, 0)
  const data = totals.map((entry) => ({ ...entry, display: entry.total.toLocaleString('en') }))

  return (
    <ResponsiveContainer width="100%" height={totals.length * BAR_HEIGHT + 24}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 56, bottom: 4, left: 4 }}>
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="label"
          width={92}
          tickLine={false}
          axisLine={false}
          tick={{ fill: 'var(--ink-secondary)', fontSize: 13 }}
        />
        <Tooltip
          cursor={{ fill: 'var(--surface-hover)' }}
          formatter={(value) => {
            const count = typeof value === 'number' ? value : 0

            return `${count.toLocaleString('en')} · ${share(count, sum)} of total`
          }}
          contentStyle={{
            background: 'var(--surface-1)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            color: 'var(--ink-primary)',
          }}
        />
        {/* One colour for every bar: length already encodes magnitude, and a
            ramp across categories with no natural order double-encodes it. */}
        <Bar dataKey="total" name="Detections" fill="var(--series-1)" radius={[0, 4, 4, 0]} isAnimationActive={false}>
          <LabelList
            dataKey="display"
            position="right"
            fill="var(--ink-secondary)"
            fontSize={13}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

function share(value: number, sum: number): string {
  return sum === 0 ? '0%' : `${((value / sum) * 100).toFixed(1)}%`
}

function headingId(title: string): string {
  return `chart-${title.toLowerCase().replaceAll(' ', '-')}`
}
