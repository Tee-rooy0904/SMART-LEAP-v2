<?php
declare(strict_types=1);

namespace App\Services;

use DateTimeImmutable;
use PDO;

class RepaymentReminderService
{
    private const UPCOMING_WINDOW_DAYS = 7;
    private const OVERDUE_WINDOW_DAYS = 30;

    public function syncDaily(): array
    {
        (new BeneficiaryProfileService())->ensureReplacementLinkSchema();
        $scheduleService = new RepaymentScheduleService();
        $scheduleService->ensureForAllActiveBeneficiaries();
        if (!$scheduleService->isAvailable()) {
            return ['beneficiaries' => 0, 'notifications' => 0];
        }

        $contexts = $this->listActiveBeneficiaryContexts();
        $notificationsCreated = 0;
        foreach ($contexts as $context) {
            $notificationsCreated += $this->syncForBeneficiaryContext($context);
        }

        return [
            'beneficiaries' => count($contexts),
            'notifications' => $notificationsCreated,
        ];
    }

    public function syncForBeneficiaryUser(int $userId): void
    {
        (new BeneficiaryProfileService())->ensureReplacementLinkSchema();
        if ($userId <= 0) {
            return;
        }

        $context = $this->findBeneficiaryReminderContext($userId);
        if ($context === null) {
            return;
        }

        $beneficiaryProfileId = (int) ($context['repayment_beneficiary_profile_id'] ?? $context['beneficiary_profile_id'] ?? 0);
        if ($beneficiaryProfileId <= 0 || !(new RepaymentScheduleService())->isAvailable()) {
            return;
        }

        (new RepaymentScheduleService())->ensureForBeneficiaryProfile($beneficiaryProfileId);
        $this->syncForBeneficiaryContext($context);
    }

    private function findBeneficiaryReminderContext(int $userId): ?array
    {
        try {
            $statement = db()->prepare(
                'SELECT beneficiary_profiles.id AS beneficiary_profile_id,
                        beneficiary_profiles.user_id,
                        COALESCE(repayment_profiles.id, beneficiary_profiles.id) AS repayment_beneficiary_profile_id,
                        beneficiary_profiles.approval_date,
                        beneficiary_profiles.beneficiary_status,
                        users.full_name AS beneficiary_name,
                        COALESCE(repayment_applicant_profiles.business_name, applicant_profiles.business_name) AS business_name,
                        COALESCE(repayment_barangays.name, barangays.name) AS barangay_name
                 FROM beneficiary_profiles
                 INNER JOIN users ON users.id = beneficiary_profiles.user_id
                 LEFT JOIN applicant_profiles ON applicant_profiles.id = beneficiary_profiles.applicant_profile_id
                 LEFT JOIN barangays ON barangays.id = applicant_profiles.barangay_id
                 LEFT JOIN beneficiary_profiles AS repayment_profiles ON repayment_profiles.id = beneficiary_profiles.replacement_for_beneficiary_profile_id
                 LEFT JOIN applicant_profiles AS repayment_applicant_profiles ON repayment_applicant_profiles.id = repayment_profiles.applicant_profile_id
                 LEFT JOIN barangays AS repayment_barangays ON repayment_barangays.id = repayment_applicant_profiles.barangay_id
                 WHERE beneficiary_profiles.user_id = :user_id
                   AND LOWER(COALESCE(beneficiary_profiles.beneficiary_status, "active")) = "active"
                 LIMIT 1'
            );
            $statement->execute(['user_id' => $userId]);
            $row = $statement->fetch(PDO::FETCH_ASSOC);
        } catch (\Throwable $exception) {
            log_database_query_failure('repayment_reminders.context', $exception, ['user_id' => $userId]);
            return null;
        }

        return is_array($row) ? $row : null;
    }

