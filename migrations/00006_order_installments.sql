-- +goose Up

ALTER TABLE orders
    ADD COLUMN initial_payment_amount BIGINT,
    ADD COLUMN final_payment_requested_at TIMESTAMPTZ,
    ADD COLUMN final_payment_card_number TEXT NOT NULL DEFAULT '',
    ADD COLUMN final_payment_instructions TEXT NOT NULL DEFAULT '',
    ADD COLUMN final_receipt_file_path TEXT NOT NULL DEFAULT '',
    ADD COLUMN final_payment_confirmed_at TIMESTAMPTZ,
    ADD COLUMN final_payment_confirmed_by_admin_id BIGINT CONSTRAINT fk_orders_final_payment_admin REFERENCES admins (id),
    ADD CONSTRAINT chk_orders_initial_payment_amount CHECK (
        initial_payment_amount IS NULL OR
        (initial_payment_amount > 0 AND initial_payment_amount < amount)
    );
