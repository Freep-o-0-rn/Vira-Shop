-- Vira Shop 0.14 — fulfillment snapshot and payment integration boundary.
-- Historical orders keep their original total; their unquoted delivery is unknown.
ALTER TABLE shop_orders ADD COLUMN IF NOT EXISTS delivery_method TEXT NOT NULL DEFAULT 'courier'
  CHECK(delivery_method IN ('pickup','courier'));
ALTER TABLE shop_orders ADD COLUMN IF NOT EXISTS delivery_fee_minor BIGINT
  CHECK(delivery_fee_minor IS NULL OR delivery_fee_minor BETWEEN 0 AND 900000000000);
ALTER TABLE shop_orders ADD COLUMN IF NOT EXISTS subtotal_minor BIGINT NOT NULL DEFAULT 0
  CHECK(subtotal_minor BETWEEN 0 AND 900000000000);
ALTER TABLE shop_orders ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'not_configured'
  CHECK(payment_method='not_configured');
UPDATE shop_orders SET subtotal_minor=total_minor
 WHERE subtotal_minor=0 AND total_minor<>0;
-- No charges or payment intents are created by this migration.
