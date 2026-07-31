-- +goose Up

CREATE TABLE admin_shops (
    admin_id BIGINT NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
    shop_id  BIGINT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ,
    PRIMARY KEY (admin_id, shop_id)
);
CREATE INDEX idx_admin_shops_shop_id ON admin_shops (shop_id);

INSERT INTO admin_shops (admin_id, shop_id)
SELECT owner_admin_id, id FROM shops;

DROP INDEX IF EXISTS idx_shops_owner_name;
ALTER TABLE shops DROP COLUMN owner_admin_id;
