import { afterEach, describe, expect, it, vi } from 'vitest'

import { closeOnSignal } from './shutdown.js'

describe('closeOnSignal', () => {
  let dispose: (() => void) | undefined

  afterEach(() => {
    dispose?.()
    dispose = undefined
  })

  function spies() {
    const closed: string[] = []

    return {
      closed,
      server: { close: () => Promise.resolve(closed.push('server')) },
      database: { close: () => Promise.resolve(closed.push('database')) },
    }
  }

  // A real signal, not a call to the handler: registering a listener is what
  // replaces Node's default action, and that replacement is the behaviour worth
  // testing. Emitting it exercises the same path the container takes.
  it.each(['SIGTERM', 'SIGINT'] as const)(
    'closes the server and then the database on %s',
    async (signal) => {
      const { closed, server, database } = spies()
      const exit = vi.fn()

      dispose = closeOnSignal(server, database, exit)
      process.emit(signal)

      await vi.waitFor(() => {
        expect(closed).toEqual(['server', 'database'])
      })
      expect(exit).toHaveBeenCalledOnce()
    },
  )

  it('closes the pool and exits even when the server refuses to close', async () => {
    const closed: string[] = []
    const server = { close: () => Promise.reject(new Error('server would not close')) }
    const database = { close: () => Promise.resolve(closed.push('database')) }
    const exit = vi.fn()
    const onError = vi.fn()

    dispose = closeOnSignal(server, database, exit, onError)
    process.emit('SIGTERM')

    await vi.waitFor(() => {
      expect(exit).toHaveBeenCalledOnce()
    })
    // The pool is what would otherwise be torn down as an unexpected EOF.
    expect(closed).toEqual(['database'])
    expect(onError).toHaveBeenCalledOnce()
  })

  it('leaves no listener behind once disposed', () => {
    const { server, database } = spies()
    const before = process.listenerCount('SIGTERM')

    closeOnSignal(server, database, vi.fn())()

    expect(process.listenerCount('SIGTERM')).toBe(before)
  })
})
