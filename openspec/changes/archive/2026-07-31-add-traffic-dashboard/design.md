## Context

Two aggregates, six categories each, ranked by total. The brief asks for charts that are "interactive and creative" and offers bar, line, or pie. It also asks for a UI that is clean, responsive, and user-friendly, which is the constraint that actually decides the form.

## Goals / Non-Goals

**Goals:**

- Two charts a reader understands without instruction, correct by the rules of the medium rather than by taste.
- Every state visible: loading, empty, and failed, each per chart.
- Legible on a phone and on a wide screen, in light and dark.

**Non-Goals:**

- Filters and time ranges. They change what is fetched and belong with the increment that adds the query parameters.
- A component library or a design system. Two charts and a heading do not earn one.

## Decisions

**Horizontal bars for both, not pie.** The brief permits a pie, and a pie is the wrong instrument here: six slices force the reader to compare angles, which people do badly, and the ranking that the data already carries is thrown away. Bars turn the comparison into lengths against a shared baseline, which is the one visual judgement people make accurately. Horizontal rather than vertical because the category labels are words — `motorcycle` does not fit under a vertical bar without rotating, and rotated text is a legibility cost paid on every read.

**One colour for every bar, not a colour per category.** Colouring each bar differently, or shading them darker-where-bigger, double-encodes what the bar length already says and spends the only free visual channel on nothing. It is also unsound: a value ramp across nominal categories — countries and vehicle types have no inherent order — cannot hold both a legible lightness spread and enough contrast against the surface, which the palette validator confirms by failing it. A single hue, ranked bars, and direct labels carry the whole message.

**Colours are selected per surface and validated, not inverted.** Light uses `#2a78d6`, dark uses `#3987e5`; both clear 3:1 against their own surface, checked by running the validator rather than by judging it. Flipping a light-mode colour into dark mode reliably produces something that either glows or disappears.

**Values direct-labelled on the bars, and no legend.** With one series, a legend would be a box explaining that blue means the thing the title already names. Six bars is few enough to label every one, so the reader never moves their eye to an axis to learn a number.

**A tooltip on hover, per bar.** An HTML chart is interactive by nature and the brief asks for it; the tooltip carries the exact count and the share of the total, which is the one thing the bars do not show directly.

**A headline total above the charts, computed from what is already fetched.** It answers "how much traffic is this" before any comparison, and it needs no endpoint: it is the sum of the country totals. A number a dashboard leads with belongs in text at size, not as a one-bar chart.

**Each chart owns its loading, empty, and failed state.** Fetching both aggregates and rendering nothing until both resolve makes one slow query hide a fast one, and one failed request blank a working chart. An empty result renders as an explicit "no traffic recorded", not as an empty frame, because a chart with nothing in it is indistinguishable from a chart that failed to draw.

**Plain CSS with custom properties, no framework.** Two charts, a heading, and a grid do not justify a utility framework or a component library in the dependency list. Custom properties give the light and dark surfaces one place to live, and the dark mode follows `prefers-color-scheme`.

## Risks / Trade-offs

- **Two bar charts may read as unimaginative against a brief asking for "creative".** → The creativity is spent on being right: ranked bars, a headline figure, real states, and a dark mode that was selected rather than inverted. A pie chart would look more varied and communicate less, and the reasoning is recorded here to be defended rather than guessed at.
- **Direct labels crowd on a narrow screen.** → Labels sit inside the bar when it is wide enough and outside when it is not, and the layout stacks before the bars get short enough for this to matter.
- **A charting library is a dependency for something drawable in SVG by hand.** → Hand-rolled axes, responsive resizing, and hit-testing for tooltips are more code than they look, and none of it is the part being assessed.
