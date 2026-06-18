<?php
/**
 * SMART LEAP FILE GUIDE
 * Beneficiary profile and status service.
 * Promotes approved applicants into beneficiary records, updates beneficiary statuses, tracks assistance receipt, and manages successor/co-maker repayment links.
 */

declare(strict_types=1);

namespace App\Services;

use PDO;
use DateInterval;
use DateTimeImmutable;

class BeneficiaryProfileService
{
    public const BASE_BATCH_CAPACITY = 255;
    public const MAX_BATCH_CAPACITY = 300;
    public const STATUS_APPLICATION_WORKSPACE = 'application_workspace';
    public const STATUS_ACTIVE = 'active';
    public const STATUS_INACTIVE = 'inactive';
    public const STATUS_DECEASED = 'deceased';

    private const ELIGIBLE_APPLICATION_STATUSES = [
        APPLICATION_STATUS_APPROVED,
        APPLICATION_STATUS_APPROVED_FOR_TRAINING,
        APPLICATION_STATUS_TRAINING_ONGOING,
        APPLICATION_STATUS_COMPLETED,
    ];

    public function ensureForApplicantProfile(int $applicantProfileId, bool $activate = false): ?int
    {
        if ($applicantProfileId <= 0) {
            return null;
        }

        $source = $this->fetchApplicantSource($applicantProfileId);
        if ($source === null || !$this->applicantQualifiesForBeneficiary($applicantProfileId)) {
            return null;
        }

        $statement = db()->prepare(
            'SELECT beneficiary_profiles.id
             FROM beneficiary_profiles
             WHERE beneficiary_profiles.applicant_profile_id = :applicant_profile_id
             LIMIT 1'
        );
        $statement->execute(['applicant_profile_id' => $applicantProfileId]);
        $existingId = $statement->fetchColumn();
        if ($existingId !== false) {
            if ($activate) {
                $this->activateBeneficiaryProfile((int) $existingId, (int) $source['user_id']);
            }
            return (int) $existingId;
        }

        $insert = db()->prepare(
            'INSERT INTO beneficiary_profiles
             (user_id, applicant_profile_id, assigned_staff_profile_id, beneficiary_status, approval_date)
             VALUES (:user_id, :applicant_profile_id, :assigned_staff_profile_id, :beneficiary_status, :approval_date)'
        );
        $insert->execute([
            'user_id' => $source['user_id'],
            'applicant_profile_id' => $applicantProfileId,
            'assigned_staff_profile_id' => $source['assigned_staff_profile_id'],
            'beneficiary_status' => $activate ? self::STATUS_ACTIVE : 'pending_fund_release',
            'approval_date' => $activate ? date('Y-m-d') : null,
        ]);

        $beneficiaryProfileId = (int) db()->lastInsertId();
        if ($activate) {
            $this->activateBeneficiaryProfile($beneficiaryProfileId, (int) $source['user_id']);
        }

        return $beneficiaryProfileId;
    }

    public function activateForApplicantProfile(int $applicantProfileId): ?int
    {
        return $this->ensureForApplicantProfile($applicantProfileId, true);
    }

    public function recordAssistanceReceivedForApplicantProfile(int $applicantProfileId, ?DateTimeImmutable $receivedAt = null): ?int
    {
        if ($applicantProfileId <= 0) {
            return null;
        }

        $source = $this->fetchApplicantSource($applicantProfileId);
        if ($source === null || !$this->applicantQualifiesForBeneficiary($applicantProfileId)) {
            return null;
        }

        $beneficiaryProfileId = $this->ensureForApplicantProfile($applicantProfileId, false);
        if ($beneficiaryProfileId === null || $beneficiaryProfileId <= 0) {
            return null;
        }

        $this->activateBeneficiaryProfile(
            $beneficiaryProfileId,
            (int) $source['user_id'],
            $receivedAt ?? new DateTimeImmutable(),
            true
        );

        return $beneficiaryProfileId;
    }

