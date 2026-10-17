-- Vira Shop 0.4: photo gallery and structured product specifications.
ALTER TABLE shop_products
  ADD COLUMN IF NOT EXISTS images TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS specs JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Keep previously published photos as the first gallery image.
UPDATE shop_products SET images = ARRAY[image_url]
 WHERE image_url <> '' AND cardinality(images) = 0;

CREATE INDEX IF NOT EXISTS shop_products_active_stock_idx
  ON shop_products(stock_count) WHERE is_active = TRUE;
