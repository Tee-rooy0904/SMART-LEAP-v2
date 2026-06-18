<?php
/**
 * SMART LEAP FILE GUIDE
 * Training eligibility evaluation service.
 * Determines which applicants are ready for training based on application status, requirement approvals, staff assignment, and scope rules.
 */

declare(strict_types=1);

namespace App\Services;

use PDO;

class TrainingEligibilityService
{
    private array $projectOfficerUserCache = [];
    private ?array $applicantProfileColumnCache = null;

    public function listApplicantSnapshots(array $actor): array
    {
        $rows = $this->fetchLatestApplicationRows([], $actor);
        if ($rows === []) {
            return [];
        }

        $snapshots = $this->buildSnapshots($rows);
        uasort($snapshots, static function (array $left, array $right): int {
            return strcasecmp((string) ($left['name'] ?? ''), (string) ($right['name'] ?? ''));
        });

        return array_values($snapshots);
    }

    public function listEligibleApplicants(array $actor): array
    {
        $snapshots = $this->listApplicantSnapshots($actor);
        $eligible = array_filter($snapshots, static fn (array $snapshot): bool => (bool) ($snapshot['eligible'] ?? false));

        uasort($eligible, static function (array $left, array $right): int {
            $leftDate = trim((string) ($left['applicationReviewedAt'] ?? ''));
            $rightDate = trim((string) ($right['applicationReviewedAt'] ?? ''));
            if ($leftDate !== $rightDate) {
                if ($leftDate === '') {
                    return 1;
                }
                if ($rightDate === '') {
                    return -1;
                }
                return strcmp($leftDate, $rightDate);
            }

            $idCompare = (int) ($left['applicationId'] ?? 0) <=> (int) ($right['applicationId'] ?? 0);
            if ($idCompare !== 0) {
                return $idCompare;
            }

            return strcasecmp((string) ($left['name'] ?? ''), (string) ($right['name'] ?? ''));
        });

        return array_values($eligible);
    }

    public function evaluateApplicantProfileIds(array $applicantProfileIds, array $actor): array
    {
        $targetIds = array_values(array_unique(array_filter(array_map('intval', $applicantProfileIds))));
        if ($targetIds === []) {
            return [];
        }

        $rows = $this->fetchLatestApplicationRows($targetIds, $actor);
        $snapshots = $this->buildSnapshots($rows);

        $missingIds = array_values(array_diff($targetIds, array_keys($snapshots)));
        if ($missingIds !== []) {
            $basics = $this->fetchApplicantBasics($missingIds);
            foreach ($missingIds as $applicantProfileId) {
                $basic = $basics[$applicantProfileId] ?? [];
                $snapshots[$applicantProfileId] = [
                    'eligible' => false,
                    'applicantProfileId' => $applicantProfileId,
                    'beneficiaryProfileId' => $basic['beneficiaryProfileId'] ?? null,
                    'applicationId' => null,
                    'name' => $basic['name'] ?? '',
                    'email' => $basic['email'] ?? '',
                    'barangay' => $basic['barangay'] ?? null,
                    'businessName' => $basic['businessName'] ?? null,
                    'sector' => $basic['sector'] ?? null,
                    'status' => null,
                    'applicationStatus' => null,
                    'assignedPdoUserId' => null,
                    'assignedPdoName' => null,
                    'userId' => $basic['userId'] ?? null,
                    'reasons' => ['No latest application found in scope.'],
                    'requirements' => [],
                ];
            }
        }

        return $snapshots;
    }

    public function isApplicantEligible(int $applicantProfileId, array $actor = []): bool
    {
        $snapshots = $this->evaluateApplicantProfileIds([$applicantProfileId], $actor);
        return (bool) ($snapshots[$applicantProfileId]['eligible'] ?? false);
    }

