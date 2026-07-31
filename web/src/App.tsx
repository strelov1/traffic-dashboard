import { useEffect, useState } from 'react'

import type { HealthOutcome } from './api/health'

type Props = {
  checkHealth: () => Promise<HealthOutcome>
}

const MESSAGES: Record<HealthOutcome['kind'], string> = {
  ok: 'Connected — API and database are reachable',
  degraded: 'API is reachable, but it cannot reach the database',
  unreachable: 'The API could not be reached',
}

export function App({ checkHealth }: Props) {
  const [outcome, setOutcome] = useState<HealthOutcome | undefined>(undefined)

  useEffect(() => {
    let current = true

    void checkHealth().then((result) => {
      // Guards against a state update after the effect has been torn down,
      // which React's strict mode double-invocation makes routine.
      if (current) {
        setOutcome(result)
      }
    })

    return () => {
      current = false
    }
  }, [checkHealth])

  return (
    <main>
      <h1>DERQ Traffic</h1>
      <p role="status">{outcome ? MESSAGES[outcome.kind] : 'Checking connection…'}</p>
    </main>
  )
}
