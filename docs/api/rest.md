# REST API (MVP)

## Public endpoints
- POST `/api/seed` → create sample scale+items (SAMPLE)
- GET `/api/scales/{id}/items?lang=en|zh` → list items (i18n with fallback)
- POST `/api/responses/bulk` → submit responses
- GET `/api/export?scale_id=...&format=long|wide|score` → CSV
- GET `/api/metrics/alpha?scale_id=...` → Cronbach’s α

## Admin (Bearer JWT)
- POST `/api/auth/register` `{ email, password, tenant_name }` → `{ token, tenant_id, user_id }`
- POST `/api/auth/login` `{ email, password }` → `{ token, tenant_id, user_id }`
- POST `/api/scales` `{ name_i18n, points, randomize? }` → `{ id, ... }`
- POST `/api/items` `{ scale_id, reverse_scored, stem_i18n }` → `{ id, ... }`
- GET `/api/admin/scales` → `{ scales: [...] }`
- GET `/api/admin/stats?scale_id=...` → `{ count }`

Notes:
- Submit bulk body: `{ participant: {email?}, scale_id, answers: [{item_id, raw_value}] }`
- Reverse coding is applied server‑side based on `reverse_scored` and scale points.

