-- +goose Up

ALTER TABLE shops
    ADD COLUMN instagram_username VARCHAR(30) NOT NULL DEFAULT '',
    ADD COLUMN whatsapp_number VARCHAR(15) NOT NULL DEFAULT '',
    ADD COLUMN support_channel VARCHAR(10) NOT NULL DEFAULT '',
    ADD CONSTRAINT shops_support_channel_valid CHECK (
        support_channel = '' OR
        (support_channel = 'instagram' AND instagram_username <> '') OR
        (support_channel = 'whatsapp' AND whatsapp_number <> '')
    );
