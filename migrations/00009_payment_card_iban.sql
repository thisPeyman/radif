-- +goose Up

ALTER TABLE shops
    ADD COLUMN payment_iban TEXT NOT NULL DEFAULT '';

ALTER TABLE shop_payment_cards
    ADD COLUMN iban TEXT NOT NULL DEFAULT '';

ALTER TABLE orders
    ADD COLUMN payment_iban TEXT NOT NULL DEFAULT '',
    ADD COLUMN final_payment_iban TEXT NOT NULL DEFAULT '';
