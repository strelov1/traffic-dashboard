import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App'
import { fetchTotalsByCountry, fetchTotalsByVehicleType } from './api/traffic'
import { API_ORIGIN } from './config'
import { periodBounds, type Filter } from './filters'
import './styles.css'

const container = document.getElementById('root')

if (!container) {
  throw new Error('index.html is missing the #root element')
}

// The preset becomes instants here, at the moment of the request, from this
// browser's clock. The clock only ever produces a request: the boundary that
// counts is the one the API rounds to and states back.
//
// Their identity no longer has to be stable — `useAsync` re-runs on its key,
// not on the loader — but defining them once keeps the composition in one place.
const loadByCountry = (filter: Filter) =>
  fetchTotalsByCountry(API_ORIGIN, periodBounds(filter.period, new Date()))

const loadByVehicleType = (filter: Filter) =>
  fetchTotalsByVehicleType(API_ORIGIN, {
    ...periodBounds(filter.period, new Date()),
    ...(filter.country === undefined ? {} : { country: filter.country }),
  })

createRoot(container).render(
  <StrictMode>
    <App loadByCountry={loadByCountry} loadByVehicleType={loadByVehicleType} />
  </StrictMode>,
)
