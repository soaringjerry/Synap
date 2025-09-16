PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  pass_hash BLOB NOT NULL,
  tenant_id TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS scales (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  points INTEGER NOT NULL,
  randomize INTEGER NOT NULL DEFAULT 0,
  name_i18n TEXT,
  consent_i18n TEXT,
  collect_email TEXT,
  e2ee_enabled INTEGER NOT NULL DEFAULT 0,
  region TEXT,
  turnstile_enabled INTEGER NOT NULL DEFAULT 0,
  items_per_page INTEGER,
  consent_config TEXT,
  likert_labels_i18n TEXT,
  likert_show_numbers INTEGER NOT NULL DEFAULT 0,
  likert_preset TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  scale_id TEXT NOT NULL,
  reverse_scored INTEGER NOT NULL DEFAULT 0,
  stem_i18n TEXT,
  type TEXT,
  options_i18n TEXT,
  placeholder_i18n TEXT,
  min_value INTEGER,
  max_value INTEGER,
  step_value INTEGER,
  required INTEGER NOT NULL DEFAULT 0,
  likert_labels_i18n TEXT,
  likert_show_numbers INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (scale_id) REFERENCES scales(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_items_scale ON items(scale_id);
CREATE INDEX IF NOT EXISTS idx_items_scale_position ON items(scale_id, position);

CREATE TABLE IF NOT EXISTS participants (
  id TEXT PRIMARY KEY,
  email TEXT,
  self_token TEXT,
  consent_id TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_participants_email ON participants(email);

CREATE TABLE IF NOT EXISTS responses (
  participant_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  scale_id TEXT NOT NULL,
  raw_value INTEGER,
  score_value INTEGER,
  submitted_at DATETIME NOT NULL,
  raw_json TEXT,
  PRIMARY KEY (participant_id, item_id),
  FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
  FOREIGN KEY (scale_id) REFERENCES scales(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_responses_scale ON responses(scale_id);
CREATE INDEX IF NOT EXISTS idx_responses_item ON responses(item_id);

CREATE TABLE IF NOT EXISTS e2ee_responses (
  response_id TEXT PRIMARY KEY,
  scale_id TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  nonce TEXT,
  aad_hash TEXT,
  enc_dek TEXT,
  pmk_fingerprint TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  self_token TEXT,
  FOREIGN KEY (scale_id) REFERENCES scales(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_e2ee_scale ON e2ee_responses(scale_id);

CREATE TABLE IF NOT EXISTS project_keys (
  scale_id TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  algorithm TEXT NOT NULL,
  kdf TEXT,
  public_key TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  disabled INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (scale_id, fingerprint),
  FOREIGN KEY (scale_id) REFERENCES scales(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tenant_ai_configs (
  tenant_id TEXT PRIMARY KEY,
  openai_key TEXT,
  openai_base TEXT,
  allow_external INTEGER NOT NULL DEFAULT 0,
  store_logs INTEGER NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT,
  note TEXT
);

CREATE TABLE IF NOT EXISTS consent_records (
  id TEXT PRIMARY KEY,
  scale_id TEXT NOT NULL,
  version TEXT,
  choices TEXT,
  locale TEXT,
  signed_at DATETIME NOT NULL,
  hash TEXT,
  FOREIGN KEY (scale_id) REFERENCES scales(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_consent_scale ON consent_records(scale_id);
