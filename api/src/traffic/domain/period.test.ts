import { describe, expect, it } from 'vitest'

import { UnrepresentableInstant } from './instant.js'
import { InvertedPeriod, toPeriod, UNBOUNDED } from './period.js'

const at = (iso: string) => new Date(iso)

describe('toPeriod', () => {
  it('is unbounded when neither bound is given', () => {
    expect(toPeriod({})).toEqual(UNBOUNDED)
  })

  it('leaves the other side unbounded when one bound is given', () => {
    expect(toPeriod({ from: '2026-03-04T13:00:00Z' })).toEqual({ from: at('2026-03-04T13:00:00Z') })
    expect(toPeriod({ to: '2026-03-04T13:00:00Z' })).toEqual({ to: at('2026-03-04T13:00:00Z') })
  })

  it('moves a start partway through an hour back to the start of that hour', () => {
    const period = toPeriod({ from: '2026-03-04T13:30:45.123Z' })

    expect(period.from).toEqual(at('2026-03-04T13:00:00Z'))
  })

  it('moves an end partway through an hour forward to the next hour', () => {
    const period = toPeriod({ to: '2026-03-04T13:00:00.001Z' })

    expect(period.to).toEqual(at('2026-03-04T14:00:00Z'))
  })

  it('leaves an end already on the hour where it is, so a period covers what it says', () => {
    const period = toPeriod({ to: '2026-03-04T13:00:00Z' })

    expect(period.to).toEqual(at('2026-03-04T13:00:00Z'))
  })

  it('rounds on the instant in UTC, not in the zone the caller wrote it in', () => {
    // 08:15 at +05:30 is 02:45 UTC. Flooring the local hour would give 02:30
    // UTC — half an hour of traffic that the period claims to cover and does
    // not. Only an offset that is not a whole hour can tell the two apart.
    const period = toPeriod({ from: '2026-03-04T08:15:00+05:30' })

    expect(period.from).toEqual(at('2026-03-04T02:00:00Z'))
  })

  it('rounds an end in a half-hour zone up to the surrounding UTC hour', () => {
    const period = toPeriod({ to: '2026-03-04T08:15:00+05:30' })

    expect(period.to).toEqual(at('2026-03-04T03:00:00Z'))
  })

  it('refuses a start later than its end, naming both bounds', () => {
    expect(() => toPeriod({ from: '2026-03-04T12:00:00Z', to: '2026-03-04T11:00:00Z' })).toThrow(
      InvertedPeriod,
    )

    try {
      toPeriod({ from: '2026-03-04T12:00:00Z', to: '2026-03-04T11:00:00Z' })
      expect.unreachable('an inverted period must be refused')
    } catch (error: unknown) {
      expect((error as Error).message).toContain('2026-03-04T12:00:00Z')
      expect((error as Error).message).toContain('2026-03-04T11:00:00Z')
    }
  })

  it('judges inversion on what the client sent, before rounding widened it', () => {
    // Rounded first, these two would be 12:00 and 13:00 — a period the client
    // never asked for, and one that hides the mistake instead of naming it.
    expect(() => toPeriod({ from: '2026-03-04T12:30:00Z', to: '2026-03-04T12:10:00Z' })).toThrow(
      InvertedPeriod,
    )
  })

  it('accepts a start equal to its end, which on the hour is the empty period it is', () => {
    const period = toPeriod({ from: '2026-03-04T13:00:00Z', to: '2026-03-04T13:00:00Z' })

    expect(period).toEqual({ from: at('2026-03-04T13:00:00Z'), to: at('2026-03-04T13:00:00Z') })
  })

  it('widens equal bounds inside an hour to that hour, like any other period', () => {
    // Equal bounds are not an exception to the rounding rule. `[12:30, 12:30)`
    // is empty as written and is no period the hourly totals can express, so it
    // widens to the hour containing it and the response states that hour.
    // Keeping it empty instead would put one period off a bucket boundary — the
    // one thing every reader of a `Period` is entitled to assume never happens.
    const period = toPeriod({ from: '2026-03-04T12:30:00Z', to: '2026-03-04T12:30:00Z' })

    expect(period).toEqual({ from: at('2026-03-04T12:00:00Z'), to: at('2026-03-04T13:00:00Z') })
  })

  it('refuses a bound this runtime cannot hold, naming the field', () => {
    expect(() => toPeriod({ from: '2026-03-04T23:59:60Z' })).toThrow(UnrepresentableInstant)
    expect(() => toPeriod({ from: '2026-03-04T23:59:60Z' })).toThrow(/from/)
    expect(() => toPeriod({ to: '2026-03-04T23:59:60Z' })).toThrow(/to/)
  })
})
