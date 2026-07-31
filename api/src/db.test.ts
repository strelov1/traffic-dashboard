import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

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

  it('returns rows for a query', async () => {
    const rows = await database.query<{ answer: number }>('select 42::int as answer')

    expect(rows).toEqual([{ answer: 42 }])
  })

  it('passes parameters rather than interpolating them', async () => {
    const rows = await database.query<{ echoed: string }>('select $1::text as echoed', [
      "'; drop table users; --",
    ])

    expect(rows).toEqual([{ echoed: "'; drop table users; --" }])
  })

  it('returns an empty array when a query matches nothing', async () => {
    const rows = await database.query('select 1 where false')

    expect(rows).toEqual([])
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
