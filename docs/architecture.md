# Architecture Overview

- cmd/server: HTTP entrypoint (Go net/http)
- internal/api: thin HTTP handlers + adapters that translate between HTTP and services
- internal/services: domain logic (responses, scales, exports, analytics, consent, E2EE, translation)
- internal/middleware: locale, no‑store cache, auth (JWT)
- frontend: React + Vite (i18n, RouterProvider)
- migrations: SQL migrations (future persistence)

Data flow:
1) Client requests `/api/...`
2) Router delegates to services → adapters → store
3) Responses JSON/CSV; `/` serves static (fullstack) or proxies to dev

Multi‑tenant (MVP): JWT carries `uid/tid`; admin endpoints require Bearer and filter by tenant.

## Service Layer Snapshot

- **ResponseService** – plaintext submission flow, scoring, Turnstile verification.
- **ScaleService** – scale/item CRUD, ordering, metadata views.
- **AuthService** – registration/login, bcrypt hashing, JWT issuance.
- **ExportService** – CSV generation (long/wide/score) with consent enrichment.
- **ParticipantDataService** – GDPR self-service export/delete for plaintext and E2EE responses.
- **TranslationService** – OpenAI translation preview orchestration.
- **E2EEService** – encrypted intake, project keys, export bundles, rewrap workflow.
- **AnalyticsService** – histogram/time series summaries and Cronbach’s alpha.
- **ConsentService** – consent signature hashing/persistence.

Each service exposes pure Go methods behind small interfaces; the router converts HTTP payloads into service requests and translates results into HTTP responses.
