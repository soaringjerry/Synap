# REST API (MVP)

## Public endpoints
- POST `/api/seed` → create sample scale+items (SAMPLE)
- GET `/api/scales/{id}/items?lang=en|zh` → list items (i18n with fallback)
- POST `/api/responses/bulk` → submit responses
- GET `/api/export?scale_id=...&format=long|wide|score` → CSV
- GET `/api/metrics/alpha?scale_id=...` → Cronbach’s α

Consent & self‑service
- POST `/api/consent/sign` `{ scale_id, version, locale, choices:{k:bool}, signed_at, signature_kind, evidence }` → store hashed consent evidence
- GET `/api/self/participant/export?pid=...&token=...`
- POST `/api/self/participant/delete?pid=...&token=...&hard=true|false`
- GET `/api/self/e2ee/export?response_id=...&token=...`
- POST `/api/self/e2ee/delete?response_id=...&token=...`

## Admin (Bearer JWT)
- POST `/api/auth/register` `{ email, password, tenant_name }` → `{ token, tenant_id, user_id }`
- POST `/api/auth/login` `{ email, password }` → `{ token, tenant_id, user_id }`
- POST `/api/scales` `{ name_i18n, points, randomize? }` → `{ id, ... }`
- POST `/api/items` `{ scale_id, reverse_scored, stem_i18n }` → `{ id, ... }`
- GET `/api/admin/scales` → `{ scales: [...] }`
- GET `/api/admin/stats?scale_id=...` → `{ count }`

Analytics & maintenance
- GET `/api/admin/analytics/summary?scale_id=...` → histograms, daily timeseries, Cronbach’s α (E2EE projects: advanced analytics disabled)
- DELETE `/api/admin/scales/{id}/responses` → purge all responses
- DELETE `/api/admin/scales/{id}` → delete scale (items + responses)

E2EE
- GET `/api/projects/{id}/keys` → list registered public keys (public)
- POST `/api/projects/{id}/keys` `{ alg, kdf, public_key, fingerprint }` → register public key (auth)
- POST `/api/exports/e2ee` `{ scale_id }` (auth + `X-Step-Up: true`) → create short‑lived download link
- GET `/api/exports/e2ee?job=...&token=...` → `{ manifest, signature, responses }`

Notes:
- Submit bulk body: `{ participant: {email?}, scale_id, answers: [{item_id, raw_value}] }`
- Reverse coding is applied server‑side based on `reverse_scored` and scale points.
- Consent: `evidence` is a JSON string downloaded to participant; server stores only a hash + metadata.