    public function updateStatus(int $beneficiaryProfileId, string $status): array
    {
        $this->ensureReplacementLinkSchema();

        if ($beneficiaryProfileId <= 0) {
            return ['ok' => false, 'message' => 'Beneficiary profile not found.'];
        }

        $normalized = $this->normalizeManualStatus($status);
        if ($normalized === null) {
            return ['ok' => false, 'message' => 'Unsupported beneficiary status.'];
        }

        db()->prepare(
            'UPDATE beneficiary_profiles
             SET beneficiary_status = :beneficiary_status,
                 updated_at = NOW()
             WHERE id = :id'
        )->execute([
            'beneficiary_status' => $normalized,
            'id' => $beneficiaryProfileId,
        ]);

        return ['ok' => true, 'status' => $normalized];
    }

    public function updateAdminRecord(int $beneficiaryProfileId, string $status, ?int $repaymentSuccessorBeneficiaryProfileId = null): array
    {
        $this->ensureReplacementLinkSchema();

        if ($beneficiaryProfileId <= 0) {
            return ['ok' => false, 'message' => 'Beneficiary profile not found.'];
        }

        $normalized = $this->normalizeManualStatus($status);
        if ($normalized === null) {
            return ['ok' => false, 'message' => 'Unsupported beneficiary status.'];
        }

        $current = $this->findBeneficiaryProfile($beneficiaryProfileId);
        if ($current === null) {
            return ['ok' => false, 'message' => 'Beneficiary profile not found.'];
        }

        $pdo = db();
        $pdo->beginTransaction();

        try {
            $pdo->prepare(
                'UPDATE beneficiary_profiles
                 SET beneficiary_status = :beneficiary_status,
                     updated_at = NOW()
                 WHERE id = :id'
            )->execute([
                'beneficiary_status' => $normalized,
                'id' => $beneficiaryProfileId,
            ]);

            $sync = $this->syncRepaymentSuccessor($pdo, $beneficiaryProfileId, $normalized, $repaymentSuccessorBeneficiaryProfileId);
            if (!$sync['ok']) {
                $pdo->rollBack();
                return $sync;
            }

            (new CoMakerRegistrationService())->syncPrimaryBeneficiaryStatus($pdo, $beneficiaryProfileId, $normalized);

            $pdo->commit();
        } catch (\Throwable $exception) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }

            log_database_query_failure('beneficiary_profiles.update_admin_record', $exception, [
                'beneficiary_profile_id' => $beneficiaryProfileId,
                'status' => $normalized,
                'repayment_successor_beneficiary_profile_id' => $repaymentSuccessorBeneficiaryProfileId,
            ]);

