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

### SQLite & legacy snapshot migration

- Primary storage lives at `SYNAP_SQLITE_PATH` (defaults to `./data/synap.sqlite`). Delete the file to reset local data.
- If `SYNAP_DB_PATH` points to an encrypted snapshot, the next server start will migrate it into SQLite and continue on the new database.
- Migrations are embedded in the binary; override `SYNAP_MIGRATIONS_DIR` only when testing alternate migration sets.
- Migration verification tips (optional — requires the `sqlite3` CLI or any SQLite viewer):
  1. Create sample data with the legacy build (or an older commit) using only `SYNAP_DB_PATH` + `SYNAP_ENC_KEY`.
  2. Switch to the current build, remove any `.sqlite` file, keep the snapshot, and start the server with both `SYNAP_SQLITE_PATH` and `SYNAP_DB_PATH` set. Watch logs for “First run detected…” and inspect the new DB (`sqlite3 $SYNAP_SQLITE_PATH 'SELECT COUNT(*) FROM scales;'`).
  3. Restart without `SYNAP_DB_PATH` to ensure the idempotent path works (no duplicate migration).

## Lint & Test

```bash
gofmt -l . && go vet ./... && go test ./... -cover
cd frontend && npm run typecheck && npm run lint
```

## Commits & PRs
- Conventional Commits; small, focused PRs with screenshots for UI
- Update docs when behavior or endpoints change
