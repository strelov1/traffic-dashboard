import { describe, expect, it } from 'vitest'

import { loadConfig } from './config.js'

const DATABASE_URL = 'postgres://user:pass@localhost:5432/derq'

describe('loadConfig', () => {
  it('reads the database connection from DATABASE_URL', () => {
    const config = loadConfig({ DATABASE_URL })

    expect(config.databaseUrl).toBe(DATABASE_URL)
  })

  it('names the missing variable when DATABASE_URL is absent', () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/)
  })

  it('rejects a DATABASE_URL that is set but empty', () => {
    expect(() => loadConfig({ DATABASE_URL: '   ' })).toThrow(/DATABASE_URL/)
  })

  it('falls back to a default port when PORT is unset', () => {
    const config = loadConfig({ DATABASE_URL })

    expect(config.port).toBe(3000)
  })

  it('reads PORT when it is a valid port number', () => {
    const config = loadConfig({ DATABASE_URL, PORT: '8080' })

    expect(config.port).toBe(8080)
  })

  it('names PORT when it is set to something that is not a port', () => {
    expect(() => loadConfig({ DATABASE_URL, PORT: 'eighty' })).toThrow(/PORT/)
  })

  it('falls back to the Vite dev server origin when WEB_ORIGIN is unset', () => {
    const config = loadConfig({ DATABASE_URL })

    expect(config.webOrigin).toBe('http://localhost:5173')
  })

  it('falls back to a seed size that starts quickly', () => {
    const config = loadConfig({ DATABASE_URL })

    expect(config.seedEvents).toBe(250_000)
  })

  it('reads SEED_EVENTS when set', () => {
    const config = loadConfig({ DATABASE_URL, SEED_EVENTS: '2000000' })

    expect(config.seedEvents).toBe(2_000_000)
  })

  it('accepts a seed size of zero, meaning do not generate data', () => {
    const config = loadConfig({ DATABASE_URL, SEED_EVENTS: '0' })

    expect(config.seedEvents).toBe(0)
  })

  it('names SEED_EVENTS when it is not a whole number of events', () => {
    expect(() => loadConfig({ DATABASE_URL, SEED_EVENTS: '-1' })).toThrow(/SEED_EVENTS/)
    expect(() => loadConfig({ DATABASE_URL, SEED_EVENTS: 'lots' })).toThrow(/SEED_EVENTS/)
  })

  it('reads WEB_ORIGIN when set', () => {
    const config = loadConfig({ DATABASE_URL, WEB_ORIGIN: 'http://web:4173' })

    expect(config.webOrigin).toBe('http://web:4173')
  })
})
