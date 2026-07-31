# traffic-dashboard Specification

## Purpose

What the browser shows: which figures appear, how each chart reads, and how the page behaves while data is loading, when there is none, and when a request fails.

Correctness here is about the reader, not the code. A chart that renders without error can still mislead — by asking for a comparison people make badly, by spending colour on information the shape already carries, or by being indistinguishable from one that failed to draw.
## Requirements
### Requirement: The dashboard shows traffic by plate country and by vehicle type

The dashboard SHALL present two charts, one per aggregate, each titled so that a reader knows what it counts without a legend. Categories SHALL appear ranked with the largest first, matching the order the API returns.

#### Scenario: Both aggregates resolve

- **WHEN** both aggregate requests succeed
- **THEN** the page shows a chart of totals per plate country and a chart of totals per vehicle type

#### Scenario: Categories are ranked

- **WHEN** a chart renders totals that differ
- **THEN** the category with the largest total appears first

### Requirement: Every bar carries its value and every chart is readable without colour

Each bar SHALL be labelled with its total, and all bars in a chart SHALL share one colour. Identity comes from the category label, never from colour alone, so a chart remains readable in greyscale and to a colourblind reader.

#### Scenario: Values are visible without interaction

- **WHEN** a chart renders
- **THEN** each bar shows its category and its total as text

### Requirement: A headline total leads the page

The dashboard SHALL show the total number of recorded events above the charts, derived from the data already fetched rather than from an additional request.

#### Scenario: Total reflects the aggregate

- **WHEN** country totals of 3 and 1 are returned
- **THEN** the headline total reads 4

### Requirement: Each chart reports its own loading, empty, and failed state

Every chart SHALL render a distinct state for each outcome, independently of the other chart. One slow or failing request MUST NOT blank a chart whose data arrived.

#### Scenario: A request has not settled

- **WHEN** an aggregate request is in flight
- **THEN** that chart reports that it is loading, rather than rendering an empty frame

#### Scenario: An aggregate is empty

- **WHEN** an aggregate resolves with no entries
- **THEN** that chart states that no traffic is recorded, rather than rendering an empty frame

#### Scenario: One request fails and the other succeeds

- **WHEN** the country aggregate fails and the vehicle-type aggregate succeeds
- **THEN** the country chart reports a failure and the vehicle-type chart renders its data

### Requirement: A pointer reveals the exact count and share

Hovering or focusing a bar SHALL reveal its exact total and its share of all events in that chart, which the bars alone do not state.

#### Scenario: A bar is hovered

- **WHEN** the pointer rests on a bar
- **THEN** a tooltip gives that category's total and its percentage of the chart's total

### Requirement: The layout adapts and honours the reader's colour scheme

The two charts SHALL sit side by side when the viewport is wide enough and stack when it is not, with no horizontal scrolling at a phone width. Colours SHALL follow the reader's `prefers-color-scheme`, with each mode's values chosen and checked against its own surface rather than derived by inverting the other.

#### Scenario: Narrow viewport

- **WHEN** the dashboard is viewed at a phone width
- **THEN** the charts are stacked and the page does not scroll horizontally

#### Scenario: Dark colour scheme

- **WHEN** the reader's system prefers a dark colour scheme
- **THEN** the page renders on a dark surface with bar and text colours meeting contrast against it

