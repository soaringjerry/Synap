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

## CSV Exports and E2EE

- Admin CSV 导出（long/wide/score）仅适用于非 E2EE 项目：当量表开启 E2EE 时，`ExportService` 会拒绝导出（返回错误）。
- 宽表（wide）导出的列名统一为英文题干；若题干重复，会自动追加 `(2)`, `(3)` 等以保证唯一列名。知情同意列名默认使用英文标签（`consent_header=label_en`）。
- 时间戳：
  - 长表 `long` 已含 `submitted_at` 列。
  - 宽表 `wide` 也包含 `submitted_at` 列（按参与者聚合的提交时间）。
- E2EE 项目的导出通过浏览器内解密完成，不涉及服务端明文：
  - 管理端：在编辑器的“分享与结果”页使用“导出面板”，导入本地私钥并在浏览器生成 JSON/CSV（英文表头）。
  - 参与者自服务：提交之后，在同一会话中可下载明文 JSON；刷新或换设备后该能力不可用（不会向服务器请求明文）。

## 提交时间戳（数据库）

- 非 E2EE：表 `responses.submitted_at`（每题一条）记录提交时间（UTC）。
  - 每个参与者的整份提交时间可取每人 `MIN(submitted_at)` 或 `MAX(submitted_at)`：
    - `SELECT participant_id, MIN(submitted_at) AS first_submitted FROM responses WHERE scale_id=? GROUP BY participant_id;`
    - `SELECT participant_id, MAX(submitted_at) AS last_submitted  FROM responses WHERE scale_id=? GROUP BY participant_id;`
- E2EE：表 `e2ee_responses.created_at` 记录每条加密答卷的创建时间（提交时间，UTC）。
- 历史数据无需迁移；字段已在最初设计中存在且默认填充。
