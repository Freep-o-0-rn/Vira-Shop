-- Administrator authentication; all passwords and session tokens are stored as hashes.
CREATE TABLE IF NOT EXISTS shop_admins (
  id BIGSERIAL PRIMARY KEY,
  login TEXT UNIQUE NOT NULL CHECK (length(login) BETWEEN 3 AND 64),
  password_hash TEXT NOT NULL,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS shop_admin_sessions (
  token_hash TEXT PRIMARY KEY,
  admin_id BIGINT NOT NULL REFERENCES shop_admins(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS shop_admin_sessions_expires_idx ON shop_admin_sessions(expires_at);
