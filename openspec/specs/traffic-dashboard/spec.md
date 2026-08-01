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

The headline SHALL follow the controls beside it. With a period chosen it counts that period; with a country chosen it counts that country, taken from the country aggregate already on hand rather than from a further request. The filter in effect SHALL be stated next to the number, so the figure is never shown without its scope — a total that silently ignored the controls would be a claim the reader has no way to check.

#### Scenario: Total reflects the aggregate

- **WHEN** country totals of 3 and 1 are returned
- **THEN** the headline total reads 4

#### Scenario: Total follows the country

- **WHEN** country totals of 3 and 1 are returned and the reader chooses the country with 1
- **THEN** the headline total reads 1

#### Scenario: The scope is stated

- **WHEN** a period or a country is in effect
- **THEN** the headline names it alongside the number

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

The dashboard SHALL lay its charts out side by side where there is room and stack them where there is not, without a breakpoint chosen by hand.

At a 320px viewport — the reflow benchmark — the page SHALL NOT scroll horizontally. A grid track whose minimum is a fixed length cannot satisfy this: the minimum is a floor, not a preference, and the page's own padding is charged on top of it.

The dashboard SHALL follow the reader's preferred colour scheme, and each scheme's colours SHALL be chosen against that scheme's own surfaces rather than inverted from the other's.

Every colour used for text SHALL meet a contrast ratio of at least 4.5:1 against every surface it is drawn on. The 3:1 threshold applies to the bars, which carry no text, and SHALL NOT be applied to text on the grounds that the bars pass it.

#### Scenario: Narrow viewport

- **WHEN** the dashboard is rendered at a 320px viewport
- **THEN** the charts are stacked, and the document is no wider than the viewport

#### Scenario: Dark colour scheme

- **WHEN** the reader's system asks for a dark colour scheme
- **THEN** the dashboard renders on dark surfaces, with bar and text colours meeting contrast against those surfaces

#### Scenario: The reader prefers a light scheme

- **WHEN** the reader's system asks for a light colour scheme
- **THEN** every text colour meets 4.5:1 against the surface behind it

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

### Requirement: The reader can narrow the dashboard to a period

The dashboard SHALL offer a period control covering the last day, the last week, the last month, and all time, with all time as the default. Choosing a period SHALL re-read both aggregates for it.

The periods offered are relative to the present rather than a pair of instants the reader picks. A traffic dashboard is asked "what has been happening lately", and a date picker would produce arbitrary bounds that the API rounds to the hour regardless.

#### Scenario: A period is chosen

- **WHEN** the reader chooses the last week
- **THEN** both charts re-read their aggregate for that period, and both show the totals for it

#### Scenario: No period is chosen

- **WHEN** the dashboard is opened without a period
- **THEN** both charts show all recorded traffic, and the control reads as all time

### Requirement: The reader can narrow the vehicle-type chart to one plate country

The dashboard SHALL offer a country control listing the countries present in the current period, plus an option for all countries. Choosing one SHALL narrow the vehicle-type chart to that country.

The country chart SHALL NOT be narrowed by it, and SHALL NOT be re-read when only the country changes: a chart of every country reduced to one country is a single bar, which answers a different question and would cost a request to render the same picture.

#### Scenario: A country is chosen

- **WHEN** the reader chooses a country
- **THEN** the vehicle-type chart shows only that country's traffic, and the country chart is unchanged

#### Scenario: The country chart is not re-read for a country

- **WHEN** the reader changes only the country
- **THEN** the by-country aggregate is not requested again

#### Scenario: A country with no traffic in the period

- **WHEN** the chosen country has no detections in the chosen period
- **THEN** the vehicle-type chart states that no traffic is recorded, rather than reporting a failure

### Requirement: The controls' state lives in the URL

The chosen period and country SHALL be reflected in the page's query string, and SHALL be read back from it on load, so that a filtered view can be linked, bookmarked and shared. Navigating back SHALL restore the previous selection rather than leaving the URL and the controls disagreeing.

