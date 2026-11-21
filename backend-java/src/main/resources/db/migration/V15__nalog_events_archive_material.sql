-- Complete change log of a nalog (who did what, when). Status changes stay in nalog_status_history; the timeline merges both.
CREATE TABLE nalog_event (
    id           BIGSERIAL     PRIMARY KEY,
    nalog_id     BIGINT        NOT NULL REFERENCES nalog (id) ON DELETE CASCADE,
    happened_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
    actor_id     BIGINT,
    actor_name   VARCHAR(150),
    kind         VARCHAR(20)   NOT NULL,
    detail       VARCHAR(600)
);
CREATE INDEX idx_nalog_event_nalog ON nalog_event (nalog_id, happened_at);

-- A technician a nalog was taken away from keeps READ-ONLY access to it (the "archive").
CREATE TABLE nalog_past_assignee (
    nalog_id  BIGINT NOT NULL REFERENCES nalog (id) ON DELETE CASCADE,
    user_id   BIGINT NOT NULL REFERENCES app_user (id),
    PRIMARY KEY (nalog_id, user_id)
);

-- Material used on a nalog is an automatic Razduzenje document; this links the document to its nalog.
-- Documents are never deleted, so deleting a nalog only detaches them.
ALTER TABLE stock_doc ADD COLUMN nalog_id BIGINT REFERENCES nalog (id) ON DELETE SET NULL;
CREATE INDEX idx_stock_doc_nalog ON stock_doc (nalog_id);
