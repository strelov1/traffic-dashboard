import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { App } from './App'
import type { HealthOutcome } from './api/health'

function resolving(outcome: HealthOutcome) {
  return () => Promise.resolve(outcome)
}

describe('App', () => {
  it('reports that the check is in flight before it settles', () => {
    render(<App checkHealth={() => new Promise<HealthOutcome>(() => undefined)} />)

    expect(screen.getByRole('status')).toHaveTextContent(/checking/i)
  })

  it('reports a connected system once the check succeeds', async () => {
    render(<App checkHealth={resolving({ kind: 'ok' })} />)

    expect(await screen.findByRole('status')).toHaveTextContent(/connected/i)
  })

  it('names the database when the API reports itself degraded', async () => {
    render(<App checkHealth={resolving({ kind: 'degraded' })} />)

    expect(await screen.findByRole('status')).toHaveTextContent(/database/i)
  })

  it('names the API when it cannot be reached at all', async () => {
    render(<App checkHealth={resolving({ kind: 'unreachable' })} />)

    const status = await screen.findByRole('status')

    expect(status).toHaveTextContent(/api/i)
    expect(status).not.toHaveTextContent(/database/i)
  })

  it('checks once rather than on every render', async () => {
    let calls = 0
    const checkHealth = () => {
      calls += 1

      return Promise.resolve<HealthOutcome>({ kind: 'ok' })
    }

    const { rerender } = render(<App checkHealth={checkHealth} />)
    await screen.findByRole('status')
    rerender(<App checkHealth={checkHealth} />)

    expect(calls).toBe(1)
  })
})
