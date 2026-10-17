<?php
declare(strict_types=1);

require __DIR__ . '/../app/bootstrap.php';

function ensure_directory(string $path): void
{
    if (!is_dir($path) && !mkdir($path, 0775, true) && !is_dir($path)) {
        throw new RuntimeException('Unable to create directory: ' . $path);
    }
}

function fetch_rows(PDO $pdo, string $sql, array $params = []): array
{
    $statement = $pdo->prepare($sql);
    $statement->execute($params);
    return $statement->fetchAll(PDO::FETCH_ASSOC) ?: [];
}

function fetch_column_ids(PDO $pdo, string $sql, array $params = []): array
{
    $statement = $pdo->prepare($sql);
    $statement->execute($params);
    return array_map('intval', $statement->fetchAll(PDO::FETCH_COLUMN) ?: []);
}

function count_rows(PDO $pdo, string $table, ?string $where = null, array $params = []): int
{
    $sql = 'SELECT COUNT(*) FROM `' . str_replace('`', '``', $table) . '`';
    if ($where !== null && trim($where) !== '') {
        $sql .= ' WHERE ' . $where;
    }
    $statement = $pdo->prepare($sql);
    $statement->execute($params);
    return (int) ($statement->fetchColumn() ?: 0);
}

function delete_rows(PDO $pdo, string $table, ?string $where = null, array $params = []): int
{
    $count = count_rows($pdo, $table, $where, $params);
    if ($count <= 0) {
        return 0;
    }

    $sql = 'DELETE FROM `' . str_replace('`', '``', $table) . '`';
    if ($where !== null && trim($where) !== '') {
        $sql .= ' WHERE ' . $where;
    }

    $statement = $pdo->prepare($sql);
    $statement->execute($params);
    return $count;
}

function clear_directory_contents(string $path): array
{
    if (!is_dir($path)) {
        return ['files' => 0, 'directories' => 0];
    }

    $filesDeleted = 0;
    $directoriesDeleted = 0;
    $entries = scandir($path);
    if ($entries === false) {
        return ['files' => 0, 'directories' => 0];
    }

    foreach ($entries as $entry) {
        if ($entry === '.' || $entry === '..') {
            continue;
        }

        $target = $path . DIRECTORY_SEPARATOR . $entry;
        if (is_dir($target)) {
            $child = clear_directory_contents($target);
            $filesDeleted += (int) ($child['files'] ?? 0);
            $directoriesDeleted += (int) ($child['directories'] ?? 0);
            if (@rmdir($target)) {
                $directoriesDeleted++;
            }
            continue;
        }

        if (@unlink($target)) {
            $filesDeleted++;
        }
    }

    return ['files' => $filesDeleted, 'directories' => $directoriesDeleted];
}

function remove_empty_directories(string $path): int
{
    if (!is_dir($path)) {
        return 0;
    }

    $removed = 0;
    $entries = scandir($path);
    if ($entries === false) {
        return 0;
    }

    foreach ($entries as $entry) {
        if ($entry === '.' || $entry === '..') {
            continue;
        }

        $target = $path . DIRECTORY_SEPARATOR . $entry;
        if (!is_dir($target)) {
            continue;
        }

        $removed += remove_empty_directories($target);
        $children = scandir($target);
        if ($children !== false && count($children) === 2 && @rmdir($target)) {
            $removed++;
        }
    }

    return $removed;
}

$pdo = db();
$timestamp = date('Y-m-d_His');
$exportDirectory = base_path('exports/non_admin_purge_' . $timestamp);
ensure_directory($exportDirectory);

$adminUsers = fetch_rows(
    $pdo,
    'SELECT users.id, users.full_name, users.email, roles.name AS role_name
     FROM users
     INNER JOIN roles ON roles.id = users.role_id
     WHERE LOWER(roles.name) IN ("administrator", "admin")
     ORDER BY users.id ASC'
);

if ($adminUsers === []) {
    throw new RuntimeException('No admin account was found. Purge aborted.');
}

$nonAdminUsers = fetch_rows(
    $pdo,
    'SELECT users.id, users.full_name, users.email, roles.name AS role_name
     FROM users
     INNER JOIN roles ON roles.id = users.role_id
     WHERE LOWER(roles.name) NOT IN ("administrator", "admin")
     ORDER BY roles.name ASC, users.full_name ASC'
);

if ($nonAdminUsers === []) {
    $summary = [
        'generated_at' => date(DATE_ATOM),
        'status' => 'skipped',
        'message' => 'No non-admin users found.',
        'admin_users' => $adminUsers,
    ];
    file_put_contents(
        $exportDirectory . '/purge-summary.json',
        json_encode($summary, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)
    );
    echo "No non-admin users found. Nothing was removed." . PHP_EOL;
    exit(0);
}

$nonAdminUserIds = array_map(static fn (array $row): int => (int) $row['id'], $nonAdminUsers);
$nonAdminStaffProfileIds = fetch_column_ids(
    $pdo,
    'SELECT id FROM staff_profiles WHERE user_id IN (' . implode(', ', array_fill(0, count($nonAdminUserIds), '?')) . ')',
    $nonAdminUserIds
);
$nonAdminApplicantProfileIds = fetch_column_ids(
    $pdo,
    'SELECT id FROM applicant_profiles WHERE user_id IN (' . implode(', ', array_fill(0, count($nonAdminUserIds), '?')) . ')',
    $nonAdminUserIds
);
$nonAdminBeneficiaryProfileIds = fetch_column_ids(
    $pdo,
    'SELECT id FROM beneficiary_profiles WHERE user_id IN (' . implode(', ', array_fill(0, count($nonAdminUserIds), '?')) . ')',
    $nonAdminUserIds
);

