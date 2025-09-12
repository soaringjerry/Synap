# Configuration

Environment variables:

- `SYNAP_ADDR` — server address (default `:8080`)
- `SYNAP_DB_PATH` — SQLite DB file path (default `./data/synap.db`)
- `SYNAP_REGION_MODE` — `auto`/`pdpa`/`gdpr`/`ccpa`/`pipl`
- `SYNAP_STATIC_DIR` — serve static files if set (fullstack image)
- `SYNAP_DEV_FRONTEND_URL` — dev proxy target for `/` (e.g., `http://127.0.0.1:5173`)
- `SYNAP_JWT_SECRET` — JWT secret for admin auth (set in prod)
- `SYNAP_COMMIT`, `SYNAP_BUILD_TIME` — version metadata shown at `/version`

Compose variables (one‑click deploy):
- `WATCH_INTERVAL` — Watchtower poll seconds (default 60)
- `DOMAIN`/`EMAIL` — Caddy ACME when using `edge=caddy`

