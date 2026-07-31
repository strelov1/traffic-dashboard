## 1. Repository reads

- [x] 1.1 Add `totalsByCountry` aggregating in SQL, ordered by total descending then by country, with the row shape validated and the count coerced to a number
- [x] 1.2 Add `totalsByVehicleType` on the same terms
- [x] 1.3 Cover the empty table and the equal-totals tie-break for both

## 2. Endpoints

- [x] 2.1 Serve `GET /api/traffic/by-country` in the `{"data": ...}` envelope, with a declared response schema
- [x] 2.2 Serve `GET /api/traffic/by-vehicle-type` on the same terms
- [x] 2.3 Prove an undocumented field on a row does not reach the response body

## 3. Wiring

- [x] 3.1 Register the routes on the server and verify both against a seeded database end to end
