import { useCallback, useMemo, useSyncExternalStore } from 'react'

import { parseFilter, toSearch, type Filter } from './filters'

/**
 * The URL is the state, rather than a copy kept in step with it.
 *
 * Holding the selection in `useState` and mirroring it into the address bar
 * gives two sources of truth that disagree the moment the reader presses back:
 * `popstate` changes the URL and nothing changes the state. Reading through
 * `useSyncExternalStore` leaves one value, with the browser's own history as
 * the store, so back and forward work because there is nothing to keep in step.
 */
const listeners = new Set<() => void>()

function subscribe(onChange: () => void): () => void {
  // Two sources, one callback: the browser announces a back or forward with
  // popstate, and `select` announces its own pushState — which, by design,
  // does not fire popstate.
  window.addEventListener('popstate', onChange)
  listeners.add(onChange)

  return () => {
    window.removeEventListener('popstate', onChange)
    listeners.delete(onChange)
  }
}

const currentSearch = () => window.location.search

export function useUrlFilter(): [Filter, (next: Filter) => void] {
  const search = useSyncExternalStore(subscribe, currentSearch)
  // Parsed once per distinct URL: the filter is compared by identity as a
  // dependency downstream, and a fresh object per render would defeat that.
  const filter = useMemo(() => parseFilter(search), [search])

  const select = useCallback((next: Filter) => {
    // Pushed, not replaced: a filter change is somewhere the reader navigated
    // to, and back should return them to what they were looking at before.
    window.history.pushState(null, '', `${window.location.pathname}${toSearch(next)}`)

    for (const onChange of listeners) {
      onChange()
    }
  }, [])

  return [filter, select]
}
