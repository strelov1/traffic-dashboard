import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { cloneElement, type ReactElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { App } from './App'
import { DetectionRejected, type CategoryTotal } from './api/traffic'
import type { Filter } from './filters'

vi.mock('recharts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('recharts')>()),
  ResponsiveContainer: ({ children }: { children: ReactElement<{ width?: number; height?: number }> }) =>
    cloneElement(children, { width: 640, height: 320 }),
}))

const never = () => new Promise<CategoryTotal[]>(() => undefined)
const resolving = (value: CategoryTotal[]) => () => Promise.resolve(value)
const failing = (reason: string) => () => Promise.reject(new Error(reason))

/** The API takes the detection. What the form does with it is its own suite. */
const stored = () => Promise.resolve()

// The filter lives in the URL, so every test that touches it leaves one behind.
afterEach(() => {
  window.history.replaceState(null, '', '/')
})

// Exact labels: the by-country panel is labelled by its own heading, so a
// loose /country/i matches the chart as well as the control.
const periodControl = () => screen.getByLabelText('Period')
const countryControl = () => screen.getByLabelText('Country')

const countryOptions = () =>
  [...countryControl().querySelectorAll('option')].map((option) => option.value)

/** Each chart reports itself in its own region, and the form has one too. */
const panelNote = (chart: RegExp) =>
  within(screen.getByRole('region', { name: chart })).getByRole('status')

const submitOne = () => {
  fireEvent.change(screen.getByLabelText('Plate country'), { target: { value: 'AE' } })
  fireEvent.click(screen.getByRole('button', { name: 'Record' }))
}

/** Records the filter each chart was asked for, in the order it was asked. */
function recording(value: CategoryTotal[] = []) {
  const filters: Filter[] = []
  const load = (filter: Filter) => {
    filters.push(filter)

    return Promise.resolve(value)
  }

  return { filters, load }
}

describe('App', () => {
  it('titles both charts', async () => {
    render(<App record={stored} loadByCountry={resolving([])} loadByVehicleType={resolving([])} />)

    expect(await screen.findByRole('heading', { name: /country/i })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: /vehicle type/i })).toBeInTheDocument()
  })

  it('links to the source, opened without handing the opener over', () => {
    render(<App record={stored} loadByCountry={resolving([])} loadByVehicleType={resolving([])} />)

    const link = screen.getByRole('link', { name: /source/i })

    expect(link).toHaveAttribute('href', 'https://github.com/strelov1/traffic-dashboard')
    // rel=noreferrer with target=_blank: without it the opened page gets a
    // handle on this one through window.opener.
    expect(link).toHaveAttribute('rel', 'noreferrer')
  })

  it('leads with the total number of recorded events', async () => {
    render(
      <App
        record={stored}
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
    render(<App record={stored} loadByCountry={never} loadByVehicleType={resolving([])} />)

    expect(screen.getByTestId('total-events')).toHaveTextContent('—')
  })

  it('renders one chart while the other is still loading', async () => {
    render(
      <App
        record={stored}
        loadByCountry={never}
        loadByVehicleType={resolving([{ label: 'car', total: 7 }])}
      />,
    )

    expect(await screen.findByText('car', { selector: 'tspan' })).toBeInTheDocument()
  })

  it('recovers a failed chart, and the headline with it, when the reader retries', async () => {
    // The API is unreachable while nginx already serves the bundle, then
    // answers: the first visit fails and the second one works.
    const loadByCountry = vi
      .fn<() => Promise<CategoryTotal[]>>()
      .mockRejectedValueOnce(new Error('answered 500'))
      .mockResolvedValueOnce([{ label: 'AE', total: 4 }])

    render(<App record={stored} loadByCountry={loadByCountry} loadByVehicleType={resolving([])} />)

    fireEvent.click(await screen.findByRole('button', { name: /try again: by plate country/i }))

    expect(await screen.findByText('AE', { selector: 'tspan' })).toBeInTheDocument()
    expect(screen.getByTestId('total-events')).toHaveTextContent('4')
  })

  it('retries only the chart that failed', async () => {
    const loadByVehicleType = vi
      .fn<() => Promise<CategoryTotal[]>>()
      .mockRejectedValueOnce(new Error('answered 500'))
      .mockResolvedValueOnce([{ label: 'car', total: 7 }])
    const loadByCountry = vi
      .fn<() => Promise<CategoryTotal[]>>()
      .mockResolvedValue([{ label: 'AE', total: 4 }])

    render(
      <App
        record={stored}
        loadByCountry={loadByCountry}
        loadByVehicleType={loadByVehicleType}
      />,
    )

    fireEvent.click(await screen.findByRole('button', { name: /try again: by vehicle type/i }))

    expect(await screen.findByText('car', { selector: 'tspan' })).toBeInTheDocument()
    expect(loadByCountry).toHaveBeenCalledTimes(1)
  })

  it('reports a failed chart without disturbing the one that loaded', async () => {
    render(
      <App
        record={stored}
        loadByCountry={failing('answered 500')}
        loadByVehicleType={resolving([{ label: 'car', total: 7 }])}
      />,
    )

    expect(await screen.findByText(/could not load/i)).toBeInTheDocument()
    expect(await screen.findByText('car', { selector: 'tspan' })).toBeInTheDocument()
  })
})

