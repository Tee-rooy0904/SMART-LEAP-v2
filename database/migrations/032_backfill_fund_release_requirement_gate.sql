-- Backfill the final proof-of-fund-release requirement and align current roles/statuses
-- with the new rule: a user remains an applicant until the fund release evidence task
-- is verified by staff.

INSERT INTO post_approval_task_types (code, label, description)
VALUES ('fund_release_evidence', 'Proof of Fund Release', 'Final attachment proving the SMART LEAP fund was released.')
ON DUPLICATE KEY UPDATE
    label = VALUES(label),
    description = VALUES(description),
    updated_at = CURRENT_TIMESTAMP;

INSERT INTO post_approval_tasks (beneficiary_profile_id, task_type_id, status, assigned_by_user_id)
SELECT
    beneficiary_profiles.id,
    final_type.id,
    'Locked',
    NULL
FROM beneficiary_profiles
INNER JOIN post_approval_task_types AS final_type
    ON final_type.code = 'fund_release_evidence'
LEFT JOIN post_approval_tasks AS existing_task
    ON existing_task.beneficiary_profile_id = beneficiary_profiles.id
   AND existing_task.task_type_id = final_type.id
WHERE existing_task.id IS NULL;

UPDATE post_approval_tasks AS final_task
INNER JOIN post_approval_task_types AS final_type
    ON final_type.id = final_task.task_type_id
   AND final_type.code = 'fund_release_evidence'
INNER JOIN (
    SELECT
        post_approval_tasks.beneficiary_profile_id
    FROM post_approval_tasks
    INNER JOIN post_approval_task_types
        ON post_approval_task_types.id = post_approval_tasks.task_type_id
    WHERE post_approval_task_types.code IN (
        'availment_form',
        'validation_form',
        'mungkahing_proyekto',
        'business_plan',
        'buhat_sa_pagpanumpa'
    )
    GROUP BY post_approval_tasks.beneficiary_profile_id
    HAVING COUNT(DISTINCT post_approval_task_types.code) = 5
       AND SUM(CASE WHEN post_approval_tasks.status = 'Verified' THEN 1 ELSE 0 END) = 5
) AS ready_profiles
    ON ready_profiles.beneficiary_profile_id = final_task.beneficiary_profile_id
SET final_task.status = CASE
    WHEN final_task.status IN ('Locked', 'Pending') THEN 'Unlocked'
    ELSE final_task.status
END,
final_task.updated_at = CURRENT_TIMESTAMP;

UPDATE beneficiary_profiles
INNER JOIN users
    ON users.id = beneficiary_profiles.user_id
INNER JOIN roles AS beneficiary_role
    ON beneficiary_role.name = 'Beneficiary'
INNER JOIN post_approval_tasks AS final_task
    ON final_task.beneficiary_profile_id = beneficiary_profiles.id
INNER JOIN post_approval_task_types AS final_type
    ON final_type.id = final_task.task_type_id
   AND final_type.code = 'fund_release_evidence'
SET beneficiary_profiles.beneficiary_status = 'active',
    beneficiary_profiles.approval_date = COALESCE(beneficiary_profiles.approval_date, CURDATE()),
    beneficiary_profiles.updated_at = CURRENT_TIMESTAMP,
    users.role_id = beneficiary_role.id,
    users.updated_at = NOW()
WHERE final_task.status = 'Verified';

UPDATE beneficiary_profiles
INNER JOIN users
    ON users.id = beneficiary_profiles.user_id
INNER JOIN roles AS applicant_role
    ON applicant_role.name = 'Applicant'
LEFT JOIN post_approval_tasks AS final_task
    ON final_task.beneficiary_profile_id = beneficiary_profiles.id
LEFT JOIN post_approval_task_types AS final_type
    ON final_type.id = final_task.task_type_id
   AND final_type.code = 'fund_release_evidence'
SET beneficiary_profiles.beneficiary_status = 'pending_fund_release',
    beneficiary_profiles.updated_at = CURRENT_TIMESTAMP,
    users.role_id = applicant_role.id,
    users.updated_at = NOW()
WHERE final_task.id IS NULL
   OR final_task.status <> 'Verified';
