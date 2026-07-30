-- +goose Up

CREATE TABLE IF NOT EXISTS admins (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    login TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    active BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    admin_id BIGINT NOT NULL CONSTRAINT fk_sessions_admin REFERENCES admins (id),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS shops (
    id BIGSERIAL PRIMARY KEY,
    owner_admin_id BIGINT NOT NULL CONSTRAINT fk_shops_owner REFERENCES admins (id),
    name TEXT NOT NULL,
    logo_path TEXT,
    short_description TEXT,
    payment_card_number TEXT NOT NULL,
    payment_instructions TEXT NOT NULL,
    active BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS products (
    id BIGSERIAL PRIMARY KEY,
    shop_id BIGINT NOT NULL CONSTRAINT fk_products_shop REFERENCES shops (id),
    name TEXT NOT NULL,
    main_image_path TEXT NOT NULL,
    default_price BIGINT NOT NULL,
    short_description TEXT,
    active BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS orders (
    id BIGSERIAL PRIMARY KEY,
    create_key TEXT NOT NULL,
    create_fingerprint TEXT NOT NULL,
    secret_token TEXT NOT NULL,
    shop_id BIGINT NOT NULL CONSTRAINT fk_orders_shop REFERENCES shops (id),
    amount BIGINT NOT NULL,
    estimated_delivery_date TEXT NOT NULL,
    instagram_username TEXT,
    internal_note TEXT,
    customer_full_name TEXT,
    customer_mobile TEXT,
    customer_address TEXT,
    customer_postal_code TEXT,
    customer_note TEXT,
    receipt_file_path TEXT,
    status TEXT NOT NULL,
    shipment_tracking_code TEXT,
    customer_submitted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS order_items (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT NOT NULL CONSTRAINT fk_orders_items REFERENCES orders (id),
    product_id BIGINT NOT NULL CONSTRAINT fk_order_items_product REFERENCES products (id),
    quantity BIGINT NOT NULL,
    unit_price BIGINT NOT NULL,
    created_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS order_status_histories (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT NOT NULL CONSTRAINT fk_orders_history REFERENCES orders (id),
    previous_status TEXT,
    new_status TEXT NOT NULL,
    changed_by_admin_id BIGINT CONSTRAINT fk_order_status_histories_changed_by_admin REFERENCES admins (id),
    created_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS pilot_events (
    id BIGSERIAL PRIMARY KEY,
    event_name TEXT NOT NULL,
    order_id BIGINT CONSTRAINT fk_pilot_events_order REFERENCES orders (id),
    admin_id BIGINT CONSTRAINT fk_pilot_events_admin REFERENCES admins (id),
    metadata TEXT,
    created_at TIMESTAMPTZ
);

ALTER TABLE orders DROP COLUMN IF EXISTS receipt_uploaded_at;

CREATE UNIQUE INDEX IF NOT EXISTS idx_admins_login ON admins (login);
CREATE INDEX IF NOT EXISTS idx_sessions_admin_id ON sessions (admin_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions (expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_shops_owner_name ON shops (owner_admin_id, name);
CREATE INDEX IF NOT EXISTS idx_shops_active ON shops (active);
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_shop_name ON products (shop_id, name);
CREATE INDEX IF NOT EXISTS idx_products_active ON products (active);
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_create_key ON orders (create_key);
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_secret_token ON orders (secret_token);
CREATE INDEX IF NOT EXISTS idx_orders_shop_id ON orders (shop_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_order_items_order_product ON order_items (order_id, product_id);
CREATE INDEX IF NOT EXISTS idx_order_status_histories_order_id ON order_status_histories (order_id);
CREATE INDEX IF NOT EXISTS idx_pilot_events_event_name ON pilot_events (event_name);
CREATE INDEX IF NOT EXISTS idx_pilot_events_order_id ON pilot_events (order_id);
CREATE INDEX IF NOT EXISTS idx_pilot_events_admin_id ON pilot_events (admin_id);
