<?php
declare(strict_types=1);

require __DIR__ . '/../app/bootstrap.php';

date_default_timezone_set('Asia/Manila');

function split_full_name(string $fullName): array
{
    $parts = preg_split('/\s+/', trim($fullName)) ?: [];
    $parts = array_values(array_filter($parts, static fn (string $value): bool => $value !== ''));
    $first = $parts[0] ?? 'SMART';
    $last = count($parts) > 1 ? (string) array_pop($parts) : 'LEAP';
    $middle = count($parts) > 1 ? trim(implode(' ', array_slice($parts, 1))) : '';

    return [$first, $middle, $last];
}

function slugify_name(string $value): string
{
    $value = strtolower(trim($value));
    $value = preg_replace('/[^a-z0-9]+/', '.', $value) ?? '';
    return trim($value, '.');
}

function query_role_ids(PDO $pdo): array
{
    $roles = [];
    foreach ($pdo->query('SELECT id, name FROM roles') as $row) {
        $roles[strtolower((string) $row['name'])] = (int) $row['id'];
    }

    return $roles;
}

function first_admin_user_id(PDO $pdo): int
{
    $statement = $pdo->query(
        'SELECT users.id
         FROM users
         INNER JOIN roles ON roles.id = users.role_id
         WHERE LOWER(roles.name) = "administrator"
         ORDER BY users.id ASC
         LIMIT 1'
    );

    return (int) ($statement->fetchColumn() ?: 0);
}

function table_columns(PDO $pdo, string $table): array
{
    $columns = [];
    $statement = $pdo->query('SHOW COLUMNS FROM ' . $table);
    foreach ($statement ?: [] as $row) {
        $columns[] = (string) ($row['Field'] ?? '');
    }

    return $columns;
}

function latest_requirement_samples(PDO $pdo): array
{
    $samples = [];
    $statement = $pdo->query(
        'SELECT irt.code, irf.file_path, irf.original_name, irf.mime_type, irf.file_size
         FROM initial_requirement_files AS irf
         INNER JOIN initial_requirement_types AS irt ON irt.id = irf.requirement_type_id
         WHERE irf.file_path IS NOT NULL AND irf.file_path <> ""
         ORDER BY irf.id DESC'
    );

    foreach ($statement ?: [] as $row) {
        $code = (string) ($row['code'] ?? '');
        if ($code === '' || isset($samples[$code])) {
            continue;
        }
        $samples[$code] = [
            'file_path' => (string) ($row['file_path'] ?? ''),
            'original_name' => (string) ($row['original_name'] ?? ''),
            'mime_type' => (string) ($row['mime_type'] ?? 'application/octet-stream'),
            'file_size' => (int) ($row['file_size'] ?? 0),
        ];
    }

    return $samples;
}

function requirement_type_map(PDO $pdo): array
{
    $map = [];
    foreach ($pdo->query('SELECT id, code FROM initial_requirement_types ORDER BY id ASC') ?: [] as $row) {
        $map[(string) $row['code']] = (int) $row['id'];
    }

    return $map;
}

function eligible_pdos(PDO $pdo, array $skipNames): array
{
    $sql = <<<SQL
SELECT
    users.full_name,
    users.email,
    staff_profiles.id AS staff_profile_id,
    COALESCE(app_counts.applicant_count, 0) AS applicant_count,
    COALESCE(ben_counts.beneficiary_count, 0) AS beneficiary_count,
    barangays.id AS barangay_id,
    barangays.name AS barangay_name
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
LEFT JOIN (
  SELECT sba.staff_profile_id, MIN(sba.barangay_id) AS barangay_id
  FROM staff_barangay_assignments AS sba
  WHERE sba.ended_at IS NULL
  GROUP BY sba.staff_profile_id
) AS scope_barangay ON scope_barangay.staff_profile_id = staff_profiles.id
LEFT JOIN barangays ON barangays.id = scope_barangay.barangay_id
WHERE LOWER(roles.name) IN ('project officer', 'project_officer', 'pdo')
ORDER BY users.full_name ASC
SQL;

    $rows = $pdo->query($sql)->fetchAll(PDO::FETCH_ASSOC) ?: [];

    return array_values(array_filter($rows, static function (array $row) use ($skipNames): bool {
        $fullName = (string) ($row['full_name'] ?? '');
        if (in_array($fullName, $skipNames, true)) {
            return false;
        }

        return (int) ($row['applicant_count'] ?? 0) === 0
            && (int) ($row['beneficiary_count'] ?? 0) === 0
            && (int) ($row['staff_profile_id'] ?? 0) > 0
            && (int) ($row['barangay_id'] ?? 0) > 0;
    }));
}

