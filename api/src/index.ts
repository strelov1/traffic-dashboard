import { loadConfig } from './platform/config.js'
import { createDatabase } from './platform/database.js'
import { migrateToLatest, MIGRATIONS_DIRECTORY } from './platform/migrate.js'
import { buildServer } from './platform/server.js'
import { closeOnSignal } from './platform/shutdown.js'
import { createTrafficRepository } from './traffic/infra/postgres-repository.js'
import { backfillHourlyTotals, seedTrafficEvents } from './traffic/infra/seed.js'

async function main(): Promise<void> {
  const config = loadConfig(process.env)

  // Before listen, so no request is ever served against an unmigrated schema.
  await migrateToLatest({ databaseUrl: config.databaseUrl, directory: MIGRATIONS_DIRECTORY })

  const database = createDatabase(config.databaseUrl)
  const repository = createTrafficRepository(database)

  const server = buildServer({ database, webOrigin: config.webOrigin })

  if (config.seedEvents > 0) {
    const written = await seedTrafficEvents(database, repository, { events: config.seedEvents })

    if (written === 0) {
      server.log.info('traffic_events already populated, seed skipped')
    } else {
      server.log.info({ written }, 'seeded traffic_events')
    }
  }

  // Unconditional, and after any seeding: history written by any route is
  // invisible to the aggregate until it is materialised once, and the failure
  // only appears minutes later when the policy first moves the watermark.
  await backfillHourlyTotals(database)

  closeOnSignal(server, database, () => {
    process.exit(0)
  })

  // Not the default loopback: the port has to be reachable from outside the container.
  await server.listen({ port: config.port, host: '0.0.0.0' })
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
