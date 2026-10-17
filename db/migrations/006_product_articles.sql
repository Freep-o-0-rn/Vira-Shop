-- Vira Shop 0.9. New public SKU/articuls are server-issued numeric TEXT ids.
-- Existing custom/text IDs remain unchanged so old product links and orders keep working.
CREATE SEQUENCE IF NOT EXISTS shop_product_article_seq
  AS BIGINT INCREMENT BY 1 MINVALUE 10000000 MAXVALUE 999999999999
  START WITH 10000000 NO CYCLE;
-- Accommodate any numeric legacy IDs before enabling automatic allocation.
-- setval(...,false) means nextval() returns the calculated first free number.
SELECT setval('shop_product_article_seq',
  GREATEST(10000000::bigint,
    COALESCE((SELECT MAX(id::bigint)+1 FROM shop_products
      WHERE id ~ '^[0-9]{1,12}$'),10000000::bigint)),false);
