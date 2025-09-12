-- I18n tables for items/scales translations

-- Core tables (subset for MVP)
CREATE TABLE IF NOT EXISTS scales (
  id TEXT PRIMARY KEY,
  points INTEGER NOT NULL,
  randomize BOOLEAN NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  scale_id TEXT NOT NULL,
  reverse_scored BOOLEAN NOT NULL DEFAULT 0,
  FOREIGN KEY (scale_id) REFERENCES scales(id)
);

-- Translations
CREATE TABLE IF NOT EXISTS scale_i18n (
  scale_id TEXT NOT NULL,
  locale TEXT NOT NULL,
  name TEXT NOT NULL,
  PRIMARY KEY (scale_id, locale),
  FOREIGN KEY (scale_id) REFERENCES scales(id)
);

CREATE TABLE IF NOT EXISTS item_i18n (
  item_id TEXT NOT NULL,
  locale TEXT NOT NULL,
  stem TEXT NOT NULL,
  PRIMARY KEY (item_id, locale),
  FOREIGN KEY (item_id) REFERENCES items(id)
);

