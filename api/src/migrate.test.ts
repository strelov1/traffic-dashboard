import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { createDatabase, type Database } from './db.js'
import { migrateToLatest, MIGRATIONS_DIRECTORY } from './migrate.js'

const PROBE_MIGRATIONS = fileURLToPath(new URL('./__fixtures__/migrations-probe', import.meta.url))
const BROKEN_MIGRATIONS = fileURLToPath(new URL('./__fixtures__/migrations-broken', import.meta.url))

// A port nothing listens on, so connecting fails the way a database that is
// still starting up does.
const UNREACHABLE_URL = 'postgres://derq:derq@127.0.0.1:1/derq'

describe('migrateToLatest', () => {
  let container: StartedPostgreSqlContainer
  let database: Database
  let databaseUrl: string

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:17-alpine').start()
    databaseUrl = container.getConnectionUri()
    database = createDatabase(databaseUrl)
  })

  afterAll(async () => {
    await database.close()
    await container.stop()
  })

  it('applies pending migrations', async () => {
    await migrateToLatest({ databaseUrl, directory: PROBE_MIGRATIONS })

    const rows = await database.query(
      z.object({ exists: z.boolean() }),
      "select to_regclass('public.probe') is not null as exists",
    )

    expect(rows).toEqual([{ exists: true }])
  })

  it('is idempotent when every migration has already run', async () => {
    await migrateToLatest({ databaseUrl, directory: PROBE_MIGRATIONS })
    await migrateToLatest({ databaseUrl, directory: PROBE_MIGRATIONS })

    const rows = await database.query(
      z.object({ applied: z.string() }),
      'select count(*)::text as applied from pgmigrations',
    )

    expect(rows).toEqual([{ applied: '1' }])
  })

  it('succeeds against a directory holding no migrations', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'derq-migrations-'))

    await expect(migrateToLatest({ databaseUrl, directory: empty })).resolves.toBeUndefined()
  })

  it("applies the project's own migrations directory", async () => {
    await expect(
      migrateToLatest({ databaseUrl, directory: MIGRATIONS_DIRECTORY }),
    ).resolves.toBeUndefined()
  })

  it('keeps retrying an unreachable database until the window closes', async () => {
    const retryForMs = 600
    const startedAt = Date.now()

    await expect(
      migrateToLatest({
        databaseUrl: UNREACHABLE_URL,
        directory: PROBE_MIGRATIONS,
        connectRetryForMs: retryForMs,
        connectRetryDelayMs: 50,
      }),
    ).rejects.toThrow()

    // Without retries this would reject immediately, and the assertion below is
    // the only thing that tells the two apart.
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(retryForMs)
  })

  it('does not spend the retry window on a migration that is broken rather than unreachable', async () => {
    const startedAt = Date.now()

    await expect(
      migrateToLatest({
        databaseUrl,
        directory: BROKEN_MIGRATIONS,
        connectRetryForMs: 30_000,
        connectRetryDelayMs: 500,
      }),
    ).rejects.toThrow()

    expect(Date.now() - startedAt).toBeLessThan(5_000)
  })
})