describe('the period control', () => {
  it('starts at all time and asks both aggregates for it', async () => {
    const byCountry = recording()
    const byVehicleType = recording()

    render(
      <App
        record={stored}
        loadByCountry={byCountry.load}
        loadByVehicleType={byVehicleType.load}
      />,
    )

    await waitFor(() => {
      expect(byCountry.filters).toEqual([{ period: 'all' }])
    })
    expect(byVehicleType.filters).toEqual([{ period: 'all' }])
    expect(periodControl()).toHaveValue('all')
  })

  it('re-reads both aggregates when the period changes', async () => {
    const byCountry = recording()
    const byVehicleType = recording()

    render(
      <App
        record={stored}
        loadByCountry={byCountry.load}
        loadByVehicleType={byVehicleType.load}
      />,
    )
    await waitFor(() => {
      expect(byCountry.filters).toHaveLength(1)
    })

    fireEvent.change(periodControl(), { target: { value: '7d' } })

    await waitFor(() => {
      expect(byCountry.filters).toEqual([{ period: 'all' }, { period: '7d' }])
    })
    expect(byVehicleType.filters).toEqual([{ period: 'all' }, { period: '7d' }])
  })

  it('opens at the period the URL carries', async () => {
    window.history.replaceState(null, '', '/?period=30d')
    const byCountry = recording()

    render(<App record={stored} loadByCountry={byCountry.load} loadByVehicleType={resolving([])} />)

    await waitFor(() => {
      expect(byCountry.filters).toEqual([{ period: '30d' }])
    })
    expect(periodControl()).toHaveValue('30d')
  })

  it('shows the default for a period the URL asks for and the dashboard does not offer', async () => {
    window.history.replaceState(null, '', '/?period=since-tuesday')
    const byCountry = recording()

    render(<App record={stored} loadByCountry={byCountry.load} loadByVehicleType={resolving([])} />)

    await waitFor(() => {
      expect(byCountry.filters).toEqual([{ period: 'all' }])
    })
    expect(periodControl()).toHaveValue('all')
  })

  it('puts the chosen period in the URL, so the view is a link', async () => {
    render(<App record={stored} loadByCountry={resolving([])} loadByVehicleType={resolving([])} />)

    fireEvent.change(periodControl(), { target: { value: '24h' } })

    await waitFor(() => {
      expect(window.location.search).toBe('?period=24h')
    })
  })
})

