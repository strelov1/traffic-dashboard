## Context

DERQ operates roadside and intersection cameras that detect vehicles and read plates. A detection is therefore a point in time carrying two attributes the assessment cares about: the country that issued the plate, and the class of vehicle. The two required charts are aggregates over exactly those attributes.

"Country-wise traffic" is read as the **country that issued the plate**, not the country the camera stands in. In the Gulf, cross-border traffic is the interesting signal — Saudi plates in Dubai, Omani plates in Abu Dhabi — and a chart of it answers a question an operator actually has. The camera's own country would instead compare deployment markets, which is a business metric rather than a traffic one.

## Goals / Non-Goals

**Goals:**

- One table whose grain survives every later question: filters at any resolution, both aggregates, and re-aggregation into rollups if the scaling work calls for it.
- Seeded volume large enough that `EXPLAIN ANALYZE` says something true, so the scaling section can cite measurements instead of expectations.
- A seed that is idempotent and automatic, so a reviewer's first `docker compose up` produces a populated database.

**Non-Goals:**

- The aggregate endpoints, the charts, and filtering. This change ends at the repository boundary.
- A `sites` table, camera identity, or geography beyond the plate's country. Nothing in the assessment reads them, and inventing a foreign key now fixes a shape before there is a question to fix it against.
- Rollup or summary tables. They are the answer to a measured problem, and the measurement is part of this change.

## Decisions

**One row per detection.** A row is a single vehicle passing a camera at a moment. The alternative — hourly counts per country and type — makes today's chart trivially fast and forecloses everything else: an hourly grain cannot answer a question about the morning peak at fifteen-minute resolution, and counts cannot be split back apart. Aggregation is a one-way operation, so the raw grain is stored and the aggregation is done on read, where it can later be cached or precomputed without touching what is recorded.

**Columns: `occurred_at`, `plate_country`, `vehicle_type`, and nothing else.** Each is required by a chart or by the time filter that follows. A `site_id`, a speed, a direction, or a confidence score would all be plausible for the domain and unused by every requirement; adding them now would be inventing a schema for an imagined feature. The seam is noted rather than built: adding a nullable column later is a one-line migration, while removing a column that queries have grown to depend on is not.

**`plate_country` as ISO 3166-1 alpha-2, enforced by a pattern rather than by a width.** A stable key that never needs re-spelling, with display names resolved in the frontend where the user's locale lives; free-text names invite `UAE`, `U.A.E.` and `United Arab Emirates` to appear as three separate bars in a chart meant to compare them. The type is `text` with `CHECK (plate_country ~ '^[A-Z]{2}$')`, not `char(2)`: a fixed-width column rejects a value that is too long but silently pads one that is too short, so `A` would be stored as `A ` and appear as a country of its own. The pattern also rejects lowercase and digits, which a width never could.

**`vehicle_type text` with a `CHECK` constraint, not a Postgres enum.** Both reject bad data. The enum demands an `ALTER TYPE` migration to admit a new class, which is friction on a value set a detection vendor will plausibly extend; the `CHECK` is a one-line migration. A lookup table with a foreign key is more machinery than a fixed, short list earns, and it would put a join in the middle of the query the project is judged on.

**`occurred_at timestamptz`, not `timestamp`.** Cameras in different countries mean more than one offset, and a naive timestamp silently means whatever the writer assumed. Storing the instant and rendering the zone at the edge is the only version of this that stays correct when a second market is added.

**Identity column rather than a natural key.** No combination of these three fields is unique — two identical cars of the same type can pass in the same second — so a surrogate key is the honest choice. `generated always as identity` over `serial`: it is the standard form and it refuses accidental explicit inserts.

**No indexes in this change.** The table ships with only its primary key. This is deliberate: the scaling work needs a measured "before", and adding the index that makes the aggregate fast before ever seeing it slow would turn the scaling section back into speculation. The index arrives in the increment that measures it, with the plan on both sides recorded.

**The seed generates rows in SQL, in one statement, not row by row from the application.** Millions of round trips would take minutes and prove nothing about the schema; `generate_series` with expressions for the distribution runs in seconds inside the server. The distribution is deliberately uneven — a dominant home country, a long tail of neighbours, and cars far outnumbering buses — because a uniform random fill produces charts where every bar is the same height and hides exactly the shape a dashboard exists to show.

**The seed runs at startup only when the table is empty, and its size is configurable.** Automatic, so a reviewer's first run is populated with no extra step; conditional, so a restart does not double the data; configurable, so the cost is a decision. Emptiness is the condition rather than a marker table: it is the state the check actually cares about, and it stays correct if data arrives from the ingest path instead.

## Risks / Trade-offs

- **A large seed makes the first startup slow, which reads as a broken container.** → The default is small enough to finish in seconds and the count is configurable, so the multi-million volume the measurement needs is asked for explicitly rather than paid for on every startup; the seed logs what it is doing and how many rows it wrote, and the API is not accepting requests during it — the startup gate already established means a slow seed shows as "starting", not as a wrong answer.
- **Storing the raw grain means the table grows without bound, and the aggregate degrades with it.** → That is the intended shape of the problem: it is the subject of the scaling section, and it is why the "before" measurement is taken here. Nothing about the grain prevents the rollups, retention, or partitioning that answer it.
- **Deferring indexes means the aggregate is slow the moment it lands.** → Slow against a multi-million-row seed and instant against a small one, and the endpoint increment follows immediately. The cost is a short window; the gain is a real measurement to argue from.
- **A synthetic distribution can flatter the system by being kinder than production.** → It is shaped to be harder in the ways that matter — skewed rather than uniform, so a plan cannot rely on even selectivity — and the README will state plainly that the data is generated.
