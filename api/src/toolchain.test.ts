import { describe, expect, it } from 'vitest'

// Proves the workspace test harness runs TypeScript under ESM in this package.
// Superseded by the real suites added in the tasks that follow.
describe('api toolchain', () => {
  it('runs a TypeScript module under ESM', () => {
    const doubled: number[] = [1, 2, 3].map((n) => n * 2)

    expect(doubled).toEqual([2, 4, 6])
  })
})
