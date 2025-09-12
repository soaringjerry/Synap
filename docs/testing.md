# Testing

## Go tests

```bash
go test ./... -cover
```

## Frontend checks

```bash
cd frontend
npm run typecheck
npm run lint
```

## CI
- See `docs/ci-cd.md`. Lint, vet, tests, security, and image builds run on PR and `main`.

