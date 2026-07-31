import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { createDatabase, type Database } from './database.js'
import { POSTGRES_IMAGE } from '../testing/postgres.js'
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
    container = await new PostgreSqlContainer(POSTGRES_IMAGE).start()
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

  // Its own container: the shared one has fixture migrations recorded in
  // pgmigrations, and the runner refuses an unrun migration that sorts before
  // one already applied.
  //
  // Asserts the schema rather than the absence of a throw. An empty directory
  // is a successful run over no migrations, so `resolves` alone would hold just
  // as well for a MIGRATIONS_DIRECTORY that had stopped naming the migrations.
  it("applies the project's own migrations directory", async () => {
    const own = await new PostgreSqlContainer(POSTGRES_IMAGE).start()
    const ownDatabase = createDatabase(own.getConnectionUri())

    try {
      await migrateToLatest({
        databaseUrl: own.getConnectionUri(),
        directory: MIGRATIONS_DIRECTORY,
      })

      const rows = await ownDatabase.query(
        z.object({ exists: z.boolean() }),
        "select to_regclass('public.traffic_events') is not null as exists",
      )

      expect(rows).toEqual([{ exists: true }])
    } finally {
      await ownDatabase.close()
      await own.stop()
    }
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

  // Its own container, and this is not incidental. Against the shared one the
  // runner rejects at `checkOrder` — 0001_broken sorts alongside the probe
  // migration already recorded in pgmigrations — so the fixture's SQL never
  // runs, and a bare `rejects.toThrow()` cannot tell the two causes apart.
  // Replacing the fixture with a perfectly valid table used to leave this test
  // green, which is the definition of a test that proves nothing.
  it('does not spend the retry window on a migration that is broken rather than unreachable', async () => {
    const own = await new PostgreSqlContainer(POSTGRES_IMAGE).start()
    const startedAt = Date.now()

    try {
      await expect(
        migrateToLatest({
          databaseUrl: own.getConnectionUri(),
          directory: BROKEN_MIGRATIONS,
          connectRetryForMs: 30_000,
          connectRetryDelayMs: 500,
        }),
        // The fixture references a table that does not exist, so this is the
        // migration's own SQL failing — not the runner refusing to start.
      ).rejects.toThrow(/nonexistent_table/)

      expect(Date.now() - startedAt).toBeLessThan(30_000)
    } finally {
      await own.stop()
    }
  })
})
