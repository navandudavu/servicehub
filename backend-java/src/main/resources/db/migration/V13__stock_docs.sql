-- Zaduzenje / Razduzenje as numbered documents (replaces the flat carried_item list).
-- Documents are never deleted: no DELETE endpoint, and the foreign keys below have no cascade.
ALTER TABLE parts ADD COLUMN unit VARCHAR(20) NOT NULL DEFAULT 'kom';

CREATE SEQUENCE stock_doc_zad_seq START 1;
CREATE SEQUENCE stock_doc_raz_seq START 1;

CREATE TABLE stock_doc (
    id               BIGSERIAL     PRIMARY KEY,
    doc_type         VARCHAR(3)    NOT NULL CHECK (doc_type IN ('ZAD', 'RAZ')),
    doc_no           BIGINT        NOT NULL,
    technician_id    BIGINT        NOT NULL REFERENCES app_user (id),
    doc_at           TIMESTAMPTZ   NOT NULL,
    created_by       BIGINT        NOT NULL REFERENCES app_user (id),
    created_by_name  VARCHAR(150)  NOT NULL,
    updated_by_name  VARCHAR(150),
    created_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
    UNIQUE (doc_type, doc_no)
);
CREATE INDEX idx_stock_doc_technician ON stock_doc (technician_id, doc_at);

CREATE TABLE stock_doc_line (
    id        BIGSERIAL      PRIMARY KEY,
    doc_id    BIGINT         NOT NULL REFERENCES stock_doc (id),
    part_id   BIGINT         REFERENCES parts (id),
    sku       VARCHAR(60),
    name      VARCHAR(200)   NOT NULL,
    unit      VARCHAR(20)    NOT NULL DEFAULT 'kom',
    quantity  NUMERIC(12, 3) NOT NULL CHECK (quantity > 0)
);
CREATE INDEX idx_stock_doc_line_doc ON stock_doc_line (doc_id);

-- Every edit of a saved document keeps the previous version here (who changed it, when, what it said before).
CREATE TABLE stock_doc_revision (
    id               BIGSERIAL     PRIMARY KEY,
    doc_id           BIGINT        NOT NULL REFERENCES stock_doc (id),
    revised_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
    revised_by_name  VARCHAR(150)  NOT NULL,
    snapshot         TEXT          NOT NULL
);
CREATE INDEX idx_stock_doc_revision_doc ON stock_doc_revision (doc_id, revised_at);

-- Carry the old lists over: one Zaduzenje per technician, dated today, issued by "Migracija".
-- Lines are matched to a part by sku where possible (so they can be razduzene by search later).
INSERT INTO stock_doc (doc_type, doc_no, technician_id, doc_at, created_by, created_by_name)
SELECT 'ZAD', nextval('stock_doc_zad_seq'), c.technician_id, now(), c.technician_id, 'Migracija'
FROM (SELECT DISTINCT technician_id FROM carried_item WHERE quantity > 0) c;

INSERT INTO stock_doc_line (doc_id, part_id, sku, name, unit, quantity)
SELECT d.id, p.id, ci.sku, ci.name, COALESCE(p.unit, 'kom'), ci.quantity
FROM carried_item ci
JOIN stock_doc d ON d.technician_id = ci.technician_id AND d.created_by_name = 'Migracija'
LEFT JOIN parts p ON p.sku = ci.sku
WHERE ci.quantity > 0;

DROP TABLE carried_item;
