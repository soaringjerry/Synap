-- Tenants
-- name: CreateTenant :exec
INSERT INTO tenants (id, name, created_at) VALUES (?, ?, COALESCE(?, CURRENT_TIMESTAMP));

-- Users
-- name: CreateUser :exec
INSERT INTO users (id, email, pass_hash, tenant_id, created_at) VALUES (?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP));

-- name: GetUserByEmail :one
SELECT id, email, pass_hash, tenant_id, created_at FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1;

-- Scales
-- name: CreateScale :exec
INSERT INTO scales (
  id, tenant_id, points, randomize, name_i18n, consent_i18n, collect_email,
  e2ee_enabled, region, turnstile_enabled, items_per_page, consent_config,
  likert_labels_i18n, likert_show_numbers, likert_preset, created_at, updated_at
) VALUES (
  ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), COALESCE(?, CURRENT_TIMESTAMP)
);

-- name: UpdateScale :exec
UPDATE scales SET
  points = ?,
  randomize = ?,
  name_i18n = ?,
  consent_i18n = ?,
  collect_email = ?,
  e2ee_enabled = ?,
  region = ?,
  turnstile_enabled = ?,
  items_per_page = ?,
  consent_config = ?,
  likert_labels_i18n = ?,
  likert_show_numbers = ?,
  likert_preset = ?,
  updated_at = CURRENT_TIMESTAMP
WHERE id = ?;

-- name: DeleteScale :exec
DELETE FROM scales WHERE id = ?;

-- name: GetScale :one
SELECT id, tenant_id, points, randomize, name_i18n, consent_i18n, collect_email,
       e2ee_enabled, region, turnstile_enabled, items_per_page, consent_config,
       likert_labels_i18n, likert_show_numbers, likert_preset, created_at, updated_at
FROM scales WHERE id = ?;

-- name: ListScalesByTenant :many
SELECT id, tenant_id, points, randomize, name_i18n, consent_i18n, collect_email,
       e2ee_enabled, region, turnstile_enabled, items_per_page, consent_config,
       likert_labels_i18n, likert_show_numbers, likert_preset, created_at, updated_at
FROM scales WHERE tenant_id = ? ORDER BY id;

-- Items
-- name: CreateItem :exec
INSERT INTO items (
  id, scale_id, reverse_scored, stem_i18n, type, options_i18n, placeholder_i18n,
  min_value, max_value, step_value, required, likert_labels_i18n, likert_show_numbers,
  position, created_at, updated_at
) VALUES (
  ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), COALESCE(?, CURRENT_TIMESTAMP)
);

-- name: UpdateItem :exec
UPDATE items SET
  stem_i18n = ?,
  reverse_scored = ?,
  type = ?,
  options_i18n = ?,
  placeholder_i18n = ?,
  min_value = ?,
  max_value = ?,
  step_value = ?,
  required = ?,
  likert_labels_i18n = ?,
  likert_show_numbers = ?,
  position = ?,
  updated_at = CURRENT_TIMESTAMP
WHERE id = ?;

-- name: DeleteItem :exec
DELETE FROM items WHERE id = ?;

-- name: GetItem :one
SELECT id, scale_id, reverse_scored, stem_i18n, type, options_i18n, placeholder_i18n,
       min_value, max_value, step_value, required, likert_labels_i18n,
       likert_show_numbers, position, created_at, updated_at
FROM items WHERE id = ?;

-- name: ListItemsByScale :many
SELECT id, scale_id, reverse_scored, stem_i18n, type, options_i18n, placeholder_i18n,
       min_value, max_value, step_value, required, likert_labels_i18n,
       likert_show_numbers, position, created_at, updated_at
FROM items WHERE scale_id = ? ORDER BY position ASC, id ASC;

-- name: UpdateItemPosition :exec
UPDATE items SET position = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND scale_id = ?;

-- Participants
-- name: CreateParticipant :exec
INSERT INTO participants (id, email, self_token, consent_id, created_at)
VALUES (?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP));

-- name: GetParticipant :one
SELECT id, email, self_token, consent_id, created_at FROM participants WHERE id = ?;

-- name: GetParticipantByEmail :one
SELECT id, email, self_token, consent_id, created_at FROM participants WHERE LOWER(email) = LOWER(?) LIMIT 1;

-- name: UpdateParticipantEmail :exec
UPDATE participants SET email = ?, self_token = self_token WHERE id = ?;

-- name: DeleteParticipant :exec
DELETE FROM participants WHERE id = ?;

