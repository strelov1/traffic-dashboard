import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App'
import { fetchHealth } from './api/health'
import { API_ORIGIN } from './config'

const container = document.getElementById('root')

if (!container) {
  throw new Error('index.html is missing the #root element')
}

// Defined once rather than inline, so the identity stays stable across renders
// and the effect that depends on it does not re-run.
const checkHealth = () => fetchHealth(API_ORIGIN)

createRoot(container).render(
  <StrictMode>
    <App checkHealth={checkHealth} />
  </StrictMode>,
)
