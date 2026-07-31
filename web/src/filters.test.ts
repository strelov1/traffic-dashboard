import { describe, expect, it } from 'vitest'

import {
  countryChartKey,
  DEFAULT_FILTER,
  parseFilter,
  periodBounds,
  toSearch,
  vehicleTypeChartKey,
} from './filters'

describe('parseFilter', () => {
  it('is the default when the query string is empty', () => {
    expect(parseFilter('')).toEqual(DEFAULT_FILTER)
  })

  it('reads a period and a country', () => {
    expect(parseFilter('?period=7d&country=AE')).toEqual({ period: '7d', country: 'AE' })
  })

  it('falls back to the default for a period it does not offer', () => {
    // A hand-edited or stale link is not an error page. The controls then show
    // what is actually in effect, which is the default.
    expect(parseFilter('?period=since-tuesday')).toEqual(DEFAULT_FILTER)
  })

  it('ignores a country that is not two uppercase letters', () => {
    // The API would refuse it, and a chart reporting a 400 for a URL the reader
    // did not type is a worse answer than the unfiltered one.
    expect(parseFilter('?country=ae')).toEqual(DEFAULT_FILTER)
    expect(parseFilter('?country=UAE')).toEqual(DEFAULT_FILTER)
  })

  it('keeps a valid period when the country beside it is not', () => {
    expect(parseFilter('?period=30d&country=1')).toEqual({ period: '30d' })
  })
})

describe('toSearch', () => {
  it('carries both selections', () => {
    expect(toSearch({ period: '7d', country: 'AE' })).toBe('?period=7d&country=AE')
  })

  it('says nothing when nothing is selected', () => {
    // The default is not worth a parameter: a URL that says nothing means the
    // dashboard's own answer, which is exactly what an unfiltered link should be.
    expect(toSearch(DEFAULT_FILTER)).toBe('')
  })

  it('round-trips a selection back to itself', () => {
    const filter = { period: '24h', country: 'SA' } as const

    expect(parseFilter(toSearch(filter))).toEqual(filter)
  })
})

describe('periodBounds', () => {
  const NOW = new Date('2026-03-04T13:30:00Z')

  it('is unbounded for all time', () => {
    expect(periodBounds('all', NOW)).toEqual({})
  })

  it('starts a preset the stated distance before now', () => {
    expect(periodBounds('24h', NOW)).toEqual({ from: '2026-03-03T13:30:00.000Z' })
    expect(periodBounds('7d', NOW)).toEqual({ from: '2026-02-25T13:30:00.000Z' })
    expect(periodBounds('30d', NOW)).toEqual({ from: '2026-02-02T13:30:00.000Z' })
  })

  it('leaves the end open, so a detection arriving mid-request still counts', () => {
    expect(periodBounds('7d', NOW)).not.toHaveProperty('to')
  })
})

describe('the chart keys', () => {
  it('re-reads both charts when the period changes', () => {
    const before = { period: 'all' } as const
    const after = { period: '7d' } as const

    expect(countryChartKey(after)).not.toBe(countryChartKey(before))
    expect(vehicleTypeChartKey(after)).not.toBe(vehicleTypeChartKey(before))
  })

  it('leaves the country chart alone when only the country changes', () => {
    // The asymmetry, as data. A country chart narrowed to one country is a
    // single bar — a different question — so it does not take the country, and
    // re-reading it would cost a request to draw exactly the same picture.
    const before = { period: '7d' } as const
    const after = { period: '7d', country: 'AE' } as const

    expect(countryChartKey(after)).toBe(countryChartKey(before))
    expect(vehicleTypeChartKey(after)).not.toBe(vehicleTypeChartKey(before))
  })
})
