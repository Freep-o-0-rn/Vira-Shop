-- A browser may cancel only the pending signup for which it owns a random secret.
-- Existing pending signups remain valid until their OTP expires.
ALTER TABLE shop_customer_signup_codes
  ADD COLUMN IF NOT EXISTS cancel_token_hash TEXT;
