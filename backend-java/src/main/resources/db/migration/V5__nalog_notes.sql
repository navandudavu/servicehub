-- Free-text notes on a nalog (what was found, what the customer said, why it was cancelled...).
-- Append-only by design: there is no UPDATE path, so the record of who wrote what and when stays honest.
-- A mistake is corrected with a newer note; only an admin can delete a note.
CREATE TABLE nalog_note (
    id           BIGSERIAL PRIMARY KEY,
    nalog_id     BIGINT        NOT NULL REFERENCES nalog (id) ON DELETE CASCADE,
    author_id    BIGINT,
    author_name  VARCHAR(150)  NOT NULL,
    body         VARCHAR(2000) NOT NULL CHECK (length(btrim(body)) > 0),
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX idx_nalog_note_nalog ON nalog_note (nalog_id, created_at, id);
