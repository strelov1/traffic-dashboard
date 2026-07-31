## Why

Both aggregates are served and nothing draws them. This is the increment where the assessment's first requirement is met and where the project becomes something a reviewer can look at rather than curl.

## What Changes

- A dashboard replacing the connectivity shell: a headline total and two charts, traffic by plate country and traffic by vehicle type.
- Both charts are horizontal bars with a single hue, ranked largest first, with values direct-labelled and a tooltip on hover.
- Loading, empty, and failed states per chart, so one failing request does not blank the page.
- A responsive layout: side by side when there is room, stacked when there is not.
- Light and dark surfaces, each with its own validated colour rather than an automatic inversion.

Not in this change: filters, the write path, and caching.

## Capabilities

### New Capabilities

- `traffic-dashboard`: what the browser shows — which figures appear, how each chart reads, and how the page behaves while data is loading, when there is none, and when a request fails.

### Modified Capabilities

- `service-health`: the shell that reported API and database reachability is replaced by the dashboard. The health endpoint keeps its requirements; only the browser-facing part of that capability changes.

## Impact

- **New code:** chart components and their suites, a small design-token stylesheet, the dashboard page.
- **Removed:** the connectivity shell, which existed to prove the seam and has been superseded by a page that exercises the same one with real data.
- **Dependencies:** a charting library.
