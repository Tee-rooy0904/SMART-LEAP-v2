USE smartleap;

ALTER TABLE post_approval_tasks
    MODIFY COLUMN status VARCHAR(40) NOT NULL DEFAULT 'Unlocked',
    ADD COLUMN form_payload JSON NULL AFTER status,
    ADD COLUMN applicant_started_at DATETIME NULL AFTER form_payload,
    ADD COLUMN applicant_submitted_at DATETIME NULL AFTER applicant_started_at,
    ADD COLUMN reviewed_by_user_id BIGINT UNSIGNED NULL AFTER applicant_submitted_at,
    ADD COLUMN reviewed_at DATETIME NULL AFTER reviewed_by_user_id,
    ADD COLUMN reviewer_remarks TEXT NULL AFTER reviewed_at,
    ADD CONSTRAINT fk_post_approval_tasks_reviewed_by FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id);

UPDATE post_approval_tasks
SET status = 'Unlocked'
WHERE LOWER(status) = 'pending';

ALTER TABLE post_approval_submissions
    MODIFY COLUMN file_path VARCHAR(255) NULL,
    MODIFY COLUMN original_name VARCHAR(255) NULL,
    MODIFY COLUMN review_status VARCHAR(40) NOT NULL DEFAULT 'Submitted',
    ADD COLUMN submission_kind VARCHAR(40) NOT NULL DEFAULT 'form' AFTER post_approval_task_id,
    ADD COLUMN payload_json JSON NULL AFTER original_name,
    ADD COLUMN submitted_by_user_id BIGINT UNSIGNED NULL AFTER payload_json,
    ADD COLUMN reviewer_remarks TEXT NULL AFTER review_status,
    ADD COLUMN reviewed_by_user_id BIGINT UNSIGNED NULL AFTER reviewer_remarks,
    ADD COLUMN submitted_at DATETIME NULL AFTER reviewed_by_user_id,
    ADD COLUMN reviewed_at DATETIME NULL AFTER submitted_at,
    ADD CONSTRAINT fk_post_approval_submissions_submitted_by FOREIGN KEY (submitted_by_user_id) REFERENCES users(id),
    ADD CONSTRAINT fk_post_approval_submissions_reviewed_by FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id);
