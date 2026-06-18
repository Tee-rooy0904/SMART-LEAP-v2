<?php
declare(strict_types=1);

namespace App\Services;

use DateInterval;
use DateTimeImmutable;
use PDO;

class RepaymentScheduleService
{
    public const PLAN_MONTHS = 24;
    public const MONTHLY_EXPECTED_AMOUNT = 625.00;

    public function isAvailable(): bool
    {
        try {
            db()->query('SELECT id FROM repayment_schedules LIMIT 1');
            return true;
        } catch (\Throwable $exception) {
            log_database_query_failure('repayment_schedules.available', $exception);
            return false;
        }
    }

    public function ensureForBeneficiaryProfile(int $beneficiaryProfileId): int
    {
        if ($beneficiaryProfileId <= 0 || !$this->isAvailable()) {
            return 0;
        }

        (new BeneficiaryProfileService())->ensureReplacementLinkSchema();
        $context = $this->findBeneficiaryContext($beneficiaryProfileId);
        if ($context === null) {
            return 0;
        }

        $approvalDate = $this->resolveApprovalAnchor($context);
        if ($approvalDate === null) {
            return 0;
        }

        $anchorDay = (int) $approvalDate->format('d');
        $coverageMonth = $approvalDate->modify('first day of next month');
        $inserted = 0;

        for ($offset = 0; $offset < self::PLAN_MONTHS; $offset++) {
            $month = $coverageMonth->modify('+' . $offset . ' month');
            $dueDate = $this->resolveDueDateForMonth($month, $anchorDay);
            $inserted += $this->insertScheduleRow(
                $beneficiaryProfileId,
                $month->format('Y-m-01'),
                $dueDate->format('Y-m-d')
            );
        }

        return $inserted;
    }

    public function rebuildForBeneficiaryProfile(int $beneficiaryProfileId): int
    {
        if ($beneficiaryProfileId <= 0 || !$this->isAvailable()) {
            return 0;
        }

        try {
            db()->prepare(
                'DELETE FROM repayment_schedules
                 WHERE beneficiary_profile_id = :beneficiary_profile_id'
            )->execute(['beneficiary_profile_id' => $beneficiaryProfileId]);
        } catch (\Throwable $exception) {
            log_database_query_failure('repayment_schedules.rebuild_clear', $exception, [
                'beneficiary_profile_id' => $beneficiaryProfileId,
            ]);
            return 0;
        }

        return $this->ensureForBeneficiaryProfile($beneficiaryProfileId);
    }

    public function firstDueDateForBeneficiaryContext(?string $approvedAtRaw, ?string $approvalDateRaw = null): ?string
    {
        $approvalDate = $this->resolveApprovalAnchor([
            'approved_at' => $approvedAtRaw,
            'approval_date' => $approvalDateRaw,
        ]);
        if ($approvalDate === null) {
            return null;
        }

        $anchorDay = (int) $approvalDate->format('d');
        $firstCoverageMonth = $approvalDate->modify('first day of next month');
        return $this->resolveDueDateForMonth($firstCoverageMonth, $anchorDay)->format('Y-m-d');
    }

    public function ensureForAllActiveBeneficiaries(): int
    {
        if (!$this->isAvailable()) {
            return 0;
        }

        (new BeneficiaryProfileService())->ensureReplacementLinkSchema();

        try {
            $statement = db()->query(
                'SELECT DISTINCT COALESCE(source_profiles.id, beneficiary_profiles.id) AS id
                 FROM beneficiary_profiles
                 LEFT JOIN beneficiary_profiles AS source_profiles ON source_profiles.id = beneficiary_profiles.replacement_for_beneficiary_profile_id
                 WHERE COALESCE(source_profiles.approved_at, source_profiles.approval_date, beneficiary_profiles.approved_at, beneficiary_profiles.approval_date) IS NOT NULL
                   AND LOWER(COALESCE(beneficiary_profiles.beneficiary_status, "active")) = "active"
                 ORDER BY id ASC'
            );
            $ids = $statement->fetchAll(PDO::FETCH_COLUMN) ?: [];
        } catch (\Throwable $exception) {
            log_database_query_failure('repayment_schedules.active_beneficiaries', $exception);
            return 0;
        }

        $inserted = 0;
        foreach ($ids as $beneficiaryProfileId) {
            $inserted += $this->ensureForBeneficiaryProfile((int) $beneficiaryProfileId);
        }

        return $inserted;
    }

    private function findBeneficiaryContext(int $beneficiaryProfileId): ?array
    {
        try {
            $statement = db()->prepare(
                'SELECT id, approval_date, approved_at, beneficiary_status
                 FROM beneficiary_profiles
                 WHERE id = :beneficiary_profile_id
                 LIMIT 1'
            );
            $statement->execute(['beneficiary_profile_id' => $beneficiaryProfileId]);
            $row = $statement->fetch(PDO::FETCH_ASSOC);
        } catch (\Throwable $exception) {
            log_database_query_failure('repayment_schedules.context', $exception, [
                'beneficiary_profile_id' => $beneficiaryProfileId,
            ]);
            return null;
        }

        return is_array($row) ? $row : null;
    }

    private function resolveApprovalAnchor(array $context): ?DateTimeImmutable
    {
        $approvedAtRaw = trim((string) ($context['approved_at'] ?? ''));
        $approvalDateRaw = trim((string) ($context['approval_date'] ?? ''));
        $raw = $approvedAtRaw !== '' ? $approvedAtRaw : $approvalDateRaw;
        if ($raw === '') {
            return null;
        }

        try {
            return new DateTimeImmutable($raw);
        } catch (\Throwable $exception) {
            return null;
        }
    }

    private function insertScheduleRow(int $beneficiaryProfileId, string $coverageMonth, string $dueDate): int
    {
        try {
            $statement = db()->prepare(
                'INSERT IGNORE INTO repayment_schedules
                    (beneficiary_profile_id, coverage_month, due_date, expected_amount, schedule_status)
                 VALUES
                    (:beneficiary_profile_id, :coverage_month, :due_date, :expected_amount, :schedule_status)'
            );
            $statement->execute([
                'beneficiary_profile_id' => $beneficiaryProfileId,
                'coverage_month' => $coverageMonth,
                'due_date' => $dueDate,
                'expected_amount' => self::MONTHLY_EXPECTED_AMOUNT,
                'schedule_status' => 'scheduled',
            ]);

            return $statement->rowCount();
        } catch (\Throwable $exception) {
            log_database_query_failure('repayment_schedules.insert', $exception, [
                'beneficiary_profile_id' => $beneficiaryProfileId,
                'coverage_month' => $coverageMonth,
            ]);
            return 0;
        }
    }

    private function resolveDueDateForMonth(DateTimeImmutable $coverageMonth, int $anchorDay): DateTimeImmutable
    {
        $monthStart = $coverageMonth->modify('first day of this month');
        $monthEnd = $coverageMonth->modify('last day of this month');
        $lastDay = (int) $monthEnd->format('d');
        $dueDay = max(1, min($anchorDay, $lastDay));

        return $monthStart->add(new DateInterval('P' . max(0, $dueDay - 1) . 'D'));
    }
}
