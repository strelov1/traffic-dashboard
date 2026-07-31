## 1. Repository writes

- [x] 1.1 Add `updateEvent` applying a partial change and returning the event as it now stands, or nothing when the id is unknown
- [x] 1.2 Add `deleteEvent` reporting whether a row was removed
- [x] 1.3 Cover both against an unknown id, and prove a partial update leaves the other fields alone

## 2. Endpoints

- [x] 2.1 Serve `POST /api/traffic/events` with a request schema restating the database's rules, answering `201` with the recorded count
- [x] 2.2 Serve `PATCH /api/traffic/events/:id`, rejecting an empty body and answering `404` for an unknown id
- [x] 2.3 Serve `DELETE /api/traffic/events/:id`, answering `204` or `404`
- [x] 2.4 Prove a bad field answers `400` rather than reaching the database, and that a rejected batch records nothing

## 3. Verification

- [x] 3.1 Drive record, correct, and remove against a real database and confirm the aggregates follow
