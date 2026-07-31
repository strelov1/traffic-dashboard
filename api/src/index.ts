import { loadConfig } from './config.js'
import { createDatabase } from './db.js'
import { migrateToLatest, MIGRATIONS_DIRECTORY } from './migrate.js'
import { buildServer } from './server.js'

async function main(): Promise<void> {
  const config = loadConfig(process.env)

  // Before listen, so no request is ever served against an unmigrated schema.
  await migrateToLatest({ databaseUrl: config.databaseUrl, directory: MIGRATIONS_DIRECTORY })

  const server = buildServer({
    database: createDatabase(config.databaseUrl),
    webOrigin: config.webOrigin,
  })

  // Not the default loopback: the port has to be reachable from outside the container.
  await server.listen({ port: config.port, host: '0.0.0.0' })
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