    private function listActiveBeneficiaryContexts(): array
    {
        try {
            $statement = db()->query(
                'SELECT beneficiary_profiles.id AS beneficiary_profile_id,
                        COALESCE(repayment_profiles.id, beneficiary_profiles.id) AS repayment_beneficiary_profile_id,
                        beneficiary_profiles.user_id,
                        beneficiary_profiles.approval_date,
                        beneficiary_profiles.beneficiary_status,
                        users.full_name AS beneficiary_name,
                        COALESCE(repayment_applicant_profiles.business_name, applicant_profiles.business_name) AS business_name,
                        COALESCE(repayment_barangays.name, barangays.name) AS barangay_name
                 FROM beneficiary_profiles
                 INNER JOIN users ON users.id = beneficiary_profiles.user_id
                 LEFT JOIN applicant_profiles ON applicant_profiles.id = beneficiary_profiles.applicant_profile_id
                 LEFT JOIN barangays ON barangays.id = applicant_profiles.barangay_id
                 LEFT JOIN beneficiary_profiles AS repayment_profiles ON repayment_profiles.id = beneficiary_profiles.replacement_for_beneficiary_profile_id
                 LEFT JOIN applicant_profiles AS repayment_applicant_profiles ON repayment_applicant_profiles.id = repayment_profiles.applicant_profile_id
                 LEFT JOIN barangays AS repayment_barangays ON repayment_barangays.id = repayment_applicant_profiles.barangay_id
                 WHERE beneficiary_profiles.approval_date IS NOT NULL
                   AND LOWER(COALESCE(beneficiary_profiles.beneficiary_status, "active")) = "active"
                 ORDER BY beneficiary_profiles.id ASC'
            );
            $rows = $statement->fetchAll(PDO::FETCH_ASSOC) ?: [];
        } catch (\Throwable $exception) {
            log_database_query_failure('repayment_reminders.active_contexts', $exception);
            return [];
        }

        return array_values(array_filter($rows, static fn ($row): bool => is_array($row)));
    }

    private function syncForBeneficiaryContext(array $context): int
    {
        $beneficiaryProfileId = (int) ($context['repayment_beneficiary_profile_id'] ?? $context['beneficiary_profile_id'] ?? 0);
        $userId = (int) ($context['user_id'] ?? 0);
        if ($beneficiaryProfileId <= 0 || $userId <= 0) {
            return 0;
        }

        try {
            $today = new DateTimeImmutable('today');
        } catch (\Throwable $exception) {
            return 0;
        }

        $statusesByMonth = $this->fetchRepaymentStatusByCoverageMonth($beneficiaryProfileId);
        $schedules = $this->fetchRepaymentSchedules($beneficiaryProfileId);
        $notificationService = new NotificationService();
        $created = 0;

        foreach ($schedules as $schedule) {
            $coverageMonth = $schedule['coverageMonth'];
            $dueDate = $schedule['dueDate'];
            $daysUntilDue = (int) floor(($dueDate->getTimestamp() - $today->getTimestamp()) / 86400);
            if ($daysUntilDue > self::UPCOMING_WINDOW_DAYS || $daysUntilDue < -self::OVERDUE_WINDOW_DAYS) {
                continue;
            }

            $coverageKey = $coverageMonth->format('Y-m');
            $repaymentStatus = $statusesByMonth[$coverageKey] ?? null;
            $stage = (string) ($repaymentStatus['stage'] ?? '');
            if (in_array($stage, ['pending', 'verified', 'credited'], true)) {
                continue;
            }

            $reminderType = $this->resolveReminderType($daysUntilDue);
            if ($reminderType === null) {
                continue;
            }

            $notification = $this->buildReminderNotification(
                $context,
                $coverageMonth,
                $dueDate,
                $daysUntilDue,
                $stage,
                $reminderType,
                (float) ($schedule['expectedAmount'] ?? RepaymentScheduleService::MONTHLY_EXPECTED_AMOUNT)
            );
            if ($notification === null) {
                continue;
            }

            if ($notificationService->createInAppIfMissing(
                $userId,
                $notification['title'],
                $notification['message'],
                $notification['channel']
            )) {
                $created++;
            }
        }

        return $created;
    }

