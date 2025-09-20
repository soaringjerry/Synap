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
  3. Add an adapter in `internal/api` to bridge the service store interface and the concrete store.
  4. Expose the behaviour via the API router by validating the HTTP request, calling the service, and mapping service errors to HTTP responses.
  5. Add unit tests at the service level and, when appropriate, integration tests under `tests/integration/`.
- Keep complex orchestration in services; routers should remain thin controllers that translate HTTP ↔ domain.

### Patterns already applied

- Router delegates bulk responses to `ResponseService` (Turnstile verifier is injected).
- Scale & item CRUD/ordering live in `ScaleService`.
- Auth (register/login/jwt) lives in `AuthService`.
- Export CSV (long/wide/score) lives in `ExportService`；E2EE 项目导出会被拒绝；宽表列名统一英文题干；同意列默认英文标签。
- Participant data (self export/delete) lives in `ParticipantDataService`；管理端按邮箱导出/删除也通过该服务暴露（Router 不直接访问 store）。
- Tenant AI provider config 暴露为 `AIConfigService`；Router 仅完成请求解析与调用。

## Frontend editor rules

- 使用 `ScaleEditorContext` + reducer 管理跨视图共享状态（量表、题目列表、分析、消息等）。
- `SettingsView` 不再使用局部 `useState`，所有输入都通过 reducer 读写，避免失焦和状态不同步。
- 提交流程在点击提交时总是执行“全表必填校验”，缺失时高亮首个未答项并 toast 提示（即使邮箱或 Turnstile 未完成也会显示提示）。
- E2EE：
  - 管理端导出通过前端 ExportPanel 浏览器内解密生成 CSV（英文表头）；本地私钥按 `synap_pmk_<scaleId>` 命名空间存储。
  - 参与者自服务页仅在提交会话内提供“明文导出”（读取 sessionStorage 缓存），刷新或换设备后按钮禁用并提示“仅会话内可用”。

### 提交与防重复

- 按钮级防抖：提交期间按钮进入 `submitting` 状态并禁用，防止双击。
- 会话级防抖：写入 `sessionStorage: synap_submit_lock_<scaleId>`，在 15 秒内重复点击会被拦截（显示“正在提交…”）。
- 锁的设置在所有校验通过后进行；出现错误或异常会清理锁，避免错误锁定。

## Commits & PRs
- Conventional Commits; small, focused PRs with screenshots for UI
- Update docs when behavior or endpoints change
