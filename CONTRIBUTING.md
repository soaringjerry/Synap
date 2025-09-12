# Contributing to Synap

Thanks for your interest! This guide explains how to propose changes and contribute code.

## Development Workflow

- Requirements: Go 1.23+, Node 20+, SQLite 3.x
- Backend: `go run ./cmd/server`
- Frontend: `cd frontend && npm ci && npm run dev`
- Dev image (optional): `docker run -it --rm -p 8080:8080 -p 5173:5173 ghcr.io/soaringjerry/synap-dev:latest`

## Code Style

- Go: `gofmt`, `go vet`, `golangci-lint`
- TS/JS: `eslint`, `tsc --noEmit`
- Commits: Conventional Commits (e.g., `feat:`, `fix:`, `docs:`, `chore:`)

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

