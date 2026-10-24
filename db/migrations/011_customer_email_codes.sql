-- Pending registrations contain no active customer until a one-time email code is checked.
-- Kept separate so all existing customer accounts remain unchanged.
CREATE TABLE IF NOT EXISTS shop_customer_signup_codes (
  email TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 2 AND 120),
  password_hash TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  resend_after TIMESTAMPTZ NOT NULL,
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_in_window INTEGER NOT NULL DEFAULT 0,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS shop_customer_signup_codes_expiry
  ON shop_customer_signup_codes(expires_at);