describe('the country control', () => {
  const TOTALS = [
    { label: 'AE', total: 3 },
    { label: 'SA', total: 1 },
  ]

  it('lists the countries the country aggregate reported', async () => {
    render(
      <App
        record={stored}
        loadByCountry={resolving(TOTALS)}
        loadByVehicleType={resolving([])}
      />,
    )

    await waitFor(() => {
      expect(countryControl()).toBeInTheDocument()
    })

    expect(
      [...countryControl().querySelectorAll('option')].map((option) => option.value),
    ).toEqual(['', 'AE', 'SA'])
  })

  it('keeps a country the URL asked for that the data does not mention', async () => {
    // A link shared before the period narrowed, or a country whose traffic
    // stopped. Dropping it would leave the control disagreeing with the chart
    // beside it, which is the one thing the URL is supposed to prevent.
    window.history.replaceState(null, '', '/?country=QA')

    render(
      <App
        record={stored}
        loadByCountry={resolving(TOTALS)}
        loadByVehicleType={resolving([])}
      />,
    )

    await waitFor(() => {
      expect(countryControl()).toHaveValue('QA')
    })
  })

  it('re-reads only the vehicle-type aggregate when the country changes', async () => {
    // The asymmetry, end to end. A by-country chart narrowed to one country is
    // a single bar, so it takes no country — and re-reading it would blank a
    // loaded chart to redraw exactly the same bars.
    const byCountry = recording(TOTALS)
    const byVehicleType = recording()

    render(
      <App
        record={stored}
        loadByCountry={byCountry.load}
        loadByVehicleType={byVehicleType.load}
      />,
    )
    await waitFor(() => {
      expect(byVehicleType.filters).toHaveLength(1)
    })

    fireEvent.change(countryControl(), { target: { value: 'AE' } })

    await waitFor(() => {
      expect(byVehicleType.filters).toEqual([{ period: 'all' }, { period: 'all', country: 'AE' }])
    })
    expect(byCountry.filters).toEqual([{ period: 'all' }])
  })

  it('keeps the options it has while a fresh read of the aggregate is in flight', async () => {
    // Every recorded detection re-reads this aggregate, so a list derived from
    // the in-flight state alone empties the control each time — under a reader
    // who may be halfway through using it.
    const loadByCountry = vi
      .fn<() => Promise<CategoryTotal[]>>()
      .mockResolvedValueOnce(TOTALS)
      .mockReturnValueOnce(new Promise<CategoryTotal[]>(() => undefined))

    render(<App record={stored} loadByCountry={loadByCountry} loadByVehicleType={resolving([])} />)
    await waitFor(() => {
      expect(countryOptions()).toEqual(['', 'AE', 'SA'])
    })

    submitOne()

    await waitFor(() => {
      expect(loadByCountry).toHaveBeenCalledTimes(2)
    })
    expect(countryOptions()).toEqual(['', 'AE', 'SA'])
  })

  it('drops back to every country', async () => {
    window.history.replaceState(null, '', '/?country=AE')
    const byVehicleType = recording()

    render(
      <App
        record={stored}
        loadByCountry={resolving(TOTALS)}
        loadByVehicleType={byVehicleType.load}
      />,
    )
    await waitFor(() => {
      expect(byVehicleType.filters).toEqual([{ period: 'all', country: 'AE' }])
    })

    fireEvent.change(countryControl(), { target: { value: '' } })

    await waitFor(() => {
      expect(byVehicleType.filters).toEqual([
        { period: 'all', country: 'AE' },
        { period: 'all' },
      ])
    })
  })
})

describe('the headline', () => {
  const TOTALS = [
    { label: 'AE', total: 3 },
    { label: 'SA', total: 1 },
  ]

  it('counts the chosen country rather than every one of them', async () => {
    // Taken from the by-country aggregate already on hand: a further request
    // for the same number is a second chance for the two to disagree.
    window.history.replaceState(null, '', '/?country=SA')

    render(
      <App
        record={stored}
        loadByCountry={resolving(TOTALS)}
        loadByVehicleType={resolving([])}
      />,
    )

    expect(await screen.findByTestId('total-events')).toHaveTextContent('1')
  })

  it('reads zero for a country with no traffic rather than the unfiltered sum', async () => {
    window.history.replaceState(null, '', '/?country=QA')

    render(
      <App
        record={stored}
        loadByCountry={resolving(TOTALS)}
        loadByVehicleType={resolving([])}
      />,
    )

    expect(await screen.findByTestId('total-events')).toHaveTextContent('0')
  })

  it('states the filter in effect beside the number', async () => {
    window.history.replaceState(null, '', '/?period=7d&country=AE')

    render(
      <App
        record={stored}
        loadByCountry={resolving(TOTALS)}
        loadByVehicleType={resolving([])}
      />,
    )

    const scope = await screen.findByTestId('headline-scope')

    expect(scope).toHaveTextContent(/last 7 days/i)
    expect(scope).toHaveTextContent('AE')
  })

  it('states the scope even when nothing is narrowed', async () => {
    render(
      <App
        record={stored}
        loadByCountry={resolving(TOTALS)}
        loadByVehicleType={resolving([])}
      />,
    )

    expect(await screen.findByTestId('headline-scope')).toHaveTextContent(/all time/i)
  })
})

