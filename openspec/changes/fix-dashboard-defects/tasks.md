## 1. Reflow at a phone width

- [x] 1.1 Measure the overflow in a real browser at a 320px viewport: record `scrollWidth` against `clientWidth`. jsdom cannot see this, so the measurement is the evidence.
- [x] 1.2 Change `.grid` to `repeat(auto-fit, minmax(min(320px, 100%), 1fr))` and update the comment, which currently claims no breakpoint was guessed at.
- [x] 1.3 Re-measure: no overflow at 320px, and two columns still above 700px.

## 2. Contrast

- [x] 2.1 RED: assert light-mode `--ink-muted` clears 4.5:1 against both `--page` and `--surface-1`, computed from the stylesheet's own values. It fails today at 4.31 and 4.43.
- [x] 2.2 Set `--ink-muted` to `#6f6d66` and record both ratios beside the token.
- [x] 2.3 GREEN, and confirm dark mode is unaffected.

## 3. Retry

- [x] 3.1 RED: a failed chart offers a retry, and using it loads the data.
- [x] 3.2 RED: while a retry is in flight the chart reports loading.
- [x] 3.3 Give `useAsync` a `reload` via an attempt counter in the dependency list; render the control in the failed branch of `TotalsChart`.
- [x] 3.4 GREEN. Confirm the headline follows, since it is derived from the by-country state.

## 4. Verify

- [x] 4.1 `pnpm verify`.
- [ ] 4.2 In a real browser: stop the API, load the page, start the API, retry — both charts recover without a reload.
- [ ] 4.3 Screenshot at 320px and at 1440px, light and dark.
- [ ] 4.4 `simplify`, then re-run the suite.
- [ ] 4.5 Request code review; fix Critical and Important.
