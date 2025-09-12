# FAQ & Troubleshooting

## I get `404 page not found` on `/`
- Backend‑only image serves API; use fullstack image or provide static at `SYNAP_STATIC_DIR`.
- In dev, backend proxies `/` to Vite when `SYNAP_DEV_FRONTEND_URL` is set.

## Dev returns HTML for `/api/*` (JSON parse error)
- When using Vite (5173), ensure proxy is enabled (we configure `/api` → 8080).
- Or call the backend port directly.

## Watchtower updates too slow
- Set `WATCH_INTERVAL=60` (default) or pass `--watch-interval 60` to the quick‑deploy script.
- Trigger manual check: `docker compose exec watchtower watchtower --run-once`.

## i18n not switching
- Use the language selector (top‑right). Choice persists and updates URL `?lang`.
- Items reload by `lang`, UI uses react‑i18next.

