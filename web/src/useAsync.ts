import { useCallback, useEffect, useState } from 'react'

export type AsyncState<T> =
  | { status: 'loading' }
  | { status: 'loaded'; value: T }
  | { status: 'failed'; reason: string }

/**
 * One state per caller, so a slow or failing request never blanks a panel whose
 * own data arrived, and a `reload` so a failed one is recoverable in place.
 *
 * `reload` takes no arguments: a request the caller parameterises — a filtered
 * range, say — belongs in `load`'s own identity, which re-runs the effect by
 * itself when it changes. Nothing here is parameterised yet, so nothing is
 * built for it.
 */
export function useAsync<T>(load: () => Promise<T>): [AsyncState<T>, () => void] {
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  const reload = useCallback(() => {
    setAttempt((previous) => previous + 1)
  }, [])

  useEffect(() => {
    // Superseded runs are dropped rather than aborted, so a response that
    // arrives after a reload cannot overwrite the run the reader asked for.
    let current = true

    // Reset inside the effect, so every run — the first one included — starts
    // from the state its own response replaces.
    setState({ status: 'loading' })

    load().then(
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
  }, [load, attempt])

  return [state, reload]
}
