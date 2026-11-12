-- "Zaduzivanje": the material a technician carries (van stock). A plain list per technician, not linked to the warehouse.
CREATE TABLE carried_item (
    id             BIGSERIAL     PRIMARY KEY,
    technician_id  BIGINT        NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    sku            VARCHAR(60),
    name           VARCHAR(200)  NOT NULL,
    quantity       INTEGER       NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    created_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX idx_carried_item_technician ON carried_item (technician_id);
