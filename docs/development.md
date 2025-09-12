# Development

## Requirements
- Go 1.23+
- Node 20+ and npm
- SQLite 3.x

## Run

```bash
# API
SYNAP_ADDR=:8080 go run ./cmd/server

# Frontend
cd frontend && npm ci && npm run dev
```

Dev convenience:
- `SYNAP_DEV_FRONTEND_URL` lets backend proxy `/` to Vite dev server
- Use GHCR `synap-dev` image to run both in one container (see README)

## Lint & Test

```bash
gofmt -l . && go vet ./... && go test ./... -cover
cd frontend && npm run typecheck && npm run lint
```

## Commits & PRs
- Conventional Commits; small, focused PRs with screenshots for UI
- Update docs when behavior or endpoints change

