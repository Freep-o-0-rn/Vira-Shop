-- Vira Shop 0.11: configurable SKU variants. Existing products/orders stay untouched.
CREATE SEQUENCE IF NOT EXISTS shop_variant_article_seq AS BIGINT
  INCREMENT BY 1 MINVALUE 200000000 MAXVALUE 999999999999 START WITH 200000000 NO CYCLE;
ALTER TABLE shop_products ADD COLUMN IF NOT EXISTS variant_groups JSONB NOT NULL DEFAULT '[]'::jsonb;
CREATE TABLE IF NOT EXISTS shop_product_variants (
 article TEXT PRIMARY KEY CHECK(article ~ '^[0-9]{8,12}$'),
 product_id TEXT NOT NULL REFERENCES shop_products(id),
 signature TEXT NOT NULL,
 selection JSONB NOT NULL,
 price_minor BIGINT NOT NULL CHECK(price_minor BETWEEN 0 AND 900000000000),
 old_price_minor BIGINT CHECK(old_price_minor IS NULL OR old_price_minor>=0),
 stock_count INTEGER NOT NULL DEFAULT 0 CHECK(stock_count BETWEEN 0 AND 100000000),
 images TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
 is_active BOOLEAN NOT NULL DEFAULT TRUE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(product_id,signature),
 UNIQUE(product_id,article)
);
CREATE INDEX IF NOT EXISTS shop_variants_product_idx ON shop_product_variants(product_id);
ALTER TABLE shop_customer_cart ADD COLUMN IF NOT EXISTS variant_id TEXT REFERENCES shop_product_variants(article);
ALTER TABLE shop_customer_cart ADD COLUMN IF NOT EXISTS variant_key TEXT NOT NULL DEFAULT '';
ALTER TABLE shop_customer_cart DROP CONSTRAINT IF EXISTS shop_customer_cart_pkey;
ALTER TABLE shop_customer_cart ADD CONSTRAINT shop_customer_cart_pkey PRIMARY KEY(customer_id,product_id,variant_key);
ALTER TABLE shop_customer_cart ADD CONSTRAINT shop_cart_variant_key_check
 CHECK(variant_key=COALESCE(variant_id,''));
ALTER TABLE shop_order_items ADD COLUMN IF NOT EXISTS variant_id TEXT REFERENCES shop_product_variants(article);
ALTER TABLE shop_order_items ADD COLUMN IF NOT EXISTS variant_selection JSONB NOT NULL DEFAULT '[]'::jsonb;
