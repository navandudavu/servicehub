-- Photos attached to a nalog. The image bytes live on disk (NALOG_PHOTOS_DIR); the row is the index.
CREATE TABLE nalog_photo (
    id               BIGSERIAL PRIMARY KEY,
    nalog_id         BIGINT       NOT NULL REFERENCES nalog (id) ON DELETE CASCADE,
    filename         VARCHAR(80)  NOT NULL UNIQUE,          -- server-generated UUID + extension, never the client's name
    original_name    VARCHAR(255),
    caption          VARCHAR(255),
    category         VARCHAR(10)  NOT NULL DEFAULT 'other' CHECK (category IN ('before', 'after', 'label', 'other')),
    content_type     VARCHAR(30)  NOT NULL,
    size_bytes       BIGINT       NOT NULL CHECK (size_bytes > 0),
    uploaded_by_id   BIGINT,
    uploaded_by_name VARCHAR(150),
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_nalog_photo_nalog ON nalog_photo (nalog_id, id);
