<?php
declare(strict_types=1);

require __DIR__ . '/../app/bootstrap.php';

date_default_timezone_set('Asia/Manila');

function fetch_all(PDOStatement|false $statement): array
{
    if (!$statement instanceof PDOStatement) {
        return [];
    }

    $rows = $statement->fetchAll(PDO::FETCH_ASSOC);
    return is_array($rows) ? $rows : [];
}

function table_columns(PDO $pdo, string $table): array
{
    $columns = [];
    foreach ($pdo->query('SHOW COLUMNS FROM ' . $table) ?: [] as $row) {
        $columns[] = (string) ($row['Field'] ?? '');
    }

    return $columns;
}

function fetch_seeded_applicants(PDO $pdo): array
{
    $sql = <<<SQL
SELECT
    users.full_name AS account_name,
    users.email,
    applicant_profiles.business_name,
    applicant_profiles.sector,
    applicant_profiles.livelihood_category,
    applicant_profiles.livelihood_type,
    applicant_profiles.barangay_id,
    applications.id AS application_id,
    applications.status AS application_status,
    applications.notes,
    assigned_user.full_name AS assigned_pdo,
    barangays.name AS barangay_name,
    COUNT(initial_requirement_files.id) AS uploaded_requirements
FROM users
INNER JOIN roles ON roles.id = users.role_id
INNER JOIN applicant_profiles ON applicant_profiles.user_id = users.id
INNER JOIN applications ON applications.applicant_profile_id = applicant_profiles.id
LEFT JOIN staff_profiles AS assigned_staff ON assigned_staff.id = applications.assigned_staff_profile_id
LEFT JOIN users AS assigned_user ON assigned_user.id = assigned_staff.user_id
LEFT JOIN barangays ON barangays.id = applicant_profiles.barangay_id
LEFT JOIN initial_requirement_files ON initial_requirement_files.application_id = applications.id
WHERE LOWER(roles.name) = 'applicant'
  AND users.email LIKE 'seed.applicant.%@smartleap.local'
GROUP BY
    users.full_name,
    users.email,
    applicant_profiles.business_name,
    applicant_profiles.sector,
    applicant_profiles.livelihood_category,
    applicant_profiles.livelihood_type,
    applicant_profiles.barangay_id,
    applications.id,
    applications.status,
    applications.notes,
    assigned_user.full_name,
    barangays.name
ORDER BY assigned_user.full_name ASC, users.full_name ASC
SQL;

    return fetch_all($pdo->query($sql));
}

function fetch_seeded_beneficiaries(PDO $pdo): array
{
    $sql = <<<SQL
SELECT
    users.full_name AS account_name,
    users.email,
    applicant_profiles.business_name,
    applicant_profiles.sector,
    applicant_profiles.livelihood_category,
    applicant_profiles.livelihood_type,
    applications.id AS application_id,
    applications.status AS application_status,
    beneficiary_profiles.id AS beneficiary_profile_id,
    beneficiary_profiles.beneficiary_status,
    assigned_user.full_name AS assigned_pdo,
    barangays.name AS barangay_name,
    SUM(CASE WHEN initial_requirement_files.review_status = 'Verified' THEN 1 ELSE 0 END) AS verified_requirements
FROM users
INNER JOIN roles ON roles.id = users.role_id
INNER JOIN applicant_profiles ON applicant_profiles.user_id = users.id
INNER JOIN applications ON applications.applicant_profile_id = applicant_profiles.id
INNER JOIN beneficiary_profiles ON beneficiary_profiles.user_id = users.id
LEFT JOIN staff_profiles AS assigned_staff ON assigned_staff.id = beneficiary_profiles.assigned_staff_profile_id
LEFT JOIN users AS assigned_user ON assigned_user.id = assigned_staff.user_id
LEFT JOIN barangays ON barangays.id = applicant_profiles.barangay_id
LEFT JOIN initial_requirement_files ON initial_requirement_files.application_id = applications.id
WHERE LOWER(roles.name) = 'beneficiary'
  AND users.email LIKE 'seed.beneficiary.%@smartleap.local'
GROUP BY
    users.full_name,
    users.email,
    applicant_profiles.business_name,
    applicant_profiles.sector,
    applicant_profiles.livelihood_category,
    applicant_profiles.livelihood_type,
    applications.id,
    applications.status,
    beneficiary_profiles.id,
    beneficiary_profiles.beneficiary_status,
    assigned_user.full_name,
    barangays.name
ORDER BY assigned_user.full_name ASC, users.full_name ASC
SQL;

    return fetch_all($pdo->query($sql));
}

