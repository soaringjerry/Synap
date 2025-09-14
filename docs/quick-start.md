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

Create your first scale (Admin):

1) Register + Login (UI: /auth)
2) Admin → Create Scale
   - Basics: Name (EN/ZH), Points, Region
   - E2EE (optional): Generate key in browser or paste a public key. Private key is encrypted locally and never uploaded.
   - Consent: Version, interactive confirmations (add/remove/edit required items), optional signature requirement
3) Manage Scale → Share participant link

E2EE vs CSV:
- When E2EE is ON: server exports encrypted bundle only; plaintext export happens locally in your browser (JSONL)
- When E2EE is OFF: server CSV exports (long/wide/score) are available

Consent evidence:
- The consent page supports interactive confirmations and optional signature. An evidence JSON is downloaded to the participant and a hashed record is stored on the server.

GDPR self‑service:
- Non‑E2EE: participants can export/delete their records via capability links returned on submit
- E2EE: per‑response export/delete endpoints are available via capability links
