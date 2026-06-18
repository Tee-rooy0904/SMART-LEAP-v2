<?php
declare(strict_types=1);

namespace App\Services;

use PDO;

class PortalService
{
    private const STEP_DEFINITIONS = [
        1 => 'Account Created',
        2 => 'Profile Completion',
        3 => 'Application Submitted',
        4 => 'Review and Assessment',
        5 => 'Training and Compliance',
        6 => 'Beneficiary Services',
    ];

    public function quickViewForUser(?array $user): ?array
    {
        if (!is_array($user) || !$this->isPortalUser($user)) {
            return null;
        }

        $coMakerQuickView = $this->buildCoMakerQuickView((int) ($user['id'] ?? 0), $user);
        if ($coMakerQuickView !== null) {
            return $coMakerQuickView;
        }

        $role = strtolower((string) ($user['role'] ?? ''));
        if (str_contains($role, 'beneficiary')) {
            return $this->buildBeneficiaryQuickView((int) ($user['id'] ?? 0), $user);
        }

        return $this->buildApplicantQuickView((int) ($user['id'] ?? 0), $user);
    }

    private function buildCoMakerQuickView(int $userId, array $user): ?array
    {
        $registration = (new CoMakerRegistrationService())->registrationForUser($userId);
        if ($registration === null) {
            return null;
        }

        $status = strtolower((string) ($registration['registrationStatus'] ?? ''));
        if (!in_array($status, [CoMakerRegistrationService::STATUS_APPROVED, CoMakerRegistrationService::LEGACY_STATUS_ACTIVE], true)) {
            return null;
        }

        $primaryName = trim((string) ($registration['primaryBeneficiaryName'] ?? ''));
        $businessName = trim((string) ($registration['primaryBusinessName'] ?? ''));
        $relationship = trim((string) ($registration['relationshipToPrimaryBeneficiary'] ?? ''));

        return [
            'type' => 'co-maker',
            'heading' => 'Co-maker Repayment Access',
            'roleLabel' => 'Co-maker',
            'statusLine' => 'Approved co-maker for deceased beneficiary repayment',
            'helperText' => $primaryName !== ''
                ? 'You are linked to ' . $primaryName . '\'s repayment account. Use your dashboard to upload receipts and monitor repayment verification.'
                : 'Use your dashboard to upload receipts and monitor repayment verification for the deceased primary beneficiary.',
            'progressPercent' => 100,
            'reference' => null,
            'steps' => [],
            'actionLabel' => 'Open Repayment Dashboard',
            'actionPath' => 'beneficiary-dashboard#repayments',
            'userName' => (string) ($user['name'] ?? ($registration['name'] ?? 'Co-maker')),
            'primaryBeneficiaryName' => $primaryName,
            'primaryBusinessName' => $businessName,
            'relationshipToPrimaryBeneficiary' => $relationship,
        ];
    }

    public function trackerByReference(string $reference): ?array
    {
        $application = $this->fetchApplicationForTracker($reference);
        if ($application === null) {
            return null;
        }

        [$currentStep, $statusLine] = $this->resolveTrackerStepMeta($application);
        $referenceCode = $this->formatApplicationReference($application);

        return [
            'reference' => $referenceCode,
            'currentStep' => $currentStep,
            'currentStepLabel' => self::STEP_DEFINITIONS[$currentStep] ?? 'Application Status',
            'status' => (string) ($application['status'] ?? ''),
            'statusLine' => $statusLine,
            'progressPercent' => $this->progressPercentForStep($currentStep),
            'submittedAt' => $application['submitted_at'] ?? null,
            'applicantName' => $application['applicant_name'] ?? null,
            'businessName' => $application['business_name'] ?? null,
            'barangay' => $application['barangay_name'] ?? null,
        ];
    }

