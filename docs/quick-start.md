# Quick Start

## UI: 3 steps to get started

1) Visit `/auth` to register and sign in.
2) Go to Admin → Create Scale. Set Points, enable End‑to‑end Encryption (recommended), and configure Consent (version + confirmations/signature).
3) Open Admin → Manage (new default editor). Items covers question editing, Settings handles consent/Likert/AI translation, and Share & Results centralizes participant link copy plus analytics/exports. Use Share & Results to distribute the link; when E2EE is ON the panel walks you through local JSONL/CSV decrypt, otherwise server CSV exports stay available.

> Mobile navigation tip: 在手机或窄屏设备上，顶部导航栏会折叠成汉堡菜单，点按即可展开“首页”、“管理”、“GitHub”、“语言切换”等入口，同时“登录/注册”按钮始终保持可见。

## Advanced: API & local run

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

Create your first scale (Admin UI):

1) Register + Login (UI: /auth)
2) Admin → Create Scale
   - Basics: Name (EN/ZH), Points, Region
   - End‑to‑end encryption: Generate key in browser or paste a public key. Private key is encrypted locally and never uploaded. E2EE/Region are locked after creation.
   - Consent: Version, interactive confirmations with simple modes per item — Off / Optional / Required; optional signature requirement. Consent text supports Markdown (headings, lists, links, bold/italic, code)
3) Manage → Items / Settings / Share & Results. Items lets you revise stems/options, Settings consolidates consent defaults, Likert presets, and AI translation, while Share & Results exposes the participant link alongside analytics and exports. Need the previous UI? Use the “Legacy view” button in the header.

Exports (Share & Results panel):
- When E2EE is ON: server exports encrypted bundle only; plaintext export happens locally in your browser (JSONL/CSV long|wide) with readable EN/ZH question texts
- When E2EE is OFF: server CSV exports (long/wide/score) are available (UTF‑8 with BOM to avoid garbling in Excel). You can use consent_header=label_en|label_zh to use human‑readable labels as column names (instead of consent.<key>).

Consent evidence:
- The consent page supports interactive confirmations and optional signature. A hashed record is stored on the server. Participants can download a PDF receipt (printed locally in the browser).
- Consent Markdown supports inline markers to place interactive blocks inside your text: [[CONSENT]] inserts all (options+signature), [[CONSENT1]]/[[CONSENT2]] insert grouped options, [[CONSENT:signature]] inserts signature only.

GDPR self‑service:
- Submit returns a unified management link to /self?pid=...&token=... (non‑E2EE) or /self?response_id=...&token=... (E2EE). Participants can open the page anytime to export/delete their submission.
