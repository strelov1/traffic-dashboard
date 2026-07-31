import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Integration suites start a throwaway TimescaleDB container; the first run
    // also pulls the image, and a suite that starts one inside a test rather
    // than a hook is bound by this rather than by hookTimeout.
    testTimeout: 150_000,
    hookTimeout: 180_000,
  },
})
