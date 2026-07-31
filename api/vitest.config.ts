import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Integration suites start a throwaway Postgres container; the first run
    // also pulls the image.
    testTimeout: 60_000,
    hookTimeout: 180_000,
  },
})