    private function fetchRepaymentStatusByCoverageMonth(int $beneficiaryProfileId): array
    {
        try {
            $statement = db()->prepare(
                'SELECT DATE_FORMAT(repayment_coverage_months.coverage_month, "%Y-%m") AS coverage_month,
                        repayments.amount,
                        repayments.payment_date,
                        repayments.status,
                        verification.verification_status
                 FROM repayments
                 INNER JOIN repayment_coverage_months ON repayment_coverage_months.repayment_id = repayments.id
                 LEFT JOIN repayment_verifications AS verification ON verification.id = (
                    SELECT rv.id
                    FROM repayment_verifications rv
                    WHERE rv.repayment_id = repayments.id
                    ORDER BY rv.verified_at DESC, rv.id DESC
                    LIMIT 1
                 )
                 WHERE repayments.beneficiary_profile_id = :beneficiary_profile_id
                 ORDER BY repayment_coverage_months.coverage_month DESC, repayments.created_at DESC, repayments.id DESC'
            );
            $statement->execute(['beneficiary_profile_id' => $beneficiaryProfileId]);
            $rows = $statement->fetchAll(PDO::FETCH_ASSOC) ?: [];
        } catch (\Throwable $exception) {
            log_database_query_failure('repayment_reminders.statuses', $exception, [
                'beneficiary_profile_id' => $beneficiaryProfileId,
            ]);
            return [];
        }

        $statuses = [];
        foreach ($rows as $row) {
            $coverageMonth = trim((string) ($row['coverage_month'] ?? ''));
            if ($coverageMonth === '' || isset($statuses[$coverageMonth])) {
                continue;
            }

            $statuses[$coverageMonth] = [
                'stage' => $this->normalizeRepaymentStage(
                    (string) ($row['status'] ?? ''),
                    (string) ($row['verification_status'] ?? '')
                ),
                'amount' => (float) ($row['amount'] ?? 0),
                'paymentDate' => (string) ($row['payment_date'] ?? ''),
            ];
        }

        return $statuses;
    }

    private function fetchRepaymentSchedules(int $beneficiaryProfileId): array
    {
        try {
            $statement = db()->prepare(
                'SELECT coverage_month, due_date, expected_amount
                 FROM repayment_schedules
                 WHERE beneficiary_profile_id = :beneficiary_profile_id
                   AND LOWER(COALESCE(schedule_status, "scheduled")) = "scheduled"
                 ORDER BY coverage_month ASC'
            );
            $statement->execute(['beneficiary_profile_id' => $beneficiaryProfileId]);
            $rows = $statement->fetchAll(PDO::FETCH_ASSOC) ?: [];
        } catch (\Throwable $exception) {
            log_database_query_failure('repayment_reminders.schedules', $exception, [
                'beneficiary_profile_id' => $beneficiaryProfileId,
            ]);
            return [];
        }

        $schedules = [];
        foreach ($rows as $row) {
            try {
                $coverageMonth = new DateTimeImmutable((string) ($row['coverage_month'] ?? ''));
                $dueDate = new DateTimeImmutable((string) ($row['due_date'] ?? ''));
            } catch (\Throwable $exception) {
                continue;
            }

            $schedules[] = [
                'coverageMonth' => $coverageMonth,
                'dueDate' => $dueDate,
                'expectedAmount' => (float) ($row['expected_amount'] ?? RepaymentScheduleService::MONTHLY_EXPECTED_AMOUNT),
            ];
        }

        return $schedules;
    }

    private function resolveReminderType(int $daysUntilDue): ?string
    {
        if ($daysUntilDue > 0 && $daysUntilDue <= self::UPCOMING_WINDOW_DAYS) {
            return 'due_soon';
        }

        if ($daysUntilDue === 0) {
            return 'due_today';
        }

        if ($daysUntilDue < 0 && $daysUntilDue >= -self::OVERDUE_WINDOW_DAYS) {
            return 'overdue';
        }

        return null;
    }

