import { useEffect, useState } from 'react'

export type AsyncState<T> =
  | { status: 'loading' }
  | { status: 'loaded'; value: T }
  | { status: 'failed'; reason: string }

/**
 * One state per caller, so a slow or failing request never blanks a panel whose
 * own data arrived.
 */
export function useAsync<T>(load: () => Promise<T>): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading' })

  useEffect(() => {
    let current = true

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
  }, [load])

  return state
}
