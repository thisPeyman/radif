-- +goose Up

ALTER TABLE orders
    ADD COLUMN sales_channel VARCHAR(20) NOT NULL DEFAULT 'instagram',
    ADD COLUMN conversation_reference TEXT NOT NULL DEFAULT '',
    ADD CONSTRAINT chk_orders_sales_channel CHECK (
        sales_channel IN ('instagram', 'whatsapp', 'telegram', 'bale', 'other')
    );

UPDATE orders
SET conversation_reference = COALESCE(instagram_username, '');