The period is carried as the reader's choice — the last week — rather than as the instants it resolves to, so a link opened tomorrow answers the question that was shared rather than repeating yesterday's window.

A query string that cannot be understood SHALL fall back to the default selection rather than render an error, and the controls SHALL then show what is actually in effect.

#### Scenario: A selection is linked

- **WHEN** the reader chooses a period and a country
- **THEN** the query string carries both, and opening that URL again reproduces the same view

#### Scenario: The reader navigates back

- **WHEN** the reader changes a control and then goes back
- **THEN** the controls and both charts return to the previous selection

#### Scenario: An unreadable query string

- **WHEN** the dashboard is opened with a period value it does not offer
- **THEN** it shows the default selection rather than an error

### Requirement: The reader can record a detection from the dashboard

The dashboard SHALL offer a form of a plate country, a vehicle type and a submit control, which records exactly one detection through the ingest endpoint the API already publishes.

The vehicle-type options SHALL be the set the API accepts, and a test SHALL fail if the two ever differ — a control offering a class the API refuses, or omitting one it added, is a defect the page cannot show by itself.

No instant is sent. A detection recorded now falls in the hour that is served live, so it is counted by the next read; a detection dated into the past would be recorded successfully and change nothing on screen.

#### Scenario: A detection is recorded

- **WHEN** the reader chooses a country and a vehicle type and submits
- **THEN** one detection with those values is sent to the ingest endpoint

#### Scenario: The recorded detection shows up in the figures

- **WHEN** a detection is recorded
- **THEN** both charts and the headline re-read their aggregates, rather than the page reporting a success over unchanged numbers

#### Scenario: The vehicle-type options match the API

- **WHEN** the vehicle-type control is rendered
- **THEN** its options are exactly the vehicle classes the API accepts

### Requirement: A refused detection is reported in the API's own words

The form SHALL NOT validate the plate country before sending it. A value the API refuses SHALL be sent, and the message the API answered with SHALL be shown unaltered, so that a reader sees the validation layer stating its own rule rather than a sentence the page invented.

A request that never received an answer SHALL be reported in the same place, distinguished from a refusal in that nothing is claimed about the value the reader typed.

#### Scenario: The API refuses the plate country

- **WHEN** the reader submits a plate country that is not an ISO alpha-2 code
- **THEN** the request is sent, and the API's own message naming the field and the pattern is shown

#### Scenario: A refusal leaves the figures alone

- **WHEN** a detection is refused
- **THEN** neither chart is re-read, and no success is reported

#### Scenario: The API cannot be reached

- **WHEN** the request fails without an answer from the API
- **THEN** the form reports the failure and does not mark the reader's value as invalid

### Requirement: The form is operable and its outcome is announced

Both controls SHALL be tied to visible labels. The outcome of a submission SHALL be announced without the reader having to go looking for it: a refusal SHALL be associated with the field it is about through `aria-describedby`, and focus SHALL move to the message; a success SHALL be announced through a live region while focus stays where the reader left it, so that a second detection costs one keystroke.

Only a refusal from the API SHALL mark a control invalid. A submission already in flight SHALL be ignored rather than disabling the focused control, which would drop focus to the top of the page.

#### Scenario: The controls are labelled

- **WHEN** the form is rendered
- **THEN** the country and vehicle-type controls are each reachable by their visible label

#### Scenario: A refusal reaches the reader

- **WHEN** a detection is refused
- **THEN** the message is associated with the plate-country field, that field is marked invalid, and focus is on the message

#### Scenario: A success is announced in place

- **WHEN** a detection is recorded
- **THEN** the outcome is announced by a live region and focus stays on the submit control

#### Scenario: Submitted twice in a row

- **WHEN** the reader submits again while a submission is still in flight
- **THEN** only one detection is sent

### Requirement: The page states that recording is unauthenticated

The dashboard SHALL state, at the form, that anyone who can reach the API can record a detection. The README says so about the deployment; a button on the page makes it something a reader meets rather than something they have to be told.

#### Scenario: The trade is visible where it is taken

- **WHEN** the form is rendered
- **THEN** it states that the write path is unauthenticated

