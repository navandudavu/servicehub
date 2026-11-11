-- "Izvrseni radovi": what was actually done. Required to close a nalog (checked in NalogService.changeStatus).
ALTER TABLE nalog ADD COLUMN work_done TEXT;

-- Photo category for a picture of the paper work order itself.
ALTER TABLE nalog_photo DROP CONSTRAINT IF EXISTS nalog_photo_category_check;
ALTER TABLE nalog_photo ADD CONSTRAINT nalog_photo_category_check
    CHECK (category IN ('before', 'after', 'label', 'workorder', 'other'));
