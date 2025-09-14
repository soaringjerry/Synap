# Changelog

All notable changes to this project will be documented here.

## Unreleased
- Initial MVP scaffolding (Go backend, React frontend)
- In‑memory APIs for survey flow; exports and α metric
- Dev/Fullstack/Backend images and one‑click deploy
- i18n (en/zh) and professional UI refresh
- Admin auth (JWT), tenant scaffolding
## Unreleased

- E2EE
  - Creation-time key setup (generate in browser or upload public key); E2EE/Region locked after creation
  - Export flow clarified: encrypted bundle (.json with manifest + Ed25519 + ciphertext) and local plaintext export (browser-only JSONL)
  - Local private key import for decryption (JSON file → stored in browser only)
  - CSV exports disabled when E2EE=ON; advanced analytics disabled on server (basic counts only)
  - New endpoints: POST /api/exports/e2ee (create short link), GET /api/exports/e2ee?job=...&token=...

- Consent
  - Interactive confirmations fully configurable (add/remove/edit items, required flags, EN/ZH labels)
  - Signature requirement toggle (signature_required); consent evidence JSON + hashed record on server
  - New endpoint: POST /api/consent/sign

- Participant self-service (GDPR)
  - Non‑E2EE: GET /api/self/participant/export, POST /api/self/participant/delete
  - E2EE: GET /api/self/e2ee/export, POST /api/self/e2ee/delete

- Admin
  - Danger Zone: DELETE /api/admin/scales/{id}/responses (purge responses); delete scale from list
  - Create Scale: two‑column layout, E2EE + Consent grouped, clearer guidance

- UX/Responsive
  - Mobile: larger tap targets, Likert wrap (max 5/row), sticky submit bar, 16px inputs (prevent iOS zoom)
  - AI Translation: clearer steps, quick target chips, provider readiness check, per‑item include toggles

- Code quality
  - Refactor: split handleAdminScaleOps to reduce cyclomatic complexity
  - gofmt fixes, i18n check enhancements

