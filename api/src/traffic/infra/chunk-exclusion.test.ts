import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

import type { Database } from '../../platform/database.js'
import { startMigratedPostgres, type MigratedPostgres } from '../../testing/postgres.js'
import { UNBOUNDED, type Period } from '../domain/period.js'
import { createTrafficRepository } from './postgres-repository.js'

const planLine = z.object({ 'QUERY PLAN': z.string() })

const chunkName = z.object({ name: z.string() })

const materialisation = z.object({ name: z.string() })

type Statement = { text: string; values: unknown[] }

/**
 * Records what the repository asks storage for without running it, so the plans
 * below belong to the query that ships. A `select` copied into this file would
 * keep answering the same way after `totalsQuery` had stopped composing a bound
 * into the statement at all, which is the one regression this file exists for.
 */
function recordingDatabase(): { database: Database; recorded: Statement[] } {
  const recorded: Statement[] = []

  return {
    recorded,
    database: {
      query: (_shape, text, values) => {
        recorded.push({ text, values: values ?? [] })

        return Promise.resolve([])
      },
      isReachable: () => Promise.resolve(true),
      close: () => Promise.resolve(),
    },
  }
}

/**
 * What a period costs, read off the plan rather than off the clock.
 *
 * `docs/performance/filtered-aggregate.md` measured this once, on a seeded
 * container, and the numbers there are timings — environment-dependent, and not
 * something a suite should assert. Which chunks a plan names is not a timing: it
 * is structural, it is what the period buys, and until this file nothing checked
 * it. The requirement it pins used to name the wrong table.
 */
describe('what a bounded period excludes from the read', () => {
  let postgres: MigratedPostgres
  let aggregateChunks: string[]
  let eventChunks: string[]
  let unbounded: string
  let bounded: string

  beforeAll(async () => {
    postgres = await startMigratedPostgres()

    // Four hundred days at five-day steps. The events table chunks weekly and
    // the aggregate's own hypertable at seventy days, so both end up with more
    // chunks than a plan could name by accident.
    await postgres.database.query(
      z.unknown(),
      `insert into traffic_events (occurred_at, plate_country, vehicle_type)
       select now() - (n * interval '5 days'), 'AE', 'car' from generate_series(1, 80) as n`,
    )

    // Without this the watermark sits at -infinity, every bucket is computed
    // live, and the read below is a scan of the whole events table. The
    // exclusion this file measures is the refresh's, not the period's.
    await postgres.database.query(
      z.unknown(),
      `call refresh_continuous_aggregate('traffic_hourly_totals', null, now() - interval '1 hour')`,
    )

    const [view] = await postgres.database.query(
      materialisation,
      `select materialization_hypertable_name as name
       from timescaledb_information.continuous_aggregates
       where view_name = 'traffic_hourly_totals'`,
    )

    aggregateChunks = await chunksOf(view?.name ?? '')
    eventChunks = await chunksOf('traffic_events')

    const { database, recorded } = recordingDatabase()
    const repository = createTrafficRepository(database)

    await repository.totalsByCountry(UNBOUNDED)
    await repository.totalsByCountry(lastSevenDays())

    unbounded = await planFor(recorded[0])
    bounded = await planFor(recorded[1])
  }, 120_000)

  afterAll(() => postgres.stop())

  async function chunksOf(hypertable: string): Promise<string[]> {
    const rows = await postgres.database.query(
      chunkName,
      `select chunk_name as name from timescaledb_information.chunks
       where hypertable_name = $1`,
      [hypertable],
    )

    return rows.map((it) => it.name)
  }

  async function planFor(statement: Statement | undefined): Promise<string> {
    const lines = await postgres.database.query(
      planLine,
      `explain ${statement?.text ?? ''}`,
      statement?.values,
    )

    return lines.map((it) => it['QUERY PLAN']).join('\n')
  }

  const named = (chunks: string[], plan: string) => chunks.filter((it) => plan.includes(it))

  it('narrows the maintained totals, which is where the partitions fall away', () => {
    expect(named(aggregateChunks, unbounded).length).toBeGreaterThan(1)
    expect(named(aggregateChunks, bounded).length).toBeLessThan(
      named(aggregateChunks, unbounded).length,
    )
  })

  // The correction this file was written for. The requirement used to claim the
  // period was what let the plan skip the events table's partitions; the plan
  // says the aggregate's watermark had already done that, and does it whether or
  // not a period was asked for.
  it('leaves the events table read one chunk deep either way', () => {
    expect(eventChunks.length).toBeGreaterThan(1)
    expect(named(eventChunks, unbounded)).toHaveLength(1)
    expect(named(eventChunks, bounded)).toHaveLength(1)
  })
})

/** Hour-aligned, because that is the only shape of bound `toPeriod` emits. */
function lastSevenDays(): Period {
  const hour = 60 * 60 * 1000

  return { from: new Date(Math.floor((Date.now() - 7 * 24 * hour) / hour) * hour) }
}
