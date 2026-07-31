import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App'
import { fetchTotalsByCountry, fetchTotalsByVehicleType } from './api/traffic'
import { API_ORIGIN } from './config'
import './styles.css'

const container = document.getElementById('root')

if (!container) {
  throw new Error('index.html is missing the #root element')
}

// Defined once rather than inline, so the identity stays stable across renders
// and the effects that depend on them do not re-run.
const loadByCountry = () => fetchTotalsByCountry(API_ORIGIN)
const loadByVehicleType = () => fetchTotalsByVehicleType(API_ORIGIN)

createRoot(container).render(
  <StrictMode>
    <App loadByCountry={loadByCountry} loadByVehicleType={loadByVehicleType} />
  </StrictMode>,
)
