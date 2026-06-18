ALTER TABLE initial_requirement_files
    ADD COLUMN reviewer_remarks TEXT NULL AFTER review_status,
    ADD COLUMN reviewed_by_user_id BIGINT UNSIGNED NULL AFTER reviewer_remarks,
    ADD COLUMN reviewed_at DATETIME NULL AFTER reviewed_by_user_id,
    ADD CONSTRAINT fk_requirement_files_reviewed_by FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id);

ALTER TABLE training_programs
    ADD COLUMN speaker VARCHAR(180) NULL AFTER venue;
