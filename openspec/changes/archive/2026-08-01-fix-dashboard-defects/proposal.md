## Why

Three defects a review found in the dashboard, each contradicting something the project already claims.

**The layout scrolls sideways on a small phone.** `.grid` uses `minmax(320px, 1fr)`; a `minmax` minimum is a hard floor, and `.page` adds 20px of padding per side under `border-box`, so the layout needs 360px to break even. `traffic-dashboard` spec requires "no horizontal scrolling at a phone width" in its own scenario, and 320px is the WCAG 1.4.10 reflow benchmark. The CSS comment claims "no breakpoint has to be guessed at" — 320px is exactly a guessed one.

**Light-mode `--ink-muted` misses WCAG AA.** Measured: 4.31:1 against `--page` and 4.43:1 against `--surface-1`, both under 4.5. It colours the `h1`, the Source link, and the loading and empty-state copy. Dark mode passes at 5.90 / 5.29. The README and the spec both state each scheme was checked against its own surface; the bar colour clears its 3:1 non-text threshold, so it looks as though the non-text rule was applied to text.

**A failed first load is permanent.** `useAsync` runs once, keyed on a module-scope loader, and the failed branch offers no way to try again. This is reachable on a normal first run: Compose gives `web` a bare `depends_on: [api]`, while the API migrates and seeds before it listens, so nginx serves the bundle before the API answers. The reader gets "Could not load this chart" on both cards and `—` as the headline, until they reload by hand.

## What Changes

- `.grid` tracks may collapse below their preferred minimum, so the page reflows at 320px instead of overflowing.
- Light-mode `--ink-muted` darkens until it clears 4.5:1 against both surfaces it is drawn on.
- `useAsync` gains a way to run again, and a failed chart offers it. The headline follows.

## Capabilities

### Modified Capabilities

- `traffic-dashboard`: the layout reflows rather than scrolling at a phone width; every text colour meets AA against its own surface; a failed load can be retried without reloading the page.

## Impact

- **Web only.** No API, database, or infrastructure change.
- **Shared with the queued follow-ups.** `add-dashboard-filters` and `add-detection-form` both need a re-run path; this change is where it lands, so they inherit it rather than each inventing one.
- **Testable, but not fully.** jsdom performs no layout, so the overflow cannot be asserted by the suite — it is verified in a real browser and the number is recorded here. The retry and the contrast values can be asserted.
