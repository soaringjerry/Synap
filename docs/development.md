# Development

## Requirements
- Go 1.23+
- Node 20+ and npm
- SQLite 3.x

## Run

```bash
# API (auto-creates SQLite if needed)
# Uses the pure Go driver `modernc.org/sqlite`, so CGO is not required.
SYNAP_SQLITE_PATH=./data/synap.sqlite \
SYNAP_ADDR=:8080 \
go run ./cmd/server

# Frontend
cd frontend && npm ci && npm run dev
```

Dev convenience:
- `SYNAP_DEV_FRONTEND_URL` lets backend proxy `/` to Vite dev server
- Use GHCR `synap-dev` image to run both in one container (see README)

### SQLite & migrations

- Primary storage lives at `SYNAP_SQLITE_PATH` (defaults to `./data/synap.sqlite`). Delete the file to reset local data.
- SQL migrations in `migrations/` run automatically on startup. Override `SYNAP_MIGRATIONS_DIR` only when testing custom migration sets.
- Legacy encrypted snapshots can be imported once by providing `SYNAP_DB_PATH` + `SYNAP_ENC_KEY`; after the migration the SQLite file becomes authoritative.

## Lint & Test

```bash
gofmt -l . && go vet ./... && go test ./... -cover
cd frontend && npm run typecheck && npm run lint
```

## Frontend structure cheatsheet

- Complex admin pages now follow a feature folder pattern (`frontend/src/pages/scale-editor/`).
- Use a context + reducer (`ScaleEditorContext`) to hold API results, selection state, analytics, and flash messages.
- Views (`ItemsView`, `SettingsView`, `ShareView`) consume the shared hooks; keep their local state minimal and domain-specific.
- Shared presets/utilities (e.g. Likert defaults) live beside the feature in `constants.ts` to avoid leaking business rules into global helpers.
- Run `npm run typecheck` and `npm run build` before committing frontend refactors to catch regressions early.

## Service layer guidelines

- **Services** (`internal/services/`) own business rules. They should accept simple structs, return pure Go results, and depend only on store interfaces. Avoid importing `net/http` or other transport-specific packages inside services.
- **Store interfaces** live next to the service and describe the persistence operations the service requires (e.g., `ScaleStore`, `BulkResponseStore`). These interfaces keep the service decoupled from SQLite and simplify testing with fakes.
- **Adapters** in `internal/api/` implement the store interfaces by delegating to the concrete repositories in `internal/db/sqlite_store.go` (which are backed by `sqlc`-generated queries).
- When adding a new feature:
  1. Model the domain behaviour in a new or existing service. Add/extend the store interface as needed.
  2. Update the SQLite store to implement the interface (or create a dedicated repository function).
  3. Expose the behaviour via the API router by validating the HTTP request, calling the service, and mapping service errors to HTTP responses.
  4. Add unit tests at the service level and, when appropriate, integration tests under `tests/integration/`.
- Keep complex orchestration in services; routers should remain thin controllers that translate HTTP ↔ domain.

## Commits & PRs
- Conventional Commits; small, focused PRs with screenshots for UI
- Update docs when behavior or endpoints change
