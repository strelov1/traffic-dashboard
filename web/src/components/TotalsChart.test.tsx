import { render, screen } from '@testing-library/react'
import { cloneElement, type ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type { CategoryTotal } from '../api/traffic'
import type { AsyncState } from '../useAsync'
import { TotalsChart } from './TotalsChart'

// ResponsiveContainer measures its parent, and every element in jsdom is zero
// by zero, so the chart would render nothing. The stand-in hands the same
// dimensions down as props; the bars and labels are drawn by the real library.
vi.mock('recharts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('recharts')>()),
  ResponsiveContainer: ({ children }: { children: ReactElement<{ width?: number; height?: number }> }) =>
    cloneElement(children, { width: 640, height: 320 }),
}))

function loaded(value: CategoryTotal[]): AsyncState<CategoryTotal[]> {
  return { status: 'loaded', value }
}

describe('TotalsChart', () => {
  it('names what it counts', () => {
    render(<TotalsChart title="Traffic by country" state={loaded([])} />)

    expect(screen.getByRole('heading', { name: 'Traffic by country' })).toBeInTheDocument()
  })

  it('reports that it is loading before data arrives', () => {
    render(<TotalsChart title="Traffic by country" state={{ status: 'loading' }} />)

    expect(screen.getByRole('status')).toHaveTextContent(/loading/i)
  })

  it('states that nothing is recorded rather than drawing an empty frame', () => {
    render(<TotalsChart title="Traffic by country" state={loaded([])} />)

    expect(screen.getByRole('status')).toHaveTextContent(/no traffic recorded/i)
  })

  it('reports a failure with its reason', () => {
    render(
      <TotalsChart
        title="Traffic by country"
        state={{ status: 'failed', reason: 'answered 500' }}
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent(/could not load/i)
    expect(screen.getByRole('status')).toHaveTextContent(/answered 500/)
  })

  it('labels every category, so identity never rests on colour', () => {
    render(
      <TotalsChart
        title="Traffic by country"
        state={loaded([
          { label: 'AE', total: 30 },
          { label: 'SA', total: 10 },
        ])}
      />,
    )

    // Scoped to the tspan: Recharts nests it inside a <text>, and both carry
    // the same textContent.
    expect(screen.getByText('AE', { selector: 'tspan' })).toBeInTheDocument()
    expect(screen.getByText('SA', { selector: 'tspan' })).toBeInTheDocument()
  })

  it('shows each total without requiring interaction', () => {
    render(
      <TotalsChart
        title="Traffic by country"
        state={loaded([
          { label: 'AE', total: 1234 },
          { label: 'SA', total: 10 },
        ])}
      />,
    )

    expect(screen.getByText('1,234', { selector: 'tspan' })).toBeInTheDocument()
    expect(screen.getByText('10', { selector: 'tspan' })).toBeInTheDocument()
  })
})
