import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Integration suites start a throwaway TimescaleDB container; the first run
    // also pulls the image, and a suite that starts one inside a test rather
    // than a hook is bound by this rather than by hookTimeout.
    testTimeout: 150_000,
    hookTimeout: 180_000,
    // Each integration suite starts its own database container. On a two-core
    // CI runner, letting every file start one at once thrashes rather than
    // finishing sooner. Spread rather than set to undefined: exactOptionalPropertyTypes
    // refuses an explicit undefined for an optional field.
    ...(process.env['CI'] ? { maxWorkers: 2 } : {}),
  },
})
