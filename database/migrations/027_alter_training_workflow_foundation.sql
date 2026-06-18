USE smartleap;

ALTER TABLE training_programs
    ADD COLUMN what_to_bring TEXT NULL AFTER ends_at,
    ADD COLUMN instructions TEXT NULL AFTER what_to_bring;

ALTER TABLE training_invitees
    ADD COLUMN applicant_profile_id BIGINT UNSIGNED NULL AFTER training_program_id,
    MODIFY COLUMN beneficiary_profile_id BIGINT UNSIGNED NULL,
    MODIFY COLUMN invite_status VARCHAR(40) NOT NULL DEFAULT 'Scheduled',
    ADD COLUMN remarks TEXT NULL AFTER invite_status,
    ADD COLUMN notified_at DATETIME NULL AFTER remarks,
    ADD COLUMN last_notice_sent_at DATETIME NULL AFTER notified_at,
    ADD COLUMN updated_by_user_id BIGINT UNSIGNED NULL AFTER last_notice_sent_at,
    ADD COLUMN post_approval_unlocked_at DATETIME NULL AFTER updated_by_user_id,
    ADD CONSTRAINT fk_training_invitees_applicant FOREIGN KEY (applicant_profile_id) REFERENCES applicant_profiles(id),
    ADD CONSTRAINT fk_training_invitees_updated_by FOREIGN KEY (updated_by_user_id) REFERENCES users(id),
    ADD UNIQUE KEY uq_training_invitee_program_applicant (training_program_id, applicant_profile_id);

UPDATE training_invitees
INNER JOIN beneficiary_profiles ON beneficiary_profiles.id = training_invitees.beneficiary_profile_id
SET training_invitees.applicant_profile_id = beneficiary_profiles.applicant_profile_id
WHERE training_invitees.applicant_profile_id IS NULL;

ALTER TABLE training_invitees
    MODIFY COLUMN applicant_profile_id BIGINT UNSIGNED NOT NULL;

ALTER TABLE attendance_records
    ADD COLUMN training_invitee_id BIGINT UNSIGNED NULL AFTER id,
    ADD COLUMN applicant_profile_id BIGINT UNSIGNED NULL AFTER training_program_id,
    MODIFY COLUMN beneficiary_profile_id BIGINT UNSIGNED NULL,
    MODIFY COLUMN attendance_status VARCHAR(40) NOT NULL DEFAULT 'Scheduled',
    ADD COLUMN remarks TEXT NULL AFTER attendance_status,
    ADD COLUMN recorded_by_user_id BIGINT UNSIGNED NULL AFTER remarks,
    ADD CONSTRAINT fk_attendance_records_invitee FOREIGN KEY (training_invitee_id) REFERENCES training_invitees(id),
    ADD CONSTRAINT fk_attendance_records_applicant FOREIGN KEY (applicant_profile_id) REFERENCES applicant_profiles(id),
    ADD CONSTRAINT fk_attendance_records_user FOREIGN KEY (recorded_by_user_id) REFERENCES users(id),
    ADD UNIQUE KEY uq_attendance_records_invitee (training_invitee_id);

UPDATE attendance_records
INNER JOIN training_invitees
    ON training_invitees.training_program_id = attendance_records.training_program_id
    AND (
        (attendance_records.beneficiary_profile_id IS NOT NULL AND training_invitees.beneficiary_profile_id = attendance_records.beneficiary_profile_id)
        OR (attendance_records.beneficiary_profile_id IS NULL AND training_invitees.applicant_profile_id IS NOT NULL)
    )
SET
    attendance_records.training_invitee_id = training_invitees.id,
    attendance_records.applicant_profile_id = training_invitees.applicant_profile_id
WHERE attendance_records.training_invitee_id IS NULL;

ALTER TABLE attendance_records
    MODIFY COLUMN training_invitee_id BIGINT UNSIGNED NOT NULL,
    MODIFY COLUMN applicant_profile_id BIGINT UNSIGNED NOT NULL;

ALTER TABLE post_approval_tasks
    ADD UNIQUE KEY uq_post_approval_tasks_beneficiary_task (beneficiary_profile_id, task_type_id);
