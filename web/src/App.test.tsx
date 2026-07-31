import { render, screen } from '@testing-library/react'
import { cloneElement, type ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { App } from './App'
import type { CategoryTotal } from './api/traffic'

vi.mock('recharts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('recharts')>()),
  ResponsiveContainer: ({ children }: { children: ReactElement<{ width?: number; height?: number }> }) =>
    cloneElement(children, { width: 640, height: 320 }),
}))

const never = () => new Promise<CategoryTotal[]>(() => undefined)
const resolving = (value: CategoryTotal[]) => () => Promise.resolve(value)
const failing = (reason: string) => () => Promise.reject(new Error(reason))

describe('App', () => {
  it('titles both charts', async () => {
    render(<App loadByCountry={resolving([])} loadByVehicleType={resolving([])} />)

    expect(await screen.findByRole('heading', { name: /country/i })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: /vehicle type/i })).toBeInTheDocument()
  })

  it('links to the source, opened without handing the opener over', () => {
    render(<App loadByCountry={resolving([])} loadByVehicleType={resolving([])} />)

    const link = screen.getByRole('link', { name: /source/i })

    expect(link).toHaveAttribute('href', 'https://github.com/strelov1/traffic-dashboard')
    // rel=noreferrer with target=_blank: without it the opened page gets a
    // handle on this one through window.opener.
    expect(link).toHaveAttribute('rel', 'noreferrer')
  })

  it('leads with the total number of recorded events', async () => {
    render(
      <App
        loadByCountry={resolving([
          { label: 'AE', total: 3 },
          { label: 'SA', total: 1 },
        ])}
        loadByVehicleType={resolving([])}
      />,
    )

    expect(await screen.findByTestId('total-events')).toHaveTextContent('4')
  })

  it('holds the total back until the aggregate it is derived from arrives', () => {
    render(<App loadByCountry={never} loadByVehicleType={resolving([])} />)

    expect(screen.getByTestId('total-events')).toHaveTextContent('—')
  })

  it('renders one chart while the other is still loading', async () => {
    render(
      <App
        loadByCountry={never}
        loadByVehicleType={resolving([{ label: 'car', total: 7 }])}
      />,
    )

    expect(await screen.findByText('car', { selector: 'tspan' })).toBeInTheDocument()
  })

  it('reports a failed chart without disturbing the one that loaded', async () => {
    render(
      <App
        loadByCountry={failing('answered 500')}
        loadByVehicleType={resolving([{ label: 'car', total: 7 }])}
      />,
    )

    expect(await screen.findByText(/could not load/i)).toBeInTheDocument()
    expect(await screen.findByText('car', { selector: 'tspan' })).toBeInTheDocument()
  })
})