function insert_row(PDO $pdo, string $table, array $payload): int
{
    $columns = array_keys($payload);
    $sql = sprintf(
        'INSERT INTO %s (%s) VALUES (%s)',
        $table,
        implode(', ', $columns),
        implode(', ', array_map(static fn (string $column): string => ':' . $column, $columns))
    );
    $statement = $pdo->prepare($sql);
    $statement->execute($payload);

    return (int) $pdo->lastInsertId();
}

function create_user(PDO $pdo, int $roleId, string $fullName, string $email, string $password): int
{
    [$firstName, $middleName, $lastName] = split_full_name($fullName);

    return insert_row($pdo, 'users', [
        'role_id' => $roleId,
        'full_name' => $fullName,
        'first_name' => $firstName,
        'middle_name' => $middleName !== '' ? $middleName : null,
        'last_name' => $lastName,
        'email' => $email,
        'password_hash' => password_hash($password, PASSWORD_BCRYPT),
        'verification_status' => 'verified',
        'is_active' => 1,
        'is_disabled' => 0,
    ]);
}

function create_applicant_profile(PDO $pdo, array $columns, int $userId, int $barangayId, array $seed): int
{
    $payload = [
        'user_id' => $userId,
        'barangay_id' => $barangayId,
        'contact_number' => $seed['contact_number'],
        'business_name' => $seed['business_name'],
        'address_line' => $seed['address_line'],
        'birthdate' => $seed['birthdate'],
        'age' => $seed['age'],
        'gender' => $seed['gender'],
        'is_4ps' => $seed['is_4ps'],
        'educational_attainment' => $seed['educational_attainment'],
        'household_size' => $seed['household_size'],
        'required_training_seminars' => 3,
        'sector' => $seed['sector'],
        'sector_other_specify' => null,
        'livelihood_category' => $seed['livelihood_category'],
        'livelihood_type' => $seed['livelihood_type'],
        'profile_status' => 'complete',
        'completion_submitted_at' => $seed['completion_submitted_at'],
    ];

    if (in_array('batch_no', $columns, true)) {
        $payload['batch_no'] = $seed['batch_no'] ?? 'Batch 1';
    }

    $payload = array_filter(
        $payload,
        static fn ($value, string $key): bool => $value !== null || in_array($key, ['middle_name', 'sector_other_specify'], true),
        ARRAY_FILTER_USE_BOTH
    );

    return insert_row($pdo, 'applicant_profiles', $payload);
}

function create_application(PDO $pdo, int $applicantProfileId, int $staffProfileId, string $status, ?string $submittedAt, ?string $reviewedAt, string $notes): int
{
    return insert_row($pdo, 'applications', [
        'applicant_profile_id' => $applicantProfileId,
        'status' => $status,
        'submitted_at' => $submittedAt,
        'reviewed_at' => $reviewedAt,
        'assigned_staff_profile_id' => $staffProfileId,
        'notes' => $notes,
    ]);
}

