-- +goose Up

ALTER TABLE orders
    ADD COLUMN original_amount BIGINT,
    ADD CONSTRAINT chk_orders_original_amount CHECK (
        original_amount IS NULL OR original_amount > amount
    );
