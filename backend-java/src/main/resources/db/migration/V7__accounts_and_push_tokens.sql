-- ============================================================================
-- V7: Java now owns the accounts (login, passwords, push tokens). The Node backend is gone.
-- app_user already holds {id, name, role, active}; it gains the login columns.
-- Existing rows keep their ids, so nalog.assigned_to_id keeps pointing at the same person.
-- password_hash is NULL for rows that were only synced from Node: those people cannot log in until
-- their hash is imported (deploy/migrate-users-from-node.sh) or an admin resets their password.
-- ============================================================================
ALTER TABLE app_user
    ADD COLUMN email               VARCHAR(150),
    ADD COLUMN password_hash       VARCHAR(100),
    ADD COLUMN phone               VARCHAR(40),
    ADD COLUMN tokens_valid_after  BIGINT       NOT NULL DEFAULT 0,   -- unix seconds: older tokens are refused
    ADD COLUMN created_at          TIMESTAMPTZ  NOT NULL DEFAULT now();

CREATE UNIQUE INDEX uq_app_user_email ON app_user (lower(email)) WHERE email IS NOT NULL;

-- ids of new users continue above every id that already exists (Node's ids were kept)
CREATE SEQUENCE app_user_id_seq;
SELECT setval('app_user_id_seq', (SELECT COALESCE(MAX(id), 0) FROM app_user) + 1, false);

-- phone push tokens (FCM). One row per device token; the newest login owns it.
CREATE TABLE user_tokens (
    id          BIGSERIAL     PRIMARY KEY,
    user_id     BIGINT        NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    token       VARCHAR(512)  NOT NULL UNIQUE,
    platform    VARCHAR(20)   NOT NULL,
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX idx_user_tokens_user ON user_tokens (user_id);