    private function buildSnapshots(array $rows): array
    {
        if ($rows === []) {
            return [];
        }

        $requiredTypes = $this->fetchRequiredRequirementTypes();
        $applicationIds = array_values(array_unique(array_map(static fn (array $row): int => (int) $row['application_id'], $rows)));
        $requirementsByApplication = $this->fetchLatestRequirementRows($applicationIds);

        $snapshots = [];
        foreach ($rows as $row) {
            $applicantProfileId = (int) $row['applicant_profile_id'];
            $applicationId = (int) $row['application_id'];
            $assignedPdoUserId = $row['assigned_pdo_user_id'] !== null ? (int) $row['assigned_pdo_user_id'] : null;
            $applicationRequirements = $requirementsByApplication[$applicationId] ?? [];
            $requirements = [];
            $reasons = [];

            if ($assignedPdoUserId === null || $assignedPdoUserId <= 0) {
                $assignedPdoUserId = $this->inferProjectOfficerReviewerUserId($applicationRequirements, $requiredTypes);
            }

            if ($assignedPdoUserId === null || $assignedPdoUserId <= 0) {
                $reasons[] = 'Latest application is not assigned to a PDO.';
            }

            $applicationStatus = $this->normalizeApplicationStatus((string) ($row['application_status'] ?? ''));
            if ($applicationStatus !== APPLICATION_STATUS_APPROVED_FOR_TRAINING) {
                $reasons[] = 'Latest application is not yet marked as Approved for Training.';
            }

            foreach ($requiredTypes as $type) {
                $requirementRow = $applicationRequirements[$type['id']] ?? null;
                $filePath = trim((string) ($requirementRow['file_path'] ?? ''));
                $reviewStatus = $this->normalizeRequirementStatus((string) ($requirementRow['review_status'] ?? ''));
                $reviewedByUserId = is_array($requirementRow) && $requirementRow['reviewed_by_user_id'] !== null
                    ? (int) $requirementRow['reviewed_by_user_id']
                    : null;
                $reviewedByAssignedPdo = $assignedPdoUserId !== null
                    && $assignedPdoUserId > 0
                    && $reviewedByUserId !== null
                    && $reviewedByUserId === $assignedPdoUserId;
                $isStatusApproved = in_array($reviewStatus, ['verified', 'approved'], true);
                $exists = $filePath !== '';

                $requirements[] = [
                    'code' => $type['code'],
                    'label' => $type['label'],
                    'exists' => $exists,
                    'reviewStatus' => $requirementRow['review_status'] ?? null,
                    'reviewedAt' => $requirementRow['reviewed_at'] ?? null,
                    'reviewedByUserId' => $reviewedByUserId,
                    'reviewedByAssignedPdo' => $reviewedByAssignedPdo,
                    'passes' => $exists && $isStatusApproved && $reviewedByAssignedPdo,
                ];

                if (!$exists) {
                    $reasons[] = sprintf('Missing required upload: %s.', $type['label']);
                    continue;
                }

                if (!$isStatusApproved) {
                    $reasons[] = sprintf('Required upload is not verified or approved: %s.', $type['label']);
                    continue;
                }

                if (!$reviewedByAssignedPdo) {
                    $reasons[] = sprintf('Required upload was not reviewed by the assigned PDO: %s.', $type['label']);
                }
            }

              $snapshots[$applicantProfileId] = [
                  'eligible' => $reasons === [],
                  'applicantProfileId' => $applicantProfileId,
                  'beneficiaryProfileId' => $row['beneficiary_profile_id'] !== null ? (int) $row['beneficiary_profile_id'] : null,
                  'applicationId' => $applicationId,
                  'applicationReviewedAt' => $row['application_reviewed_at'] ?? null,
                  'applicationSubmittedAt' => $row['application_submitted_at'] ?? null,
                  'applicationCreatedAt' => $row['application_created_at'] ?? null,
                  'name' => $row['full_name'],
                  'email' => $row['email'],
                  'barangay' => $row['barangay_name'],
                  'businessName' => $row['business_name'],
                  'sector' => $row['sector'],
                  'sectorOtherSpecify' => $row['sector_other_specify'] ?? null,
                  'livelihoodCategory' => $row['livelihood_category'] ?? null,
                  'batchNo' => $row['batch_no'] ?? null,
                  'livelihood' => $row['livelihood_type'] ?? null,
                  'status' => $applicationStatus,
                  'applicationStatus' => $applicationStatus,
                  'assignedPdoUserId' => $assignedPdoUserId,
                  'assignedPdoName' => $row['assigned_pdo_name'],
                  'userId' => (int) $row['user_id'],
                  'reasons' => array_values(array_unique($reasons)),
                'requirements' => $requirements,
            ];
        }

        return $snapshots;
    }

    private function fetchLatestApplicationRows(array $applicantProfileIds, array $actor): array
    {
        $params = [];
        $joins = [];
        $conditions = [
            'LOWER(REPLACE(applications.status, "_", " ")) NOT IN ("training ongoing", "completed")',
            'LOWER(COALESCE(user_roles.name, "")) <> "beneficiary"',
            'NOT (
                beneficiary_profiles.id IS NOT NULL
                AND (
                    beneficiary_profiles.approval_date IS NOT NULL
                    OR LOWER(COALESCE(beneficiary_profiles.beneficiary_status, "")) = "active"
                )
            )',
        ];

