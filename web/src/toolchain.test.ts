import { describe, expect, it } from 'vitest'

// Proves the harness runs; replaced by the real suite when the shell lands.
describe('web toolchain', () => {
  it('runs a TypeScript module under ESM', () => {
    const doubled: number[] = [1, 2, 3].map((n) => n * 2)

    expect(doubled).toEqual([2, 4, 6])
  })
})
