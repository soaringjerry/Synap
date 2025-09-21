-- Team collaborators per scale
CREATE TABLE IF NOT EXISTS scale_collaborators (
  scale_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'editor', -- editor|viewer (extensible)
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (scale_id, user_id),
  FOREIGN KEY (scale_id) REFERENCES scales(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_scale_collabs_scale ON scale_collaborators(scale_id);
CREATE INDEX IF NOT EXISTS idx_scale_collabs_user ON scale_collaborators(user_id);

