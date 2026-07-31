export type Config = {
  databaseUrl: string
  port: number
  webOrigin: string
}

type Environment = Record<string, string | undefined>

const DEFAULT_PORT = 3000
const DEFAULT_WEB_ORIGIN = 'http://localhost:5173'

/** Throws rather than exiting, so the entrypoint owns the exit code and this stays testable. */
export function loadConfig(env: Environment): Config {
  return {
    databaseUrl: readRequired(env, 'DATABASE_URL'),
    port: readPort(env),
    webOrigin: readOptional(env, 'WEB_ORIGIN') ?? DEFAULT_WEB_ORIGIN,
  }
}

function readOptional(env: Environment, name: string): string | undefined {
  const value = env[name]?.trim()

  return value === '' ? undefined : value
}

function readRequired(env: Environment, name: string): string {
  const value = readOptional(env, name)

  if (value === undefined) {
    throw new Error(`${name} is required but was not set`)
  }

  return value
}

function readPort(env: Environment): number {
  const raw = readOptional(env, 'PORT')

  if (raw === undefined) {
    return DEFAULT_PORT
  }

  const port = Number(raw)

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT must be an integer between 1 and 65535, but was "${raw}"`)
  }

  return port
}
