## Context

Three small defects, one of which is a real design decision and two of which are one-token corrections.

## Goals / Non-Goals

**Goals:** reflow at 320px; AA on every text colour in both schemes; a failed load is recoverable without a page reload.

**Non-Goals:** no redesign, no new chart affordance, no polling or automatic refresh. Filters and the ingest form are separate changes and own their own state.

## Decisions

**`minmax(min(320px, 100%), 1fr)`.** The standard form: the track prefers 320px and may collapse to the container's width when there is less. The two-column behaviour above 700px is unchanged, so this fixes the floor without touching the intent.

**`--ink-muted` becomes `#6f6d66`** — 4.91:1 on `--page`, 5.04:1 on `--surface-1`. Chosen as the smallest darkening that clears 4.5 on both, so the visual weight barely moves, with a margin comparable to dark mode's 5.29–5.90. The values are recorded in the stylesheet next to the token: a contrast claim that lives only in a README is a claim nobody re-checks.

**`useAsync` returns a `reload`, not a `refetch(args)`.** An attempt counter in the dependency list re-runs the effect and resets the state to `loading`. That is the smallest thing that satisfies both this change and the two queued behind it, and it does not presume how a caller will parameterise a future request — filters will need a keyed dependency, and inventing that shape now, before there is a filter, is the overengineering AGENTS.md forbids. The seam is noted, not built.

**The retry is offered per chart, not once for the page.** Each panel already reports its own state, precisely so a slow or failing request cannot blank a panel whose data arrived. A single page-level retry would contradict that.

## Risks / Trade-offs

**jsdom cannot see the overflow → verified in a real browser, and the number recorded.** `App.test.tsx` and `TotalsChart.test.tsx` stub `ResponsiveContainer` at a fixed size and jsdom performs no layout, so no test can catch a regression here. Stated rather than papered over: the assertion is `documentElement.scrollWidth` against `clientWidth` at a 320px viewport, run by hand.

**A retry button is a new way to hammer a failing API → it is user-initiated and per chart.** No automatic retry, no backoff to get wrong.
