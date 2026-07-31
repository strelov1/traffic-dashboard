import http from 'k6/http'
import { check } from 'k6'

// One tier per run: RATE=5 k6 run perf/aggregate-load.js
//
// Open model on purpose. A closed model (N virtual users in a loop) slows its
// own request rate down as the system slows, so a saturated service looks
// merely slow instead of overloaded. Arrival rate keeps issuing on schedule,
// which is how real traffic behaves.
const TARGET = __ENV.TARGET ?? 'http://localhost:3399/api/traffic/by-country'
const RATE = Number(__ENV.RATE ?? 5)

export const options = {
  scenarios: {
    tier: {
      executor: 'constant-arrival-rate',
      rate: RATE,
      timeUnit: '1s',
      duration: '20s',
      preAllocatedVUs: Math.min(RATE * 2, 200),
      maxVUs: 1000,
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500'],
  },
}

export default function () {
  const response = http.get(TARGET)

  check(response, { 'status is 200': (r) => r.status === 200 })
}
