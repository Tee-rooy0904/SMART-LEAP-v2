<?php


declare(strict_types=1);

namespace App\Services;

use PDO;

class RepaymentLedgerService
{
    public function listForBeneficiary(int $userId): array
    {
        $this->ensureHardCopyOfficeStatusColumn();
        $this->ensureReplacementLinkSchema();
        $account = $this->resolveRepaymentAccountForUser($userId);
        if ($account === null) {
            return ['payments' => [], 'account' => null];
        }

        return [
            'payments' => $this->fetchRepayments(['repayments.beneficiary_profile_id = :beneficiary_profile_id'], [
                'beneficiary_profile_id' => (int) $account['repaymentSourceBeneficiaryProfileId'],
            ]),
            'account' => $account,
        ];
    }

    public function submitForBeneficiary(int $userId, array $payload): array
    {
        $this->ensureHardCopyOfficeStatusColumn();
        $this->ensureReplacementLinkSchema();
        $account = $this->resolveRepaymentAccountForUser($userId);
        if ($account === null) {
            return ['ok' => false, 'message' => 'Beneficiary profile not found.'];
        }
        $beneficiaryProfileId = (int) $account['repaymentSourceBeneficiaryProfileId'];

        $records = $payload['payments'] ?? [];
        if (!is_array($records) || $records === []) {
            return ['ok' => false, 'message' => 'No repayment records were submitted.'];
        }

        $errors = $this->validateRecords($records, $beneficiaryProfileId);
        if ($errors !== []) {
            return ['ok' => false, 'message' => $errors[0]];
        }

        $pdo = db();
        $pdo->beginTransaction();

        try {
            $uploadService = new UploadService();
            $insertRepayment = $pdo->prepare(
                'INSERT INTO repayments
                    (beneficiary_profile_id, submission_group_id, amount, payment_date, official_receipt_number, proof_file_path, proof_original_name, proof_mime_type, hard_copy_office_status, status)
                 VALUES
                    (:beneficiary_profile_id, :submission_group_id, :amount, :payment_date, :official_receipt_number, :proof_file_path, :proof_original_name, :proof_mime_type, :hard_copy_office_status, :status)'
            );
            $insertCoverage = $pdo->prepare(
                'INSERT INTO repayment_coverage_months (repayment_id, coverage_month)
                 VALUES (:repayment_id, :coverage_month)'
            );
            $insertVerification = $pdo->prepare(
                'INSERT INTO repayment_verifications (repayment_id, verification_status, remarks)
                 VALUES (:repayment_id, :verification_status, :remarks)'
            );
            $insertHistory = $pdo->prepare(
                'INSERT INTO repayment_status_history (repayment_id, changed_by_user_id, from_status, to_status, remarks)
                 VALUES (:repayment_id, :changed_by_user_id, :from_status, :to_status, :remarks)'
            );

            foreach ($records as $record) {
                $proofMeta = $uploadService->storeRepaymentAssetFromDataUrl(
                    trim((string) ($record['proofName'] ?? 'repayment-proof')),
                    trim((string) ($record['proof'] ?? ''))
                );
                $submissionGroupId = trim((string) ($record['parentSubmissionId'] ?? ''));
                $paymentDate = trim((string) ($record['paymentDate'] ?? ''));
                $month = trim((string) ($record['month'] ?? ''));
                $notes = trim((string) ($record['notes'] ?? ''));

                $insertRepayment->execute([
                    'beneficiary_profile_id' => $beneficiaryProfileId,
                    'submission_group_id' => $submissionGroupId !== '' ? $submissionGroupId : null,
                    'amount' => $this->normalizeAmount($record['amount'] ?? 0),
                    'payment_date' => $paymentDate,
                    'official_receipt_number' => $this->sanitizeOrNumber((string) ($record['orNumber'] ?? '')),
                    'proof_file_path' => $proofMeta['file_path'],
                    'proof_original_name' => $proofMeta['original_name'],
                    'proof_mime_type' => $proofMeta['mime_type'],
                    'hard_copy_office_status' => 'not_submitted',
                    'status' => 'uploaded',
                ]);

                $repaymentId = (int) $pdo->lastInsertId();
                $insertCoverage->execute([
                    'repayment_id' => $repaymentId,
                    'coverage_month' => $this->normalizeCoverageMonth($month),
                ]);
                $insertVerification->execute([
                    'repayment_id' => $repaymentId,
                    'verification_status' => 'uploaded',
                    'remarks' => $notes !== '' ? $notes : null,
                ]);
                $insertHistory->execute([
                    'repayment_id' => $repaymentId,
                    'changed_by_user_id' => $userId,
                    'from_status' => null,
                    'to_status' => 'uploaded',
                    'remarks' => $notes !== '' ? $notes : null,
                ]);
            }

            $pdo->commit();
        } catch (\Throwable $exception) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }

            log_database_query_failure('repayment.submit_for_beneficiary', $exception, [
                'user_id' => $userId,
                'beneficiary_profile_id' => $beneficiaryProfileId,
            ]);

