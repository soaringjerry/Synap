# Architecture Overview

- cmd/server: HTTP entrypoint (Go net/http)
- internal/api: API router + in‑memory store (MVP)
- internal/services: domain logic (reverse score, exports, α)
- internal/middleware: locale, no‑store cache, auth (JWT)
- frontend: React + Vite (i18n, RouterProvider)
- migrations: SQL migrations (future persistence)

Data flow:
1) Client requests `/api/...`
2) Router handles endpoints → services → store
3) Responses JSON/CSV; `/` serves static (fullstack) or proxies to dev

Multi‑tenant (MVP): JWT carries `uid/tid`; admin endpoints require Bearer and filter by tenant.

