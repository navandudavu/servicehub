-- New working statuses (preuzet u servis, testira se, vozi se, potreban elektronicar) and the "manager" role.
ALTER TABLE nalog DROP CONSTRAINT IF EXISTS chk_nalog_status;
ALTER TABLE nalog ADD CONSTRAINT chk_nalog_status CHECK (status IN
    ('DRAFT','DISPATCHED','IN_PROGRESS','AWAITING_PARTS','RECEIVED','TESTING','DRIVING','NEEDS_ELECTRICIAN','COMPLETED','CANCELLED'));

ALTER TABLE nalog_status_history DROP CONSTRAINT IF EXISTS chk_hist_to;
ALTER TABLE nalog_status_history DROP CONSTRAINT IF EXISTS chk_hist_from;
ALTER TABLE nalog_status_history ADD CONSTRAINT chk_hist_to CHECK (to_status IN
    ('DRAFT','DISPATCHED','IN_PROGRESS','AWAITING_PARTS','RECEIVED','TESTING','DRIVING','NEEDS_ELECTRICIAN','COMPLETED','CANCELLED'));
ALTER TABLE nalog_status_history ADD CONSTRAINT chk_hist_from CHECK (from_status IS NULL OR from_status IN
    ('DRAFT','DISPATCHED','IN_PROGRESS','AWAITING_PARTS','RECEIVED','TESTING','DRIVING','NEEDS_ELECTRICIAN','COMPLETED','CANCELLED'));

ALTER TABLE app_user DROP CONSTRAINT IF EXISTS app_user_role_check;
ALTER TABLE app_user ADD CONSTRAINT app_user_role_check CHECK (role IN ('admin','manager','technician'));
