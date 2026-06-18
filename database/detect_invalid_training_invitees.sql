USE smartleap;

SELECT
    training_invitees.id AS training_invitee_id,
    training_invitees.training_program_id,
    training_programs.title AS training_program_title,
    training_invitees.applicant_profile_id,
    users.full_name AS applicant_name,
    latest_applications.application_id AS latest_application_id,
    latest_applications.assigned_staff_profile_id,
    latest_applications.assigned_pdo_name,
    required_requirements.required_total,
    requirement_audit.passing_requirement_count,
    requirement_audit.missing_requirement_count,
    requirement_audit.non_approved_requirement_count,
    requirement_audit.wrong_reviewer_count
FROM training_invitees
INNER JOIN training_programs ON training_programs.id = training_invitees.training_program_id
INNER JOIN applicant_profiles ON applicant_profiles.id = training_invitees.applicant_profile_id
INNER JOIN users ON users.id = applicant_profiles.user_id
LEFT JOIN (
    SELECT
        applications.applicant_profile_id,
        applications.id AS application_id,
        applications.status AS application_status,
        applications.assigned_staff_profile_id,
        assigned_users.id AS assigned_pdo_user_id,
        assigned_users.full_name AS assigned_pdo_name
    FROM applications
    INNER JOIN (
        SELECT MAX(id) AS latest_application_id
        FROM applications
        GROUP BY applicant_profile_id
    ) AS latest ON latest.latest_application_id = applications.id
    LEFT JOIN staff_profiles AS assigned_staff ON assigned_staff.id = applications.assigned_staff_profile_id
    LEFT JOIN users AS assigned_users ON assigned_users.id = assigned_staff.user_id
) AS latest_applications ON latest_applications.applicant_profile_id = training_invitees.applicant_profile_id
CROSS JOIN (
    SELECT COUNT(*) AS required_total
    FROM initial_requirement_types
    WHERE is_required = 1
) AS required_requirements
LEFT JOIN (
    SELECT
        audit.application_id,
        COUNT(*) AS audited_requirement_total,
        SUM(CASE WHEN audit.file_present = 0 THEN 1 ELSE 0 END) AS missing_requirement_count,
        SUM(CASE WHEN audit.file_present = 1 AND audit.status_ok = 0 THEN 1 ELSE 0 END) AS non_approved_requirement_count,
        SUM(CASE WHEN audit.file_present = 1 AND audit.status_ok = 1 AND audit.reviewer_ok = 0 THEN 1 ELSE 0 END) AS wrong_reviewer_count,
        SUM(CASE WHEN audit.file_present = 1 AND audit.status_ok = 1 AND audit.reviewer_ok = 1 THEN 1 ELSE 0 END) AS passing_requirement_count
    FROM (
        SELECT
            applications.id AS application_id,
            requirement_types.id AS requirement_type_id,
            CASE
                WHEN latest_files.file_path IS NOT NULL AND TRIM(latest_files.file_path) <> '' THEN 1
                ELSE 0
            END AS file_present,
            CASE
                WHEN LOWER(TRIM(COALESCE(latest_files.review_status, ''))) IN ('verified', 'approved') THEN 1
                ELSE 0
            END AS status_ok,
            CASE
                WHEN latest_files.reviewed_by_user_id IS NOT NULL
                     AND latest_files.reviewed_by_user_id = assigned_users.id THEN 1
                ELSE 0
            END AS reviewer_ok
        FROM applications
        INNER JOIN (
            SELECT MAX(id) AS latest_application_id
            FROM applications
            GROUP BY applicant_profile_id
        ) AS latest ON latest.latest_application_id = applications.id
        CROSS JOIN (
            SELECT id
            FROM initial_requirement_types
            WHERE is_required = 1
        ) AS requirement_types
        LEFT JOIN (
            SELECT requirement_files.application_id,
                   requirement_files.requirement_type_id,
                   requirement_files.file_path,
                   requirement_files.review_status,
                   requirement_files.reviewed_by_user_id
            FROM initial_requirement_files AS requirement_files
            INNER JOIN (
                SELECT application_id, requirement_type_id, MAX(id) AS latest_file_id
                FROM initial_requirement_files
                GROUP BY application_id, requirement_type_id
            ) AS latest_requirement_files
                ON latest_requirement_files.latest_file_id = requirement_files.id
        ) AS latest_files
            ON latest_files.application_id = applications.id
           AND latest_files.requirement_type_id = requirement_types.id
        LEFT JOIN staff_profiles AS assigned_staff ON assigned_staff.id = applications.assigned_staff_profile_id
        LEFT JOIN users AS assigned_users ON assigned_users.id = assigned_staff.user_id
    ) AS audit
    GROUP BY audit.application_id
) AS requirement_audit ON requirement_audit.application_id = latest_applications.application_id
WHERE latest_applications.application_id IS NULL
   OR latest_applications.assigned_staff_profile_id IS NULL
   OR COALESCE(requirement_audit.passing_requirement_count, 0) <> required_requirements.required_total
   OR COALESCE(requirement_audit.missing_requirement_count, 0) > 0
   OR COALESCE(requirement_audit.non_approved_requirement_count, 0) > 0
   OR COALESCE(requirement_audit.wrong_reviewer_count, 0) > 0
ORDER BY training_invitees.id ASC;
