ALTER TABLE applicant_profiles
    ADD COLUMN required_training_seminars TINYINT UNSIGNED NOT NULL DEFAULT 3
    AFTER household_size;

UPDATE applicant_profiles
SET required_training_seminars = 3
WHERE required_training_seminars IS NULL OR required_training_seminars = 0;

UPDATE applicant_profiles
INNER JOIN users ON users.id = applicant_profiles.user_id
SET applicant_profiles.required_training_seminars = 1
WHERE LOWER(TRIM(users.full_name)) = 'john paul reformado';