    private function buildApplicantQuickView(int $userId, array $user): array
    {
        $dashboardState = (new ApplicantDashboardService())->stateForUser($userId);
        $application = is_array($dashboardState['application'] ?? null) ? $dashboardState['application'] : null;
        $training = is_array($dashboardState['training'] ?? null) ? $dashboardState['training'] : [];
        $postApproval = is_array($dashboardState['postApproval'] ?? null) ? $dashboardState['postApproval'] : [];
        $nextStep = is_array($dashboardState['nextStep'] ?? null) ? $dashboardState['nextStep'] : [];

        [$currentStep, $statusLine] = $this->resolveApplicantStepMeta($application, $training, $postApproval);

        return [
            'heading' => 'Applicant Quick View',
            'roleLabel' => 'Applicant',
            'currentStep' => $currentStep,
            'currentStepLabel' => self::STEP_DEFINITIONS[$currentStep] ?? 'Portal Progress',
            'statusLine' => $statusLine,
            'helperText' => (string) ($nextStep['description'] ?? 'Use your dashboard to continue your SMART LEAP record.'),
            'progressPercent' => $this->progressPercentForStep($currentStep),
            'reference' => $application ? $this->formatApplicationReference([
                'id' => $application['id'] ?? 0,
                'submitted_at' => $application['submittedAt'] ?? null,
                'created_at' => $application['updatedAt'] ?? null,
            ]) : null,
            'steps' => $this->buildSteps($currentStep),
            'actionLabel' => (string) ($nextStep['actionLabel'] ?? 'Open Dashboard'),
            'actionPath' => (string) ($nextStep['actionPath'] ?? 'applicant-dashboard'),
            'userName' => (string) ($user['name'] ?? ''),
        ];
    }

    private function buildBeneficiaryQuickView(int $userId, array $user): array
    {
        $state = (new ApplicationService())->getBeneficiaryProfileState($userId);
        $repayments = (new RepaymentLedgerService())->listForBeneficiary($userId);
        $application = is_array($state['application'] ?? null) ? $state['application'] : null;

        $standing = 'Your beneficiary record is active.';
        if (($repayments['ok'] ?? false) && !empty($repayments['items'])) {
            $standing = 'Repayment submissions and post-approval records are available in your dashboard.';
        }

        return [
            'heading' => 'Beneficiary Quick View',
            'roleLabel' => 'Beneficiary',
            'currentStep' => 6,
            'currentStepLabel' => self::STEP_DEFINITIONS[6],
            'statusLine' => 'Currently in Step 6 - Beneficiary Services',
            'helperText' => $standing,
            'progressPercent' => 100,
            'reference' => $application ? $this->formatApplicationReference([
                'id' => $application['id'] ?? 0,
                'submitted_at' => $application['submittedAt'] ?? null,
                'created_at' => $application['updatedAt'] ?? null,
            ]) : null,
            'steps' => $this->buildSteps(6),
            'actionLabel' => 'Open Dashboard',
            'actionPath' => 'beneficiary-dashboard#overview',
            'userName' => (string) ($user['name'] ?? ''),
        ];
    }

    private function resolveApplicantStepMeta(?array $application, array $training, array $postApproval): array
    {
        if ($application === null) {
            return [2, 'Currently in Step 2 - Profile Completion'];
        }

        $status = $this->normalizeApplicationStatus((string) ($application['status'] ?? ''));

        if (in_array($status, [APPLICATION_STATUS_DRAFT], true)) {
            return [2, 'Currently in Step 2 - Profile Completion'];
        }

        if ($status === APPLICATION_STATUS_SUBMITTED) {
            return [3, 'Currently in Step 3 - Application Submitted'];
        }

        if (
            ($postApproval['isUnlocked'] ?? false)
            || in_array($status, [APPLICATION_STATUS_APPROVED, APPLICATION_STATUS_APPROVED_FOR_TRAINING, APPLICATION_STATUS_TRAINING_ONGOING], true)
            || (($training['eligible'] ?? false) && (($training['summary']['totalPrograms'] ?? 0) > 0))
        ) {
            return [5, 'Currently in Step 5 - Training and Compliance'];
        }

        if ($status === APPLICATION_STATUS_COMPLETED) {
            return [6, 'Currently in Step 6 - Beneficiary Services'];
        }

        return [4, 'Currently in Step 4 - Review and Assessment'];
    }

    private function resolveTrackerStepMeta(array $application): array
    {
        $beneficiaryStatus = strtolower(trim((string) ($application['beneficiary_status'] ?? '')));
        if ($beneficiaryStatus === 'active' || !empty($application['approval_date'])) {
            return [6, 'Currently in Step 6 - Beneficiary Services'];
        }

        $status = $this->normalizeApplicationStatus((string) ($application['status'] ?? ''));

        return match ($status) {
            APPLICATION_STATUS_DRAFT => [2, 'Currently in Step 2 - Profile Completion'],
            APPLICATION_STATUS_SUBMITTED => [3, 'Currently in Step 3 - Application Submitted'],
            APPLICATION_STATUS_APPROVED,
            APPLICATION_STATUS_APPROVED_FOR_TRAINING,
            APPLICATION_STATUS_TRAINING_ONGOING => [5, 'Currently in Step 5 - Training and Compliance'],
            APPLICATION_STATUS_COMPLETED => [6, 'Currently in Step 6 - Beneficiary Services'],
            default => [4, 'Currently in Step 4 - Review and Assessment'],
        };
    }

