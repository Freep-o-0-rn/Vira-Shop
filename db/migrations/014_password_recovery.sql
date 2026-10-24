-- Separate password recovery from signup/deletion verification codes.
-- Throttle by a SHA-256 digest of normalized email, including unknown accounts;
-- no plaintext email is kept in the request-rate table.
CREATE TABLE IF NOT EXISTS shop_customer_password_reset_rates (
 email_hash TEXT PRIMARY KEY,
 window_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 sent_in_window INTEGER NOT NULL DEFAULT 0,
 resend_after TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS shop_customer_password_resets (
 customer_id BIGINT PRIMARY KEY REFERENCES shop_customers(id) ON DELETE CASCADE,
 code_hash TEXT NOT NULL,
 expires_at TIMESTAMPTZ NOT NULL,
 failed_attempts INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS shop_customer_password_resets_expiry_idx
 ON shop_customer_password_resets(expires_at);
