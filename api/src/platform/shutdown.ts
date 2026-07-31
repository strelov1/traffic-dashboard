export type Closable = {
  close: () => Promise<unknown>
}

const SIGNALS = ['SIGTERM', 'SIGINT'] as const

/**
 * Stops serving before exiting, in that order: the server first so no new
 * connection is accepted and requests already in flight are answered, then the
 * pool so the database is not left closing sockets itself.
 *
 * Node's default action for these signals ends the process at once. The
 * container runs this process as PID 1 with no init, so without a listener
 * every `compose down`, restart and replacement cuts open responses mid-write
 * and closes each pooled connection as an unexpected end-of-file.
 *
 * Returns a disposer, so a test can drive a real signal without leaving a
 * listener behind for the next one.
 */
export function closeOnSignal(
  server: Closable,
  database: Closable,
  exit: () => void,
  onError: (error: unknown) => void = (error) => {
    console.error('shutdown step failed', error)
  },
): () => void {
  const stop = () => {
    void (async () => {
      // Each step is attempted even if the previous one failed: a server that
      // refuses to close is no reason to leave the pool to be torn down as the
      // unexpected end-of-file this handler exists to avoid. A rejection here
      // would otherwise be unhandled, which terminates the process with a stack
      // trace and a non-zero code — read by an orchestrator as a failed stop.
      await server.close().catch(onError)
      await database.close().catch(onError)

      exit()
    })()
  }

  for (const signal of SIGNALS) {
    process.once(signal, stop)
  }

  return () => {
    for (const signal of SIGNALS) {
      process.removeListener(signal, stop)
    }
  }
}
