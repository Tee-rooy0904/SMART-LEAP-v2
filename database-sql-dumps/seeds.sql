USE smartleap;

INSERT INTO roles (name) VALUES
('Administrator'),
('Project Officer'),
('Social Worker'),
('Applicant'),
('Beneficiary')
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO initial_requirement_types (code, label, description, is_required) VALUES
('valid_id', 'Valid ID', 'Primary government-issued identification.', 1),
('health_certificate', 'Health Certificate', 'Health or sanitary clearance required for applicants.', 1),
('cedula', 'Cedula', 'Community tax certificate.', 1)
ON DUPLICATE KEY UPDATE
label = VALUES(label),
description = VALUES(description),
is_required = VALUES(is_required);

DELETE FROM initial_requirement_types WHERE code = 'business_plan';

INSERT INTO users (role_id, full_name, first_name, middle_name, last_name, email, password_hash, verification_status, is_active, is_disabled) VALUES
((SELECT id FROM roles WHERE name = 'Administrator'), 'System Administrator', 'System', '', 'Administrator', 'admin@smartleap.local', '$2y$12$8ctbT5rIWwyLCRILdZ/buev3PVTrnwOqBgD7aP6ISTLQfDoX4.ls2', 'verified', 1, 0),
((SELECT id FROM roles WHERE name = 'Project Officer'), 'Default Project Officer', 'Default', '', 'Project Officer', 'po@smartleap.local', '$2y$12$TtxkiDcyoSaprcw1rMQETeh2MuttWc8RG5RqExmxzGrm6nEMMUJI2', 'verified', 1, 0),
((SELECT id FROM roles WHERE name = 'Social Worker'), 'Default Social Worker', 'Default', '', 'Social Worker', 'sw@smartleap.local', '$2y$10$0PQuH/rdPjJzMfwBAuRUpuqAXJOPdRuPGtd/IBMaCqsIrM3sDV9xi', 'verified', 1, 0),
((SELECT id FROM roles WHERE name = 'Beneficiary'), 'Default Beneficiary', 'Default', '', 'Beneficiary', 'beneficiary@smartleap.local', '$2y$12$RGvQykk9zdI1o7wLmOLLYuvAaPko/7H/gqWXNimhtfzSssyDrKJKm', 'verified', 1, 0)
ON DUPLICATE KEY UPDATE
role_id = VALUES(role_id),
full_name = VALUES(full_name),
first_name = VALUES(first_name),
middle_name = VALUES(middle_name),
last_name = VALUES(last_name),
password_hash = VALUES(password_hash),
verification_status = VALUES(verification_status),
is_active = VALUES(is_active),
is_disabled = VALUES(is_disabled);

INSERT INTO staff_profiles (user_id, contact_number, position_title, status) VALUES
((SELECT id FROM users WHERE email = 'po@smartleap.local'), '09170000001', 'Project Officer', 'active'),
((SELECT id FROM users WHERE email = 'sw@smartleap.local'), '09170000002', 'Social Worker', 'active')
ON DUPLICATE KEY UPDATE
contact_number = VALUES(contact_number),
position_title = VALUES(position_title),
status = VALUES(status);

INSERT INTO applicant_profiles (
    user_id,
    contact_number,
    business_name,
    address_line,
    birthdate,
    age,
    gender,
    is_4ps,
    household_size,
    sector,
    livelihood_type,
    profile_status,
    completion_submitted_at
) VALUES (
    (SELECT id FROM users WHERE email = 'beneficiary@smartleap.local'),
    '09170000003',
    'Default Sari-sari Store',
    'Purok 1, Butuan City',
    '1995-06-15',
    30,
    'Female',
    0,
    4,
    'Solo Parent',
    'Retail',
    'draft',
    NULL
)
ON DUPLICATE KEY UPDATE
contact_number = VALUES(contact_number),
business_name = VALUES(business_name),
address_line = VALUES(address_line),
birthdate = VALUES(birthdate),
age = VALUES(age),
gender = VALUES(gender),
is_4ps = VALUES(is_4ps),
household_size = VALUES(household_size),
sector = VALUES(sector),
livelihood_type = VALUES(livelihood_type),
profile_status = VALUES(profile_status),
completion_submitted_at = VALUES(completion_submitted_at);

INSERT INTO post_approval_task_types (code, label, description) VALUES
('business_plan', 'Business Plan', 'Post-training business plan requirement.'),
('availment_form', 'SMART LEAP Availment Form', 'Required availment form after training completion.'),
('validation_form', 'SMART LEAP Validation Form', 'Validation form for post-approval compliance.'),
('buhat_sa_pagpanumpa', 'Buhat sa Pagpanumpa', 'Required oath-taking compliance document.'),
('fund_release_evidence', 'Proof of Fund Release', 'Final attachment proving the SMART LEAP fund was released.'),
('seminar_attendance', 'Attendance to seminars/trainings conducted', 'Attendance compliance for required trainings.')
ON DUPLICATE KEY UPDATE
label = VALUES(label),
description = VALUES(description);
