-- Allow verified account deletion while retaining the order audit/history records.
-- Active orders are blocked by the application until completed or cancelled.
ALTER TABLE shop_orders ALTER COLUMN customer_id DROP NOT NULL;
ALTER TABLE shop_orders DROP CONSTRAINT IF EXISTS shop_orders_customer_id_fkey;
ALTER TABLE shop_orders ADD CONSTRAINT shop_orders_customer_id_fkey
 FOREIGN KEY (customer_id) REFERENCES shop_customers(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS shop_customer_deletion_codes (
 customer_id BIGINT PRIMARY KEY REFERENCES shop_customers(id) ON DELETE CASCADE,
 code_hash TEXT NOT NULL,
 expires_at TIMESTAMPTZ NOT NULL,
 resend_after TIMESTAMPTZ NOT NULL,
 window_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 sent_in_window INTEGER NOT NULL DEFAULT 1,
 failed_attempts INTEGER NOT NULL DEFAULT 0
);
