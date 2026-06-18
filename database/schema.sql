CREATE DATABASE IF NOT EXISTS smartleap CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE smartleap;

CREATE TABLE IF NOT EXISTS roles (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    role_id BIGINT UNSIGNED NOT NULL,
    full_name VARCHAR(160) NOT NULL,
    first_name VARCHAR(80) NULL,
    middle_name VARCHAR(80) NULL,
    last_name VARCHAR(80) NULL,
    email VARCHAR(160) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    verification_status VARCHAR(40) NOT NULL DEFAULT 'pending',
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    is_disabled TINYINT(1) NOT NULL DEFAULT 0,
    last_login_at DATETIME NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles(id)
);

CREATE TABLE IF NOT EXISTS account_verification_codes (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    challenge_type VARCHAR(40) NOT NULL DEFAULT 'account_activation',
    code_hash VARCHAR(255) NOT NULL,
    attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
    expires_at DATETIME NOT NULL,
    consumed_at DATETIME NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_account_verification_codes_user FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS barangays (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(120) NOT NULL UNIQUE,
    district VARCHAR(120) NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS staff_profiles (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL UNIQUE,
    contact_number VARCHAR(40) NULL,
    position_title VARCHAR(120) NULL,
    signature_file_path VARCHAR(255) NULL,
    signature_original_name VARCHAR(255) NULL,
    signature_mime_type VARCHAR(120) NULL,
    signature_file_size BIGINT UNSIGNED NULL,
    signature_uploaded_at DATETIME NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'active',
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_staff_profiles_user FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS staff_barangay_assignments (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    staff_profile_id BIGINT UNSIGNED NOT NULL,
    barangay_id BIGINT UNSIGNED NOT NULL,
    assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ended_at DATETIME NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_assignments_staff FOREIGN KEY (staff_profile_id) REFERENCES staff_profiles(id),
    CONSTRAINT fk_assignments_barangay FOREIGN KEY (barangay_id) REFERENCES barangays(id)
);

CREATE TABLE IF NOT EXISTS applicant_profiles (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL UNIQUE,
    barangay_id BIGINT UNSIGNED NULL,
    contact_number VARCHAR(40) NULL,
    business_name VARCHAR(160) NULL,
    address_line TEXT NULL,
    birthdate DATE NULL,
    age TINYINT UNSIGNED NULL,
    gender VARCHAR(40) NULL,
    is_4ps TINYINT(1) NOT NULL DEFAULT 0,
    household_size SMALLINT UNSIGNED NULL,
    educational_attainment VARCHAR(80) NULL,
    batch_no VARCHAR(40) NULL,
    required_training_seminars TINYINT UNSIGNED NOT NULL DEFAULT 3,
    sector VARCHAR(120) NULL,
    sector_other_specify VARCHAR(160) NULL,
    livelihood_category VARCHAR(120) NULL,
    livelihood_type VARCHAR(160) NULL,
    profile_status VARCHAR(40) NOT NULL DEFAULT 'incomplete',
    completion_submitted_at DATETIME NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_applicant_profiles_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT fk_applicant_profiles_barangay FOREIGN KEY (barangay_id) REFERENCES barangays(id)
);

CREATE TABLE IF NOT EXISTS beneficiary_profiles (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL UNIQUE,
    applicant_profile_id BIGINT UNSIGNED NULL,
    assigned_staff_profile_id BIGINT UNSIGNED NULL,
    beneficiary_status VARCHAR(40) NOT NULL DEFAULT 'active',
    approval_date DATE NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_beneficiary_profiles_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT fk_beneficiary_profiles_applicant FOREIGN KEY (applicant_profile_id) REFERENCES applicant_profiles(id),
    CONSTRAINT fk_beneficiary_profiles_staff FOREIGN KEY (assigned_staff_profile_id) REFERENCES staff_profiles(id)
);

CREATE TABLE IF NOT EXISTS beneficiary_feedback (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    beneficiary_profile_id BIGINT UNSIGNED NOT NULL,
    submitted_by_user_id BIGINT UNSIGNED NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_beneficiary_feedback_profile FOREIGN KEY (beneficiary_profile_id) REFERENCES beneficiary_profiles(id),
    CONSTRAINT fk_beneficiary_feedback_user FOREIGN KEY (submitted_by_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS user_profile_photos (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL UNIQUE,
    mime_type VARCHAR(120) NOT NULL,
    image_data MEDIUMTEXT NOT NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_user_profile_photos_user FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS applications (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    applicant_profile_id BIGINT UNSIGNED NOT NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'draft',
    submitted_at DATETIME NULL,
    reviewed_at DATETIME NULL,
    assigned_staff_profile_id BIGINT UNSIGNED NULL,
    notes TEXT NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_applications_applicant FOREIGN KEY (applicant_profile_id) REFERENCES applicant_profiles(id),
    CONSTRAINT fk_applications_staff FOREIGN KEY (assigned_staff_profile_id) REFERENCES staff_profiles(id)
);

CREATE TABLE IF NOT EXISTS application_comments (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    application_id BIGINT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    comment_text TEXT NOT NULL,
    visibility VARCHAR(40) NOT NULL DEFAULT 'internal',
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_application_comments_application FOREIGN KEY (application_id) REFERENCES applications(id),
    CONSTRAINT fk_application_comments_user FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS application_status_history (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    application_id BIGINT UNSIGNED NOT NULL,
    changed_by_user_id BIGINT UNSIGNED NOT NULL,
    from_status VARCHAR(40) NULL,
    to_status VARCHAR(40) NOT NULL,
    remarks TEXT NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_application_status_history_application FOREIGN KEY (application_id) REFERENCES applications(id),
    CONSTRAINT fk_application_status_history_user FOREIGN KEY (changed_by_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS application_assessments (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    application_id BIGINT UNSIGNED NOT NULL,
    assessor_user_id BIGINT UNSIGNED NOT NULL,
    assessor_staff_profile_id BIGINT UNSIGNED NULL,
    identity_residency_status VARCHAR(40) NOT NULL,
    document_validity_status VARCHAR(40) NOT NULL,
    livelihood_confirmation_status VARCHAR(40) NOT NULL,
    program_fit_status VARCHAR(40) NOT NULL,
    readiness_commitment_status VARCHAR(40) NOT NULL,
    recommendation VARCHAR(40) NOT NULL,
    remarks TEXT NOT NULL,
    direct_worker_user_id BIGINT UNSIGNED NULL,
    direct_worker_name VARCHAR(160) NULL,
    certifying_officer_user_id BIGINT UNSIGNED NULL,
    certifying_officer_name VARCHAR(160) NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_application_assessments_application FOREIGN KEY (application_id) REFERENCES applications(id),
    CONSTRAINT fk_application_assessments_assessor_user FOREIGN KEY (assessor_user_id) REFERENCES users(id),
    CONSTRAINT fk_application_assessments_assessor_staff FOREIGN KEY (assessor_staff_profile_id) REFERENCES staff_profiles(id),
    CONSTRAINT fk_application_assessments_direct_worker FOREIGN KEY (direct_worker_user_id) REFERENCES users(id),
    CONSTRAINT fk_application_assessments_certifying_officer FOREIGN KEY (certifying_officer_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS initial_requirement_types (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(80) NOT NULL UNIQUE,
    label VARCHAR(140) NOT NULL,
    description TEXT NULL,
    is_required TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS initial_requirement_files (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    application_id BIGINT UNSIGNED NOT NULL,
    requirement_type_id BIGINT UNSIGNED NOT NULL,
    file_path VARCHAR(255) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(120) NULL,
    file_size BIGINT UNSIGNED NULL,
    review_status VARCHAR(40) NOT NULL DEFAULT 'pending',
    reviewer_remarks TEXT NULL,
    reviewed_by_user_id BIGINT UNSIGNED NULL,
    reviewed_at DATETIME NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_requirement_files_application FOREIGN KEY (application_id) REFERENCES applications(id),
    CONSTRAINT fk_requirement_files_type FOREIGN KEY (requirement_type_id) REFERENCES initial_requirement_types(id),
    CONSTRAINT fk_requirement_files_reviewed_by FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS training_programs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(180) NOT NULL,
    description TEXT NULL,
    venue VARCHAR(180) NULL,
    speaker VARCHAR(180) NULL,
    starts_at DATETIME NULL,
    ends_at DATETIME NULL,
    what_to_bring TEXT NULL,
    instructions TEXT NULL,
    training_scope_mode VARCHAR(20) NOT NULL DEFAULT 'batch',
    batch_group_count TINYINT UNSIGNED NOT NULL DEFAULT 3,
    batch_group_size SMALLINT UNSIGNED NOT NULL DEFAULT 85,
    seminar_form_codes JSON NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'scheduled',
    created_by_user_id BIGINT UNSIGNED NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_training_programs_user FOREIGN KEY (created_by_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS training_invitees (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    training_program_id BIGINT UNSIGNED NOT NULL,
    applicant_profile_id BIGINT UNSIGNED NOT NULL,
    beneficiary_profile_id BIGINT UNSIGNED NULL,
    invite_status VARCHAR(40) NOT NULL DEFAULT 'Scheduled',
    remarks TEXT NULL,
    notified_at DATETIME NULL,
    last_notice_sent_at DATETIME NULL,
    updated_by_user_id BIGINT UNSIGNED NULL,
    post_approval_unlocked_at DATETIME NULL,
    batch_group_number TINYINT UNSIGNED NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_training_invitees_program FOREIGN KEY (training_program_id) REFERENCES training_programs(id),
    CONSTRAINT fk_training_invitees_applicant FOREIGN KEY (applicant_profile_id) REFERENCES applicant_profiles(id),
    CONSTRAINT fk_training_invitees_beneficiary FOREIGN KEY (beneficiary_profile_id) REFERENCES beneficiary_profiles(id),
    CONSTRAINT fk_training_invitees_updated_by FOREIGN KEY (updated_by_user_id) REFERENCES users(id),
    UNIQUE KEY uq_training_invitee_program_applicant (training_program_id, applicant_profile_id)
);

CREATE TABLE IF NOT EXISTS attendance_records (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    training_invitee_id BIGINT UNSIGNED NOT NULL,
    training_program_id BIGINT UNSIGNED NOT NULL,
    applicant_profile_id BIGINT UNSIGNED NOT NULL,
    beneficiary_profile_id BIGINT UNSIGNED NULL,
    attendance_status VARCHAR(40) NOT NULL DEFAULT 'Scheduled',
    remarks TEXT NULL,
    proof_file_path VARCHAR(255) NULL,
    proof_original_name VARCHAR(255) NULL,
    proof_mime_type VARCHAR(120) NULL,
    proof_file_size BIGINT UNSIGNED NULL,
    recorded_by_user_id BIGINT UNSIGNED NULL,
    checked_in_at DATETIME NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_attendance_records_invitee FOREIGN KEY (training_invitee_id) REFERENCES training_invitees(id),
    CONSTRAINT fk_attendance_records_program FOREIGN KEY (training_program_id) REFERENCES training_programs(id),
    CONSTRAINT fk_attendance_records_applicant FOREIGN KEY (applicant_profile_id) REFERENCES applicant_profiles(id),
    CONSTRAINT fk_attendance_records_beneficiary FOREIGN KEY (beneficiary_profile_id) REFERENCES beneficiary_profiles(id),
    CONSTRAINT fk_attendance_records_user FOREIGN KEY (recorded_by_user_id) REFERENCES users(id),
    UNIQUE KEY uq_attendance_records_invitee (training_invitee_id)
);

CREATE TABLE IF NOT EXISTS post_approval_task_types (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(80) NOT NULL UNIQUE,
    label VARCHAR(140) NOT NULL,
    description TEXT NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS post_approval_tasks (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    beneficiary_profile_id BIGINT UNSIGNED NOT NULL,
    task_type_id BIGINT UNSIGNED NOT NULL,
    due_date DATE NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'Unlocked',
    form_payload JSON NULL,
    applicant_started_at DATETIME NULL,
    applicant_submitted_at DATETIME NULL,
    reviewed_by_user_id BIGINT UNSIGNED NULL,
    reviewed_at DATETIME NULL,
    reviewer_remarks TEXT NULL,
    assigned_by_user_id BIGINT UNSIGNED NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_post_approval_tasks_beneficiary FOREIGN KEY (beneficiary_profile_id) REFERENCES beneficiary_profiles(id),
    CONSTRAINT fk_post_approval_tasks_type FOREIGN KEY (task_type_id) REFERENCES post_approval_task_types(id),
    CONSTRAINT fk_post_approval_tasks_user FOREIGN KEY (assigned_by_user_id) REFERENCES users(id),
    CONSTRAINT fk_post_approval_tasks_reviewed_by FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id),
    UNIQUE KEY uq_post_approval_tasks_beneficiary_task (beneficiary_profile_id, task_type_id)
);

CREATE TABLE IF NOT EXISTS post_approval_submissions (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    post_approval_task_id BIGINT UNSIGNED NOT NULL,
    submission_kind VARCHAR(40) NOT NULL DEFAULT 'form',
    file_path VARCHAR(255) NULL,
    original_name VARCHAR(255) NULL,
    payload_json JSON NULL,
    submitted_by_user_id BIGINT UNSIGNED NULL,
    review_status VARCHAR(40) NOT NULL DEFAULT 'Submitted',
    reviewer_remarks TEXT NULL,
    reviewed_by_user_id BIGINT UNSIGNED NULL,
    submitted_at DATETIME NULL,
    reviewed_at DATETIME NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_post_approval_submissions_task FOREIGN KEY (post_approval_task_id) REFERENCES post_approval_tasks(id),
    CONSTRAINT fk_post_approval_submissions_submitted_by FOREIGN KEY (submitted_by_user_id) REFERENCES users(id),
    CONSTRAINT fk_post_approval_submissions_reviewed_by FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS repayments (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    beneficiary_profile_id BIGINT UNSIGNED NOT NULL,
    submission_group_id VARCHAR(80) NULL,
    amount DECIMAL(12,2) NOT NULL,
    payment_date DATE NOT NULL,
    official_receipt_number VARCHAR(120) NULL,
    proof_file_path VARCHAR(255) NULL,
    proof_original_name VARCHAR(255) NULL,
    proof_mime_type VARCHAR(120) NULL,
    hard_copy_office_status VARCHAR(40) NOT NULL DEFAULT 'not_submitted',
    status VARCHAR(40) NOT NULL DEFAULT 'submitted',
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_repayments_beneficiary FOREIGN KEY (beneficiary_profile_id) REFERENCES beneficiary_profiles(id)
);

CREATE TABLE IF NOT EXISTS repayment_coverage_months (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    repayment_id BIGINT UNSIGNED NOT NULL,
    coverage_month DATE NOT NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_repayment_coverage_months_repayment FOREIGN KEY (repayment_id) REFERENCES repayments(id)
);

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

CREATE TABLE IF NOT EXISTS repayment_verifications (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    repayment_id BIGINT UNSIGNED NOT NULL,
    verified_by_user_id BIGINT UNSIGNED NULL,
    verification_status VARCHAR(40) NOT NULL DEFAULT 'pending',
    remarks TEXT NULL,
    verified_at DATETIME NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_repayment_verifications_repayment FOREIGN KEY (repayment_id) REFERENCES repayments(id),
    CONSTRAINT fk_repayment_verifications_user FOREIGN KEY (verified_by_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS repayment_status_history (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    repayment_id BIGINT UNSIGNED NOT NULL,
    changed_by_user_id BIGINT UNSIGNED NOT NULL,
    from_status VARCHAR(40) NULL,
    to_status VARCHAR(40) NOT NULL,
    remarks TEXT NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_repayment_status_history_repayment FOREIGN KEY (repayment_id) REFERENCES repayments(id),
    CONSTRAINT fk_repayment_status_history_user FOREIGN KEY (changed_by_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS notifications (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    channel VARCHAR(40) NOT NULL DEFAULT 'in_app',
    title VARCHAR(180) NOT NULL,
    message TEXT NOT NULL,
    is_read TINYINT(1) NOT NULL DEFAULT 0,
    sent_at DATETIME NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS support_chat_messages (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    participant_user_id BIGINT UNSIGNED NOT NULL,
    sender_user_id BIGINT UNSIGNED NOT NULL,
    recipient_role VARCHAR(80) NOT NULL,
    body TEXT NOT NULL,
    is_read TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_support_chat_participant_role (participant_user_id, recipient_role),
    INDEX idx_support_chat_sender (sender_user_id),
    CONSTRAINT fk_support_chat_participant FOREIGN KEY (participant_user_id) REFERENCES users(id),
    CONSTRAINT fk_support_chat_sender FOREIGN KEY (sender_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS support_tickets (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    ticket_no VARCHAR(30) NOT NULL UNIQUE,
    requester_user_id BIGINT UNSIGNED NOT NULL,
    requester_role VARCHAR(50) NOT NULL,
    category VARCHAR(80) NOT NULL,
    subject VARCHAR(180) NOT NULL,
    message TEXT NOT NULL,
    related_record_type VARCHAR(80) NULL,
    related_record_id VARCHAR(80) NULL,
    assigned_role VARCHAR(50) NOT NULL,
    assigned_user_id BIGINT UNSIGNED NULL,
    priority ENUM('Low','Normal','Urgent') NOT NULL DEFAULT 'Normal',
    status ENUM('New','In Review','Waiting for Beneficiary','Referred','Resolved','Closed') NOT NULL DEFAULT 'New',
    unread_for_requester TINYINT(1) NOT NULL DEFAULT 0,
    unread_for_staff TINYINT(1) NOT NULL DEFAULT 1,
    last_message_at DATETIME NULL,
    resolved_at DATETIME NULL,
    closed_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_support_tickets_requester (requester_user_id),
    INDEX idx_support_tickets_assigned_role (assigned_role),
    INDEX idx_support_tickets_assigned_user (assigned_user_id),
    INDEX idx_support_tickets_category (category),
    INDEX idx_support_tickets_status (status),
    INDEX idx_support_tickets_priority (priority),
    INDEX idx_support_tickets_created (created_at),
    INDEX idx_support_tickets_last_message (last_message_at),
    CONSTRAINT fk_support_tickets_requester FOREIGN KEY (requester_user_id) REFERENCES users(id),
    CONSTRAINT fk_support_tickets_assigned_user FOREIGN KEY (assigned_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS support_ticket_messages (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    ticket_id BIGINT UNSIGNED NOT NULL,
    sender_user_id BIGINT UNSIGNED NOT NULL,
    sender_role VARCHAR(50) NOT NULL,
    sender_type ENUM('Beneficiary','Applicant','Social Worker','PDO','Admin','System') NOT NULL,
    message TEXT NOT NULL,
    is_internal TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_support_messages_ticket (ticket_id),
    INDEX idx_support_messages_sender (sender_user_id),
    INDEX idx_support_messages_sender_role (sender_role),
    INDEX idx_support_messages_internal (is_internal),
    INDEX idx_support_messages_created (created_at),
    CONSTRAINT fk_support_messages_ticket FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE,
    CONSTRAINT fk_support_messages_sender FOREIGN KEY (sender_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS support_ticket_attachments (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    ticket_id BIGINT UNSIGNED NOT NULL,
    message_id BIGINT UNSIGNED NULL,
    uploaded_by_user_id BIGINT UNSIGNED NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    stored_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    mime_type VARCHAR(120) NOT NULL,
    file_size INT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_support_attachments_ticket (ticket_id),
    INDEX idx_support_attachments_message (message_id),
    INDEX idx_support_attachments_user (uploaded_by_user_id),
    INDEX idx_support_attachments_created (created_at),
    CONSTRAINT fk_support_attachments_ticket FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE,
    CONSTRAINT fk_support_attachments_message FOREIGN KEY (message_id) REFERENCES support_ticket_messages(id) ON DELETE SET NULL,
    CONSTRAINT fk_support_attachments_user FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS support_ticket_activity_logs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    ticket_id BIGINT UNSIGNED NOT NULL,
    actor_user_id BIGINT UNSIGNED NULL,
    actor_role VARCHAR(50) NULL,
    action VARCHAR(120) NOT NULL,
    old_value VARCHAR(255) NULL,
    new_value VARCHAR(255) NULL,
    note TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_support_activity_ticket (ticket_id),
    INDEX idx_support_activity_created (created_at),
    CONSTRAINT fk_support_activity_ticket FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE,
    CONSTRAINT fk_support_activity_actor FOREIGN KEY (actor_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS email_logs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NULL,
    recipient_email VARCHAR(160) NOT NULL,
    subject VARCHAR(180) NOT NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'queued',
    provider_message_id VARCHAR(191) NULL,
    error_message TEXT NULL,
    sent_at DATETIME NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_email_logs_user FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NULL,
    action VARCHAR(120) NOT NULL,
    entity_type VARCHAR(120) NULL,
    entity_id BIGINT NULL,
    details JSON NULL,
    ip_address VARCHAR(64) NULL,
    user_agent TEXT NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_audit_logs_user FOREIGN KEY (user_id) REFERENCES users(id)
);
