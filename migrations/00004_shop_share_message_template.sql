-- +goose Up

ALTER TABLE shops
    ADD COLUMN share_message_template TEXT NOT NULL DEFAULT '';