function insert_history(PDO $pdo, int $applicationId, int $actorUserId, ?string $fromStatus, string $toStatus, ?string $remarks, string $createdAt): void
{
    $statement = $pdo->prepare(
        'INSERT INTO application_status_history (application_id, changed_by_user_id, from_status, to_status, remarks, created_at)
         VALUES (:application_id, :changed_by_user_id, :from_status, :to_status, :remarks, :created_at)'
    );
    $statement->execute([
        'application_id' => $applicationId,
        'changed_by_user_id' => $actorUserId,
        'from_status' => $fromStatus,
        'to_status' => $toStatus,
        'remarks' => $remarks,
        'created_at' => $createdAt,
    ]);
}

function create_requirement_files(PDO $pdo, int $applicationId, int $reviewerUserId, array $requirementTypeMap, array $sampleFiles, string $reviewedAt): void
{
    $requiredCodes = ['valid_id', 'health_certificate', 'cedula', 'barangay_endorsement_letter'];
    $statement = $pdo->prepare(
        'INSERT INTO initial_requirement_files
         (application_id, requirement_type_id, file_path, original_name, mime_type, file_size, review_status, reviewer_remarks, reviewed_by_user_id, reviewed_at)
         VALUES
         (:application_id, :requirement_type_id, :file_path, :original_name, :mime_type, :file_size, :review_status, :reviewer_remarks, :reviewed_by_user_id, :reviewed_at)'
    );

    foreach ($requiredCodes as $code) {
        if (!isset($requirementTypeMap[$code], $sampleFiles[$code])) {
            throw new RuntimeException('Missing requirement seed asset for ' . $code);
        }
        $sample = $sampleFiles[$code];
        $statement->execute([
            'application_id' => $applicationId,
            'requirement_type_id' => $requirementTypeMap[$code],
            'file_path' => $sample['file_path'],
            'original_name' => $sample['original_name'],
            'mime_type' => $sample['mime_type'],
            'file_size' => $sample['file_size'] > 0 ? $sample['file_size'] : 1024,
            'review_status' => 'Verified',
            'reviewer_remarks' => 'Seeded verified requirement for PDO test run.',
            'reviewed_by_user_id' => $reviewerUserId > 0 ? $reviewerUserId : null,
            'reviewed_at' => $reviewedAt,
        ]);
    }
}

function create_beneficiary_profile(PDO $pdo, array $columns, int $userId, int $applicantProfileId, int $staffProfileId, string $approvalDate): int
{
    $payload = [
        'user_id' => $userId,
        'applicant_profile_id' => $applicantProfileId,
        'assigned_staff_profile_id' => $staffProfileId,
        'beneficiary_status' => 'active',
        'approval_date' => $approvalDate,
    ];

    $beneficiaryProfileId = insert_row($pdo, 'beneficiary_profiles', $payload);

    if (in_array('approved_at', $columns, true)) {
        $pdo->prepare(
            'UPDATE beneficiary_profiles
             SET approved_at = :approved_at
             WHERE id = :id'
        )->execute([
            'approved_at' => $approvalDate . ' 09:00:00',
            'id' => $beneficiaryProfileId,
        ]);
    }

    return $beneficiaryProfileId;
}

function find_existing_user(PDO $pdo, string $email): ?array
{
    $statement = $pdo->prepare('SELECT id, full_name, email FROM users WHERE email = :email LIMIT 1');
    $statement->execute(['email' => $email]);
    $row = $statement->fetch(PDO::FETCH_ASSOC);

    return is_array($row) ? $row : null;
}