        $actorRole = strtolower((string) ($actor['role'] ?? ''));
        if (str_contains($actorRole, 'project')) {
            $staffProfileId = $this->findStaffProfileIdForUser((int) ($actor['id'] ?? 0));
            if ($staffProfileId === null) {
                return [];
            }

            $params['scope_assignment_staff_profile_id'] = $staffProfileId;
            $params['scope_application_staff_profile_id'] = $staffProfileId;
            $joins[] = 'INNER JOIN staff_barangay_assignments AS scope_assignments
                        ON scope_assignments.barangay_id = applicant_profiles.barangay_id
                       AND scope_assignments.staff_profile_id = :scope_assignment_staff_profile_id
                       AND scope_assignments.ended_at IS NULL';
            $conditions[] = 'applications.assigned_staff_profile_id = :scope_application_staff_profile_id';
        }

        if ($applicantProfileIds !== []) {
            $placeholders = [];
            foreach (array_values($applicantProfileIds) as $index => $applicantProfileId) {
                $key = 'applicant_profile_id_' . $index;
                $placeholders[] = ':' . $key;
                $params[$key] = $applicantProfileId;
            }
            $conditions[] = 'applicant_profiles.id IN (' . implode(', ', $placeholders) . ')';
        }

        $sql = '
              SELECT
                  applicant_profiles.id AS applicant_profile_id,
                  applicant_profiles.business_name,
                  applicant_profiles.barangay_id,
                  applicant_profiles.sector,
                  ' . $this->selectApplicantSectorOtherSpecifySql() . ',
                  ' . $this->selectApplicantLivelihoodCategorySql() . ',
                  ' . $this->selectApplicantLivelihoodTypeSql() . ',
                  ' . $this->selectApplicantBatchNoSql() . ',
                  applicant_profiles.contact_number,
                  users.id AS user_id,
                  users.full_name,
                  users.email,
                barangays.name AS barangay_name,
                beneficiary_profiles.id AS beneficiary_profile_id,
                applications.id AS application_id,
                applications.status AS application_status,
                applications.reviewed_at AS application_reviewed_at,
                applications.submitted_at AS application_submitted_at,
                applications.created_at AS application_created_at,
                applications.assigned_staff_profile_id,
                assigned_users.id AS assigned_pdo_user_id,
                assigned_users.full_name AS assigned_pdo_name
            FROM applicant_profiles
            INNER JOIN (
                SELECT MAX(applications.id) AS latest_application_id
                FROM applications
                GROUP BY applications.applicant_profile_id
            ) AS latest_applications ON latest_applications.latest_application_id IS NOT NULL
            INNER JOIN applications ON applications.id = latest_applications.latest_application_id
               AND applications.applicant_profile_id = applicant_profiles.id
            INNER JOIN users ON users.id = applicant_profiles.user_id
            LEFT JOIN roles AS user_roles ON user_roles.id = users.role_id
            LEFT JOIN barangays ON barangays.id = applicant_profiles.barangay_id
            LEFT JOIN beneficiary_profiles ON beneficiary_profiles.applicant_profile_id = applicant_profiles.id
            LEFT JOIN staff_profiles AS assigned_staff ON assigned_staff.id = applications.assigned_staff_profile_id
            LEFT JOIN users AS assigned_users ON assigned_users.id = assigned_staff.user_id
            ' . implode("\n", $joins) . '
            ' . ($conditions !== [] ? 'WHERE ' . implode(' AND ', $conditions) : '') . '
            ORDER BY users.full_name ASC
        ';

