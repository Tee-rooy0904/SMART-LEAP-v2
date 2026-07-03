USE smartleap;

ALTER TABLE training_programs
    ADD COLUMN training_scope_mode VARCHAR(20) NOT NULL DEFAULT 'all' AFTER instructions,
    ADD COLUMN batch_group_count TINYINT UNSIGNED NOT NULL DEFAULT 3 AFTER training_scope_mode,
    ADD COLUMN batch_group_size SMALLINT UNSIGNED NOT NULL DEFAULT 85 AFTER batch_group_count;

ALTER TABLE training_invitees
    ADD COLUMN batch_group_number TINYINT UNSIGNED NULL AFTER post_approval_unlocked_at;

ALTER TABLE attendance_records
    ADD COLUMN proof_file_path VARCHAR(255) NULL AFTER remarks,
    ADD COLUMN proof_original_name VARCHAR(255) NULL AFTER proof_file_path,
    ADD COLUMN proof_mime_type VARCHAR(120) NULL AFTER proof_original_name,
    ADD COLUMN proof_file_size BIGINT UNSIGNED NULL AFTER proof_mime_type;

