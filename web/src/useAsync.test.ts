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

    const { result } = renderHook(() => useAsync('one', load))

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

    const { result } = renderHook(() => useAsync('one', load))

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

    const { result } = renderHook(() => useAsync('one', load))

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

  describe('the key', () => {
    it('re-runs the loader when the key changes', async () => {
      const first = deferred<string>()
      const second = deferred<string>()
      const load = loaderFor(first.promise, second.promise)

      const { result, rerender } = renderHook(({ key }) => useAsync(key, load), {
        initialProps: { key: 'all' },
      })

      first.resolve('all time')
      await waitFor(() => {
        expect(result.current[0]).toEqual({ status: 'loaded', value: 'all time' })
      })

      rerender({ key: '7d' })
      second.resolve('last week')

      await waitFor(() => {
        expect(result.current[0]).toEqual({ status: 'loaded', value: 'last week' })
      })
      expect(load).toHaveBeenCalledTimes(2)
    })

    it('does not re-run when the loader is a fresh closure but the key is unchanged', async () => {
      // The discriminating one. Before the key, the effect depended on `load`'s
      // identity, so a caller who forgot to memoise fetched on every render and
      // a caller who memoised with a missing dependency served stale data.
      // Neither mistake is visible to a type; this is what makes it visible.
      const first = deferred<string>()
      const load = vi.fn<() => Promise<string>>().mockReturnValue(first.promise)

      const { result, rerender } = renderHook(
        // A new arrow every render, exactly as an inline loader would be.
        ({ key }) => useAsync(key, () => load()),
        { initialProps: { key: 'all' } },
      )

      first.resolve('all time')
      await waitFor(() => {
        expect(result.current[0]).toEqual({ status: 'loaded', value: 'all time' })
      })

      rerender({ key: 'all' })
      rerender({ key: 'all' })

      expect(load).toHaveBeenCalledTimes(1)
    })

    it('runs the loader the key change handed it, not the one captured before', async () => {
      // The ref is read at run time. Held as a dependency instead, this would
      // pass; captured once at mount, it would fetch the old filter forever.
      const seen: string[] = []
      const load = (key: string) => {
        seen.push(key)

        return Promise.resolve(key)
      }

      const { rerender } = renderHook(({ key }) => useAsync(key, () => load(key)), {
        initialProps: { key: 'all' },
      })

      rerender({ key: '7d' })

      await waitFor(() => {
        expect(seen).toEqual(['all', '7d'])
      })
    })

    it('ignores the response of a run a key change superseded', async () => {
      const first = deferred<string>()
      const second = deferred<string>()
      const load = loaderFor(first.promise, second.promise)

      const { result, rerender } = renderHook(({ key }) => useAsync(key, load), {
        initialProps: { key: 'all' },
      })

      rerender({ key: '7d' })
      second.resolve('last week')
      await waitFor(() => {
        expect(result.current[0]).toEqual({ status: 'loaded', value: 'last week' })
      })

      // The unfiltered request finally answers. Rendering it now would show
      // all-time bars under a heading that says last week.
      first.resolve('all time')
      await act(async () => {
        await first.promise
      })

      expect(result.current[0]).toEqual({ status: 'loaded', value: 'last week' })
    })

    it('reports loading again while the run a key change started is in flight', () => {
      const first = deferred<string>()
      const second = deferred<string>()
      const load = loaderFor(first.promise, second.promise)

      const { result, rerender } = renderHook(({ key }) => useAsync(key, load), {
        initialProps: { key: 'all' },
      })

      first.resolve('all time')
      rerender({ key: '7d' })

      expect(result.current[0]).toEqual({ status: 'loading' })
    })
  })
})
