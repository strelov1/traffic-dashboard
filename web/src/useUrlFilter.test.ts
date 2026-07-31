import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { DEFAULT_FILTER } from './filters'
import { useUrlFilter } from './useUrlFilter'

afterEach(() => {
  window.history.replaceState(null, '', '/')
})

describe('useUrlFilter', () => {
  it('reads the selection out of the URL the page was opened with', () => {
    window.history.replaceState(null, '', '/?period=7d&country=AE')

    const { result } = renderHook(() => useUrlFilter())

    expect(result.current[0]).toEqual({ period: '7d', country: 'AE' })
  })

  it('is the default when the URL carries nothing', () => {
    const { result } = renderHook(() => useUrlFilter())

    expect(result.current[0]).toEqual(DEFAULT_FILTER)
  })

  it('writes a selection into the URL and reports it back', () => {
    const { result } = renderHook(() => useUrlFilter())

    act(() => {
      result.current[1]({ period: '30d', country: 'SA' })
    })

    expect(window.location.search).toBe('?period=30d&country=SA')
    expect(result.current[0]).toEqual({ period: '30d', country: 'SA' })
  })

  it('pushes an entry rather than replacing one, so back returns to the previous view', async () => {
    const { result } = renderHook(() => useUrlFilter())

    act(() => {
      result.current[1]({ period: '7d' })
    })
    expect(result.current[0]).toEqual({ period: '7d' })

    // popstate is what the hook subscribes to; without that subscription the
    // URL would go back and the controls would stay where the reader left them.
    await act(async () => {
      window.history.back()
      await popped()
    })

    expect(window.location.search).toBe('')
    expect(result.current[0]).toEqual(DEFAULT_FILTER)
  })

  it('drops a selection back to the bare URL', () => {
    window.history.replaceState(null, '', '/?period=7d')

    const { result } = renderHook(() => useUrlFilter())

    act(() => {
      result.current[1](DEFAULT_FILTER)
    })

    expect(window.location.search).toBe('')
  })
})

/** history.back() is asynchronous; popstate is how it announces it landed. */
function popped(): Promise<void> {
  return new Promise((resolve) => {
    window.addEventListener('popstate', () => {
      resolve()
    })
  })
}
