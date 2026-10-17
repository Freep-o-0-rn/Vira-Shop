-- Vira Shop schema v1. Prices use INTEGER minor units (kopeks); no floating-point money in the database.
CREATE TABLE IF NOT EXISTS shop_categories (
    id TEXT PRIMARY KEY CHECK (id ~ '^[a-z0-9_-]{1,64}$'),
    title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
    emoji TEXT NOT NULL DEFAULT '',
    tone TEXT NOT NULL DEFAULT 'blue',
    display_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shop_products (
    id TEXT PRIMARY KEY CHECK (id ~ '^[a-zA-Z0-9_-]{1,64}$'),
    category_id TEXT NOT NULL REFERENCES shop_categories(id),
    title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
    subtitle TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    price_minor BIGINT NOT NULL CHECK (price_minor >= 0 AND price_minor <= 900000000000),
    old_price_minor BIGINT CHECK (old_price_minor IS NULL OR old_price_minor >= 0),
    currency TEXT NOT NULL DEFAULT 'RUB' CHECK (currency = 'RUB'),
    rating NUMERIC(2,1) NOT NULL DEFAULT 0 CHECK (rating BETWEEN 0 AND 5),
    reviews INTEGER NOT NULL DEFAULT 0 CHECK (reviews >= 0),
    image_url TEXT NOT NULL DEFAULT '',
    badge TEXT,
    stock_count INTEGER NOT NULL DEFAULT 0 CHECK (stock_count >= 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS shop_products_active_category_idx ON shop_products (category_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS shop_products_active_price_idx ON shop_products (price_minor) WHERE is_active;