function reset_training(PDO $pdo): array
{
    $round1Ids = [];
    $roundLaterIds = [];
    $statement = $pdo->query('SELECT id, training_round_number FROM training_programs ORDER BY id ASC');
    foreach ($statement ?: [] as $row) {
        $round = (int) ($row['training_round_number'] ?? 0);
        $id = (int) ($row['id'] ?? 0);
        if ($id <= 0) {
            continue;
        }
        if ($round === 1) {
            $round1Ids[] = $id;
        } elseif ($round > 1) {
            $roundLaterIds[] = $id;
        }
    }

    $beneficiaryProfileIds = $pdo->query(
        'SELECT DISTINCT beneficiary_profile_id
         FROM training_invitees
         WHERE beneficiary_profile_id IS NOT NULL'
    )->fetchAll(PDO::FETCH_COLUMN) ?: [];
    $beneficiaryProfileIds = array_values(array_unique(array_map('intval', $beneficiaryProfileIds)));

    $deletedAttendance = (int) $pdo->exec('DELETE FROM attendance_records');

    if ($roundLaterIds !== []) {
        $placeholders = implode(',', array_fill(0, count($roundLaterIds), '?'));
        $deleteInvitees = $pdo->prepare('DELETE FROM training_invitees WHERE training_program_id IN (' . $placeholders . ')');
        foreach ($roundLaterIds as $index => $programId) {
            $deleteInvitees->bindValue($index + 1, $programId, PDO::PARAM_INT);
        }
        $deleteInvitees->execute();

        $deletePrograms = $pdo->prepare('DELETE FROM training_programs WHERE id IN (' . $placeholders . ')');
        foreach ($roundLaterIds as $index => $programId) {
            $deletePrograms->bindValue($index + 1, $programId, PDO::PARAM_INT);
        }
        $deletePrograms->execute();
    }

    if ($round1Ids !== []) {
        $placeholders = implode(',', array_fill(0, count($round1Ids), '?'));
        $resetInvitees = $pdo->prepare(
            'UPDATE training_invitees
             SET invite_status = "Scheduled",
                 remarks = NULL,
                 notified_at = NULL,
                 last_notice_sent_at = NULL,
                 updated_by_user_id = NULL,
                 post_approval_unlocked_at = NULL,
                 updated_at = NOW()
             WHERE training_program_id IN (' . $placeholders . ')'
        );
        foreach ($round1Ids as $index => $programId) {
            $resetInvitees->bindValue($index + 1, $programId, PDO::PARAM_INT);
        }
        $resetInvitees->execute();

        $resetPrograms = $pdo->prepare(
            'UPDATE training_programs
             SET status = "Scheduled", updated_at = NOW()
             WHERE id IN (' . $placeholders . ')'
        );
        foreach ($round1Ids as $index => $programId) {
            $resetPrograms->bindValue($index + 1, $programId, PDO::PARAM_INT);
        }
        $resetPrograms->execute();
    }

    if ($beneficiaryProfileIds !== []) {
        $placeholders = implode(',', array_fill(0, count($beneficiaryProfileIds), '?'));
        $deleteSubmissions = $pdo->prepare(
            'DELETE post_approval_submissions
             FROM post_approval_submissions
             INNER JOIN post_approval_tasks ON post_approval_tasks.id = post_approval_submissions.post_approval_task_id
             WHERE post_approval_tasks.beneficiary_profile_id IN (' . $placeholders . ')'
        );
        foreach ($beneficiaryProfileIds as $index => $beneficiaryProfileId) {
            $deleteSubmissions->bindValue($index + 1, $beneficiaryProfileId, PDO::PARAM_INT);
        }
        $deleteSubmissions->execute();

        $resetTasks = $pdo->prepare(
            'UPDATE post_approval_tasks
             SET status = "Locked",
                 form_payload = NULL,
                 applicant_started_at = NULL,
                 applicant_submitted_at = NULL,
                 reviewed_by_user_id = NULL,
                 reviewed_at = NULL,
                 reviewer_remarks = NULL,
                 updated_at = NOW()
             WHERE beneficiary_profile_id IN (' . $placeholders . ')'
        );
        foreach ($beneficiaryProfileIds as $index => $beneficiaryProfileId) {
            $resetTasks->bindValue($index + 1, $beneficiaryProfileId, PDO::PARAM_INT);
        }
        $resetTasks->execute();
    }

    return [
        'deletedAttendance' => $deletedAttendance,
        'round1ProgramsKept' => $round1Ids,
        'roundLaterProgramsDeleted' => $roundLaterIds,
        'beneficiaryTasksReset' => $beneficiaryProfileIds,
    ];
}

