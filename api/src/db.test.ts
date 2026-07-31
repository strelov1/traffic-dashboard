import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { createDatabase, type Database } from './db.js'

describe('database', () => {
  let container: StartedPostgreSqlContainer
  let database: Database

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:17-alpine').start()
    database = createDatabase(container.getConnectionUri())
  })

  afterAll(async () => {
    await database.close()
    await container.stop()
  })

  it('returns rows parsed against the given shape', async () => {
    const rows = await database.query(z.object({ answer: z.number() }), 'select 42::int as answer')

    expect(rows).toEqual([{ answer: 42 }])
  })

  it('passes parameters rather than interpolating them', async () => {
    const rows = await database.query(z.object({ echoed: z.string() }), 'select $1::text as echoed', [
      "'; drop table users; --",
    ])

    expect(rows).toEqual([{ echoed: "'; drop table users; --" }])
  })

  it('returns an empty array when a query matches nothing', async () => {
    const rows = await database.query(z.object({ n: z.number() }), 'select 1 as n where false')

    expect(rows).toEqual([])
  })

  it('rejects rows whose column type does not match the shape', async () => {
    // numeric arrives as a string from the driver, which is exactly the kind of
    // mismatch an unchecked generic would have let through.
    await expect(
      database.query(z.object({ total: z.number() }), 'select count(*) as total from pg_class'),
    ).rejects.toThrow(/shape/i)
  })

  it('rejects rows missing a column the shape requires', async () => {
    await expect(
      database.query(z.object({ missing: z.string() }), 'select 1 as present'),
    ).rejects.toThrow(/missing/)
  })

  it('reports the database as reachable', async () => {
    await expect(database.isReachable()).resolves.toBe(true)
  })

  it('reports an unreachable database rather than throwing', async () => {
    const unreachable = createDatabase('postgres://derq:derq@127.0.0.1:1/derq')

    await expect(unreachable.isReachable()).resolves.toBe(false)

    await unreachable.close()
  })
})