function fetch_pdo_summary(PDO $pdo): array
{
    $sql = <<<SQL
SELECT
    users.full_name AS pdo_name,
    COALESCE(app_counts.applicant_count, 0) AS applicant_count,
    COALESCE(ben_counts.beneficiary_count, 0) AS beneficiary_count
FROM users
INNER JOIN roles ON roles.id = users.role_id
INNER JOIN staff_profiles ON staff_profiles.user_id = users.id
LEFT JOIN (
  SELECT applications.assigned_staff_profile_id AS staff_profile_id,
         COUNT(DISTINCT applications.applicant_profile_id) AS applicant_count
  FROM applications
  WHERE applications.assigned_staff_profile_id IS NOT NULL
  GROUP BY applications.assigned_staff_profile_id
) AS app_counts ON app_counts.staff_profile_id = staff_profiles.id
LEFT JOIN (
  SELECT beneficiary_profiles.assigned_staff_profile_id AS staff_profile_id,
         COUNT(*) AS beneficiary_count
  FROM beneficiary_profiles
  WHERE beneficiary_profiles.assigned_staff_profile_id IS NOT NULL
  GROUP BY beneficiary_profiles.assigned_staff_profile_id
) AS ben_counts ON ben_counts.staff_profile_id = staff_profiles.id
WHERE LOWER(roles.name) IN ('project officer', 'project_officer', 'pdo')
ORDER BY users.full_name ASC
SQL;

    return fetch_all($pdo->query($sql));
}

function fetch_training_state(PDO $pdo): array
{
    $trainingColumns = table_columns($pdo, 'training_programs');
    $selectColumns = ['id'];
    foreach (['title', 'training_round_number', 'training_group', 'group_no', 'status'] as $column) {
        if (in_array($column, $trainingColumns, true)) {
            $selectColumns[] = $column;
        }
    }
    $programSelect = implode(', ', $selectColumns);

    $programs = fetch_all($pdo->query(
        'SELECT ' . $programSelect . '
         FROM training_programs
         ORDER BY id ASC'
    ));

    $invitees = fetch_all($pdo->query(
        'SELECT training_program_id, applicant_profile_id, beneficiary_profile_id, invite_status, notified_at, last_notice_sent_at, post_approval_unlocked_at
         FROM training_invitees
         ORDER BY training_program_id ASC, id ASC'
    ));

    $attendanceCount = (int) ($pdo->query('SELECT COUNT(*) FROM attendance_records')->fetchColumn() ?: 0);

    return [
        'programs' => $programs,
        'invitees' => $invitees,
        'attendance_records' => $attendanceCount,
    ];
}

function fetch_portal_totals(PDO $pdo): array
{
    return [
        'seeded_applicant_accounts' => (int) ($pdo->query("SELECT COUNT(*) FROM users WHERE email LIKE 'seed.applicant.%@smartleap.local'")->fetchColumn() ?: 0),
        'seeded_beneficiary_accounts' => (int) ($pdo->query("SELECT COUNT(*) FROM users WHERE email LIKE 'seed.beneficiary.%@smartleap.local'")->fetchColumn() ?: 0),
        'seeded_admin_review_cases' => (int) ($pdo->query("
            SELECT COUNT(*)
            FROM applications
            INNER JOIN applicant_profiles ON applicant_profiles.id = applications.applicant_profile_id
            INNER JOIN users ON users.id = applicant_profiles.user_id
            WHERE users.email LIKE 'seed.applicant.%@smartleap.local'
              AND applications.status = 'Draft'
        ")->fetchColumn() ?: 0),
        'seeded_active_beneficiaries' => (int) ($pdo->query("
            SELECT COUNT(*)
            FROM beneficiary_profiles
            INNER JOIN users ON users.id = beneficiary_profiles.user_id
            WHERE users.email LIKE 'seed.beneficiary.%@smartleap.local'
              AND beneficiary_profiles.beneficiary_status = 'active'
        ")->fetchColumn() ?: 0),
    ];
}

$pdo = db();

$report = [
    'generated_at' => date('c'),
    'portal_totals' => fetch_portal_totals($pdo),
    'seeded_applicants' => fetch_seeded_applicants($pdo),
    'seeded_beneficiaries' => fetch_seeded_beneficiaries($pdo),
    'pdo_summary' => fetch_pdo_summary($pdo),
    'training_state' => fetch_training_state($pdo),
];

echo json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), PHP_EOL;
