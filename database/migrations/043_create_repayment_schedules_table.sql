CREATE TABLE IF NOT EXISTS repayment_schedules (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    beneficiary_profile_id BIGINT UNSIGNED NOT NULL,
    coverage_month DATE NOT NULL,
    due_date DATE NOT NULL,
    expected_amount DECIMAL(12,2) NOT NULL DEFAULT 625.00,
    schedule_status VARCHAR(40) NOT NULL DEFAULT 'scheduled',
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_repayment_schedules_beneficiary FOREIGN KEY (beneficiary_profile_id) REFERENCES beneficiary_profiles(id),
    UNIQUE KEY uq_repayment_schedules_beneficiary_month (beneficiary_profile_id, coverage_month),
    KEY idx_repayment_schedules_due_date (due_date),
    KEY idx_repayment_schedules_status (schedule_status)
);