            return ['ok' => false, 'message' => 'Unable to submit the repayment record right now.'];
        }

        $this->notifyRepaymentSubmitted($beneficiaryProfileId, $userId, count($records));

        return [
            'ok' => true,
            'message' => 'Repayment record submitted. Pending verification.',
            'data' => $this->listForBeneficiary($userId),
        ];
    }

    public function listForProjectOfficer(array $actor): array
    {
        $this->ensureHardCopyOfficeStatusColumn();
        $staffProfileId = $this->findStaffProfileIdForUser((int) ($actor['id'] ?? 0));
        if ($staffProfileId === null) {
            return ['payments' => []];
        }

        $scopeBarangays = $this->findAssignedBarangayIds($staffProfileId);
        $conditions = ['(beneficiary_profiles.assigned_staff_profile_id = :staff_profile_id'];
        $params = ['staff_profile_id' => $staffProfileId];

        if ($scopeBarangays !== []) {
            $placeholders = [];
            foreach ($scopeBarangays as $index => $barangayId) {
                $key = 'barangay_' . $index;
                $placeholders[] = ':' . $key;
                $params[$key] = $barangayId;
            }
            $conditions[0] .= ' OR applicant_profiles.barangay_id IN (' . implode(', ', $placeholders) . ')';
        }

        $conditions[0] .= ')';

        return ['payments' => $this->fetchRepayments($conditions, $params)];
    }

    public function listForReviewer(array $actor): array
    {
        $this->ensureHardCopyOfficeStatusColumn();
        $role = strtolower((string) ($actor['role'] ?? ''));
        if (str_contains($role, 'admin') || str_contains($role, 'social')) {
            return ['payments' => $this->fetchRepayments([], [])];
        }

        return $this->listForProjectOfficer($actor);
    }

    public function updateRepaymentInputData(int $repaymentId, array $payload, array $actor): array
    {
        $this->ensureHardCopyOfficeStatusColumn();

        $role = strtolower((string) ($actor['role'] ?? ''));
        if (!str_contains($role, 'social') && !str_contains($role, 'admin')) {
            return ['ok' => false, 'message' => 'You are not allowed to correct repayment input data.'];
        }

        $repayment = $this->findRepaymentForDataEditor($repaymentId, $actor);
        if ($repayment === null) {
            return ['ok' => false, 'message' => 'Repayment record not found.'];
        }

        if (str_contains($role, 'social') && !str_contains($role, 'admin') && $this->hasRepaymentStaffReview($repaymentId)) {
            return ['ok' => false, 'message' => 'This repayment has already been checked by PDO/Admin and is locked for Social Worker input correction.'];
        }

        $reason = trim((string) ($payload['correctionReason'] ?? $payload['remarks'] ?? ''));
        if (strlen($reason) < 10) {
            return ['ok' => false, 'message' => 'Correction reason must be at least 10 characters.'];
        }

        $amount = $this->normalizeAmount($payload['amount'] ?? $repayment['amount'] ?? 0);
        $paymentDate = trim((string) ($payload['paymentDate'] ?? $repayment['payment_date'] ?? ''));
        $orNumber = $this->sanitizeOrNumber((string) ($payload['orNumber'] ?? $payload['officialReceiptNumber'] ?? $repayment['official_receipt_number'] ?? ''));
        $coverageMonth = trim((string) ($payload['month'] ?? $payload['coverageMonth'] ?? ''));
        $currentHardCopyOfficeStatus = $this->normalizeHardCopyOfficeStatus((string) ($repayment['hard_copy_office_status'] ?? '')) ?? 'not_submitted';
        $hardCopyOfficeStatus = array_key_exists('hardCopyOfficeStatus', $payload)
            ? $this->normalizeHardCopyOfficeStatus((string) $payload['hardCopyOfficeStatus'])
            : $currentHardCopyOfficeStatus;

        if ($amount <= 0) {
            return ['ok' => false, 'message' => 'Repayment amount must be greater than zero.'];
        }

        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $paymentDate)) {
            return ['ok' => false, 'message' => 'Payment date must use YYYY-MM-DD format.'];
        }

        if ($orNumber === '') {
            return ['ok' => false, 'message' => 'Official receipt number is required.'];
        }

        if ($coverageMonth !== '' && !preg_match('/^\d{4}-\d{2}$/', $coverageMonth)) {
            return ['ok' => false, 'message' => 'Coverage month must use YYYY-MM format.'];
        }
        if ($coverageMonth !== '') {
            $coverageWindow = $this->repaymentCoverageWindow((int) ($repayment['beneficiary_profile_id'] ?? 0));
            if ($coverageWindow !== null && !$this->isCoverageMonthWithinWindow($coverageMonth, $coverageWindow)) {
                return [
                    'ok' => false,
                    'message' => sprintf(
                        'Repayments for this beneficiary can only start at %s.',
                        $this->formatCoverageMonthLabel($coverageWindow['start'])
                    ),
                ];
            }
        }

        if ($hardCopyOfficeStatus === null) {
            return ['ok' => false, 'message' => 'Unsupported hard copy office status.'];
        }

        if (str_contains($role, 'social') && !str_contains($role, 'admin') && $hardCopyOfficeStatus !== $currentHardCopyOfficeStatus) {
            return ['ok' => false, 'message' => 'Social Workers can correct repayment input data, but cannot update repayment or office status fields.'];
        }

        $beneficiaryProfileId = (int) ($repayment['beneficiary_profile_id'] ?? 0);
        if ($this->orNumberExistsForOtherRepayment($beneficiaryProfileId, $orNumber, $repaymentId)) {
            return ['ok' => false, 'message' => sprintf('The OR number %s already exists in this beneficiary repayment record.', $orNumber)];
        }

        if ($coverageMonth !== '' && $this->coverageMonthExistsForOtherRepayment($beneficiaryProfileId, $coverageMonth, $repaymentId)) {
            return ['ok' => false, 'message' => sprintf('A repayment for %s already exists in this beneficiary repayment record.', $coverageMonth)];
        }

        $pdo = db();
        $pdo->beginTransaction();
        try {
            $update = $pdo->prepare(
                'UPDATE repayments
                 SET amount = :amount,
                     payment_date = :payment_date,
                     official_receipt_number = :official_receipt_number,
                     hard_copy_office_status = :hard_copy_office_status,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = :id'
            );
            $update->execute([
                'amount' => $amount,
                'payment_date' => $paymentDate,
                'official_receipt_number' => $orNumber,
                'hard_copy_office_status' => $hardCopyOfficeStatus,
                'id' => $repaymentId,
            ]);

            if ($coverageMonth !== '') {
                $deleteCoverage = $pdo->prepare('DELETE FROM repayment_coverage_months WHERE repayment_id = :repayment_id');
                $deleteCoverage->execute(['repayment_id' => $repaymentId]);

                $insertCoverage = $pdo->prepare(
                    'INSERT INTO repayment_coverage_months (repayment_id, coverage_month)
                     VALUES (:repayment_id, :coverage_month)'
                );
                $insertCoverage->execute([
                    'repayment_id' => $repaymentId,
                    'coverage_month' => $this->normalizeCoverageMonth($coverageMonth),
                ]);
            }

            $history = $pdo->prepare(
                'INSERT INTO repayment_status_history
                    (repayment_id, changed_by_user_id, from_status, to_status, remarks)
                 VALUES
                    (:repayment_id, :changed_by_user_id, :from_status, :to_status, :remarks)'
            );
            $history->execute([
                'repayment_id' => $repaymentId,
                'changed_by_user_id' => (int) ($actor['id'] ?? 0),
                'from_status' => (string) ($repayment['status'] ?? 'uploaded'),
                'to_status' => (string) ($repayment['status'] ?? 'uploaded'),
                'remarks' => 'Input correction: ' . $reason,
            ]);

            $pdo->commit();
        } catch (\Throwable $exception) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }

            log_database_query_failure('repayment.update_input_data', $exception, [
                'repayment_id' => $repaymentId,
                'actor_id' => (int) ($actor['id'] ?? 0),
            ]);

            return ['ok' => false, 'message' => 'Unable to update the repayment input data right now.'];
        }

        return [
            'ok' => true,
            'message' => 'Repayment input data updated.',
            'data' => $this->listForReviewer($actor),
        ];
    }

    public function reviewRepayment(int $repaymentId, string $status, ?string $remarks, ?string $hardCopyOfficeStatus, array $actor): array
    {
        $this->ensureHardCopyOfficeStatusColumn();
        $status = $this->normalizeReviewStatus($status);
        if ($status === null) {
            return ['ok' => false, 'message' => 'Unsupported repayment review status.'];
        }

        $normalizedHardCopyStatus = $this->normalizeHardCopyOfficeStatus($hardCopyOfficeStatus);
        if ($normalizedHardCopyStatus === null) {
            return ['ok' => false, 'message' => 'Unsupported hard copy office status.'];
        }

        if (in_array($status, ['needs_correction', 'rejected'], true) && trim((string) $remarks) === '') {
            return ['ok' => false, 'message' => 'Reviewer remarks are required for this decision.'];
        }

        $repayment = $this->findRepaymentForReviewer($repaymentId, $actor);
        if ($repayment === null) {
            return ['ok' => false, 'message' => 'Repayment record not found.'];
        }

        $pdo = db();
        $pdo->beginTransaction();

        try {
            $update = $pdo->prepare(
                'UPDATE repayments
                 SET status = :status,
                     hard_copy_office_status = :hard_copy_office_status,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = :id'
            );
            $update->execute([
                'status' => $status,
                'hard_copy_office_status' => $normalizedHardCopyStatus,
                'id' => $repaymentId,
            ]);

            $verification = $pdo->prepare(
                'INSERT INTO repayment_verifications
                    (repayment_id, verified_by_user_id, verification_status, remarks, verified_at)
                 VALUES
                    (:repayment_id, :verified_by_user_id, :verification_status, :remarks, :verified_at)'
            );
            $verification->execute([
                'repayment_id' => $repaymentId,
                'verified_by_user_id' => (int) ($actor['id'] ?? 0),
                'verification_status' => $status,
                'remarks' => $remarks !== null && trim($remarks) !== '' ? trim($remarks) : null,
                'verified_at' => date('Y-m-d H:i:s'),
            ]);

            $history = $pdo->prepare(
                'INSERT INTO repayment_status_history
                    (repayment_id, changed_by_user_id, from_status, to_status, remarks)
                 VALUES
                    (:repayment_id, :changed_by_user_id, :from_status, :to_status, :remarks)'
            );
            $history->execute([
                'repayment_id' => $repaymentId,
                'changed_by_user_id' => (int) ($actor['id'] ?? 0),
                'from_status' => $repayment['status'],
                'to_status' => $status,
                'remarks' => $remarks !== null && trim($remarks) !== '' ? trim($remarks) : null,
            ]);

            $pdo->commit();
        } catch (\Throwable $exception) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }

            log_database_query_failure('repayment.review', $exception, [
                'repayment_id' => $repaymentId,
                'actor_id' => (int) ($actor['id'] ?? 0),
            ]);

            return ['ok' => false, 'message' => 'Unable to save the repayment review right now.'];
        }

        $this->notifyRepaymentReviewed($repaymentId, $status, trim((string) $remarks), $actor);
        $this->notifyAssignedRepaymentStaff($repaymentId, $status, trim((string) $remarks), (int) ($actor['id'] ?? 0));

        return [
            'ok' => true,
            'message' => match ($status) {
                'verified' => 'Repayment submission verified.',
                'needs_correction' => 'Repayment marked for correction.',
                'rejected' => 'Repayment rejected.',
                default => 'Repayment review saved.',
            },
        ];
    }

    private function notifyRepaymentSubmitted(int $beneficiaryProfileId, int $beneficiaryUserId, int $recordCount): void
    {
        $context = $this->repaymentNotificationContext($beneficiaryProfileId);
        $beneficiaryName = $context['beneficiary_name'] ?? 'Beneficiary';
        $businessName = $context['business_name'] ?? 'livelihood record';
        $barangay = $context['barangay_name'] ?? 'assigned barangay';
        $countText = $recordCount === 1 ? '1 repayment receipt' : $recordCount . ' repayment receipts';

        $notificationService = new NotificationService();
        $notificationService->createInApp(
            $beneficiaryUserId,
            'Repayment receipt submitted',
            'Your repayment receipt was submitted and is waiting for PDO/Admin verification.',
            'repayment_submission'
        );

        $reviewerIds = $this->repaymentReviewerUserIds($context);
        foreach ($reviewerIds as $reviewerId) {
            if ($reviewerId === $beneficiaryUserId) {
                continue;
            }
            $notificationService->createInApp(
                $reviewerId,
                'Repayment receipt needs review',
                sprintf('%s submitted %s for %s in %s.', $beneficiaryName, $countText, $businessName, $barangay),
                'repayment_review_queue'
            );
        }
    }

    private function notifyRepaymentReviewed(int $repaymentId, string $status, string $remarks, array $actor): void
    {
        $context = $this->repaymentNotificationContextForRepayment($repaymentId);
        $beneficiaryUserId = (int) ($context['beneficiary_user_id'] ?? 0);
        if ($beneficiaryUserId <= 0) {
            return;
        }

        $hardCopyStatus = (string) ($context['hard_copy_office_status'] ?? '');
        $statusLabel = match ($status) {
            'verified' => $hardCopyStatus === 'confirmed_by_office' ? 'fully verified' : 'partially verified',
            'needs_correction' => 'marked for correction',
            'rejected' => 'rejected',
            default => 'reviewed',
        };
        $actorName = trim((string) ($actor['name'] ?? 'SMART LEAP staff'));
        $orNumber = trim((string) ($context['official_receipt_number'] ?? ''));
        $message = sprintf(
            'Your repayment receipt%s was %s by %s.',
            $orNumber !== '' ? ' ' . $orNumber : '',
            $statusLabel,
            $actorName !== '' ? $actorName : 'SMART LEAP staff'
        );

        if ($remarks !== '') {
            $message .= ' Remarks: ' . $remarks;
        }

        (new NotificationService())->createInApp(
            $beneficiaryUserId,
            'Repayment review update',
            $message,
            'repayment_review_result'
        );
    }

    private function notifyAssignedRepaymentStaff(int $repaymentId, string $status, string $remarks, int $actorUserId): void
    {
        $context = $this->repaymentNotificationContextForRepayment($repaymentId);
        $assignedStaffProfileId = (int) ($context['assigned_staff_profile_id'] ?? 0);
        $assignedUserId = (new NotificationService())->userIdForStaffProfileId($assignedStaffProfileId);
        if ($assignedUserId === null || $assignedUserId === $actorUserId) {
            return;
        }

        $statusLabel = match ($status) {
            'verified' => (string) (($context['hard_copy_office_status'] ?? '') === 'confirmed_by_office' ? 'fully verified' : 'partially verified'),
            'needs_correction' => 'marked for correction',
            'rejected' => 'rejected',
            default => 'reviewed',
        };
        $beneficiaryName = trim((string) ($context['beneficiary_name'] ?? ''));
        $businessName = trim((string) ($context['business_name'] ?? ''));
        $barangayName = trim((string) ($context['barangay_name'] ?? ''));
        $subjectParts = array_filter([$beneficiaryName, $businessName, $barangayName], static fn (string $value): bool => $value !== '');
        $subject = $subjectParts !== [] ? implode(' | ', $subjectParts) : 'the repayment submission';
        $message = sprintf('%s was %s.', $subject, $statusLabel);
        if ($remarks !== '') {
            $message .= ' Remarks: ' . $remarks;
        }

        (new NotificationService())->createInApp(
            $assignedUserId,
            'Repayment review update',
            $message,
            'repayment_review_result'
        );
    }

    private function repaymentNotificationContextForRepayment(int $repaymentId): array
    {
        try {
            $statement = db()->prepare(
                'SELECT repayments.beneficiary_profile_id,
                        repayments.official_receipt_number,
                        repayments.hard_copy_office_status
                 FROM repayments
                 WHERE repayments.id = :repayment_id
                 LIMIT 1'
            );
            $statement->execute(['repayment_id' => $repaymentId]);
            $row = $statement->fetch(PDO::FETCH_ASSOC) ?: [];
        } catch (\Throwable $exception) {
            log_database_query_failure('repayment.notification_context_by_repayment', $exception, ['repayment_id' => $repaymentId]);
            return [];
        }

        $context = $this->repaymentNotificationContext((int) ($row['beneficiary_profile_id'] ?? 0));
        if ($row !== []) {
            $context['official_receipt_number'] = (string) ($row['official_receipt_number'] ?? '');
            $context['hard_copy_office_status'] = (string) ($row['hard_copy_office_status'] ?? '');
        }

        return $context;
    }

    private function repaymentNotificationContext(int $beneficiaryProfileId): array
    {
        if ($beneficiaryProfileId <= 0) {
            return [];
        }

        try {
            $statement = db()->prepare(
                'SELECT beneficiary_profiles.user_id AS beneficiary_user_id,
                        beneficiary_profiles.assigned_staff_profile_id,
                        users.full_name AS beneficiary_name,
                        applicant_profiles.business_name,
                        applicant_profiles.barangay_id,
                        barangays.name AS barangay_name,
                        assigned_user.id AS assigned_pdo_user_id
                 FROM beneficiary_profiles
                 INNER JOIN users ON users.id = beneficiary_profiles.user_id
                 LEFT JOIN applicant_profiles ON applicant_profiles.id = beneficiary_profiles.applicant_profile_id
                 LEFT JOIN barangays ON barangays.id = applicant_profiles.barangay_id
                 LEFT JOIN staff_profiles AS assigned_staff ON assigned_staff.id = beneficiary_profiles.assigned_staff_profile_id
                 LEFT JOIN users AS assigned_user ON assigned_user.id = assigned_staff.user_id
                 WHERE beneficiary_profiles.id = :beneficiary_profile_id
                 LIMIT 1'
            );
            $statement->execute(['beneficiary_profile_id' => $beneficiaryProfileId]);
            return $statement->fetch(PDO::FETCH_ASSOC) ?: [];
        } catch (\Throwable $exception) {
            log_database_query_failure('repayment.notification_context', $exception, ['beneficiary_profile_id' => $beneficiaryProfileId]);
            return [];
        }
    }

    private function repaymentReviewerUserIds(array $context): array
    {
        $ids = [];
        $assignedPdoUserId = (int) ($context['assigned_pdo_user_id'] ?? 0);
        if ($assignedPdoUserId > 0) {
            $ids[] = $assignedPdoUserId;
        }

        $barangayId = (int) ($context['barangay_id'] ?? 0);
        if ($barangayId > 0) {
            try {
                $statement = db()->prepare(
                    'SELECT DISTINCT users.id
                     FROM staff_barangay_assignments
                     INNER JOIN staff_profiles ON staff_profiles.id = staff_barangay_assignments.staff_profile_id
                     INNER JOIN users ON users.id = staff_profiles.user_id
                     WHERE staff_barangay_assignments.barangay_id = :barangay_id
                       AND staff_barangay_assignments.ended_at IS NULL
                       AND users.is_active = 1
                       AND users.is_disabled = 0'
                );
                $statement->execute(['barangay_id' => $barangayId]);
                foreach ($statement->fetchAll(PDO::FETCH_COLUMN) ?: [] as $id) {
                    $ids[] = (int) $id;
                }
            } catch (\Throwable $exception) {
                log_database_query_failure('repayment.notification_barangay_reviewers', $exception, ['barangay_id' => $barangayId]);
            }
        }

        try {
            $statement = db()->query(
                "SELECT users.id
                 FROM users
                 INNER JOIN roles ON roles.id = users.role_id
                 WHERE users.is_active = 1
                   AND users.is_disabled = 0
                   AND LOWER(roles.name) LIKE '%admin%'"
            );
            foreach ($statement->fetchAll(PDO::FETCH_COLUMN) ?: [] as $id) {
                $ids[] = (int) $id;
            }
        } catch (\Throwable $exception) {
            log_database_query_failure('repayment.notification_admin_reviewers', $exception);
        }

        return array_values(array_unique(array_filter($ids, static fn (int $id): bool => $id > 0)));
    }

    private function fetchRepayments(array $conditions, array $params): array
    {
        $sql = 'SELECT repayments.id,
                       repayments.beneficiary_profile_id,
                       repayments.submission_group_id,
                       repayments.amount,
                       repayments.payment_date,
                       repayments.official_receipt_number,
                       repayments.proof_file_path,
                       repayments.proof_original_name,
                       repayments.proof_mime_type,
                       repayments.hard_copy_office_status,
                       repayments.status,
                       repayments.created_at,
                       repayments.updated_at,
                       beneficiary_profiles.beneficiary_status,
                       beneficiary_profiles.approval_date,
                       beneficiary_profiles.approved_at,
                       users.full_name AS beneficiary_name,
                       users.email AS beneficiary_email,
                       applicant_profiles.birthdate AS beneficiary_birthdate,
                       applicant_profiles.age AS beneficiary_age,
                       applicant_profiles.gender AS beneficiary_gender,
                       applicant_profiles.livelihood_type AS beneficiary_livelihood_type,
                       applicant_profiles.sector AS beneficiary_sector,
                       applicant_profiles.business_name,
                       barangays.name AS barangay_name,
                       assigned_staff_user.full_name AS assigned_pdo_name,
                       verification.verification_status,
                       verification.remarks AS verification_remarks,
                       verification.verified_at,
                       reviewer.full_name AS reviewed_by
                FROM repayments
                INNER JOIN beneficiary_profiles ON beneficiary_profiles.id = repayments.beneficiary_profile_id
                INNER JOIN users ON users.id = beneficiary_profiles.user_id
                LEFT JOIN applicant_profiles ON applicant_profiles.id = beneficiary_profiles.applicant_profile_id
                LEFT JOIN barangays ON barangays.id = applicant_profiles.barangay_id
                LEFT JOIN staff_profiles AS assigned_staff ON assigned_staff.id = beneficiary_profiles.assigned_staff_profile_id
                LEFT JOIN users AS assigned_staff_user ON assigned_staff_user.id = assigned_staff.user_id
                LEFT JOIN repayment_verifications AS verification ON verification.id = (
                    SELECT rv.id
                    FROM repayment_verifications rv
                    WHERE rv.repayment_id = repayments.id
                    ORDER BY rv.verified_at DESC, rv.id DESC
                    LIMIT 1
                )
                LEFT JOIN users AS reviewer ON reviewer.id = verification.verified_by_user_id';

        if ($conditions !== []) {
            $sql .= ' WHERE ' . implode(' AND ', $conditions);
        }

        $sql .= ' ORDER BY repayments.created_at DESC, repayments.id DESC';

        $statement = db()->prepare($sql);
        $statement->execute($params);
        $rows = $statement->fetchAll(PDO::FETCH_ASSOC) ?: [];

        if ($rows === []) {
            return [];
        }

        $repaymentIds = array_map(static fn(array $row): int => (int) $row['id'], $rows);
        $coverageByRepayment = $this->fetchCoverageMonths($repaymentIds);
        $duplicateOrReferences = $this->buildDuplicateOrReferences($rows);
        $verifiedMonthReferences = $this->buildVerifiedMonthReferences($rows, $coverageByRepayment);

        return array_map(function (array $row) use ($coverageByRepayment, $duplicateOrReferences, $verifiedMonthReferences): array {
            $repaymentId = (int) $row['id'];
            $coverageMonths = $coverageByRepayment[$repaymentId] ?? [];
            $month = $coverageMonths[0] ?? date('Y-m', strtotime((string) $row['payment_date']));
            $proofPath = trim((string) ($row['proof_file_path'] ?? ''));

            return [
                'id' => $repaymentId,
                'month' => $month,
                'paymentDate' => $row['payment_date'],
                'amount' => (float) ($row['amount'] ?? 0),
                'stage' => $this->normalizeFrontendStage((string) ($row['status'] ?: ($row['verification_status'] ?? 'uploaded'))),
                'verifiedBy' => (string) ($row['reviewed_by'] ?? ''),
                'verifiedAt' => $row['verified_at'] ?? '',
                'notes' => (string) ($row['verification_remarks'] ?? ''),
                'adminRemarks' => (string) ($row['verification_remarks'] ?? ''),
                'orNumber' => (string) ($row['official_receipt_number'] ?? ''),
                'proof' => $proofPath !== '' ? app_url($proofPath) : '',
                'proofName' => (string) ($row['proof_original_name'] ?? basename($proofPath)),
                'proofType' => (string) ($row['proof_mime_type'] ?? ''),
                'hardCopyOfficeStatus' => $this->normalizeHardCopyOfficeStatus((string) ($row['hard_copy_office_status'] ?? '')) ?? 'not_submitted',
                'submittedAt' => $row['created_at'] ?? '',
                'beneficiaryId' => (int) $row['beneficiary_profile_id'],
                'beneficiaryStatus' => (string) ($row['beneficiary_status'] ?? ''),
                'beneficiaryApprovalDate' => (string) ($row['approval_date'] ?? ''),
                'beneficiaryApprovedAt' => (string) ($row['approved_at'] ?? ''),
                'beneficiaryName' => (string) ($row['beneficiary_name'] ?? 'Unknown beneficiary'),
                'beneficiaryBusiness' => (string) ($row['business_name'] ?? ''),
                'beneficiaryBarangay' => (string) ($row['barangay_name'] ?? ''),
                'beneficiaryEmail' => (string) ($row['beneficiary_email'] ?? ''),
                'beneficiaryBirthdate' => (string) ($row['beneficiary_birthdate'] ?? ''),
                'beneficiaryAge' => $row['beneficiary_age'] !== null ? (int) $row['beneficiary_age'] : null,
                'beneficiaryGender' => (string) ($row['beneficiary_gender'] ?? ''),
                'beneficiaryServiceType' => (string) (($row['beneficiary_livelihood_type'] ?? '') ?: ($row['beneficiary_sector'] ?? '')),
                'assignedPdo' => (string) ($row['assigned_pdo_name'] ?? ''),
                'reviewedBy' => (string) ($row['reviewed_by'] ?? ''),
                'reviewedByRole' => $row['reviewed_by'] ? 'Project Officer' : '',
                'reviewedAt' => $row['verified_at'] ?? '',
                'parentSubmissionId' => (string) ($row['submission_group_id'] ?? ''),
                'coverageFrom' => $coverageMonths[0] ?? $month,
                'coverageTo' => $coverageMonths !== [] ? $coverageMonths[count($coverageMonths) - 1] : $month,
                'allocatedAmount' => (float) ($row['amount'] ?? 0),
                'creditApplied' => 0,
                'remainingCredit' => 0,
                'duplicateOrReferences' => $duplicateOrReferences[$repaymentId] ?? [],
                'monthConflictReferences' => $verifiedMonthReferences[$repaymentId] ?? [],
            ];
        }, $rows);
    }

    private function buildDuplicateOrReferences(array $rows): array
    {
        $grouped = [];
        foreach ($rows as $row) {
            $orNumber = $this->sanitizeOrNumber((string) ($row['official_receipt_number'] ?? ''));
            $beneficiaryId = (int) ($row['beneficiary_profile_id'] ?? 0);
            if ($beneficiaryId <= 0 || $orNumber === '') {
                continue;
            }
            $key = $beneficiaryId . '|' . strtolower($orNumber);
            $grouped[$key] ??= [];
            $grouped[$key][] = [
                'repaymentId' => (int) ($row['id'] ?? 0),
                'submissionGroupId' => (string) ($row['submission_group_id'] ?? ''),
                'orNumber' => (string) ($row['official_receipt_number'] ?? ''),
                'submittedAt' => (string) ($row['created_at'] ?? ''),
                'reviewedAt' => (string) ($row['verified_at'] ?? ''),
                'reviewedBy' => (string) ($row['reviewed_by'] ?? ''),
                'status' => $this->normalizeFrontendStage((string) (($row['status'] ?? '') ?: ($row['verification_status'] ?? 'uploaded'))),
            ];
        }

        $references = [];
        foreach ($grouped as $entries) {
            if (count($entries) <= 1) {
                continue;
            }
            foreach ($entries as $entry) {
                $repaymentId = (int) ($entry['repaymentId'] ?? 0);
                if ($repaymentId <= 0) {
                    continue;
                }
                $references[$repaymentId] = array_values(array_filter($entries, static fn(array $candidate): bool => (int) ($candidate['repaymentId'] ?? 0) !== $repaymentId));
            }
        }

        return $references;
    }

    private function buildVerifiedMonthReferences(array $rows, array $coverageByRepayment): array
    {
        $verifiedByBeneficiaryMonth = [];
        foreach ($rows as $row) {
            $repaymentId = (int) ($row['id'] ?? 0);
            $beneficiaryId = (int) ($row['beneficiary_profile_id'] ?? 0);
            if ($repaymentId <= 0 || $beneficiaryId <= 0) {
                continue;
            }
            $stage = $this->normalizeFrontendStage((string) (($row['status'] ?? '') ?: ($row['verification_status'] ?? 'uploaded')));
            if ($stage !== 'verified') {
                continue;
            }
            foreach (($coverageByRepayment[$repaymentId] ?? []) as $month) {
                $key = $beneficiaryId . '|' . $month;
                $verifiedByBeneficiaryMonth[$key] ??= [];
                $verifiedByBeneficiaryMonth[$key][] = [
                    'repaymentId' => $repaymentId,
                    'submissionGroupId' => (string) ($row['submission_group_id'] ?? ''),
                    'month' => $month,
                    'orNumber' => (string) ($row['official_receipt_number'] ?? ''),
                    'submittedAt' => (string) ($row['created_at'] ?? ''),
                    'reviewedAt' => (string) ($row['verified_at'] ?? ''),
                    'reviewedBy' => (string) ($row['reviewed_by'] ?? ''),
                    'status' => $stage,
                ];
            }
        }

        $references = [];
        foreach ($rows as $row) {
            $repaymentId = (int) ($row['id'] ?? 0);
            $beneficiaryId = (int) ($row['beneficiary_profile_id'] ?? 0);
            if ($repaymentId <= 0 || $beneficiaryId <= 0) {
                continue;
            }
            foreach (($coverageByRepayment[$repaymentId] ?? []) as $month) {
                $key = $beneficiaryId . '|' . $month;
                $matches = array_values(array_filter(
                    $verifiedByBeneficiaryMonth[$key] ?? [],
                    static fn(array $candidate): bool => (int) ($candidate['repaymentId'] ?? 0) !== $repaymentId
                ));
                if ($matches !== []) {
                    $references[$repaymentId][$month] = $matches;
                }
            }
        }

        return $references;
    }

    private function fetchCoverageMonths(array $repaymentIds): array
    {
        if ($repaymentIds === []) {
            return [];
        }

        $placeholders = [];
        $params = [];
        foreach (array_values(array_unique($repaymentIds)) as $index => $repaymentId) {
            $key = 'repayment_' . $index;
            $placeholders[] = ':' . $key;
            $params[$key] = $repaymentId;
        }

        $statement = db()->prepare(
            'SELECT repayment_id, coverage_month
             FROM repayment_coverage_months
             WHERE repayment_id IN (' . implode(', ', $placeholders) . ')
             ORDER BY coverage_month ASC, id ASC'
        );
        $statement->execute($params);
        $rows = $statement->fetchAll(PDO::FETCH_ASSOC) ?: [];

        $months = [];
        foreach ($rows as $row) {
            $repaymentId = (int) $row['repayment_id'];
            $months[$repaymentId] ??= [];
            $months[$repaymentId][] = substr((string) $row['coverage_month'], 0, 7);
        }

        return $months;
    }

    private function validateRecords(array $records, int $beneficiaryProfileId): array
    {
        $errors = [];
        $coverageWindow = $this->repaymentCoverageWindow($beneficiaryProfileId);
        foreach ($records as $index => $record) {
            $month = trim((string) ($record['month'] ?? ''));
            $paymentDate = trim((string) ($record['paymentDate'] ?? ''));
            $orNumber = $this->sanitizeOrNumber((string) ($record['orNumber'] ?? ''));
            $proof = trim((string) ($record['proof'] ?? ''));
            $submissionGroupId = trim((string) ($record['parentSubmissionId'] ?? ''));

            if (!preg_match('/^\d{4}-\d{2}$/', $month)) {
                $errors[] = 'One or more repayment rows use an invalid coverage month.';
                break;
            }
            if ($coverageWindow !== null && !$this->isCoverageMonthWithinWindow($month, $coverageWindow)) {
                $errors[] = sprintf(
                    'Repayments for this beneficiary can only start at %s.',
                    $this->formatCoverageMonthLabel($coverageWindow['start'])
                );
                break;
            }
            if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $paymentDate)) {
                $errors[] = 'One or more repayment rows use an invalid payment date.';
                break;
            }
            if ($this->normalizeAmount($record['amount'] ?? 0) <= 0) {
                $errors[] = 'One or more repayment rows use an invalid amount.';
                break;
            }
            if ($orNumber === '') {
                $errors[] = 'Each repayment row needs an official receipt number.';
                break;
            }
            if ($proof === '') {
                $errors[] = 'Each repayment row needs a proof file.';
                break;
            }
            if ($this->orNumberExists($beneficiaryProfileId, $orNumber, $submissionGroupId)) {
                $errors[] = sprintf('The OR number %s already exists in your repayment records.', $orNumber);
                break;
            }
            if ($this->coverageMonthExists($beneficiaryProfileId, $month)) {
                $errors[] = sprintf('A repayment for %s already exists in your repayment records.', $month);
                break;
            }

            if (!is_array($record)) {
                $errors[] = sprintf('Invalid repayment payload at row %d.', $index + 1);
                break;
            }
        }

        return $errors;
    }

    private function repaymentCoverageWindow(int $beneficiaryProfileId): ?array
    {
        if ($beneficiaryProfileId <= 0) {
            return null;
        }

        $statement = db()->prepare(
            'SELECT COALESCE(source_profiles.approval_date, beneficiary_profiles.approval_date) AS approval_date,
                    COALESCE(source_profiles.approved_at, beneficiary_profiles.approved_at) AS approved_at
             FROM beneficiary_profiles
             LEFT JOIN beneficiary_profiles AS source_profiles
                    ON source_profiles.id = beneficiary_profiles.replacement_for_beneficiary_profile_id
             WHERE beneficiary_profiles.id = :beneficiary_profile_id
             LIMIT 1'
        );
        $statement->execute(['beneficiary_profile_id' => $beneficiaryProfileId]);
        $row = $statement->fetch(PDO::FETCH_ASSOC);
        if (!is_array($row)) {
            return null;
        }

        $firstDueDate = (new RepaymentScheduleService())->firstDueDateForBeneficiaryContext(
            (string) ($row['approved_at'] ?? ''),
            (string) ($row['approval_date'] ?? '')
        );
        if (!is_string($firstDueDate) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $firstDueDate)) {
            return null;
        }

        $start = substr($firstDueDate, 0, 7);
        return [
            'start' => $start,
            'end' => $this->addMonthsToCoverageMonth($start, 23),
        ];
    }

    private function isCoverageMonthWithinWindow(string $month, array $window): bool
    {
        $start = (string) ($window['start'] ?? '');
        $end = (string) ($window['end'] ?? '');
        if ($start === '' || $end === '') {
            return true;
        }

        return $month >= $start && $month <= $end;
    }

    private function addMonthsToCoverageMonth(string $month, int $offset): string
    {
        $date = \DateTimeImmutable::createFromFormat('Y-m-d H:i:s', $month . '-01 00:00:00');
        if (!$date instanceof \DateTimeImmutable) {
            return $month;
        }

        return $date->modify(($offset >= 0 ? '+' : '') . $offset . ' months')->format('Y-m');
    }

    private function formatCoverageMonthLabel(string $month): string
    {
        $date = \DateTimeImmutable::createFromFormat('Y-m-d H:i:s', $month . '-01 00:00:00');
        if (!$date instanceof \DateTimeImmutable) {
            return $month;
        }

        return $date->format('F Y');
    }

    private function normalizeAmount(mixed $value): float
    {
        return round((float) $value, 2);
    }

    private function sanitizeOrNumber(string $value): string
    {
        return preg_replace('/\s+/', ' ', trim($value)) ?? '';
    }

    private function normalizeCoverageMonth(string $month): string
    {
        return $month . '-01';
    }

    private function normalizeReviewStatus(string $status): ?string
    {
        $normalized = strtolower(trim($status));
        return match ($normalized) {
            'verified' => 'verified',
            'needs_correction', 'needscorrection', 'needs correction' => 'needs_correction',
            'rejected' => 'rejected',
            default => null,
        };
    }

    private function normalizeHardCopyOfficeStatus(?string $status): ?string
    {
        $normalized = strtolower(trim((string) $status));
        return match ($normalized) {
            '', 'not_submitted', 'notsubmitted', 'not submitted', 'no' => 'not_submitted',
            'submitted_to_office', 'submittedtooffice', 'submitted to office', 'submitted' => 'submitted_to_office',
            'confirmed_by_office', 'confirmedbyoffice', 'confirmed by office', 'confirmed', 'yes' => 'confirmed_by_office',
            default => null,
        };
    }

    private function normalizeFrontendStage(string $status): string
    {
        $normalized = strtolower(trim($status));
        return match ($normalized) {
            'verified' => 'verified',
            'pending', 'submitted' => 'pending',
            'needs_correction', 'needs correction' => 'needs_correction',
            'rejected', 'flagged' => 'rejected',
            default => 'uploaded',
        };
    }

    private function orNumberExists(int $beneficiaryProfileId, string $orNumber, string $submissionGroupId): bool
    {
        $statement = db()->prepare(
            'SELECT COUNT(*)
             FROM repayments
             WHERE beneficiary_profile_id = :beneficiary_profile_id
               AND LOWER(official_receipt_number) = LOWER(:official_receipt_number)
               AND COALESCE(submission_group_id, "") <> :submission_group_id'
        );
        $statement->execute([
            'beneficiary_profile_id' => $beneficiaryProfileId,
            'official_receipt_number' => $orNumber,
            'submission_group_id' => $submissionGroupId,
        ]);

        return ((int) $statement->fetchColumn()) > 0;
    }

    private function coverageMonthExists(int $beneficiaryProfileId, string $month): bool
    {
        $statement = db()->prepare(
            'SELECT COUNT(*)
             FROM repayment_coverage_months
             INNER JOIN repayments ON repayments.id = repayment_coverage_months.repayment_id
             WHERE repayments.beneficiary_profile_id = :beneficiary_profile_id
               AND repayment_coverage_months.coverage_month = :coverage_month'
        );
        $statement->execute([
            'beneficiary_profile_id' => $beneficiaryProfileId,
            'coverage_month' => $this->normalizeCoverageMonth($month),
        ]);

        return ((int) $statement->fetchColumn()) > 0;
    }

    private function orNumberExistsForOtherRepayment(int $beneficiaryProfileId, string $orNumber, int $repaymentId): bool
    {
        if ($beneficiaryProfileId <= 0 || $orNumber === '') {
            return false;
        }

        $statement = db()->prepare(
            'SELECT COUNT(*)
             FROM repayments
             WHERE beneficiary_profile_id = :beneficiary_profile_id
               AND id <> :repayment_id
               AND LOWER(official_receipt_number) = LOWER(:official_receipt_number)'
        );
        $statement->execute([
            'beneficiary_profile_id' => $beneficiaryProfileId,
            'repayment_id' => $repaymentId,
            'official_receipt_number' => $orNumber,
        ]);

        return ((int) $statement->fetchColumn()) > 0;
    }

    private function coverageMonthExistsForOtherRepayment(int $beneficiaryProfileId, string $month, int $repaymentId): bool
    {
        if ($beneficiaryProfileId <= 0 || $month === '') {
            return false;
        }

        $statement = db()->prepare(
            'SELECT COUNT(*)
             FROM repayment_coverage_months
             INNER JOIN repayments ON repayments.id = repayment_coverage_months.repayment_id
             WHERE repayments.beneficiary_profile_id = :beneficiary_profile_id
               AND repayments.id <> :repayment_id
               AND repayment_coverage_months.coverage_month = :coverage_month'
        );
        $statement->execute([
            'beneficiary_profile_id' => $beneficiaryProfileId,
            'repayment_id' => $repaymentId,
            'coverage_month' => $this->normalizeCoverageMonth($month),
        ]);

        return ((int) $statement->fetchColumn()) > 0;
    }

    private function hasRepaymentStaffReview(int $repaymentId): bool
    {
        $statement = db()->prepare(
            'SELECT COUNT(*)
             FROM repayment_verifications
             WHERE repayment_id = :repayment_id
               AND (verified_by_user_id IS NOT NULL OR verified_at IS NOT NULL)'
        );
        $statement->execute(['repayment_id' => $repaymentId]);

        return ((int) $statement->fetchColumn()) > 0;
    }

    private function findRepaymentForProjectOfficer(int $repaymentId, array $actor): ?array
    {
        $staffProfileId = $this->findStaffProfileIdForUser((int) ($actor['id'] ?? 0));
        if ($staffProfileId === null) {
            return null;
        }

        $scopeBarangays = $this->findAssignedBarangayIds($staffProfileId);
        $sql = 'SELECT repayments.id, repayments.status
                FROM repayments
                INNER JOIN beneficiary_profiles ON beneficiary_profiles.id = repayments.beneficiary_profile_id
                LEFT JOIN applicant_profiles ON applicant_profiles.id = beneficiary_profiles.applicant_profile_id
                WHERE repayments.id = :repayment_id
                  AND (beneficiary_profiles.assigned_staff_profile_id = :staff_profile_id';
        $params = [
            'repayment_id' => $repaymentId,
            'staff_profile_id' => $staffProfileId,
        ];
        if ($scopeBarangays !== []) {
            $placeholders = [];
            foreach ($scopeBarangays as $index => $barangayId) {
                $key = 'scope_barangay_' . $index;
                $placeholders[] = ':' . $key;
                $params[$key] = $barangayId;
            }
            $sql .= ' OR applicant_profiles.barangay_id IN (' . implode(', ', $placeholders) . ')';
        }
        $sql .= ') LIMIT 1';

        $statement = db()->prepare($sql);
        $statement->execute($params);
        $row = $statement->fetch(PDO::FETCH_ASSOC);

        return is_array($row) ? $row : null;
    }

    private function findRepaymentForReviewer(int $repaymentId, array $actor): ?array
    {
        $role = strtolower((string) ($actor['role'] ?? ''));
        if (str_contains($role, 'admin')) {
            $statement = db()->prepare('SELECT id, status FROM repayments WHERE id = :repayment_id LIMIT 1');
            $statement->execute(['repayment_id' => $repaymentId]);
            $row = $statement->fetch(PDO::FETCH_ASSOC);
            return is_array($row) ? $row : null;
        }

        return $this->findRepaymentForProjectOfficer($repaymentId, $actor);
    }

    private function findRepaymentForDataEditor(int $repaymentId, array $actor): ?array
    {
        $role = strtolower((string) ($actor['role'] ?? ''));
        if (!str_contains($role, 'admin') && !str_contains($role, 'social')) {
            return null;
        }

        $statement = db()->prepare(
            'SELECT id,
                    beneficiary_profile_id,
                    amount,
                    payment_date,
                    official_receipt_number,
                    hard_copy_office_status,
                    status
             FROM repayments
             WHERE id = :repayment_id
             LIMIT 1'
        );
        $statement->execute(['repayment_id' => $repaymentId]);
        $row = $statement->fetch(PDO::FETCH_ASSOC);

        return is_array($row) ? $row : null;
    }

    private function findBeneficiaryProfileIdForUser(int $userId): ?int
    {
        $statement = db()->prepare('SELECT id FROM beneficiary_profiles WHERE user_id = :user_id LIMIT 1');
        $statement->execute(['user_id' => $userId]);
        $value = $statement->fetchColumn();
        $id = $value !== false ? (int) $value : 0;
        return $id > 0 ? $id : null;
    }

    private function resolveRepaymentAccountForUser(int $userId): ?array
    {
        if ($userId <= 0) {
            return null;
        }

        $statement = db()->prepare(
            'SELECT beneficiary_profiles.id,
                    beneficiary_profiles.beneficiary_status,
                    beneficiary_profiles.replacement_for_beneficiary_profile_id,
                    users.full_name AS beneficiary_name,
                    replacement_users.full_name AS replacement_for_name
             FROM beneficiary_profiles
             INNER JOIN users ON users.id = beneficiary_profiles.user_id
             LEFT JOIN beneficiary_profiles AS replacement_profiles ON replacement_profiles.id = beneficiary_profiles.replacement_for_beneficiary_profile_id
             LEFT JOIN users AS replacement_users ON replacement_users.id = replacement_profiles.user_id
             WHERE beneficiary_profiles.user_id = :user_id
             LIMIT 1'
        );
        $statement->execute(['user_id' => $userId]);
        $row = $statement->fetch(PDO::FETCH_ASSOC);
        if (!is_array($row)) {
            return null;
        }

        $beneficiaryProfileId = (int) ($row['id'] ?? 0);
        if ($beneficiaryProfileId <= 0) {
            return null;
        }

        $replacementForBeneficiaryProfileId = (int) ($row['replacement_for_beneficiary_profile_id'] ?? 0);
        $repaymentSourceBeneficiaryProfileId = $replacementForBeneficiaryProfileId > 0
            ? $replacementForBeneficiaryProfileId
            : $beneficiaryProfileId;

        return [
            'beneficiaryProfileId' => $beneficiaryProfileId,
            'beneficiaryName' => (string) ($row['beneficiary_name'] ?? ''),
            'repaymentSourceBeneficiaryProfileId' => $repaymentSourceBeneficiaryProfileId,
            'isRepaymentSuccessor' => $replacementForBeneficiaryProfileId > 0,
            'replacementForBeneficiaryProfileId' => $replacementForBeneficiaryProfileId > 0 ? $replacementForBeneficiaryProfileId : null,
            'replacementForName' => (string) ($row['replacement_for_name'] ?? ''),
        ];
    }

    private function findStaffProfileIdForUser(int $userId): ?int
    {
        $statement = db()->prepare('SELECT id FROM staff_profiles WHERE user_id = :user_id LIMIT 1');
        $statement->execute(['user_id' => $userId]);
        $value = $statement->fetchColumn();
        $id = $value !== false ? (int) $value : 0;
        return $id > 0 ? $id : null;
    }

    private function findAssignedBarangayIds(int $staffProfileId): array
    {
        return (new BarangayAssignmentService())->activeBarangayIdsForStaffProfileId($staffProfileId);
    }

    private function ensureHardCopyOfficeStatusColumn(): void
    {
        static $ensured = false;
        if ($ensured) {
            return;
        }

        $statement = db()->prepare(
            'SELECT COUNT(*) FROM information_schema.columns
             WHERE table_schema = DATABASE()
               AND table_name = :table_name
               AND column_name = :column_name'
        );
        $statement->execute([
            'table_name' => 'repayments',
            'column_name' => 'hard_copy_office_status',
        ]);

        if ((int) $statement->fetchColumn() === 0) {
            db()->exec(
                "ALTER TABLE repayments
                 ADD COLUMN hard_copy_office_status VARCHAR(40) NOT NULL DEFAULT 'not_submitted'
                 AFTER proof_mime_type"
            );
        }

        $ensured = true;
    }

    private function ensureReplacementLinkSchema(): void
    {
        (new BeneficiaryProfileService())->ensureReplacementLinkSchema();
    }
}