$seedPassword = 'SmartLeap2026!';
$skipNames = [
    'Simon Gwapo Riley',
    'Hannah Iris Reformado',
    'Bernadette Rabe Salazar',
];
$pendingBusinessSeeds = [
    ['full_name' => 'Kevin Dale Mendez', 'business_name' => 'Cruz Food Cart', 'livelihood_type' => 'Food Cart', 'livelihood_category' => 'Food and Beverages', 'gender' => 'Male'],
    ['full_name' => 'Janelle Mae Butiong', 'business_name' => 'Mendoza General Merchandising', 'livelihood_type' => 'Sari-Sari Store', 'livelihood_category' => 'Establishment', 'gender' => 'Female'],
    ['full_name' => 'Ronald James Abad', 'business_name' => 'Flores Backyard Hog Raising', 'livelihood_type' => 'Hog Raising', 'livelihood_category' => 'Livestock', 'gender' => 'Male'],
    ['full_name' => 'Patricia Anne Gomez', 'business_name' => 'Villanueva RTW Trading', 'livelihood_type' => 'Online Selling', 'livelihood_category' => 'Buy & Sell', 'gender' => 'Female'],
    ['full_name' => 'Jerome Paul Neri', 'business_name' => 'Salazar Snack Corner', 'livelihood_type' => 'Snack Stand', 'livelihood_category' => 'Food and Beverages', 'gender' => 'Male'],
    ['full_name' => 'Maria Luisa Orden', 'business_name' => 'Rivera Dry Goods', 'livelihood_type' => 'Dry Goods Retail', 'livelihood_category' => 'Buy & Sell', 'gender' => 'Female'],
    ['full_name' => 'Harold Vincent Saren', 'business_name' => 'Navarro Water Refilling Station', 'livelihood_type' => 'Water Refilling', 'livelihood_category' => 'Establishment', 'gender' => 'Male'],
    ['full_name' => 'Ivy Grace Toledo', 'business_name' => 'Lopez Native Chicken Raising', 'livelihood_type' => 'Native Chicken Raising', 'livelihood_category' => 'Livestock', 'gender' => 'Female'],
];
$beneficiaryBusinessSeeds = [
    ['full_name' => 'Rowena Faith Dacumos', 'business_name' => 'Cruz Rice Retail', 'livelihood_type' => 'Rice Retail', 'livelihood_category' => 'Buy & Sell', 'gender' => 'Female'],
    ['full_name' => 'Nestor Allan Tapia', 'business_name' => 'Mendoza Lutong Bahay', 'livelihood_type' => 'Carinderia', 'livelihood_category' => 'Food and Beverages', 'gender' => 'Male'],
    ['full_name' => 'Cherry Mae Galang', 'business_name' => 'Flores Egg Trading', 'livelihood_type' => 'Egg Retail', 'livelihood_category' => 'Buy & Sell', 'gender' => 'Female'],
    ['full_name' => 'Benjamin Ross Acedo', 'business_name' => 'Villanueva Motorcycle Repair', 'livelihood_type' => 'Motorcycle Repair', 'livelihood_category' => 'Establishment', 'gender' => 'Male'],
    ['full_name' => 'Aileen Joy Soriano', 'business_name' => 'Salazar Ready-to-Eat Meals', 'livelihood_type' => 'Homemade Snacks', 'livelihood_category' => 'Food and Beverages', 'gender' => 'Female'],
    ['full_name' => 'Carlito Ramos Dela Peña', 'business_name' => 'Rivera Poultry Raising', 'livelihood_type' => 'Poultry Raising', 'livelihood_category' => 'Livestock', 'gender' => 'Male'],
    ['full_name' => 'Lucille Mae Ebron', 'business_name' => 'Navarro Cosmetics Outlet', 'livelihood_type' => 'Beauty Salon', 'livelihood_category' => 'Establishment', 'gender' => 'Female'],
    ['full_name' => 'Ricky John Casquejo', 'business_name' => 'Lopez Vegetable Retail', 'livelihood_type' => 'Vegetable Retail', 'livelihood_category' => 'Buy & Sell', 'gender' => 'Male'],
];

