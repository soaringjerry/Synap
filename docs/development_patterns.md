# Development Patterns & Architecture

This document codifies our backend and frontend architecture, error‑handling strategy, testing expectations, and contribution conventions. Treat this as the "source of truth" when adding or refactoring features.

## Backend Architecture

Backend is layered into:

1) API Layer (HTTP Adapters)
- Location: `internal/api/router.go` (+ small helper files under `internal/api/`)
- Responsibilities:
  - Parse/validate HTTP requests (query, path, body)
  - Call service layer methods
  - Translate service errors to HTTP status codes
  - Serialize responses (JSON/CSV/etc.)
- Anti‑patterns: do not place business logic here; avoid direct store access (exceptions must be migrated).

2) Service Layer (Domain Logic)
- Location: `internal/services/`
- Responsibilities:
  - Own domain rules and workflows (validation, authorization, orchestration)
  - Expose narrow methods per use case (e.g., `ResponseService.ProcessBulkResponses`, `ExportService.ExportCSV`, `TeamService.Add`)
  - Depend only on Go stdlib and small domain interfaces (no `net/http` types)
- Error Model: return typed service errors (see Error Handling below).

3) Data Layer (Store Implementations)
- Interfaces used by services live in `internal/services/*_service.go` files.
- API store adapters (implement interfaces using project `Store`): `internal/api/*_service_adapter.go`
- Concrete persistence: `internal/db/` (SQLite via `sqlc`), legacy in‑memory store under `internal/api` (being phased out).
- Responsibility: isolate SQL details and serialization from the service layer.

### Typical Backend Development Flow

When adding a new backend feature or endpoint:

1. Start in the Service Layer
   - Create or extend a service in `internal/services/` with a cohesive method.
   - Define a small interface for required persistence needs (e.g., `type FooStore interface { ... }`).

2. Define Store Contracts
   - Add methods to the interface that express data needs in domain terms.
   - Avoid leaking SQL specifics to services (e.g., no `sql.Row`, no table schemas).

3. Author SQL and Generate Code
   - Edit `internal/db/query.sql` (or add a migration under `internal/db/migrations/` as needed).
   - Run `sqlc` (CI or local) to regenerate `internal/db/sqlc/*`.

4. Implement Store Methods
   - Implement the interface in `internal/db/sqlite_store.go` using generated `sqlc` Queries.
   - If legacy memory store must be supported, add analogous methods to `internal/api/store.go`.

5. Wire Adapters
   - Add an adapter in `internal/api/*_service_adapter.go` to translate the app‑level `Store` or DB layer into the service interface.
   - Register the service in `NewRouterWithStore`.

6. Add HTTP Endpoint (Thin Controller)
   - In `internal/api/router.go`, add a small handler: parse request → call service → map errors → write response.
   - Keep it thin; non‑trivial logic belongs in the service.

7. Tests
   - Unit test the service (no HTTP/types) under `internal/services/*_test.go`.
   - (Optional, recommended) Add an integration test (build tag `//go:build integration`) that runs the server and hits the endpoint.

### Error Handling

- Use typed service errors from `internal/services`:
  - `NewInvalidError`, `NewForbiddenError`, `NewNotFoundError`, `NewConflictError`, `NewUnauthorizedError`, `NewBadGatewayError`, `NewTooManyRequestsError`.
- API layer maps service errors to HTTP codes:
  - 400 Bad Request: invalid input
  - 401 Unauthorized: authentication required or invalid credentials
  - 403 Forbidden: tenant/permission mismatch
  - 404 Not Found: missing resource
  - 409 Conflict: duplicate resource or conflicting state
  - 429 Too Many Requests: throttling/backpressure
  - 5xx for unexpected errors
- Services never import `net/http` or write HTTP responses.

### Patterns You Should Reuse

- Service per domain: `ResponseService`, `ScaleService`, `AuthService`, `ExportService`, `AnalyticsService`, `TranslationService`, `E2EEService`, `ConsentService`, `ParticipantDataService`, `TeamService`.
- Adapters translate between app `Store` and service interfaces; keep them dumb and mechanical.
- Keep router handlers short; factor branches into helpers when complexity grows.
- Prefer deterministic naming for helpers, e.g., `handleAdminScaleUpdate`, `handleAdminScaleDelete`.

## Frontend Architecture

The frontend emphasizes componentization and centralized state for shared, non‑trivial data.

1) Componentization
- Keep components small and single‑purpose; avoid monolithic "mega" components.
- Extract subviews (e.g., settings sub‑tabs) to their own files under `views/` or `views/settings/`.
- Avoid defining unstable inline components that remount on every render (leads to focus loss).

2) State Management
- Use the Scale Editor Context + Reducer for cross‑view state:
  - Files: `frontend/src/pages/scale-editor/ScaleEditorContext.tsx`, `state.ts`.
  - Define state shape and actions in `state.ts`.
  - Add actions like `setView`, `setSettingsTab`, `setItems`, `setAiState`, etc.
- Local UI state (e.g., a dropdown open flag) may use `useState` inside a component.
- Do not put HTTP concerns into reducers; effects live in components or small hooks.

3) Settings UX Pattern
- Use second‑level navigation (pills/tabs) inside Settings to reduce complexity.
- Subviews:
  - General (basic info + Likert defaults)
  - Security (region, email collection, Turnstile, pagination)
  - Consent (consent text + advanced options)
  - AI (translation workflow)
  - Team (collaborators)
  - Danger (destructive operations)

4) Testing
- Use Vitest + React Testing Library.
- Write unit tests for reducers and logic‑bearing components.
- Keep tests deterministic; avoid hidden globals and cross‑test state.

## Code Quality & CI

- Backend
  - Format: `gofmt`
  - Lint: `golangci-lint` (includes `gocyclo`, `errcheck`, etc.)
  - Vet: `go vet`
  - Tests: `go test ./...`
- Frontend
  - Lint: `eslint`
  - Types: `tsc --noEmit`
  - Tests: `vitest`
- Commits: Conventional Commits (e.g., `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`)
- CI must be green; do not merge with failing checks.

## Practical Checklist (New Feature)

1. Service method + interface in `internal/services/`
2. SQL + `sqlc` if persistence is needed
3. Store implementation in `internal/db/sqlite_store.go` (+ memory if needed)
4. Adapter in `internal/api/*_service_adapter.go`
5. Router handler in `internal/api/router.go` (thin)
6. Unit tests for service; integration test (optional)
7. Frontend: small components, context/reducer for shared state, tests
8. Lint/format/tests pass locally before PR

## Anti‑Patterns to Avoid

- Business logic in `router.go` handlers
- Services importing `net/http` types
- Direct SQL in API or services
- Large, stateful React components with many unrelated responsibilities
- Re‑creating components on every render; unstable `key`s
- Skipping tests: logic without coverage will regress

