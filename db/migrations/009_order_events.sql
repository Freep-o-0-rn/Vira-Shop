-- Vira Shop 0.15: immutable order workflow history.
-- Backfill older orders with the only state we can verify (creation and current status).
-- We do NOT invent historical transitions that were never recorded.
CREATE TABLE IF NOT EXISTS shop_order_events (
 id BIGSERIAL PRIMARY KEY,
 order_id BIGINT NOT NULL REFERENCES shop_orders(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('created','status_changed')),
 from_status TEXT,
 to_status TEXT NOT NULL CHECK(to_status IN ('new','confirmed','packing','shipped','completed','cancelled')),
 actor_type TEXT NOT NULL CHECK(actor_type IN ('customer','admin','system')),
 note TEXT NOT NULL DEFAULT '' CHECK(length(note)<=500),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS shop_order_events_order_idx ON shop_order_events(order_id,id);
INSERT INTO shop_order_events(order_id,kind,from_status,to_status,actor_type,note,created_at)
 SELECT o.id,'created',NULL,o.status,'system',
   CASE WHEN o.status='new' THEN 'Перенесён существующий заказ; предыдущая история недоступна.'
        ELSE 'Перенесён существующий заказ. Зафиксирован только текущий статус.' END,
   o.created_at
 FROM shop_orders o
 WHERE NOT EXISTS(SELECT 1 FROM shop_order_events e WHERE e.order_id=o.id);
