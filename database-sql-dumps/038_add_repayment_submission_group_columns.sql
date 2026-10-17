ALTER TABLE repayments
    ADD COLUMN submission_group_id VARCHAR(80) NULL AFTER beneficiary_profile_id,
    ADD COLUMN proof_original_name VARCHAR(255) NULL AFTER proof_file_path,
    ADD COLUMN proof_mime_type VARCHAR(120) NULL AFTER proof_original_name;
