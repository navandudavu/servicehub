-- Editing a nalog changes part quantities, deleting one gives its parts back: both write to the stock ledger,
-- so the allowed ledger reasons must include them.
DO $$
DECLARE c text;
BEGIN
    FOR c IN SELECT conname FROM pg_constraint
             WHERE conrelid = 'stock_movement'::regclass AND contype = 'c'
               AND pg_get_constraintdef(oid) LIKE '%NALOG_CREATE%'
    LOOP
        EXECUTE format('ALTER TABLE stock_movement DROP CONSTRAINT %I', c);
    END LOOP;
END $$;

ALTER TABLE stock_movement ADD CONSTRAINT chk_stock_reason CHECK (reason IN
    ('INITIAL', 'MANUAL', 'NALOG_CREATE', 'NALOG_CANCEL', 'NALOG_EDIT', 'NALOG_DELETE'));

-- A deleted nalog is gone, but who deleted what, and when, is kept.
CREATE TABLE nalog_deleted_log (
    id               BIGSERIAL     PRIMARY KEY,
    nalog_id         BIGINT        NOT NULL,
    nalog_number     VARCHAR(30)   NOT NULL,
    status           VARCHAR(20)   NOT NULL,
    customer_name    VARCHAR(150),
    total            NUMERIC(12,2) NOT NULL,
    deleted_by_id    BIGINT,
    deleted_by_name  VARCHAR(150),
    deleted_at       TIMESTAMPTZ   NOT NULL DEFAULT now()
);
