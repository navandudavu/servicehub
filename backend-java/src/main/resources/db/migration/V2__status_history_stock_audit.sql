-- ============================================================================
-- V2: audit trail (who/when), status history, stock movements, legacy mapping
-- ============================================================================

-- legacy_* columns let the SQLite -> Postgres import be re-run without duplicates
ALTER TABLE customer ADD COLUMN legacy_id BIGINT UNIQUE;

ALTER TABLE nalog
    ADD COLUMN created_by_id    BIGINT,          -- user id from the ServiceHub JWT
    ADD COLUMN created_by_name  VARCHAR(150),
    ADD COLUMN completed_at     TIMESTAMPTZ,
    ADD COLUMN scheduled_at     TIMESTAMPTZ,      -- planned visit (calendar)
    ADD COLUMN legacy_job_id    BIGINT UNIQUE;

-- Every status change, forever. Append-only by convention: nothing updates or deletes it.
CREATE TABLE nalog_status_history (
    id               BIGSERIAL    PRIMARY KEY,
    nalog_id         BIGINT       NOT NULL REFERENCES nalog (id) ON DELETE CASCADE,
    from_status      VARCHAR(20),                -- NULL = creation
    to_status        VARCHAR(20)  NOT NULL,
    changed_by_id    BIGINT,
    changed_by_name  VARCHAR(150),
    changed_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT chk_hist_to   CHECK (to_status   IN ('DRAFT','DISPATCHED','IN_PROGRESS','AWAITING_PARTS','COMPLETED','CANCELLED')),
    CONSTRAINT chk_hist_from CHECK (from_status IS NULL OR from_status IN ('DRAFT','DISPATCHED','IN_PROGRESS','AWAITING_PARTS','COMPLETED','CANCELLED'))
);
CREATE INDEX idx_hist_nalog ON nalog_status_history (nalog_id, changed_at);

-- Every stock change with a reason. stock_qty on parts must always equal the sum of its deltas.
CREATE TABLE stock_movement (
    id          BIGSERIAL    PRIMARY KEY,
    part_id     BIGINT       NOT NULL REFERENCES parts (id) ON DELETE RESTRICT,
    delta       INTEGER      NOT NULL CHECK (delta <> 0),
    reason      VARCHAR(20)  NOT NULL CHECK (reason IN ('INITIAL','MANUAL','NALOG_CREATE','NALOG_CANCEL')),
    note        VARCHAR(255),
    nalog_id    BIGINT       REFERENCES nalog (id) ON DELETE SET NULL,
    actor_id    BIGINT,
    actor_name  VARCHAR(150),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_stock_part ON stock_movement (part_id, created_at);
