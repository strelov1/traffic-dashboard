## ADDED Requirements

### Requirement: A failed chart can be retried without reloading the page

When a chart's data could not be loaded, the dashboard SHALL offer a way to request it again, and SHALL show that the request is in progress while it runs.

This is reachable on an ordinary first visit: the static bundle is served before the API accepts requests, since the API applies migrations and may seed before it listens. Without a retry the reader's only recourse is a manual reload, on a page that gives no sign one would help.

The retry SHALL be offered per chart. Each chart already reports its own state so that a slow or failing request cannot blank a panel whose own data arrived; a single page-level control would undo that.

#### Scenario: The API is unreachable on first load and recovers

- **WHEN** a chart's request fails and the reader asks for it again after the API becomes available
- **THEN** the chart loads and replaces the failure message

#### Scenario: A retry is in flight

- **WHEN** the reader asks for a failed chart again
- **THEN** the chart reports that it is loading until the request settles

## MODIFIED Requirements

### Requirement: The layout adapts and honours the reader's colour scheme

The dashboard SHALL lay its charts out side by side where there is room and stack them where there is not, without a breakpoint chosen by hand.

At a 320px viewport — the reflow benchmark — the page SHALL NOT scroll horizontally. A grid track whose minimum is a fixed length cannot satisfy this: the minimum is a floor, not a preference, and the page's own padding is charged on top of it.

The dashboard SHALL follow the reader's preferred colour scheme, and each scheme's colours SHALL be chosen against that scheme's own surfaces rather than inverted from the other's.

Every colour used for text SHALL meet a contrast ratio of at least 4.5:1 against every surface it is drawn on. The 3:1 threshold applies to the bars, which carry no text, and SHALL NOT be applied to text on the grounds that the bars pass it.

#### Scenario: A phone-width viewport

- **WHEN** the dashboard is rendered at a 320px viewport
- **THEN** the charts are stacked, and the document is no wider than the viewport

#### Scenario: The reader prefers a dark scheme

- **WHEN** the reader's system asks for a dark colour scheme
- **THEN** the dashboard renders on dark surfaces, with bar and text colours meeting contrast against those surfaces

#### Scenario: The reader prefers a light scheme

- **WHEN** the reader's system asks for a light colour scheme
- **THEN** every text colour meets 4.5:1 against the surface behind it
