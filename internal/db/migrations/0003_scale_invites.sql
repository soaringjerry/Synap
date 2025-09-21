-- Invitation tokens to onboard collaborators into an existing tenant/scale
CREATE TABLE IF NOT EXISTS scale_invites (
  token TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  scale_id TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'editor',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  accepted_at DATETIME,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (scale_id) REFERENCES scales(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_scale_invites_tenant ON scale_invites(tenant_id);
CREATE INDEX IF NOT EXISTS idx_scale_invites_scale ON scale_invites(scale_id);
CREATE INDEX IF NOT EXISTS idx_scale_invites_email ON scale_invites(email);

