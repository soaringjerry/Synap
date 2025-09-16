Frontend (TypeScript + React + Vite)

Structure:
- `src/components` — reusable UI components
- `src/pages` — routed pages
- `src/api` — OpenAPI-generated SDK wrappers
- `src/styles` — global and module styles

Config:
- Same-origin API (default): all requests go to the same host (no extra config).
- Split deployment: set `VITE_API_BASE` to backend origin at build time, e.g.
  - `VITE_API_BASE=https://api.example.com npm run build`
  - If using different origins, ensure your proxy handles `/api/*` or enable CORS on the backend side.