    private function buildReminderNotification(
        array $context,
        DateTimeImmutable $coverageMonth,
        DateTimeImmutable $dueDate,
        int $daysUntilDue,
        string $stage,
        string $reminderType,
        float $expectedAmount
    ): ?array {
        $coverageLabel = $coverageMonth->format('F Y');
        $dueLabel = $dueDate->format('F j, Y');
        $businessName = trim((string) ($context['business_name'] ?? ''));
        $barangay = trim((string) ($context['barangay_name'] ?? ''));
        $subjectLabel = $businessName !== '' ? $businessName : 'your livelihood record';
        $locationSuffix = $barangay !== '' ? ' in ' . $barangay : '';
        $amountLabel = 'PHP ' . number_format($expectedAmount, 2);
        $needsCorrection = in_array($stage, ['needs_correction', 'rejected'], true);

        $channel = sprintf(
            'repay_%s_%s',
            str_replace('-', '', $coverageMonth->format('Y-m')),
            $reminderType
        );

        if ($reminderType === 'due_soon') {
            return [
                'channel' => $channel,
                'title' => $needsCorrection ? 'Repayment correction due soon' : 'Repayment due soon',
                'message' => $needsCorrection
                    ? sprintf(
                        'Your SMART LEAP repayment for %s still needs a corrected OR/proof. Submit a valid %s repayment for %s%s before %s.',
                        $coverageLabel,
                        $amountLabel,
                        $subjectLabel,
                        $locationSuffix,
                        $dueLabel
                    )
                    : sprintf(
                        'Your SMART LEAP repayment for %s is due on %s. Submit your %s OR/proof for %s%s before the deadline.',
                        $coverageLabel,
                        $dueLabel,
                        $amountLabel,
                        $subjectLabel,
                        $locationSuffix
                    ),
            ];
        }

        if ($reminderType === 'due_today') {
            return [
                'channel' => $channel,
                'title' => $needsCorrection ? 'Repayment correction due today' : 'Repayment due today',
                'message' => $needsCorrection
                    ? sprintf(
                        'Your corrected SMART LEAP repayment for %s is due today, %s. Submit a valid %s OR/proof for %s%s.',
                        $coverageLabel,
                        $dueLabel,
                        $amountLabel,
                        $subjectLabel,
                        $locationSuffix
                    )
                    : sprintf(
                        'Your SMART LEAP repayment for %s is due today, %s. Submit your %s OR/proof for %s%s.',
                        $coverageLabel,
                        $dueLabel,
                        $amountLabel,
                        $subjectLabel,
                        $locationSuffix
                    ),
            ];
        }

        if ($reminderType === 'overdue') {
            return [
                'channel' => $channel,
                'title' => $needsCorrection ? 'Repayment still needs correction' : 'Repayment overdue',
                'message' => $needsCorrection
                    ? sprintf(
                        'Your SMART LEAP repayment for %s is already past due and the submitted OR/proof still needs correction. Submit a valid %s repayment for %s%s as soon as possible.',
                        $coverageLabel,
                        $amountLabel,
                        $subjectLabel,
                        $locationSuffix
                    )
                    : sprintf(
                        'Your SMART LEAP repayment for %s is already overdue. Upload your %s OR/proof for %s%s as soon as possible.',
                        $coverageLabel,
                        $amountLabel,
                        $subjectLabel,
                        $locationSuffix
                    ),
            ];
        }

        return null;
    }

    private function normalizeRepaymentStage(string $status, string $verificationStatus): string
    {
        $value = strtolower(trim($verificationStatus !== '' ? $verificationStatus : $status));

        return match ($value) {
            'verified' => 'verified',
            'credited' => 'credited',
            'pending', 'submitted', 'uploaded' => 'pending',
            'needs_correction', 'needs correction', 'overdue' => 'needs_correction',
            'rejected', 'flagged' => 'rejected',
            default => 'uploaded',
        };
    }
}
