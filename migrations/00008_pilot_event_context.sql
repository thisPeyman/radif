-- +goose Up

ALTER TABLE pilot_events
    ADD COLUMN shop_id BIGINT CONSTRAINT fk_pilot_events_shop REFERENCES shops (id),
    ADD COLUMN event_key TEXT;

UPDATE pilot_events
SET shop_id = orders.shop_id
FROM orders
WHERE pilot_events.order_id = orders.id;

CREATE INDEX idx_pilot_events_shop_id ON pilot_events (shop_id);
CREATE UNIQUE INDEX idx_pilot_events_name_key ON pilot_events (event_name, event_key) WHERE event_key IS NOT NULL;
