-- +goose Up

ALTER TABLE admins ADD COLUMN IF NOT EXISTS mobile TEXT;
DROP INDEX IF EXISTS idx_admins_mobile;
CREATE UNIQUE INDEX idx_admins_mobile ON admins (mobile) WHERE mobile IS NOT NULL AND mobile <> '';

CREATE TABLE IF NOT EXISTS otp_challenges (
    id BIGSERIAL PRIMARY KEY,
    mobile TEXT NOT NULL,
    purpose TEXT NOT NULL DEFAULT 'signup',
    code_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    sent_at TIMESTAMPTZ NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    invalidated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_otp_challenges_mobile_purpose_sent ON otp_challenges (mobile, purpose, sent_at DESC);

ALTER TABLE shops
    ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS paid_through DATE,
    ADD COLUMN IF NOT EXISTS subscription_mode TEXT NOT NULL DEFAULT 'grandfathered';

-- Existing shops retain their access after this release.
UPDATE shops SET subscription_mode = 'grandfathered' WHERE trial_ends_at IS NULL AND paid_through IS NULL;