-- Responses
-- name: InsertResponse :exec
INSERT INTO responses (
  participant_id, item_id, scale_id, raw_value, score_value, submitted_at, raw_json
) VALUES (?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(participant_id, item_id) DO UPDATE SET
  raw_value = excluded.raw_value,
  score_value = excluded.score_value,
  submitted_at = excluded.submitted_at,
  raw_json = excluded.raw_json;

-- name: ListResponsesByScale :many
SELECT participant_id, item_id, scale_id, raw_value, score_value, submitted_at, raw_json
FROM responses WHERE scale_id = ? ORDER BY submitted_at ASC;

-- name: ListResponsesByParticipant :many
SELECT participant_id, item_id, scale_id, raw_value, score_value, submitted_at, raw_json
FROM responses WHERE participant_id = ? ORDER BY submitted_at ASC;

-- name: DeleteResponsesByScale :exec
DELETE FROM responses WHERE scale_id = ?;

-- name: DeleteResponsesByParticipant :exec
DELETE FROM responses WHERE participant_id = ?;

-- E2EE responses
-- name: InsertE2EEResponse :exec
INSERT INTO e2ee_responses (
  response_id, scale_id, ciphertext, nonce, aad_hash, enc_dek, pmk_fingerprint, created_at, self_token
) VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), ?)
ON CONFLICT(response_id) DO UPDATE SET
  scale_id = excluded.scale_id,
  ciphertext = excluded.ciphertext,
  nonce = excluded.nonce,
  aad_hash = excluded.aad_hash,
  enc_dek = excluded.enc_dek,
  pmk_fingerprint = excluded.pmk_fingerprint,
  self_token = excluded.self_token;

-- name: GetE2EEResponse :one
SELECT response_id, scale_id, ciphertext, nonce, aad_hash, enc_dek, pmk_fingerprint, created_at, self_token
FROM e2ee_responses WHERE response_id = ?;

-- name: ListE2EEResponsesByScale :many
SELECT response_id, scale_id, ciphertext, nonce, aad_hash, enc_dek, pmk_fingerprint, created_at, self_token
FROM e2ee_responses WHERE scale_id = ? ORDER BY created_at ASC;

-- name: ListAllE2EEResponses :many
SELECT response_id, scale_id, ciphertext, nonce, aad_hash, enc_dek, pmk_fingerprint, created_at, self_token
FROM e2ee_responses ORDER BY created_at ASC;

-- name: UpdateE2EEEncDEK :exec
UPDATE e2ee_responses SET enc_dek = ? WHERE response_id = ?;

-- name: DeleteE2EEResponse :exec
DELETE FROM e2ee_responses WHERE response_id = ?;

-- Project keys
-- name: InsertProjectKey :exec
INSERT INTO project_keys (scale_id, fingerprint, algorithm, kdf, public_key, created_at, disabled)
VALUES (?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), ?)
ON CONFLICT(scale_id, fingerprint) DO UPDATE SET
  algorithm = excluded.algorithm,
  kdf = excluded.kdf,
  public_key = excluded.public_key,
  disabled = excluded.disabled,
  created_at = CASE WHEN project_keys.created_at IS NULL THEN excluded.created_at ELSE project_keys.created_at END;

-- name: ListProjectKeys :many
SELECT scale_id, fingerprint, algorithm, kdf, public_key, created_at, disabled
FROM project_keys WHERE scale_id = ? ORDER BY created_at ASC;

-- Consent records
-- name: InsertConsentRecord :exec
INSERT INTO consent_records (id, scale_id, version, choices, locale, signed_at, hash)
VALUES (?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET
  scale_id = excluded.scale_id,
  version = excluded.version,
  choices = excluded.choices,
  locale = excluded.locale,
  signed_at = excluded.signed_at,
  hash = excluded.hash;

-- name: GetConsentRecord :one
SELECT id, scale_id, version, choices, locale, signed_at, hash FROM consent_records WHERE id = ?;

-- name: DeleteConsentRecordsByScale :exec
DELETE FROM consent_records WHERE scale_id = ?;

-- Audit log
-- name: InsertAudit :exec
INSERT INTO audit_log (ts, actor, action, target, note) VALUES (COALESCE(?, CURRENT_TIMESTAMP), ?, ?, ?, ?);

-- name: ListAudit :many
SELECT id, ts, actor, action, target, note FROM audit_log ORDER BY ts DESC, id DESC LIMIT ?;

-- AI config
-- name: GetAIConfig :one
SELECT tenant_id, openai_key, openai_base, allow_external, store_logs, updated_at FROM tenant_ai_configs WHERE tenant_id = ?;

-- name: UpsertAIConfig :exec
INSERT INTO tenant_ai_configs (tenant_id, openai_key, openai_base, allow_external, store_logs, updated_at)
VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
ON CONFLICT(tenant_id) DO UPDATE SET
  openai_key = excluded.openai_key,
  openai_base = excluded.openai_base,
  allow_external = excluded.allow_external,
  store_logs = excluded.store_logs,
  updated_at = CURRENT_TIMESTAMP;
