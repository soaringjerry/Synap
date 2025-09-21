# Contributing to Synap

Thanks for your interest! This guide explains how to propose changes and contribute code.

## Development Workflow

- Requirements: Go 1.23+, Node 20+, SQLite 3.x
- Backend: `go run ./cmd/server`
- Frontend: `cd frontend && npm ci && npm run dev`
- Dev image (optional): `docker run -it --rm -p 8080:8080 -p 5173:5173 ghcr.io/soaringjerry/synap-dev:latest`

### Architecture Philosophy (Read Me First)

We use a layered backend (API → Services → Store) and a componentized frontend with centralized state where appropriate. Keep API handlers thin, put domain logic in services, and express persistence via small interfaces implemented by SQLite (`sqlc`). On the frontend, split large views into focused subviews and use the Scale Editor Context + Reducer for shared state.

See the detailed guide: `docs/development_patterns.md`.

## Code Style

- Go: `gofmt`, `go vet`, `golangci-lint`
- TS/JS: `eslint`, `tsc --noEmit`
- Commits: Conventional Commits (e.g., `feat:`, `fix:`, `docs:`, `chore:`)

All code MUST pass: `gofmt`, `golangci-lint`, `go vet`, `go test ./...`, `eslint`, `tsc --noEmit`, `vitest`.

## Tests

- Run: `go test ./... -cover`
- Add tests next to code you change; keep unit tests fast and deterministic.

## Pull Requests

- Fork → Branch → PR to `main`
- Ensure CI is green and lint passes
- Include context in the PR description: motivation, screenshots (if UI), and docs updates

## Issues

- Use the provided templates for bug reports and feature requests
- Include steps to reproduce and environment details

## Security

- Please report vulnerabilities via `SECURITY.md` process — do not open public issues.