        try {
            $statement = db()->prepare($sql);
            foreach ($params as $key => $value) {
                $statement->bindValue(':' . $key, $value);
            }
            $statement->execute();
            return $statement->fetchAll(PDO::FETCH_ASSOC) ?: [];
        } catch (\Throwable $exception) {
            log_database_query_failure('training_eligibility.latest_applications', $exception, ['actor_id' => $actor['id'] ?? null]);
            return [];
        }
    }

    private function fetchRequiredRequirementTypes(): array
    {
        try {
            $statement = db()->query(
                'SELECT id, code, label
                 FROM initial_requirement_types
                 WHERE is_required = 1
                 ORDER BY id ASC'
            );
            return $statement->fetchAll(PDO::FETCH_ASSOC) ?: [];
        } catch (\Throwable $exception) {
            log_database_query_failure('training_eligibility.required_requirement_types', $exception);
            return [];
        }
    }

    private function fetchLatestRequirementRows(array $applicationIds): array
    {
        if ($applicationIds === []) {
            return [];
        }

        $placeholders = implode(', ', array_fill(0, count($applicationIds), '?'));
        $sql = "
            SELECT
                initial_requirement_files.id,
                initial_requirement_files.application_id,
                initial_requirement_files.requirement_type_id,
                initial_requirement_files.file_path,
                initial_requirement_files.review_status,
                initial_requirement_files.reviewed_by_user_id,
                initial_requirement_files.reviewed_at
            FROM initial_requirement_files
            WHERE initial_requirement_files.application_id IN ($placeholders)
            ORDER BY initial_requirement_files.id DESC
        ";

        try {
            $statement = db()->prepare($sql);
            foreach (array_values($applicationIds) as $index => $applicationId) {
                $statement->bindValue($index + 1, $applicationId, PDO::PARAM_INT);
            }
            $statement->execute();
            $rows = $statement->fetchAll(PDO::FETCH_ASSOC) ?: [];
        } catch (\Throwable $exception) {
            log_database_query_failure('training_eligibility.requirement_rows', $exception, ['application_ids' => $applicationIds]);
            return [];
        }

        $grouped = [];
        foreach ($rows as $row) {
            $applicationId = (int) ($row['application_id'] ?? 0);
            $requirementTypeId = (int) ($row['requirement_type_id'] ?? 0);
            if ($applicationId <= 0 || $requirementTypeId <= 0) {
                continue;
            }
            if (!isset($grouped[$applicationId][$requirementTypeId])) {
                $grouped[$applicationId][$requirementTypeId] = $row;
            }
        }

        return $grouped;
    }

    private function fetchApplicantBasics(array $applicantProfileIds): array
    {
        if ($applicantProfileIds === []) {
            return [];
        }

        $placeholders = implode(', ', array_fill(0, count($applicantProfileIds), '?'));
        $sql = "
              SELECT
                  applicant_profiles.id AS applicant_profile_id,
                  applicant_profiles.business_name,
                  applicant_profiles.sector,
                  {$this->selectApplicantSectorOtherSpecifySql()},
                  {$this->selectApplicantLivelihoodCategorySql()},
                  {$this->selectApplicantBatchNoSql()},
                  {$this->selectApplicantLivelihoodTypeSql()},
                  users.id AS user_id,
                  users.full_name,
                  users.email,
                barangays.name AS barangay_name,
                beneficiary_profiles.id AS beneficiary_profile_id
            FROM applicant_profiles
            INNER JOIN users ON users.id = applicant_profiles.user_id
            LEFT JOIN barangays ON barangays.id = applicant_profiles.barangay_id
            LEFT JOIN beneficiary_profiles ON beneficiary_profiles.applicant_profile_id = applicant_profiles.id
            WHERE applicant_profiles.id IN ($placeholders)
        ";

        try {
            $statement = db()->prepare($sql);
            foreach (array_values($applicantProfileIds) as $index => $applicantProfileId) {
                $statement->bindValue($index + 1, $applicantProfileId, PDO::PARAM_INT);
            }
            $statement->execute();
            $rows = $statement->fetchAll(PDO::FETCH_ASSOC) ?: [];
        } catch (\Throwable $exception) {
            log_database_query_failure('training_eligibility.applicant_basics', $exception, ['applicant_profile_ids' => $applicantProfileIds]);
            return [];
        }

        $basics = [];
        foreach ($rows as $row) {
              $basics[(int) $row['applicant_profile_id']] = [
                  'beneficiaryProfileId' => $row['beneficiary_profile_id'] !== null ? (int) $row['beneficiary_profile_id'] : null,
                  'name' => $row['full_name'],
                  'email' => $row['email'],
                  'barangay' => $row['barangay_name'],
                  'businessName' => $row['business_name'],
                  'sector' => $row['sector'],
                  'sectorOtherSpecify' => $row['sector_other_specify'] ?? null,
                  'livelihoodCategory' => $row['livelihood_category'] ?? null,
                  'batchNo' => $row['batch_no'] ?? null,
                  'livelihood' => $row['livelihood_type'] ?? null,
                  'userId' => (int) $row['user_id'],
              ];
        }

        return $basics;
    }

    private function applicantProfileColumns(): array
    {
        if ($this->applicantProfileColumnCache !== null) {
            return $this->applicantProfileColumnCache;
        }

        try {
            $statement = db()->query('SHOW COLUMNS FROM applicant_profiles');
            $rows = $statement->fetchAll(PDO::FETCH_ASSOC) ?: [];
            $this->applicantProfileColumnCache = array_map(
                static fn (array $row): string => (string) ($row['Field'] ?? ''),
                $rows
            );
        } catch (\Throwable $exception) {
            log_database_query_failure('training_eligibility.applicant_profile_columns', $exception);
            $this->applicantProfileColumnCache = [];
        }

        return $this->applicantProfileColumnCache;
    }

    private function selectApplicantBatchNoSql(): string
    {
        return in_array('batch_no', $this->applicantProfileColumns(), true)
            ? 'applicant_profiles.batch_no AS batch_no'
            : 'NULL AS batch_no';
    }

    private function selectApplicantLivelihoodCategorySql(): string
    {
        return in_array('livelihood_category', $this->applicantProfileColumns(), true)
            ? 'applicant_profiles.livelihood_category AS livelihood_category'
            : 'NULL AS livelihood_category';
    }

    private function selectApplicantLivelihoodTypeSql(): string
    {
        return in_array('livelihood_type', $this->applicantProfileColumns(), true)
            ? 'applicant_profiles.livelihood_type AS livelihood_type'
            : 'NULL AS livelihood_type';
    }

    private function selectApplicantSectorOtherSpecifySql(): string
    {
        return in_array('sector_other_specify', $this->applicantProfileColumns(), true)
            ? 'applicant_profiles.sector_other_specify AS sector_other_specify'
            : 'NULL AS sector_other_specify';
    }

    private function normalizeApplicationStatus(string $status): string
    {
        return match (strtolower(trim($status))) {
            'approved' => APPLICATION_STATUS_APPROVED,
            'approved for training', 'approved_for_training', 'approvedfortraining' => APPLICATION_STATUS_APPROVED_FOR_TRAINING,
            default => trim($status),
        };
    }

    private function normalizeRequirementStatus(string $status): string
    {
        $normalized = strtolower(trim($status));
        return match ($normalized) {
            'needs_correction' => 'needs correction',
            default => $normalized,
        };
    }

    private function findStaffProfileIdForUser(int $userId): ?int
    {
        if ($userId <= 0) {
            return null;
        }

        $statement = db()->prepare('SELECT id FROM staff_profiles WHERE user_id = :user_id LIMIT 1');
        $statement->execute(['user_id' => $userId]);
        $value = $statement->fetchColumn();
        return $value !== false ? (int) $value : null;
    }

    private function inferProjectOfficerReviewerUserId(array $requirementsByType, array $requiredTypes): ?int
    {
        $reviewerIds = [];
        foreach ($requiredTypes as $type) {
            $requirementRow = $requirementsByType[$type['id']] ?? null;
            if (!is_array($requirementRow)) {
                return null;
            }

            $filePath = trim((string) ($requirementRow['file_path'] ?? ''));
            $reviewStatus = $this->normalizeRequirementStatus((string) ($requirementRow['review_status'] ?? ''));
            $reviewerId = $requirementRow['reviewed_by_user_id'] !== null
                ? (int) $requirementRow['reviewed_by_user_id']
                : null;

            if ($filePath === '' || !in_array($reviewStatus, ['verified', 'approved'], true) || $reviewerId === null || $reviewerId <= 0) {
                return null;
            }

            $reviewerIds[$reviewerId] = true;
        }

        if (count($reviewerIds) !== 1) {
            return null;
        }

        $reviewerId = (int) array_key_first($reviewerIds);
        return $this->isProjectOfficerUser($reviewerId) ? $reviewerId : null;
    }

    private function isProjectOfficerUser(int $userId): bool
    {
        if ($userId <= 0) {
            return false;
        }

        if (array_key_exists($userId, $this->projectOfficerUserCache)) {
            return $this->projectOfficerUserCache[$userId];
        }

        try {
            $statement = db()->prepare(
                'SELECT roles.name
                 FROM users
                 INNER JOIN roles ON roles.id = users.role_id
                 INNER JOIN staff_profiles ON staff_profiles.user_id = users.id
                 WHERE users.id = :user_id
                   AND users.is_active = 1
                   AND staff_profiles.status = "active"
                 LIMIT 1'
            );
            $statement->execute(['user_id' => $userId]);
            $roleName = strtolower(trim((string) ($statement->fetchColumn() ?: '')));
        } catch (\Throwable $exception) {
            log_database_query_failure('training_eligibility.project_officer_reviewer', $exception, ['user_id' => $userId]);
            $roleName = '';
        }

        $this->projectOfficerUserCache[$userId] = str_contains($roleName, 'project');
        return $this->projectOfficerUserCache[$userId];
    }
}
