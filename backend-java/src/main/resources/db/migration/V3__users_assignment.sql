-- ============================================================================
-- V3: user directory + technician assignment
-- The Node app owns the real user accounts. This is a read-mostly COPY of
-- {id, name, role}, filled from JWTs as people use the API (and seeded by the
-- SQLite importer), so we can assign nalozi and show names without calling Node.
-- ============================================================================
CREATE TABLE app_user (
    id            BIGINT       PRIMARY KEY,          -- same id as users.id in ServiceHub
    name          VARCHAR(150) NOT NULL,
    role          VARCHAR(20)  NOT NULL CHECK (role IN ('admin','technician')),
    active        BOOLEAN      NOT NULL DEFAULT TRUE,
    last_seen_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

ALTER TABLE nalog
    ADD COLUMN assigned_to_id    BIGINT REFERENCES app_user (id) ON DELETE SET NULL,
    ADD COLUMN assigned_to_name  VARCHAR(150);
CREATE INDEX idx_nalog_assigned ON nalog (assigned_to_id);
CREATE INDEX idx_nalog_created_by ON nalog (created_by_id);
