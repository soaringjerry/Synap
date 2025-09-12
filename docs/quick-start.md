# Quick Start

Run the minimal stack locally:

```bash
# Backend
SYNAP_ADDR=:8080 go run ./cmd/server

# Frontend
cd frontend && npm ci && npm run dev
```

Seed sample content and submit responses:

1. POST /api/seed → creates `SAMPLE` scale with 3 items
2. GET /api/scales/SAMPLE/items?lang=en|zh → fetch items
3. POST /api/responses/bulk → submit answers
4. GET /api/metrics/alpha?scale_id=SAMPLE → Cronbach’s α

Export data:
- /api/export?format=long&scale_id=...
- /api/export?format=wide&scale_id=...
- /api/export?format=score&scale_id=...

