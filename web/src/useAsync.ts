import { useCallback, useEffect, useRef, useState } from 'react'

export type AsyncState<T> =
  | { status: 'loading' }
  | { status: 'loaded'; value: T }
  | { status: 'failed'; reason: string }

/**
 * One state per caller, so a slow or failing request never blanks a panel whose
 * own data arrived; a `key` so a parameterised request re-runs when its
 * parameters change; and a `reload` so a failed one is recoverable in place.
 *
 * The key states what the request depends on, as data. The hook used to re-run
 * on `load`'s identity instead, which made correctness a matter of the caller's
 * memoisation discipline: a `useCallback` missing a dependency silently served
 * the previous filter's data, and no `useCallback` at all was a request per
 * render. Neither mistake is visible to a type, and both are ordinary.
 *
 * The loader is therefore held in a ref and read when a run starts. A render
 * that only changes its closure never fetches, and a run that does start always
 * uses the closure the latest render handed over — never one captured at mount.
 *
 * The key has no default. A hook that re-ran only when told to would put the
 * stale-data bug back for every caller who forgot to say.
 */
export function useAsync<T>(key: string, load: () => Promise<T>): [AsyncState<T>, () => void] {
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  const latest = useRef(load)
  latest.current = load

  const reload = useCallback(() => {
    setAttempt((previous) => previous + 1)
  }, [])

  useEffect(() => {
    // Superseded runs are dropped rather than aborted, so a response that
    // arrives after a reload or a filter change cannot overwrite the run the
    // reader asked for.
    let current = true

    // Reset inside the effect, so every run — the first one included — starts
    // from the state its own response replaces.
    setState({ status: 'loading' })

    latest.current().then(
      (value) => {
        if (current) {
          setState({ status: 'loaded', value })
        }
      },
      (error: unknown) => {
        if (current) {
          setState({ status: 'failed', reason: error instanceof Error ? error.message : 'unknown' })
        }
      },
    )

    return () => {
      current = false
    }
  }, [key, attempt])

  return [state, reload]
}
