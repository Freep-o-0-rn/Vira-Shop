-- Idempotency of customer order submissions.
ALTER TABLE shop_orders ADD COLUMN IF NOT EXISTS client_key TEXT;
UPDATE shop_orders SET client_key=md5(id::text || created_at::text) WHERE client_key IS NULL;
ALTER TABLE shop_orders ALTER COLUMN client_key SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS shop_orders_customer_key_idx ON shop_orders(customer_id,client_key);
