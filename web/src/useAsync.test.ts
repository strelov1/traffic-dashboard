import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useAsync } from './useAsync'

/** Settled by the test rather than by a timer, so each run responds on cue. */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((settle, fail) => {
    resolve = settle
    reject = fail
  })

  return { promise, resolve, reject }
}

/** Two runs, handed out in the order the hook asks for them. */
function loaderFor(...runs: Promise<string>[]) {
  const load = vi.fn<() => Promise<string>>()

  for (const run of runs) {
    load.mockReturnValueOnce(run)
  }

  return load
}

describe('useAsync', () => {
  it('runs the loader again when reloaded, replacing a failure with the data', async () => {
    const first = deferred<string>()
    const second = deferred<string>()
    const load = loaderFor(first.promise, second.promise)

    const { result } = renderHook(() => useAsync(load))

    first.reject(new Error('answered 500'))
    await waitFor(() => {
      expect(result.current[0]).toEqual({ status: 'failed', reason: 'answered 500' })
    })

    act(() => {
      result.current[1]()
    })
    second.resolve('recovered')

    await waitFor(() => {
      expect(result.current[0]).toEqual({ status: 'loaded', value: 'recovered' })
    })
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('reports loading again while the run a reload started is in flight', async () => {
    const first = deferred<string>()
    const second = deferred<string>()
    const load = loaderFor(first.promise, second.promise)

    const { result } = renderHook(() => useAsync(load))

    first.reject(new Error('answered 500'))
    await waitFor(() => {
      expect(result.current[0]).toEqual({ status: 'failed', reason: 'answered 500' })
    })

    act(() => {
      result.current[1]()
    })

    expect(result.current[0]).toEqual({ status: 'loading' })
  })

  it('ignores the response of a run a reload superseded', async () => {
    const first = deferred<string>()
    const second = deferred<string>()
    const load = loaderFor(first.promise, second.promise)

    const { result } = renderHook(() => useAsync(load))

    // Reloaded before the first run settles: in whichever order the two
    // responses arrive, the run the reader asked for last is the one that counts.
    act(() => {
      result.current[1]()
    })
    second.resolve('fresh')
    await waitFor(() => {
      expect(result.current[0]).toEqual({ status: 'loaded', value: 'fresh' })
    })

    first.resolve('stale')
    await act(async () => {
      await first.promise
    })

    expect(result.current[0]).toEqual({ status: 'loaded', value: 'fresh' })
  })
})