            return ['ok' => false, 'message' => 'Unable to update the beneficiary record right now.'];
        }

        return [
            'ok' => true,
            'status' => $normalized,
            'repaymentSuccessorBeneficiaryProfileId' => $sync['repaymentSuccessorBeneficiaryProfileId'] ?? null,
            'message' => $sync['message'] ?? 'Beneficiary record updated.',
        ];
    }

    public function updateProjectOfficerRecord(array $actor, int $beneficiaryProfileId, string $status): array
    {
        return ['ok' => false, 'message' => 'Only Admin can update beneficiary active or deceased status.'];
    }

    public function recordAssistanceReceivedForProjectOfficerRecord(array $actor, int $beneficiaryProfileId): array
    {
        if (!$this->beneficiaryWithinProjectOfficerScope($actor, $beneficiaryProfileId)) {
            return ['ok' => false, 'message' => 'Beneficiary profile not found in your scope.'];
        }

        return $this->recordAssistanceReceivedForRecord($beneficiaryProfileId);
    }

    public function recordAssistanceReceivedForRecord(int $beneficiaryProfileId, ?DateTimeImmutable $receivedAt = null): array
    {
        $this->ensureReplacementLinkSchema();

        if ($beneficiaryProfileId <= 0) {
            return ['ok' => false, 'message' => 'Beneficiary profile not found.'];
        }

        $current = $this->findBeneficiaryProfile($beneficiaryProfileId);
        if ($current === null) {
            return ['ok' => false, 'message' => 'Beneficiary profile not found.'];
        }

        $status = strtolower(trim((string) ($current['beneficiary_status'] ?? '')));
        if ($status === self::STATUS_APPLICATION_WORKSPACE || $status === 'pending_fund_release') {
            return ['ok' => false, 'message' => 'Only approved beneficiary records can receive a repayment anchor.'];
        }

        $anchor = $receivedAt ?? $this->defaultBackfillAssistanceReceivedAt();
        $pdo = db();
        $pdo->beginTransaction();

        try {
            $pdo->prepare(
                'UPDATE beneficiary_profiles
                 SET approval_date = :approval_date,
                     approved_at = :approved_at,
                     updated_at = NOW()
                 WHERE id = :id'
            )->execute([
                'approval_date' => $anchor->format('Y-m-d'),
                'approved_at' => $anchor->format('Y-m-d H:i:s'),
                'id' => $beneficiaryProfileId,
            ]);

            $this->promoteUserToBeneficiary((int) ($current['user_id'] ?? 0));
            (new RepaymentScheduleService())->rebuildForBeneficiaryProfile($beneficiaryProfileId);

            $pdo->commit();
        } catch (\Throwable $exception) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }

            log_database_query_failure('beneficiary_profiles.record_assistance_received', $exception, [
                'beneficiary_profile_id' => $beneficiaryProfileId,
            ]);

            return ['ok' => false, 'message' => 'Unable to record assistance release right now.'];
        }

        return [
            'ok' => true,
            'message' => 'Assistance release date recorded.',
            'beneficiaryProfileId' => $beneficiaryProfileId,
            'approvedAt' => $anchor->format('Y-m-d H:i:s'),
            'approvalDate' => $anchor->format('Y-m-d'),
            'firstRepaymentDueDate' => (new RepaymentScheduleService())->firstDueDateForBeneficiaryContext(
                $anchor->format('Y-m-d H:i:s'),
                $anchor->format('Y-m-d')
            ),
        ];
    }

    private function defaultBackfillAssistanceReceivedAt(): DateTimeImmutable
    {
        $now = new DateTimeImmutable();
        $previousMonth = $now->modify('first day of this month')->sub(new DateInterval('P1M'));
        $lastDay = (int) $previousMonth->modify('last day of this month')->format('d');
        $day = min((int) $now->format('d'), $lastDay);

        return $previousMonth
            ->setDate((int) $previousMonth->format('Y'), (int) $previousMonth->format('m'), $day)
            ->setTime((int) $now->format('H'), (int) $now->format('i'), (int) $now->format('s'));
    }

    public function synchronizeSystemInactivityStatuses(): void
    {
        $this->ensureReplacementLinkSchema();

        try {
            $rows = db()->query(
                'SELECT
                    beneficiary_profiles.id,
                    LOWER(COALESCE(beneficiary_profiles.beneficiary_status, "")) AS beneficiary_status,
                    beneficiary_profiles.approval_date,
                    MAX(COALESCE(repayments.payment_date, DATE(repayments.created_at))) AS latest_payment_date
                 FROM beneficiary_profiles
                 LEFT JOIN repayments ON repayments.beneficiary_profile_id = beneficiary_profiles.id
                 WHERE beneficiary_profiles.replacement_for_beneficiary_profile_id IS NULL
                   AND beneficiary_profiles.approval_date IS NOT NULL
                   AND LOWER(COALESCE(beneficiary_profiles.beneficiary_status, "")) <> "deceased"
                 GROUP BY beneficiary_profiles.id, beneficiary_profiles.beneficiary_status, beneficiary_profiles.approval_date'
            )->fetchAll(PDO::FETCH_ASSOC) ?: [];
        } catch (\Throwable $exception) {
            log_database_query_failure('beneficiary_profiles.synchronize_system_inactivity_statuses.fetch', $exception);
            return;
        }

        if ($rows === []) {
            return;
        }

        $updates = [];
        foreach ($rows as $row) {
            $beneficiaryProfileId = (int) ($row['id'] ?? 0);
            if ($beneficiaryProfileId <= 0) {
                continue;
            }

            $currentStatus = strtolower(trim((string) ($row['beneficiary_status'] ?? '')));
            $desiredStatus = $this->shouldSystemMarkInactive($row)
                ? self::STATUS_INACTIVE
                : self::STATUS_ACTIVE;

            if ($currentStatus !== $desiredStatus) {
                $updates[$beneficiaryProfileId] = $desiredStatus;
            }
        }

        if ($updates === []) {
            return;
        }

        $statement = db()->prepare(
            'UPDATE beneficiary_profiles
             SET beneficiary_status = :beneficiary_status,
                 updated_at = NOW()
             WHERE id = :id'
        );

        foreach ($updates as $beneficiaryProfileId => $desiredStatus) {
            try {
                $statement->execute([
                    'beneficiary_status' => $desiredStatus,
                    'id' => $beneficiaryProfileId,
                ]);
            } catch (\Throwable $exception) {
                log_database_query_failure('beneficiary_profiles.synchronize_system_inactivity_statuses.update', $exception, [
                    'beneficiary_profile_id' => $beneficiaryProfileId,
                    'beneficiary_status' => $desiredStatus,
                ]);
            }
        }
    }

    public function deceasedCount(): int
    {
        $statement = db()->prepare(
            'SELECT COUNT(*)
             FROM beneficiary_profiles
             WHERE LOWER(COALESCE(beneficiary_status, "")) = :beneficiary_status'
        );
        $statement->execute(['beneficiary_status' => self::STATUS_DECEASED]);
        return (int) ($statement->fetchColumn() ?: 0);
    }

    public function activeBatchCapacity(): int
    {
        return min(self::MAX_BATCH_CAPACITY, self::BASE_BATCH_CAPACITY + $this->deceasedCount());
    }

    public function activeTrainingGroupSize(): int
    {
        return (int) ceil($this->activeBatchCapacity() / TRAINING_BATCH_GROUP_COUNT);
    }

    public function ensureReplacementLinkSchema(): void
    {
        static $ensured = false;
        if ($ensured) {
            return;
        }

        $missingRequirements = [];

        if (!$this->schemaColumnExists('beneficiary_profiles', 'replacement_for_beneficiary_profile_id')) {
            $missingRequirements[] = 'column beneficiary_profiles.replacement_for_beneficiary_profile_id (migration 046)';
        }

        if (!$this->schemaColumnExists('beneficiary_profiles', 'approved_at')) {
            $missingRequirements[] = 'column beneficiary_profiles.approved_at (migration 048)';
        }

        if (!$this->schemaIndexExists('beneficiary_profiles', 'idx_beneficiary_profiles_replacement_for')) {
            $missingRequirements[] = 'index beneficiary_profiles.idx_beneficiary_profiles_replacement_for (migration 046)';
        }

        if ($missingRequirements !== []) {
            write_app_log('schema', 'Beneficiary profile schema is outdated.', [
                'table' => 'beneficiary_profiles',
                'missing' => $missingRequirements,
            ]);

            throw new \RuntimeException(
                'Beneficiary profile schema is outdated. Run migrations 046_add_beneficiary_repayment_successor_link.sql and 048_add_beneficiary_approved_at_and_stage_one_email_tracking.sql.'
            );
        }

        $ensured = true;
    }

    private function schemaColumnExists(string $tableName, string $columnName): bool
    {
        $statement = db()->prepare(
            'SELECT COUNT(*) FROM information_schema.columns
             WHERE table_schema = DATABASE()
               AND table_name = :table_name
               AND column_name = :column_name'
        );
        $statement->execute([
            'table_name' => $tableName,
            'column_name' => $columnName,
        ]);

        return ((int) $statement->fetchColumn()) > 0;
    }

    private function schemaIndexExists(string $tableName, string $indexName): bool
    {
        $statement = db()->prepare(
            'SELECT COUNT(*) FROM information_schema.statistics
             WHERE table_schema = DATABASE()
               AND table_name = :table_name
               AND index_name = :index_name'
        );
        $statement->execute([
            'table_name' => $tableName,
            'index_name' => $indexName,
        ]);

        return ((int) $statement->fetchColumn()) > 0;
    }

    public function ensureWorkspaceProfileForApplicantProfile(int $applicantProfileId): ?int
    {
        if ($applicantProfileId <= 0) {
            return null;
        }

        $source = $this->fetchApplicantSource($applicantProfileId);
        if ($source === null) {
            return null;
        }

        $statement = db()->prepare(
            'SELECT beneficiary_profiles.id, beneficiary_profiles.beneficiary_status, beneficiary_profiles.approval_date
             FROM beneficiary_profiles
             WHERE beneficiary_profiles.applicant_profile_id = :applicant_profile_id
             LIMIT 1'
        );
        $statement->execute(['applicant_profile_id' => $applicantProfileId]);
        $existing = $statement->fetch(PDO::FETCH_ASSOC);
        if (is_array($existing)) {
            $existingId = (int) ($existing['id'] ?? 0);
            $existingStatus = strtolower(trim((string) ($existing['beneficiary_status'] ?? '')));
            $approvalDate = $existing['approval_date'] ?? null;

            if ($existingId > 0 && $approvalDate === null && $existingStatus === 'pending_fund_release') {
                db()->prepare(
                    'UPDATE beneficiary_profiles
                     SET beneficiary_status = :beneficiary_status, updated_at = NOW()
                     WHERE id = :id'
                )->execute([
                    'beneficiary_status' => self::STATUS_APPLICATION_WORKSPACE,
                    'id' => $existingId,
                ]);
            }

            return $existingId > 0 ? $existingId : null;
        }

        $insert = db()->prepare(
            'INSERT INTO beneficiary_profiles
             (user_id, applicant_profile_id, assigned_staff_profile_id, beneficiary_status, approval_date)
             VALUES (:user_id, :applicant_profile_id, :assigned_staff_profile_id, :beneficiary_status, :approval_date)'
        );
        $insert->execute([
            'user_id' => $source['user_id'],
            'applicant_profile_id' => $applicantProfileId,
            'assigned_staff_profile_id' => $source['assigned_staff_profile_id'],
            'beneficiary_status' => self::STATUS_APPLICATION_WORKSPACE,
            'approval_date' => null,
        ]);

        return (int) db()->lastInsertId();
    }

    private function fetchApplicantSource(int $applicantProfileId): ?array
    {
        $statement = db()->prepare(
            'SELECT applicant_profiles.user_id, applications.assigned_staff_profile_id
             FROM applicant_profiles
             LEFT JOIN applications ON applications.applicant_profile_id = applicant_profiles.id
             WHERE applicant_profiles.id = :applicant_profile_id
             ORDER BY applications.id DESC
             LIMIT 1'
        );
        $statement->execute(['applicant_profile_id' => $applicantProfileId]);
        $row = $statement->fetch(PDO::FETCH_ASSOC);

        if (!is_array($row)) {
            return null;
        }

        return [
            'user_id' => (int) $row['user_id'],
            'assigned_staff_profile_id' => $row['assigned_staff_profile_id'] !== null ? (int) $row['assigned_staff_profile_id'] : null,
        ];
    }

    private function applicantQualifiesForBeneficiary(int $applicantProfileId): bool
    {
        $statement = db()->prepare(
            'SELECT applications.status
             FROM applications
             WHERE applications.applicant_profile_id = :applicant_profile_id
             ORDER BY applications.id DESC
             LIMIT 1'
        );
        $statement->execute(['applicant_profile_id' => $applicantProfileId]);
        $status = $statement->fetchColumn();
        if (!is_string($status) || trim($status) === '') {
            return false;
        }

        return in_array($this->normalizeApplicationStatus($status), self::ELIGIBLE_APPLICATION_STATUSES, true);
    }

    private function normalizeApplicationStatus(string $status): string
    {
        return match (strtolower(trim($status))) {
            'approved' => APPLICATION_STATUS_APPROVED,
            'approved for training', 'approved_for_training', 'approvedfortraining' => APPLICATION_STATUS_APPROVED_FOR_TRAINING,
            'training ongoing', 'training_ongoing', 'trainingongoing' => APPLICATION_STATUS_TRAINING_ONGOING,
            'completed' => APPLICATION_STATUS_COMPLETED,
            default => trim($status),
        };
    }

    private function normalizeStatus(string $status): ?string
    {
        return match (strtolower(trim($status))) {
            self::STATUS_ACTIVE => self::STATUS_ACTIVE,
            self::STATUS_INACTIVE => self::STATUS_INACTIVE,
            self::STATUS_DECEASED => self::STATUS_DECEASED,
            default => null,
        };
    }

    private function normalizeManualStatus(string $status): ?string
    {
        return match (strtolower(trim($status))) {
            self::STATUS_ACTIVE => self::STATUS_ACTIVE,
            self::STATUS_DECEASED => self::STATUS_DECEASED,
            default => null,
        };
    }

    private function shouldSystemMarkInactive(array $row): bool
    {
        $latestPaymentDate = trim((string) ($row['latest_payment_date'] ?? ''));
        $approvalDate = trim((string) ($row['approval_date'] ?? ''));
        $referenceDate = $latestPaymentDate !== '' ? $latestPaymentDate : $approvalDate;
        if ($referenceDate === '') {
            return false;
        }

        try {
            $reference = new DateTimeImmutable($referenceDate);
        } catch (\Throwable) {
            return false;
        }

        $cutoff = (new DateTimeImmutable('now'))->sub(new DateInterval('P3M'));
        return $reference < $cutoff;
    }

    private function beneficiaryWithinProjectOfficerScope(array $actor, int $beneficiaryProfileId): bool
    {
        $userId = (int) ($actor['id'] ?? 0);
        if ($userId <= 0 || $beneficiaryProfileId <= 0) {
            return false;
        }

        $statement = db()->prepare(
            'SELECT COUNT(*)
             FROM beneficiary_profiles
             INNER JOIN applicant_profiles ON applicant_profiles.id = beneficiary_profiles.applicant_profile_id
             INNER JOIN staff_profiles ON staff_profiles.user_id = :user_id
             INNER JOIN staff_barangay_assignments
                 ON staff_barangay_assignments.staff_profile_id = staff_profiles.id
                AND staff_barangay_assignments.barangay_id = applicant_profiles.barangay_id
                AND staff_barangay_assignments.ended_at IS NULL
             WHERE beneficiary_profiles.id = :beneficiary_profile_id'
        );
        $statement->execute([
            'user_id' => $userId,
            'beneficiary_profile_id' => $beneficiaryProfileId,
        ]);

        return ((int) $statement->fetchColumn()) > 0;
    }

    private function promoteUserToBeneficiary(int $userId): void
    {
        if ($userId <= 0) {
            return;
        }

        $roleId = $this->findRoleIdByName(ROLE_BENEFICIARY);
        if ($roleId === null) {
            return;
        }

        db()->prepare(
            'UPDATE users
             SET role_id = :role_id, updated_at = NOW()
             WHERE id = :user_id'
        )->execute([
            'role_id' => $roleId,
            'user_id' => $userId,
        ]);
    }

    private function activateBeneficiaryProfile(
        int $beneficiaryProfileId,
        int $userId,
        ?DateTimeImmutable $approvedAt = null,
        bool $replaceApprovalAnchor = false
    ): void
    {
        $approvalAnchor = $approvedAt ?? new DateTimeImmutable();
        $approvalDateValue = $approvalAnchor->format('Y-m-d');
        $approvedAtValue = $approvalAnchor->format('Y-m-d H:i:s');

        if ($beneficiaryProfileId > 0) {
            $statusStatement = db()->prepare(
                'SELECT LOWER(COALESCE(beneficiary_status, "")) AS beneficiary_status
                 FROM beneficiary_profiles
                 WHERE id = :id
                 LIMIT 1'
            );
            $statusStatement->execute(['id' => $beneficiaryProfileId]);
            if ((string) ($statusStatement->fetchColumn() ?: '') === self::STATUS_DECEASED) {
                return;
            }

            if ($replaceApprovalAnchor) {
                db()->prepare(
                    'UPDATE beneficiary_profiles
                     SET beneficiary_status = :beneficiary_status,
                         approval_date = :approval_date,
                         approved_at = :approved_at,
                         updated_at = NOW()
                     WHERE id = :id'
                )->execute([
                    'beneficiary_status' => self::STATUS_ACTIVE,
                    'approval_date' => $approvalDateValue,
                    'approved_at' => $approvedAtValue,
                    'id' => $beneficiaryProfileId,
                ]);
            } else {
                db()->prepare(
                    'UPDATE beneficiary_profiles
                     SET beneficiary_status = :beneficiary_status,
                         approval_date = COALESCE(approval_date, :approval_date),
                         approved_at = COALESCE(approved_at, :approved_at),
                         updated_at = NOW()
                     WHERE id = :id'
                )->execute([
                    'beneficiary_status' => self::STATUS_ACTIVE,
                    'approval_date' => $approvalDateValue,
                    'approved_at' => $approvedAtValue,
                    'id' => $beneficiaryProfileId,
                ]);
            }
        }

        $this->promoteUserToBeneficiary($userId);
        $scheduleService = new RepaymentScheduleService();
        if ($replaceApprovalAnchor) {
            $scheduleService->rebuildForBeneficiaryProfile($beneficiaryProfileId);
        } else {
            $scheduleService->ensureForBeneficiaryProfile($beneficiaryProfileId);
        }
    }

    private function syncRepaymentSuccessor(PDO $pdo, int $beneficiaryProfileId, string $status, ?int $repaymentSuccessorBeneficiaryProfileId): array
    {
        if ($status !== self::STATUS_DECEASED) {
            $pdo->prepare(
                'UPDATE beneficiary_profiles
                 SET replacement_for_beneficiary_profile_id = NULL,
                     updated_at = NOW()
                 WHERE replacement_for_beneficiary_profile_id = :beneficiary_profile_id'
            )->execute(['beneficiary_profile_id' => $beneficiaryProfileId]);

            return ['ok' => true, 'message' => 'Beneficiary record updated.'];
        }

        $pdo->prepare(
            'UPDATE beneficiary_profiles
             SET replacement_for_beneficiary_profile_id = NULL,
                 updated_at = NOW()
             WHERE id = :beneficiary_profile_id'
        )->execute(['beneficiary_profile_id' => $beneficiaryProfileId]);

        if ($repaymentSuccessorBeneficiaryProfileId === null || $repaymentSuccessorBeneficiaryProfileId <= 0) {
            $pdo->prepare(
                'UPDATE beneficiary_profiles
                 SET replacement_for_beneficiary_profile_id = NULL,
                     updated_at = NOW()
                 WHERE replacement_for_beneficiary_profile_id = :beneficiary_profile_id'
            )->execute(['beneficiary_profile_id' => $beneficiaryProfileId]);

            return ['ok' => true, 'message' => 'Beneficiary marked as deceased. No repayment successor linked yet.'];
        }

        if ($repaymentSuccessorBeneficiaryProfileId === $beneficiaryProfileId) {
            return ['ok' => false, 'message' => 'A beneficiary cannot be their own repayment successor.'];
        }

        $successor = $this->findBeneficiaryProfile($repaymentSuccessorBeneficiaryProfileId, $pdo);
        if ($successor === null) {
            return ['ok' => false, 'message' => 'Selected repayment successor was not found.'];
        }

        if (strtolower(trim((string) ($successor['beneficiary_status'] ?? ''))) === self::STATUS_DECEASED) {
            return ['ok' => false, 'message' => 'A deceased beneficiary cannot be assigned as a repayment successor.'];
        }

        $currentReplacementFor = (int) ($successor['replacement_for_beneficiary_profile_id'] ?? 0);
        if ($currentReplacementFor > 0 && $currentReplacementFor !== $beneficiaryProfileId) {
            return ['ok' => false, 'message' => 'This beneficiary is already linked as the repayment successor for another deceased beneficiary.'];
        }

        if ($this->beneficiaryHasOwnRepaymentSubmissions($repaymentSuccessorBeneficiaryProfileId, $pdo)) {
            return ['ok' => false, 'message' => 'This beneficiary already has repayment submissions on their own account and cannot be reassigned as a repayment successor.'];
        }

        $pdo->prepare(
            'UPDATE beneficiary_profiles
             SET replacement_for_beneficiary_profile_id = NULL,
                 updated_at = NOW()
             WHERE replacement_for_beneficiary_profile_id = :beneficiary_profile_id
               AND id <> :successor_beneficiary_profile_id'
        )->execute([
            'beneficiary_profile_id' => $beneficiaryProfileId,
            'successor_beneficiary_profile_id' => $repaymentSuccessorBeneficiaryProfileId,
        ]);

        $pdo->prepare(
            'UPDATE beneficiary_profiles
             SET replacement_for_beneficiary_profile_id = :beneficiary_profile_id,
                 updated_at = NOW()
             WHERE id = :successor_beneficiary_profile_id'
        )->execute([
            'beneficiary_profile_id' => $beneficiaryProfileId,
            'successor_beneficiary_profile_id' => $repaymentSuccessorBeneficiaryProfileId,
        ]);

        return [
            'ok' => true,
            'repaymentSuccessorBeneficiaryProfileId' => $repaymentSuccessorBeneficiaryProfileId,
            'message' => 'Beneficiary marked as deceased and repayment successor linked.',
        ];
    }

    private function beneficiaryHasOwnRepaymentSubmissions(int $beneficiaryProfileId, PDO $pdo): bool
    {
        $statement = $pdo->prepare(
            'SELECT COUNT(*)
             FROM repayments
             WHERE beneficiary_profile_id = :beneficiary_profile_id'
        );
        $statement->execute(['beneficiary_profile_id' => $beneficiaryProfileId]);

        return ((int) $statement->fetchColumn()) > 0;
    }

    private function findBeneficiaryProfile(int $beneficiaryProfileId, ?PDO $pdo = null): ?array
    {
        $connection = $pdo ?? db();
        $statement = $connection->prepare(
            'SELECT id,
                    user_id,
                    applicant_profile_id,
                    assigned_staff_profile_id,
                    beneficiary_status,
                    approval_date,
                    replacement_for_beneficiary_profile_id
             FROM beneficiary_profiles
             WHERE id = :id
             LIMIT 1'
        );
        $statement->execute(['id' => $beneficiaryProfileId]);
        $row = $statement->fetch(PDO::FETCH_ASSOC);

        return is_array($row) ? $row : null;
    }

    private function findRoleIdByName(string $name): ?int
    {
        $statement = db()->prepare('SELECT id FROM roles WHERE name = :name LIMIT 1');
        $statement->execute(['name' => $name]);
        $roleId = $statement->fetchColumn();
        return $roleId !== false ? (int) $roleId : null;
    }
}
