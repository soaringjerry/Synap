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
   - End‑to‑end encryption: Generate key in browser or paste a public key. Private key is encrypted locally and never uploaded. E2EE/Region are locked after creation.
   - Consent: Version, interactive confirmations with simple modes per item — Off / Optional / Required; optional signature requirement. Consent text supports Markdown (headings, lists, links, bold/italic, code)
3) Manage Scale → Share participant link

Exports:
- When E2EE is ON: server exports encrypted bundle only; plaintext export happens locally in your browser (JSONL/CSV long|wide) with readable EN/ZH question texts
- When E2EE is OFF: server CSV exports (long/wide/score) are available (UTF‑8 with BOM to avoid garbling in Excel). Exports include consent.* (1/0) columns for interactive confirmations

Consent evidence:
- The consent page supports interactive confirmations and optional signature. A hashed record is stored on the server. Participants can download a PDF receipt (fallback to HTML if popup is blocked).

GDPR self‑service:
- Non‑E2EE: participants can export/delete their records via capability links returned on submit (delete uses POST)
- E2EE: per‑response export/delete endpoints are available via capability links
