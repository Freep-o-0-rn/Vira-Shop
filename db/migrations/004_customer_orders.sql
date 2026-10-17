-- Vira Shop 0.5: customer accounts, saved addresses, server carts and unpaid manual orders.
CREATE TABLE IF NOT EXISTS shop_customers (
 id BIGSERIAL PRIMARY KEY,
 email TEXT NOT NULL CHECK (length(email) BETWEEN 5 AND 254),
 name TEXT NOT NULL CHECK (length(name) BETWEEN 2 AND 120),
 password_hash TEXT NOT NULL,
 failed_attempts INTEGER NOT NULL DEFAULT 0,
 locked_until TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS shop_customers_email_ci ON shop_customers (lower(email));

CREATE TABLE IF NOT EXISTS shop_customer_sessions (
 token_hash TEXT PRIMARY KEY,
 customer_id BIGINT NOT NULL REFERENCES shop_customers(id) ON DELETE CASCADE,
 expires_at TIMESTAMPTZ NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shop_customer_sessions_expiry ON shop_customer_sessions(expires_at);

CREATE TABLE IF NOT EXISTS shop_customer_addresses (
 id BIGSERIAL PRIMARY KEY,
 customer_id BIGINT NOT NULL REFERENCES shop_customers(id) ON DELETE CASCADE,
 recipient TEXT NOT NULL,
 phone TEXT NOT NULL,
 city TEXT NOT NULL,
 street TEXT NOT NULL,
 building TEXT NOT NULL,
 apartment TEXT NOT NULL DEFAULT '',
 comment TEXT NOT NULL DEFAULT '',
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shop_customer_addresses_customer_idx ON shop_customer_addresses(customer_id);

CREATE TABLE IF NOT EXISTS shop_customer_cart (
 customer_id BIGINT NOT NULL REFERENCES shop_customers(id) ON DELETE CASCADE,
 product_id TEXT NOT NULL REFERENCES shop_products(id),
 quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 99),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(customer_id, product_id)
);

CREATE TABLE IF NOT EXISTS shop_orders (
 id BIGSERIAL PRIMARY KEY,
 customer_id BIGINT NOT NULL REFERENCES shop_customers(id),
 status TEXT NOT NULL DEFAULT 'new'
   CHECK(status IN ('new','confirmed','packing','shipped','completed','cancelled')),
 payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK(payment_status='unpaid'),
 total_minor BIGINT NOT NULL CHECK(total_minor >= 0),
 currency TEXT NOT NULL DEFAULT 'RUB' CHECK(currency='RUB'),
 delivery_address JSONB NOT NULL,
 buyer_note TEXT NOT NULL DEFAULT '',
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shop_orders_customer_created_idx ON shop_orders(customer_id,created_at DESC);
CREATE INDEX IF NOT EXISTS shop_orders_status_created_idx ON shop_orders(status,created_at DESC);

CREATE TABLE IF NOT EXISTS shop_order_items (
 id BIGSERIAL PRIMARY KEY,
 order_id BIGINT NOT NULL REFERENCES shop_orders(id) ON DELETE CASCADE,
 product_id TEXT NOT NULL REFERENCES shop_products(id),
 title TEXT NOT NULL,
 quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 99),
 unit_price_minor BIGINT NOT NULL CHECK(unit_price_minor >= 0),
 line_total_minor BIGINT NOT NULL CHECK(line_total_minor >= 0)
);
CREATE INDEX IF NOT EXISTS shop_order_items_order_idx ON shop_order_items(order_id);
