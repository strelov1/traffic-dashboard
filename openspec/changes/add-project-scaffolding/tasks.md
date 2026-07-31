## 1. Workspace foundation

- [x] 1.1 Create the pnpm workspace root: `package.json`, `pnpm-workspace.yaml` listing `api` and `web`, and `.gitignore`
- [x] 1.2 Add the shared TypeScript base config and the linter config that both packages extend
- [x] 1.3 Wire Vitest so a single root command runs both packages' suites, and prove it with one trivial passing test per package

## 2. API configuration and error shape

- [x] 2.1 Scaffold the `api` package with Fastify and a build and dev script
- [x] 2.2 Read `DATABASE_URL` through a config module that exits non-zero with a message naming the missing variable
- [x] 2.3 Render unknown routes as `404 {"error": "<message>"}`
- [x] 2.4 Render unhandled failures as 5xx `{"error": "<message>"}` without leaking stack traces or driver internals

## 3. Database access and migrations

- [ ] 3.1 Add the `pg` connection pool and a query helper, covered by an integration test against a Testcontainers Postgres
- [ ] 3.2 Add the migration runner with an empty initial migration, applied at startup before the server accepts requests
- [ ] 3.3 Retry startup while the database refuses connections, and exit non-zero when a migration fails for any other reason

## 4. Health endpoint

- [ ] 4.1 Serve `GET /api/health` as `200 {"data": {"status": "ok", "database": "up"}}` when a query succeeds
- [ ] 4.2 Serve `503 {"data": {"status": "degraded", "database": "down"}}` when the database is unreachable
- [ ] 4.3 Re-check connectivity on every request, proven by a test where the database becomes unreachable between two calls

## 5. Web shell

- [ ] 5.1 Scaffold the `web` package with React, Vite, and TypeScript, rendering a shell
- [ ] 5.2 Add the health client and render the in-flight state while the request has not settled
- [ ] 5.3 Render the connected state for `status: "ok"`, and disconnected states that name the database for `503` and the API for a failed request

## 6. Cross-origin access and containerisation

- [ ] 6.1 Configure CORS explicitly in the API for the web origin, covered by a test asserting the response headers
- [ ] 6.2 Write `docker-compose.yml` for Postgres, API, and web, with the API gated on a Postgres health check
- [ ] 6.3 Add `.env.example` listing every variable the API requires, and verify a clean checkout reaches `"database": "up"` with one command
