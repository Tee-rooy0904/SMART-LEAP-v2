ALTER TABLE beneficiary_profiles
    ADD COLUMN approved_at DATETIME NULL AFTER approval_date;

ALTER TABLE stage_one_registrations
    ADD COLUMN selection_email_sent_at DATETIME NULL AFTER validated_at,
    ADD COLUMN selection_email_failed_at DATETIME NULL AFTER selection_email_sent_at,
    ADD COLUMN selection_email_error TEXT NULL AFTER selection_email_failed_at;
