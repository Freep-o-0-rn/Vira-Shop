-- Unverified signups expire after 30 minutes independently of the OTP's 10-minute lifetime.
-- The random resume key is never stored in plaintext on the server.
ALTER TABLE shop_customer_signup_codes
  ADD COLUMN IF NOT EXISTS resume_token_hash TEXT;
ALTER TABLE shop_customer_signup_codes
  ADD COLUMN IF NOT EXISTS registration_expires_at TIMESTAMPTZ;
UPDATE shop_customer_signup_codes SET registration_expires_at=created_at+INTERVAL '30 minutes'
 WHERE registration_expires_at IS NULL;
ALTER TABLE shop_customer_signup_codes
  ALTER COLUMN registration_expires_at SET NOT NULL;
CREATE INDEX IF NOT EXISTS shop_customer_signup_codes_registration_expiry
  ON shop_customer_signup_codes(registration_expires_at);