    private function fetchApplicationForTracker(string $reference): ?array
    {
        [$applicationId, $year] = $this->parseApplicationReference($reference);
        if ($applicationId <= 0) {
            return null;
        }

        $statement = db()->prepare(
            'SELECT
                applications.id,
                applications.status,
                applications.submitted_at,
                applications.created_at,
                applicant_users.full_name AS applicant_name,
                applicant_profiles.business_name,
                barangays.name AS barangay_name,
                beneficiary_profiles.beneficiary_status,
                beneficiary_profiles.approval_date
             FROM applications
             INNER JOIN applicant_profiles ON applicant_profiles.id = applications.applicant_profile_id
             INNER JOIN users AS applicant_users ON applicant_users.id = applicant_profiles.user_id
             LEFT JOIN barangays ON barangays.id = applicant_profiles.barangay_id
             LEFT JOIN beneficiary_profiles ON beneficiary_profiles.applicant_profile_id = applicant_profiles.id
             WHERE applications.id = :application_id
             LIMIT 1'
        );
        $statement->execute(['application_id' => $applicationId]);
        $row = $statement->fetch(PDO::FETCH_ASSOC);

        if (!is_array($row)) {
            return null;
        }

        $rowYear = $this->extractReferenceYear($row);
        if ($year !== null && $rowYear !== $year) {
            return null;
        }

        return $row;
    }

    private function parseApplicationReference(string $reference): array
    {
        $normalized = strtoupper(trim($reference));
        if ($normalized === '') {
            return [0, null];
        }

        if (preg_match('/^APP-(\d{4})-(\d{4,})$/', $normalized, $matches)) {
            return [(int) $matches[2], (int) $matches[1]];
        }

        if (ctype_digit($normalized)) {
            return [(int) $normalized, null];
        }

        return [0, null];
    }

    private function formatApplicationReference(array $application): string
    {
        $year = $this->extractReferenceYear($application);
        return sprintf('APP-%04d-%04d', $year, (int) ($application['id'] ?? 0));
    }

    private function extractReferenceYear(array $application): int
    {
        $source = (string) (($application['submitted_at'] ?? '') ?: ($application['created_at'] ?? ''));
        $timestamp = strtotime($source);
        if ($timestamp === false) {
            return (int) date('Y');
        }

        return (int) date('Y', $timestamp);
    }

    private function progressPercentForStep(int $currentStep): int
    {
        return (int) round(($currentStep / max(1, count(self::STEP_DEFINITIONS))) * 100);
    }

    private function buildSteps(int $currentStep): array
    {
        $steps = [];
        foreach (self::STEP_DEFINITIONS as $index => $label) {
            $steps[] = [
                'number' => $index,
                'label' => $label,
                'state' => $index < $currentStep ? 'complete' : ($index === $currentStep ? 'active' : 'upcoming'),
            ];
        }

        return $steps;
    }

    private function normalizeApplicationStatus(string $status): string
    {
        return match (strtolower(trim(str_replace('_', ' ', $status)))) {
            'draft' => APPLICATION_STATUS_DRAFT,
            'submitted' => APPLICATION_STATUS_SUBMITTED,
            'under review' => APPLICATION_STATUS_UNDER_REVIEW,
            'checked by pdo' => APPLICATION_STATUS_CHECKED_BY_PDO,
            'requirements verified' => APPLICATION_STATUS_REQUIREMENTS_VERIFIED,
            'for assessment' => APPLICATION_STATUS_FOR_ASSESSMENT,
            'approved' => APPLICATION_STATUS_APPROVED,
            'approved for training' => APPLICATION_STATUS_APPROVED_FOR_TRAINING,
            'rejected' => APPLICATION_STATUS_REJECTED,
            'flagged' => APPLICATION_STATUS_FLAGGED,
            'needs documents' => APPLICATION_STATUS_NEEDS_DOCUMENTS,
            'needs correction' => APPLICATION_STATUS_NEEDS_CORRECTION,
            'training ongoing' => APPLICATION_STATUS_TRAINING_ONGOING,
            'completed' => APPLICATION_STATUS_COMPLETED,
            default => $status,
        };
    }

    private function isPortalUser(array $user): bool
    {
        $role = strtolower((string) ($user['role'] ?? ''));
        return str_contains($role, 'applicant') || str_contains($role, 'beneficiary');
    }
}
