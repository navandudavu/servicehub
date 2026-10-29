-- ============================================================================
-- V1: core schema for Nalog (work order), customer, parts  (PostgreSQL 14+)
--
-- Stability rules baked into the schema (the app is NOT the only line of defence):
--   * every money column is NUMERIC(12,2) - never FLOAT/DOUBLE/REAL
--   * CHECK constraints reject negative money, negative stock, and any row where
--     total != subtotal + vat_amount, even if a buggy client/service tries it
--   * FKs are RESTRICT: a customer or part that has history can never be deleted
--   * idempotency_key is UNIQUE: a retried POST after a network timeout can
--     never create a duplicate nalog
--   * "version" columns enable optimistic locking against lost updates
-- ============================================================================

CREATE TABLE customer (
    id              BIGSERIAL     PRIMARY KEY,
    full_name       VARCHAR(150)  NOT NULL,
    address         VARCHAR(255)  NOT NULL,
    city            VARCHAR(100),
    phone           VARCHAR(40)   NOT NULL,
    email           VARCHAR(150),
    location_notes  VARCHAR(500),               -- "3rd floor, no elevator, ring twice"
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
    version         BIGINT        NOT NULL DEFAULT 0
);
CREATE INDEX idx_customer_phone     ON customer (phone);
CREATE INDEX idx_customer_full_name ON customer (lower(full_name));

CREATE TABLE parts (
    id          BIGSERIAL      PRIMARY KEY,
    sku         VARCHAR(60)    NOT NULL UNIQUE,
    name        VARCHAR(200)   NOT NULL,
    unit_price  NUMERIC(12,2)  NOT NULL CHECK (unit_price >= 0),   -- net of VAT
    stock_qty   INTEGER        NOT NULL DEFAULT 0 CHECK (stock_qty >= 0),
    active      BOOLEAN        NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ    NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ    NOT NULL DEFAULT now(),
    version     BIGINT         NOT NULL DEFAULT 0
);
CREATE INDEX idx_parts_name ON parts (lower(name));

-- Human-readable number: N-2026-000123. Sequences are not rolled back, so
-- gaps are possible after a failed transaction - that is normal and accepted.
CREATE SEQUENCE nalog_number_seq START 1;

CREATE TABLE nalog (
    id               BIGSERIAL      PRIMARY KEY,
    nalog_number     VARCHAR(30)    NOT NULL UNIQUE,
    idempotency_key  VARCHAR(80)    UNIQUE,

    customer_id      BIGINT         NOT NULL REFERENCES customer (id) ON DELETE RESTRICT,

    -- Appliance (denormalised on purpose: a nalog is a historical document)
    appliance_type   VARCHAR(30)    NOT NULL,
    appliance_brand  VARCHAR(100)   NOT NULL,
    appliance_model  VARCHAR(100),
    serial_number    VARCHAR(100),

    diagnosis        TEXT           NOT NULL,

    -- Labor
    labor_hours      NUMERIC(6,2)   NOT NULL DEFAULT 0 CHECK (labor_hours >= 0),
    labor_rate       NUMERIC(12,2)  NOT NULL CHECK (labor_rate >= 0),   -- snapshot of hourly rate
    labor_total      NUMERIC(12,2)  NOT NULL CHECK (labor_total >= 0),

    -- Financials: ALL computed by the Java backend (BigDecimal, HALF_UP)
    parts_total      NUMERIC(12,2)  NOT NULL CHECK (parts_total >= 0),
    subtotal         NUMERIC(12,2)  NOT NULL CHECK (subtotal >= 0),
    vat_rate         NUMERIC(5,4)   NOT NULL CHECK (vat_rate >= 0 AND vat_rate < 1),  -- 0.2000 = 20%
    vat_amount       NUMERIC(12,2)  NOT NULL CHECK (vat_amount >= 0),
    total            NUMERIC(12,2)  NOT NULL CHECK (total >= 0),

    payment_type     VARCHAR(20)    NOT NULL,
    status           VARCHAR(20)    NOT NULL DEFAULT 'DRAFT',

    created_at       TIMESTAMPTZ    NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ    NOT NULL DEFAULT now(),
    version          BIGINT         NOT NULL DEFAULT 0,

    CONSTRAINT chk_nalog_status CHECK (status IN
        ('DRAFT','DISPATCHED','IN_PROGRESS','AWAITING_PARTS','COMPLETED','CANCELLED')),
    CONSTRAINT chk_nalog_payment CHECK (payment_type IN ('CASH','CARD','INVOICE')),
    CONSTRAINT chk_nalog_appliance CHECK (appliance_type IN
        ('AIR_CONDITIONER','REFRIGERATOR','FREEZER','WASHING_MACHINE','DRYER',
         'DISHWASHER','OVEN','STOVE','WATER_HEATER','BOILER','OTHER')),
    CONSTRAINT chk_nalog_subtotal CHECK (subtotal = labor_total + parts_total),
    CONSTRAINT chk_nalog_total    CHECK (total = subtotal + vat_amount)
);
CREATE INDEX idx_nalog_customer ON nalog (customer_id);
CREATE INDEX idx_nalog_status   ON nalog (status);
CREATE INDEX idx_nalog_created  ON nalog (created_at DESC);
CREATE INDEX idx_nalog_serial   ON nalog (serial_number) WHERE serial_number IS NOT NULL;

-- Parts used on a nalog. name/price are SNAPSHOTS: changing the catalogue
-- price tomorrow must never rewrite what a customer was charged yesterday.
CREATE TABLE nalog_part_line (
    id          BIGSERIAL      PRIMARY KEY,
    nalog_id    BIGINT         NOT NULL REFERENCES nalog (id)  ON DELETE CASCADE,
    part_id     BIGINT         NOT NULL REFERENCES parts (id)  ON DELETE RESTRICT,
    part_sku    VARCHAR(60)    NOT NULL,
    part_name   VARCHAR(200)   NOT NULL,
    unit_price  NUMERIC(12,2)  NOT NULL CHECK (unit_price >= 0),
    quantity    INTEGER        NOT NULL CHECK (quantity > 0),
    line_total  NUMERIC(12,2)  NOT NULL CHECK (line_total >= 0),
    CONSTRAINT uq_nalog_part UNIQUE (nalog_id, part_id)
);
CREATE INDEX idx_nalog_part_line_nalog ON nalog_part_line (nalog_id);
