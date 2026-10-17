-- Vira Shop 0.15.1: independent fulfillment lifecycle and verified pickup-point snapshot.
ALTER TABLE shop_orders DROP CONSTRAINT IF EXISTS shop_orders_delivery_method_check;
ALTER TABLE shop_orders ADD CONSTRAINT shop_orders_delivery_method_check
 CHECK(delivery_method IN ('pickup','courier','transport','ozon_pvz'));
ALTER TABLE shop_orders ADD COLUMN IF NOT EXISTS logistics_status TEXT NOT NULL DEFAULT 'awaiting_confirmation'
 CHECK(logistics_status IN ('awaiting_confirmation','sourcing','preparing',
   'ready_for_pickup','handed_over','in_transit','ready_for_collection','delivered','cancelled'));
ALTER TABLE shop_orders ADD COLUMN IF NOT EXISTS fulfillment_source TEXT NOT NULL DEFAULT 'own_stock'
 CHECK(fulfillment_source IN ('own_stock','purchase_to_order'));
ALTER TABLE shop_orders ADD COLUMN IF NOT EXISTS carrier_code TEXT;
ALTER TABLE shop_orders ADD COLUMN IF NOT EXISTS tracking_number TEXT;
ALTER TABLE shop_orders ADD COLUMN IF NOT EXISTS purchase_reference TEXT;
ALTER TABLE shop_orders ADD COLUMN IF NOT EXISTS delivery_point JSONB;
ALTER TABLE shop_orders ADD COLUMN IF NOT EXISTS logistics_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE TABLE IF NOT EXISTS shop_logistics_events (
 id BIGSERIAL PRIMARY KEY,
 order_id BIGINT NOT NULL REFERENCES shop_orders(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('created','status_changed','details_updated')),
 from_status TEXT,
 to_status TEXT NOT NULL,
 actor_type TEXT NOT NULL CHECK(actor_type IN ('customer','admin','system','carrier')),
 note TEXT NOT NULL DEFAULT '' CHECK(length(note)<=500),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS shop_logistics_events_order_idx ON shop_logistics_events(order_id,id);
INSERT INTO shop_logistics_events(order_id,kind,from_status,to_status,actor_type,note,created_at)
 SELECT o.id,'created',NULL,o.logistics_status,'system',
 'Создана запись логистики при обновлении магазина; предыдущие события неизвестны.',o.created_at
 FROM shop_orders o
 WHERE NOT EXISTS(SELECT 1 FROM shop_logistics_events e WHERE e.order_id=o.id);