$summary = [
    'generated_at' => date(DATE_ATOM),
    'admin_users_kept' => $adminUsers,
    'non_admin_users_removed' => $nonAdminUsers,
    'deleted' => [],
];

file_put_contents(
    $exportDirectory . '/non-admin-users.json',
    json_encode($nonAdminUsers, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)
);

$fullDeleteTables = [
    'co_maker_registration_invitations',
    'co_maker_registrations',
    'stage_one_email_verification_codes',
    'stage_one_registrations',
    'support_chat_messages',
    'support_ticket_attachments',
    'support_ticket_messages',
    'support_ticket_activity_logs',
    'support_tickets',
    'initial_requirement_files',
    'application_comments',
    'application_status_history',
    'application_assessments',
    'applications',
    'attendance_records',
    'training_invitees',
    'training_programs',
    'post_approval_submissions',
    'post_approval_tasks',
    'beneficiary_feedback',
    'repayment_coverage_months',
    'repayment_status_history',
    'repayment_verifications',
    'repayments',
    'repayment_schedules',
    'email_logs',
    'notifications',
    'audit_logs',
    'account_verification_codes',
];

$pdo->beginTransaction();

try {
    foreach ($fullDeleteTables as $table) {
        $summary['deleted'][$table] = delete_rows($pdo, $table);
    }

    $summary['deleted']['user_profile_photos'] = delete_rows(
        $pdo,
        'user_profile_photos',
        'user_id IN (' . implode(', ', array_fill(0, count($nonAdminUserIds), '?')) . ')',
        $nonAdminUserIds
    );

    if ($nonAdminStaffProfileIds !== []) {
        $summary['deleted']['staff_barangay_assignments'] = delete_rows(
            $pdo,
            'staff_barangay_assignments',
            'staff_profile_id IN (' . implode(', ', array_fill(0, count($nonAdminStaffProfileIds), '?')) . ')',
            $nonAdminStaffProfileIds
        );
    } else {
        $summary['deleted']['staff_barangay_assignments'] = 0;
    }

    if ($nonAdminBeneficiaryProfileIds !== []) {
        $summary['deleted']['beneficiary_profiles'] = delete_rows(
            $pdo,
            'beneficiary_profiles',
            'id IN (' . implode(', ', array_fill(0, count($nonAdminBeneficiaryProfileIds), '?')) . ')',
            $nonAdminBeneficiaryProfileIds
        );
    } else {
        $summary['deleted']['beneficiary_profiles'] = 0;
    }

    if ($nonAdminApplicantProfileIds !== []) {
        $summary['deleted']['applicant_profiles'] = delete_rows(
            $pdo,
            'applicant_profiles',
            'id IN (' . implode(', ', array_fill(0, count($nonAdminApplicantProfileIds), '?')) . ')',
            $nonAdminApplicantProfileIds
        );
    } else {
        $summary['deleted']['applicant_profiles'] = 0;
    }

    if ($nonAdminStaffProfileIds !== []) {
        $summary['deleted']['staff_profiles'] = delete_rows(
            $pdo,
            'staff_profiles',
            'id IN (' . implode(', ', array_fill(0, count($nonAdminStaffProfileIds), '?')) . ')',
            $nonAdminStaffProfileIds
        );
    } else {
        $summary['deleted']['staff_profiles'] = 0;
    }

    $summary['deleted']['users'] = delete_rows(
        $pdo,
        'users',
        'id IN (' . implode(', ', array_fill(0, count($nonAdminUserIds), '?')) . ')',
        $nonAdminUserIds
    );

    $pdo->commit();
} catch (Throwable $exception) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    $summary['status'] = 'failed';
    $summary['error'] = $exception->getMessage();
    file_put_contents(
        $exportDirectory . '/purge-summary.json',
        json_encode($summary, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)
    );
    throw $exception;
}

$summary['status'] = 'completed';
$summary['remaining_user_counts'] = fetch_rows(
    $pdo,
    'SELECT roles.name AS role_name, COUNT(*) AS total
     FROM users
     INNER JOIN roles ON roles.id = users.role_id
     GROUP BY roles.name
     ORDER BY roles.name ASC'
);

$uploadDirectories = [
    'public/uploads/co-makers',
    'public/uploads/initial-requirements',
    'public/uploads/post-approval',
    'public/uploads/profile-photos',
    'public/uploads/repayments',
    'public/uploads/stage-one',
    'public/uploads/support',
    'public/uploads/temp',
];

$summary['cleared_uploads'] = [];
foreach ($uploadDirectories as $relativeDirectory) {
    $absoluteDirectory = base_path($relativeDirectory);
    $result = clear_directory_contents($absoluteDirectory);
    $result['directories_removed_after_clear'] = remove_empty_directories($absoluteDirectory);
    $summary['cleared_uploads'][$relativeDirectory] = $result;
}

file_put_contents(
    $exportDirectory . '/purge-summary.json',
    json_encode($summary, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)
);

echo 'Non-admin users removed successfully.' . PHP_EOL;
echo $exportDirectory . PHP_EOL;