describe('an empty chart', () => {
  it('says the system has recorded nothing only when nothing is narrowed', async () => {
    render(<App record={stored} loadByCountry={resolving([])} loadByVehicleType={resolving([])} />)

    await waitFor(() => {
      expect(panelNote(/by plate country/i)).toHaveTextContent(/no traffic recorded yet/i)
    })
  })

  it('names the period it found nothing in', async () => {
    // Otherwise a quiet week reads as a database that has never seen a vehicle,
    // and the reader has no way to tell the two apart from the page.
    window.history.replaceState(null, '', '/?period=7d')

    render(<App record={stored} loadByCountry={resolving([])} loadByVehicleType={resolving([])} />)

    await waitFor(() => {
      expect(panelNote(/by plate country/i)).toHaveTextContent(
        /no traffic recorded for last 7 days/i,
      )
    })
  })

  it('names the country only on the chart that was narrowed by one', async () => {
    // The by-country chart takes no country, so blaming QA for its empty state
    // would name a filter that never touched the request behind it.
    window.history.replaceState(null, '', '/?country=QA')

    render(<App record={stored} loadByCountry={resolving([])} loadByVehicleType={resolving([])} />)

    await waitFor(() => {
      expect(panelNote(/by vehicle type/i)).toHaveTextContent(
        /no traffic recorded for all time · QA/i,
      )
    })
    expect(panelNote(/by plate country/i)).toHaveTextContent(/no traffic recorded yet/i)
  })
})

describe('recording a detection', () => {
  // Scoped to the form's own region: an empty chart reports itself with a
  // status role too, and the page has two of those.
  const outcome = () =>
    within(screen.getByRole('region', { name: /record a detection/i })).getByRole('status')

  it('re-reads both aggregates once the API has taken it', async () => {
    const byCountry = recording()
    const byVehicleType = recording()

    render(
      <App record={stored} loadByCountry={byCountry.load} loadByVehicleType={byVehicleType.load} />,
    )
    await waitFor(() => {
      expect(byCountry.filters).toHaveLength(1)
    })

    submitOne()

    await waitFor(() => {
      expect(byCountry.filters).toHaveLength(2)
    })
    expect(byVehicleType.filters).toHaveLength(2)
  })

  it('moves the headline, which is the whole point of the control', async () => {
    // A form that reported a success over unchanged numbers would demonstrate
    // less than `curl` does. The detection lands in the hour served live, so
    // the next read counts it.
    const loadByCountry = vi
      .fn<() => Promise<CategoryTotal[]>>()
      .mockResolvedValueOnce([{ label: 'AE', total: 4 }])
      .mockResolvedValueOnce([{ label: 'AE', total: 5 }])

    render(<App record={stored} loadByCountry={loadByCountry} loadByVehicleType={resolving([])} />)
    expect(await screen.findByTestId('total-events')).toHaveTextContent('4')

    submitOne()

    await waitFor(() => {
      expect(screen.getByTestId('total-events')).toHaveTextContent('5')
    })
  })

  it('leaves the aggregates alone when the API refuses the detection', async () => {
    const byCountry = recording()
    const refused = () => Promise.reject(new DetectionRejected('body/events/0/plateCountry ...'))

    render(
      <App
        record={refused}
        loadByCountry={byCountry.load}
        loadByVehicleType={resolving([])}
      />,
    )
    await waitFor(() => {
      expect(byCountry.filters).toHaveLength(1)
    })

    submitOne()

    await waitFor(() => {
      expect(outcome()).toHaveTextContent(/refused/i)
    })
    expect(byCountry.filters).toHaveLength(1)
  })
})