$pdo = db();
$roleIds = query_role_ids($pdo);
$applicantRoleId = $roleIds['applicant'] ?? 0;
$beneficiaryRoleId = $roleIds['beneficiary'] ?? 0;
$reviewerUserId = first_admin_user_id($pdo);
$applicantColumns = table_columns($pdo, 'applicant_profiles');
$beneficiaryColumns = table_columns($pdo, 'beneficiary_profiles');
$requirementTypeMap = requirement_type_map($pdo);
$sampleFiles = latest_requirement_samples($pdo);
$eligiblePdos = eligible_pdos($pdo, $skipNames);

if ($applicantRoleId <= 0 || $beneficiaryRoleId <= 0) {
    fwrite(STDERR, "Applicant or Beneficiary role is missing.\n");
    exit(1);
}

if ($eligiblePdos === []) {
    echo json_encode([
        'created' => [],
        'message' => 'No zero-applicant / zero-beneficiary PDOs were found to seed.',
        'trainingReset' => reset_training($pdo),
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), PHP_EOL;
    exit(0);
}

$created = [];

$pdo->beginTransaction();

try {
    foreach ($eligiblePdos as $index => $pdoRow) {
        $pdoName = (string) $pdoRow['full_name'];
        $staffProfileId = (int) $pdoRow['staff_profile_id'];
        $barangayId = (int) $pdoRow['barangay_id'];
        $barangayName = (string) ($pdoRow['barangay_name'] ?? 'Assigned Barangay');
        $nameSlug = slugify_name($pdoName);

        $pendingSeed = $pendingBusinessSeeds[$index % count($pendingBusinessSeeds)];
        $pendingEmail = 'seed.applicant.' . $nameSlug . '@smartleap.local';
        if (find_existing_user($pdo, $pendingEmail) === null) {
            $pendingUserId = create_user($pdo, $applicantRoleId, $pendingSeed['full_name'], $pendingEmail, $seedPassword);
            $pendingProfileId = create_applicant_profile($pdo, $applicantColumns, $pendingUserId, $barangayId, [
                'contact_number' => '0917' . str_pad((string) (4100000 + $index), 7, '0', STR_PAD_LEFT),
                'business_name' => $pendingSeed['business_name'],
                'address_line' => $barangayName . ', Butuan City',
                'birthdate' => '1997-0' . (($index % 8) + 1) . '-15',
                'age' => 29,
                'gender' => $pendingSeed['gender'],
                'is_4ps' => 0,
                'educational_attainment' => 'High School Graduate',
                'household_size' => 4,
                'sector' => 'None',
                'livelihood_category' => $pendingSeed['livelihood_category'],
                'livelihood_type' => $pendingSeed['livelihood_type'],
                'completion_submitted_at' => date('Y-m-d H:i:s'),
            ]);
            $pendingApplicationId = create_application(
                $pdo,
                $pendingProfileId,
                $staffProfileId,
                'Draft',
                null,
                null,
                'Seeded pending applicant for PDO test run. Four upload requirements are still missing.'
            );
            insert_history(
                $pdo,
                $pendingApplicationId,
                $reviewerUserId > 0 ? $reviewerUserId : $pendingUserId,
                null,
                'Draft',
                'Seeded pending applicant for PDO test run.',
                date('Y-m-d H:i:s')
            );

            $created[] = [
                'type' => 'applicant',
                'pdo' => $pdoName,
                'fullName' => $pendingSeed['full_name'],
                'email' => $pendingEmail,
                'password' => $seedPassword,
                'businessName' => $pendingSeed['business_name'],
                'livelihoodType' => $pendingSeed['livelihood_type'],
                'livelihoodCategory' => $pendingSeed['livelihood_category'],
                'assignedBarangay' => $barangayName,
            ];
        }

        $beneficiarySeed = $beneficiaryBusinessSeeds[$index % count($beneficiaryBusinessSeeds)];
        $beneficiaryEmail = 'seed.beneficiary.' . $nameSlug . '@smartleap.local';
        if (find_existing_user($pdo, $beneficiaryEmail) === null) {
            $beneficiaryUserId = create_user($pdo, $beneficiaryRoleId, $beneficiarySeed['full_name'], $beneficiaryEmail, $seedPassword);
            $beneficiaryProfileApplicantId = create_applicant_profile($pdo, $applicantColumns, $beneficiaryUserId, $barangayId, [
                'contact_number' => '0918' . str_pad((string) (5100000 + $index), 7, '0', STR_PAD_LEFT),
                'business_name' => $beneficiarySeed['business_name'],
                'address_line' => $barangayName . ', Butuan City',
                'birthdate' => '1993-0' . (($index % 8) + 1) . '-09',
                'age' => 33,
                'gender' => $beneficiarySeed['gender'],
                'is_4ps' => 0,
                'educational_attainment' => 'College Level',
                'household_size' => 5,
                'sector' => 'None',
                'livelihood_category' => $beneficiarySeed['livelihood_category'],
                'livelihood_type' => $beneficiarySeed['livelihood_type'],
                'completion_submitted_at' => date('Y-m-d H:i:s', strtotime('-3 days')),
            ]);
            $beneficiaryApplicationId = create_application(
                $pdo,
                $beneficiaryProfileApplicantId,
                $staffProfileId,
                'Completed',
                date('Y-m-d H:i:s', strtotime('-2 days')),
                date('Y-m-d H:i:s', strtotime('-1 day')),
                'Seeded approved beneficiary for PDO test run.'
            );
            create_requirement_files(
                $pdo,
                $beneficiaryApplicationId,
                $reviewerUserId,
                $requirementTypeMap,
                $sampleFiles,
                date('Y-m-d H:i:s', strtotime('-1 day'))
            );
            insert_history(
                $pdo,
                $beneficiaryApplicationId,
                $reviewerUserId > 0 ? $reviewerUserId : $beneficiaryUserId,
                null,
                'Submitted',
                'Seeded beneficiary application submitted for test run.',
                date('Y-m-d H:i:s', strtotime('-2 days'))
            );
            insert_history(
                $pdo,
                $beneficiaryApplicationId,
                $reviewerUserId > 0 ? $reviewerUserId : $beneficiaryUserId,
                'Submitted',
                'Approved for Training',
                'Seeded test case approved for training.',
                date('Y-m-d H:i:s', strtotime('-1 day -2 hours'))
            );
            insert_history(
                $pdo,
                $beneficiaryApplicationId,
                $reviewerUserId > 0 ? $reviewerUserId : $beneficiaryUserId,
                'Approved for Training',
                'Completed',
                'Seeded test case promoted to active beneficiary.',
                date('Y-m-d H:i:s', strtotime('-1 day'))
            );
            create_beneficiary_profile(
                $pdo,
                $beneficiaryColumns,
                $beneficiaryUserId,
                $beneficiaryProfileApplicantId,
                $staffProfileId,
                date('Y-m-d')
            );

            $created[] = [
                'type' => 'beneficiary',
                'pdo' => $pdoName,
                'fullName' => $beneficiarySeed['full_name'],
                'email' => $beneficiaryEmail,
                'password' => $seedPassword,
                'businessName' => $beneficiarySeed['business_name'],
                'livelihoodType' => $beneficiarySeed['livelihood_type'],
                'livelihoodCategory' => $beneficiarySeed['livelihood_category'],
                'assignedBarangay' => $barangayName,
            ];
        }
    }

    $trainingReset = reset_training($pdo);
    $pdo->commit();

    echo json_encode([
        'created' => $created,
        'trainingReset' => $trainingReset,
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), PHP_EOL;
} catch (Throwable $exception) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    fwrite(STDERR, $exception->getMessage() . PHP_EOL);
    exit(1);
}
