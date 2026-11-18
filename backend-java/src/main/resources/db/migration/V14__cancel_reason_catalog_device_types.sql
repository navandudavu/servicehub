-- 1) Cancelled nalozi carry the technician's / admin's reason (mandatory when cancelling, see NalogService.changeStatus).
ALTER TABLE nalog ADD COLUMN cancel_reason VARCHAR(1000);

-- 2) "Izvrseni radovi" is merged into the konstatacije (nalog_note). Old text becomes a note so nothing is lost;
--    the closing rule now asks for at least one konstatacija. nalog_note.body holds 2000 chars, work_done up to 4000.
INSERT INTO nalog_note (nalog_id, author_id, author_name, body, created_at)
SELECT id, NULL, 'Migracija', left(btrim(work_done), 2000), COALESCE(completed_at, updated_at)
FROM nalog
WHERE work_done IS NOT NULL AND length(btrim(work_done)) > 0;

INSERT INTO nalog_note (nalog_id, author_id, author_name, body, created_at)
SELECT id, NULL, 'Migracija', left(substr(btrim(work_done), 2001), 2000), COALESCE(completed_at, updated_at)
FROM nalog
WHERE work_done IS NOT NULL AND length(btrim(work_done)) > 2000
  AND length(btrim(substr(btrim(work_done), 2001))) > 0;

ALTER TABLE nalog DROP COLUMN work_done;

-- 3) Magacin is a plain catalogue (sifra, naziv, jedinica mere): no price, no stock, no ledger.
--    nalog_part_line keeps its own price snapshot, so old nalozi still print as they were.
DROP TABLE stock_movement;
ALTER TABLE parts DROP COLUMN unit_price;
ALTER TABLE parts DROP COLUMN stock_qty;

-- 4) Device types are no longer a closed list. The built-in ones stay as codes in the enum; anything the admin adds
--    is stored here and is written to nalog.appliance_type as its own name.
ALTER TABLE nalog DROP CONSTRAINT IF EXISTS chk_nalog_appliance;
ALTER TABLE nalog ALTER COLUMN appliance_type TYPE VARCHAR(100);

CREATE TABLE appliance_type_custom (
    id          BIGSERIAL     PRIMARY KEY,
    name        VARCHAR(100)  NOT NULL,
    created_by  VARCHAR(150),
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_appliance_type_custom_name ON appliance_type_custom (lower(name));
