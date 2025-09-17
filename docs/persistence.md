# Persistence

Synap persists all application data in a local SQLite database. The Go backend connects through the pure-Go driver (`modernc.org/sqlite`), so CGO is not required and the same binary runs across platforms.

## Files & Environment Variables

| Variable | Description |
| --- | --- |
| `SYNAP_SQLITE_PATH` | Path to the primary SQLite database file (default `./data/synap.sqlite`). A new file is created automatically if it does not exist. |
| `SYNAP_MIGRATIONS_DIR` | Optional override for loading SQL migrations from disk. When unset, the binary uses the embedded migration assets in `migrations/`. |
| `SYNAP_DB_PATH` + `SYNAP_ENC_KEY` | **Optional** legacy import. When provided, the server performs a one-time copy from the encrypted snapshot to SQLite and then continues using SQLite exclusively. |

## Schema Management

- SQL migrations live in `migrations/` and follow the `*.up.sql` / `*.down.sql` convention.
- On startup `cmd/server/main.go` opens the SQLite file and calls `internal/db/RunMigrations`, ensuring all pending migrations are applied.
- When `SYNAP_MIGRATIONS_DIR` is set, migrations are read from that directory (useful for testing alternate schemas).

## Data Access Layer

- `sqlc` generates type-safe query code inside `internal/db/sqlc/` based on the SQL in `migrations/` and `internal/db/query.sql` files.
- `internal/db/sqlite_store.go` composes the generated code into higher-level repositories (e.g., scale, items, responses) and implements the interfaces expected by the service layer.
- Adapters in `internal/api/` map service-level store interfaces to these repositories so that business logic stays persistence-agnostic.

## Backups & Operations

- Back up the SQLite file at `SYNAP_SQLITE_PATH`. Consider enabling WAL mode (`PRAGMA journal_mode=WAL;`) when running in production containers to improve durability; the store enables suitable pragmas automatically.
- Because SQLite is a single file, snapshotting the volume or copying the file during low traffic periods is often sufficient. Use the built-in `.backup` command when using the `sqlite3` CLI for online backups.
- Always keep database backups and application migrations in sync; restoring an old database while running newer migrations can lead to missing columns.

## Legacy Snapshot Import (Optional)

Earlier versions of Synap stored data as encrypted JSON snapshots. To migrate:

1. Set `SYNAP_DB_PATH` to the existing snapshot and `SYNAP_ENC_KEY` to its encryption key.
2. Start the server with a fresh `SYNAP_SQLITE_PATH` (or delete the old file).
3. The server copies data into SQLite on boot and logs the migration. After this run you can remove `SYNAP_DB_PATH`/`SYNAP_ENC_KEY`; the SQLite file becomes the source of truth.

For details on how services consume the persistence layer, see `docs/architecture.md`. For local workflows, see `docs/development.md`.
