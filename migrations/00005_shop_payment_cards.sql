-- +goose Up

CREATE TABLE shop_payment_cards (
    id BIGSERIAL PRIMARY KEY,
    shop_id BIGINT NOT NULL CONSTRAINT fk_shop_payment_cards_shop REFERENCES shops (id),
    card_number TEXT NOT NULL,
    payment_instructions TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_shop_payment_cards_shop_number UNIQUE (shop_id, card_number)
);

INSERT INTO shop_payment_cards (shop_id, card_number, payment_instructions)
SELECT id, payment_card_number, payment_instructions
FROM shops;

ALTER TABLE orders
    ADD COLUMN payment_card_number TEXT,
    ADD COLUMN payment_instructions TEXT;

UPDATE orders
SET payment_card_number = shops.payment_card_number,
    payment_instructions = shops.payment_instructions
FROM shops
WHERE shops.id = orders.shop_id;
