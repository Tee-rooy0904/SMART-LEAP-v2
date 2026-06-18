<?php
declare(strict_types=1);

namespace App\Services;

use PDO;

class DashboardMetricsService
{
    private const REPAYMENT_PLAN_MONTHS = 24;
    private ?array $applicantProfileColumns = null;

    public function adminOverview(): array
    {
        $beneficiaryProfileService = new BeneficiaryProfileService();
        $beneficiaryProfileService->ensureReplacementLinkSchema();
        $beneficiaryProfileService->synchronizeSystemInactivityStatuses();
        $applicationSummary = $this->applicationSummary();
        $trainingSummary = $this->trainingSummary();
        $staffSummary = $this->staffSummary();
        $beneficiarySummary = $this->beneficiarySummary();
        $repaymentSummary = $this->repaymentSummary($beneficiarySummary);
        $beneficiaryRoster = $this->beneficiaryRoster();
        $coMakerRegistrations = (new CoMakerRegistrationService())->listForActor(['role' => ROLE_ADMIN]);

        return [
            'generatedAt' => date(DATE_ATOM),
            'applicationSummary' => $applicationSummary,
            'validationSummary' => (new StageOneRegistrationService())->validationSummary(),
            'recentApplications' => $this->recentApplications(),
            'trainingSummary' => $trainingSummary,
            'staffSummary' => $staffSummary,
            'assessmentQueue' => $this->assessmentQueue(),
            'beneficiarySummary' => $beneficiarySummary,
            'beneficiaryRoster' => $beneficiaryRoster,
            'coMakerRegistrations' => $coMakerRegistrations,
            'coMakerRegistrationSummary' => $this->coMakerRegistrationSummary($coMakerRegistrations),
            'beneficiaryRosterSummary' => $this->beneficiaryRosterSummary($beneficiaryRoster),
            'beneficiaryStatusDistribution' => $this->beneficiaryStatusDistribution($beneficiaryRoster),
            'repaymentSummary' => $repaymentSummary,
            'workflowDistribution' => $this->workflowDistribution($applicationSummary, $trainingSummary, $beneficiarySummary),
            'repaymentDistribution' => $repaymentSummary['distribution'] ?? ['segments' => [], 'total' => 0],
            'recentActivity' => $this->recentActivity(),
        ];
    }

    public function socialWorkerOverview(array $actor = []): array
    {
        $beneficiaryProfileService = new BeneficiaryProfileService();
        $beneficiaryProfileService->ensureReplacementLinkSchema();
        $beneficiaryProfileService->synchronizeSystemInactivityStatuses();
        $applicationSummary = $this->applicationSummary();
        $trainingSummary = $this->trainingSummary();
        $beneficiarySummary = $this->beneficiarySummary();
        $repaymentSummary = $this->repaymentSummary($beneficiarySummary);
        $beneficiaryRoster = $this->beneficiaryRoster();
        $validationState = (new StageOneRegistrationService())->validationState();
        $coMakerRegistrations = (new CoMakerRegistrationService())->listForActor($actor);

        return [
            'generatedAt' => date(DATE_ATOM),
            'applicationSummary' => $applicationSummary,
            'validationSummary' => $validationState['summary'] ?? [],
            'validationState' => $validationState,
            'assessmentQueue' => $this->assessmentQueue(12),
            'recentApplications' => $this->recentApplications(12),
            'trainingSummary' => $trainingSummary,
            'beneficiarySummary' => $beneficiarySummary,
            'beneficiaryRoster' => $beneficiaryRoster,
            'coMakerRegistrations' => $coMakerRegistrations,
            'coMakerRegistrationSummary' => $this->coMakerRegistrationSummary($coMakerRegistrations),
            'beneficiaryRosterSummary' => $this->beneficiaryRosterSummary($beneficiaryRoster),
            'beneficiaryStatusDistribution' => $this->beneficiaryStatusDistribution($beneficiaryRoster),
            'repaymentSummary' => $repaymentSummary,
            'workflowDistribution' => $this->workflowDistribution($applicationSummary, $trainingSummary, $beneficiarySummary),
            'repaymentDistribution' => $repaymentSummary['distribution'] ?? ['segments' => [], 'total' => 0],
            'recentActivity' => $this->recentActivity(),
        ];
    }

    private function applicationSummary(): array
    {
        $summary = [
            'total' => 0,
            'submitted' => 0,
            'underReview' => 0,
            'forAssessment' => 0,
            'approvedForTraining' => 0,
            'needsAttention' => 0,
        ];

        try {
            $rows = db()->query(
                'SELECT applications.status, COUNT(*) AS aggregate
                 FROM applications
                 INNER JOIN applicant_profiles ON applicant_profiles.id = applications.applicant_profile_id
                 INNER JOIN users AS applicant_users ON applicant_users.id = applicant_profiles.user_id
                 LEFT JOIN roles AS applicant_roles ON applicant_roles.id = applicant_users.role_id
                 LEFT JOIN beneficiary_profiles ON beneficiary_profiles.applicant_profile_id = applicant_profiles.id
                 WHERE LOWER(REPLACE(applications.status, "_", " ")) NOT IN ("training ongoing", "completed")
                   AND LOWER(COALESCE(applicant_roles.name, "")) <> "beneficiary"
                   AND NOT (
                        beneficiary_profiles.id IS NOT NULL
                        AND (
                            beneficiary_profiles.approval_date IS NOT NULL
                            OR LOWER(COALESCE(beneficiary_profiles.beneficiary_status, "")) = "active"
                        )
                   )
                 GROUP BY applications.status'
            )->fetchAll(PDO::FETCH_ASSOC) ?: [];
        } catch (\Throwable $exception) {
            log_database_query_failure('dashboard_metrics.application_summary', $exception);
            return $summary;
        }

        foreach ($rows as $row) {
            $status = $this->normalizeApplicationStatus((string) ($row['status'] ?? ''));
            $count = (int) ($row['aggregate'] ?? 0);
            $summary['total'] += $count;

            if ($status === APPLICATION_STATUS_SUBMITTED) {
                $summary['submitted'] += $count;
            }
            if ($status === APPLICATION_STATUS_UNDER_REVIEW) {
                $summary['underReview'] += $count;
            }
            if (in_array($status, [APPLICATION_STATUS_REQUIREMENTS_VERIFIED, APPLICATION_STATUS_FOR_ASSESSMENT], true)) {
                $summary['forAssessment'] += $count;
            }
            if (in_array($status, [APPLICATION_STATUS_APPROVED, APPLICATION_STATUS_APPROVED_FOR_TRAINING], true)) {
                $summary['approvedForTraining'] += $count;
            }
            if (in_array($status, [APPLICATION_STATUS_FLAGGED, APPLICATION_STATUS_NEEDS_CORRECTION, APPLICATION_STATUS_REJECTED], true)) {
                $summary['needsAttention'] += $count;
            }
        }

        return $summary;
    }

    private function recentApplications(int $limit = 10): array
    {
        try {
            $statement = db()->prepare(
                'SELECT
                    applications.id,
                    applications.status,
                    applications.updated_at,
                    applicant_profiles.business_name,
                    barangays.name AS barangay_name,
                    applicant_users.full_name AS applicant_name,
                    assigned_users.full_name AS assigned_pdo_name
                 FROM applications
                 INNER JOIN applicant_profiles ON applicant_profiles.id = applications.applicant_profile_id
                 INNER JOIN users AS applicant_users ON applicant_users.id = applicant_profiles.user_id
                 LEFT JOIN barangays ON barangays.id = applicant_profiles.barangay_id
                 LEFT JOIN staff_profiles ON staff_profiles.id = applications.assigned_staff_profile_id
                 LEFT JOIN users AS assigned_users ON assigned_users.id = staff_profiles.user_id
                 ORDER BY applications.updated_at DESC, applications.id DESC
                 LIMIT :limit'
            );
            $statement->bindValue(':limit', $limit, PDO::PARAM_INT);
            $statement->execute();
            $rows = $statement->fetchAll(PDO::FETCH_ASSOC) ?: [];
        } catch (\Throwable $exception) {
            log_database_query_failure('dashboard_metrics.recent_applications', $exception, ['limit' => $limit]);
            return [];
        }

        return array_map(function (array $row): array {
            return [
                'id' => (int) $row['id'],
                'applicantName' => $row['applicant_name'],
                'businessName' => $row['business_name'],
                'barangay' => $row['barangay_name'] ?: 'Not set',
                'status' => $this->normalizeApplicationStatus((string) ($row['status'] ?? '')),
                'assignedPdo' => $row['assigned_pdo_name'] ?: 'Unassigned',
                'updatedAt' => $row['updated_at'],
            ];
        }, $rows);
    }

    private function assessmentQueue(int $limit = 8): array
    {
        try {
            $statement = db()->prepare(
                'SELECT
                    applications.id,
                    applications.status,
                    applications.updated_at,
                    applicant_users.full_name AS applicant_name,
                    applicant_profiles.business_name,
                    barangays.name AS barangay_name
                 FROM applications
                 INNER JOIN applicant_profiles ON applicant_profiles.id = applications.applicant_profile_id
                 INNER JOIN users AS applicant_users ON applicant_users.id = applicant_profiles.user_id
                 LEFT JOIN barangays ON barangays.id = applicant_profiles.barangay_id
                 WHERE LOWER(REPLACE(applications.status, "_", " ")) IN ("requirements verified", "for assessment", "checked by pdo")
                 ORDER BY applications.updated_at DESC, applications.id DESC
                 LIMIT :limit'
            );
            $statement->bindValue(':limit', $limit, PDO::PARAM_INT);
            $statement->execute();
            $rows = $statement->fetchAll(PDO::FETCH_ASSOC) ?: [];
        } catch (\Throwable $exception) {
            log_database_query_failure('dashboard_metrics.assessment_queue', $exception, ['limit' => $limit]);
            return [];
        }

        return array_map(function (array $row): array {
            return [
                'id' => (int) $row['id'],
                'applicantName' => $row['applicant_name'],
                'businessName' => $row['business_name'],
                'barangay' => $row['barangay_name'] ?: 'Not set',
                'status' => $this->normalizeApplicationStatus((string) ($row['status'] ?? '')),
                'updatedAt' => $row['updated_at'],
            ];
        }, $rows);
    }

    private function trainingSummary(): array
    {
        $summary = [
            'programs' => 0,
            'scheduled' => 0,
            'notified' => 0,
            'completed' => 0,
            'invitees' => 0,
            'excused' => 0,
        ];

        try {
            $summary['programs'] = (int) (db()->query('SELECT COUNT(*) FROM training_programs')->fetchColumn() ?: 0);
            $rows = db()->query(
                'SELECT invite_status, COUNT(*) AS aggregate
                 FROM training_invitees
                 GROUP BY invite_status'
            )->fetchAll(PDO::FETCH_ASSOC) ?: [];
        } catch (\Throwable $exception) {
            log_database_query_failure('dashboard_metrics.training_summary', $exception);
            return $summary;
        }

        foreach ($rows as $row) {
            $status = strtolower((string) ($row['invite_status'] ?? ''));
            $count = (int) ($row['aggregate'] ?? 0);
            $summary['invitees'] += $count;

            if ($status === strtolower(TRAINING_STATUS_SCHEDULED)) {
                $summary['scheduled'] += $count;
            }
            if ($status === strtolower(TRAINING_STATUS_NOTIFIED)) {
                $summary['notified'] += $count;
            }
            if ($status === strtolower(TRAINING_STATUS_EXCUSED)) {
                $summary['excused'] += $count;
            }
            if (in_array($status, [strtolower(TRAINING_STATUS_ATTENDED), strtolower(TRAINING_STATUS_COMPLETED)], true)) {
                $summary['completed'] += $count;
            }
        }

        return $summary;
    }

    private function staffSummary(): array
    {
        $summary = [
            'admins' => 0,
            'pdo' => 0,
            'socialWorkers' => 0,
            'active' => 0,
        ];

        try {
            $rows = db()->query(
                'SELECT roles.name AS role_name, staff_profiles.status, COUNT(*) AS aggregate
                 FROM staff_profiles
                 INNER JOIN users ON users.id = staff_profiles.user_id
                 INNER JOIN roles ON roles.id = users.role_id
                 GROUP BY roles.name, staff_profiles.status'
            )->fetchAll(PDO::FETCH_ASSOC) ?: [];
        } catch (\Throwable $exception) {
            log_database_query_failure('dashboard_metrics.staff_summary', $exception);
            return $summary;
        }

        foreach ($rows as $row) {
            $count = (int) ($row['aggregate'] ?? 0);
            $role = strtolower((string) ($row['role_name'] ?? ''));
            $status = strtolower((string) ($row['status'] ?? ''));
            if ($status === 'active') {
                $summary['active'] += $count;
            }

            if (str_contains($role, 'admin')) {
                $summary['admins'] += $count;
            } elseif (str_contains($role, 'project')) {
                $summary['pdo'] += $count;
            } elseif (str_contains($role, 'social')) {
                $summary['socialWorkers'] += $count;
            }
        }

        return $summary;
    }

    private function beneficiarySummary(): array
    {
        $summary = ['total' => 0, 'active' => 0];
        $countableStatusSql = 'LOWER(COALESCE(beneficiary_status, "")) IN ("active", "inactive", "deceased")';

        try {
            (new CoMakerRegistrationService())->ensureSchema();
            $summary['total'] = (int) (db()->query(
                'SELECT COUNT(*)
                 FROM beneficiary_profiles
                 WHERE replacement_for_beneficiary_profile_id IS NULL
                   AND (
                        approval_date IS NOT NULL
                        OR ' . $countableStatusSql . '
                   )'
            )->fetchColumn() ?: 0);
            $summary['active'] = (int) (db()->query(
                'SELECT COUNT(*)
                 FROM beneficiary_profiles
                 WHERE replacement_for_beneficiary_profile_id IS NULL
                   AND (
                        approval_date IS NOT NULL
                        OR ' . $countableStatusSql . '
                   )
                   AND LOWER(beneficiary_status) = "active"'
            )->fetchColumn() ?: 0);
        } catch (\Throwable $exception) {
            log_database_query_failure('dashboard_metrics.beneficiary_summary', $exception);
        }

        return $summary;
    }

    private function beneficiaryRoster(int $limit = 500): array
    {
        (new CoMakerRegistrationService())->ensureSchema();

        try {
            $statement = db()->prepare(
                'SELECT
                    beneficiary_profiles.id,
                    beneficiary_profiles.beneficiary_status,
                    beneficiary_profiles.replacement_for_beneficiary_profile_id,
                    beneficiary_profiles.approval_date,
                    beneficiary_profiles.updated_at,
                    latest_application.status AS latest_application_status,
                    beneficiary_users.full_name AS beneficiary_name,
                    beneficiary_users.email AS beneficiary_email,
                    user_profile_photos.image_data AS beneficiary_photo,
                    applicant_profiles.business_name,
                    applicant_profiles.contact_number,
                    applicant_profiles.address_line,
                    applicant_profiles.birthdate,
                    applicant_profiles.age,
                    applicant_profiles.is_4ps,
                    ' . $this->selectApplicantEducationalAttainmentSql() . ',
                    ' . $this->selectApplicantLivelihoodCategorySql() . ',
                    ' . $this->selectApplicantSectorOtherSpecifySql() . ',
                    ' . $this->selectApplicantBatchNoSql() . ',
                    applicant_profiles.livelihood_type,
                    applicant_profiles.sector,
                    applicant_profiles.gender,
                    barangays.name AS barangay_name,
                    assigned_users.full_name AS assigned_pdo_name,
                    replacement_users.full_name AS replacement_for_name,
                    replacement_profiles.beneficiary_status AS replacement_for_status,
                    successor_profiles.id AS repayment_successor_beneficiary_profile_id,
                    successor_users.full_name AS repayment_successor_name,
                    co_maker_registrations.id AS co_maker_registration_id,
                    co_maker_registrations.user_id AS co_maker_user_id,
                    co_maker_registrations.beneficiary_profile_id AS co_maker_beneficiary_profile_id,
                    co_maker_registrations.relationship_to_beneficiary AS co_maker_relationship,
                    co_maker_registrations.contact_number AS co_maker_contact_number,
                    co_maker_registrations.valid_id_file_path AS co_maker_valid_id_path,
                    co_maker_registrations.valid_id_original_name AS co_maker_valid_id_name,
                    co_maker_registrations.relationship_document_path AS co_maker_relationship_document_path,
                    co_maker_registrations.relationship_document_original_name AS co_maker_relationship_document_name,
                    co_maker_registrations.registration_status AS co_maker_registration_status,
                    co_maker_users.full_name AS co_maker_name,
                    co_maker_users.email AS co_maker_email
                 FROM beneficiary_profiles
                 INNER JOIN users AS beneficiary_users ON beneficiary_users.id = beneficiary_profiles.user_id
                 LEFT JOIN user_profile_photos ON user_profile_photos.user_id = beneficiary_users.id
                 LEFT JOIN applicant_profiles ON applicant_profiles.id = beneficiary_profiles.applicant_profile_id
                 LEFT JOIN applications AS latest_application ON latest_application.id = (
                    SELECT application_scope.id
                    FROM applications AS application_scope
                    WHERE application_scope.applicant_profile_id = beneficiary_profiles.applicant_profile_id
                    ORDER BY application_scope.id DESC
                    LIMIT 1
                 )
                 LEFT JOIN barangays ON barangays.id = applicant_profiles.barangay_id
                 LEFT JOIN staff_profiles AS assigned_staff ON assigned_staff.id = beneficiary_profiles.assigned_staff_profile_id
                 LEFT JOIN users AS assigned_users ON assigned_users.id = assigned_staff.user_id
                 LEFT JOIN beneficiary_profiles AS replacement_profiles ON replacement_profiles.id = beneficiary_profiles.replacement_for_beneficiary_profile_id
                 LEFT JOIN users AS replacement_users ON replacement_users.id = replacement_profiles.user_id
                 LEFT JOIN beneficiary_profiles AS successor_profiles ON successor_profiles.replacement_for_beneficiary_profile_id = beneficiary_profiles.id
                 LEFT JOIN users AS successor_users ON successor_users.id = successor_profiles.user_id
                 LEFT JOIN co_maker_registrations
                    ON co_maker_registrations.deceased_beneficiary_profile_id = beneficiary_profiles.id
                   AND LOWER(COALESCE(co_maker_registrations.registration_status, "")) IN ("active", "approved")
                 LEFT JOIN users AS co_maker_users ON co_maker_users.id = co_maker_registrations.user_id
                 WHERE beneficiary_profiles.replacement_for_beneficiary_profile_id IS NULL
                   AND (
                        beneficiary_profiles.approval_date IS NOT NULL
                        OR LOWER(COALESCE(beneficiary_profiles.beneficiary_status, "")) IN ("active", "inactive", "deceased")
                   )
                 ORDER BY beneficiary_profiles.updated_at DESC, beneficiary_profiles.id DESC
                 LIMIT :limit'
            );
            $statement->bindValue(':limit', $limit, PDO::PARAM_INT);
            $statement->execute();
            $rows = $statement->fetchAll(PDO::FETCH_ASSOC) ?: [];
        } catch (\Throwable $exception) {
            log_database_query_failure('dashboard_metrics.beneficiary_roster', $exception, ['limit' => $limit]);
            return [];
        }

        if (!$rows) {
            return [];
        }

        $beneficiaryIds = array_values(array_filter(array_map(
            static fn (array $row): int => (int) ($row['id'] ?? 0),
            $rows
        )));

        $repaymentMap = $this->beneficiaryRepaymentSummaries($beneficiaryIds);
        $complianceMap = $this->beneficiaryComplianceSummaries($beneficiaryIds);

        return array_map(function (array $row) use ($repaymentMap, $complianceMap): array {
            $beneficiaryId = (int) ($row['id'] ?? 0);
            $repayment = $repaymentMap[$beneficiaryId] ?? $this->emptyBeneficiaryRepaymentSummary();
            $compliance = $complianceMap[$beneficiaryId] ?? $this->emptyBeneficiaryComplianceSummary();
            $activityCandidates = array_filter([
                (string) ($row['updated_at'] ?? ''),
                (string) ($repayment['latestActivity'] ?? ''),
                (string) ($compliance['latestActivity'] ?? ''),
            ]);
            $lastActivity = $activityCandidates ? max($activityCandidates) : (string) ($row['updated_at'] ?? '');

            return [
                'id' => $beneficiaryId,
                'name' => $row['beneficiary_name'] ?: 'Unnamed beneficiary',
                'email' => $row['beneficiary_email'] ?: '',
                'photo' => $row['beneficiary_photo'] ?: null,
                'contactNumber' => $row['contact_number'] ?: '',
                'address' => $row['address_line'] ?: '',
                'businessName' => $row['business_name'] ?: 'No business name',
                'birthdate' => $row['birthdate'] ?: '',
                'age' => $this->resolveAge($row),
                'ageGroup' => $this->resolveAgeGroup($row),
                'businessType' => $row['livelihood_type'] ?: ($row['sector'] ?: 'Not set'),
                'serviceType' => $this->normalizeServiceType((string) (($row['livelihood_category'] ?: $row['livelihood_type']) ?: ($row['sector'] ?: ''))),
                'livelihoodCategory' => $row['livelihood_category'] ?: '',
                'gender' => $this->labelizeStatus((string) ($row['gender'] ?? 'Not set')),
                'is4ps' => ((int) ($row['is_4ps'] ?? 0)) === 1 ? 'Yes' : 'No',
                'educationalAttainment' => $row['educational_attainment'] ?: '',
                'sector' => $row['sector'] ?: '',
                'sectorOtherSpecify' => $row['sector_other_specify'] ?: '',
                'batchNo' => $row['batch_no'] ?: '',
                'barangay' => $row['barangay_name'] ?: 'Unassigned',
                'assignedPdo' => $row['assigned_pdo_name'] ?: 'Unassigned',
                'programStatus' => $this->labelizeStatus((string) ($row['beneficiary_status'] ?? 'active')),
                'latestApplicationStatus' => strtolower(trim(str_replace('_', ' ', (string) ($row['latest_application_status'] ?? '')))),
                'replacementForBeneficiaryId' => $row['replacement_for_beneficiary_profile_id'] !== null ? (int) $row['replacement_for_beneficiary_profile_id'] : null,
                'replacementForName' => $row['replacement_for_name'] ?: '',
                'replacementForStatus' => $this->labelizeStatus((string) ($row['replacement_for_status'] ?? '')),
                'repaymentSuccessorBeneficiaryProfileId' => $row['repayment_successor_beneficiary_profile_id'] !== null ? (int) $row['repayment_successor_beneficiary_profile_id'] : null,
                'repaymentSuccessorName' => $row['repayment_successor_name'] ?: '',
                'coMakerRegistration' => $row['co_maker_registration_id'] !== null ? [
                    'id' => (int) $row['co_maker_registration_id'],
                    'userId' => (int) ($row['co_maker_user_id'] ?? 0),
                    'beneficiaryProfileId' => (int) ($row['co_maker_beneficiary_profile_id'] ?? 0),
                    'name' => (string) ($row['co_maker_name'] ?? ''),
                    'email' => (string) ($row['co_maker_email'] ?? ''),
                    'contactNumber' => (string) ($row['co_maker_contact_number'] ?? ''),
                    'relationshipToPrimaryBeneficiary' => (string) ($row['co_maker_relationship'] ?? ''),
                    'registrationStatus' => (string) ($row['co_maker_registration_status'] ?? 'inactive'),
                    'validId' => [
                        'path' => (string) ($row['co_maker_valid_id_path'] ?? ''),
                        'name' => (string) ($row['co_maker_valid_id_name'] ?? ''),
                        'url' => $this->publicUploadUrl((string) ($row['co_maker_valid_id_path'] ?? '')),
                    ],
                    'relationshipDocument' => [
                        'path' => (string) ($row['co_maker_relationship_document_path'] ?? ''),
                        'name' => (string) ($row['co_maker_relationship_document_name'] ?? ''),
                        'url' => $this->publicUploadUrl((string) ($row['co_maker_relationship_document_path'] ?? '')),
                    ],
                ] : null,
                'approvalDate' => $row['approval_date'],
                'repayment' => $repayment,
                'compliance' => $compliance,
                'lastActivity' => $lastActivity,
            ];
        }, $rows);
    }

    private function beneficiaryRosterSummary(array $roster): array
    {
        $summary = [
            'active' => 0,
            'inactive' => 0,
            'deceased' => 0,
            'pendingRepayment' => 0,
            'needsFollowUp' => 0,
            'noUploadYet' => 0,
        ];

        $statusBuckets = $this->beneficiaryStatusBuckets($roster);
        $summary['active'] = $statusBuckets['active'];
        $summary['inactive'] = $statusBuckets['inactive'];
        $summary['deceased'] = $statusBuckets['deceased'];

        foreach ($roster as $beneficiary) {
            $repaymentKey = (string) ($beneficiary['repayment']['key'] ?? '');
            $complianceKey = (string) ($beneficiary['compliance']['key'] ?? '');

            if ($repaymentKey === 'under_review') {
                $summary['pendingRepayment']++;
            }
            if (in_array($repaymentKey, ['needs_follow_up', 'rejected'], true) || $complianceKey === 'needs_follow_up') {
                $summary['needsFollowUp']++;
            }
            if ($repaymentKey === 'no_upload') {
                $summary['noUploadYet']++;
            }
        }

        return $summary;
    }

    private function coMakerRegistrationSummary(array $registrations): array
    {
        $summary = [
            'total' => count($registrations),
            'pendingReview' => 0,
            'approved' => 0,
            'rejected' => 0,
        ];

        foreach ($registrations as $registration) {
            $status = strtolower(trim((string) ($registration['registrationStatus'] ?? '')));
            if ($status === CoMakerRegistrationService::STATUS_PENDING_REVIEW) {
                $summary['pendingReview']++;
                continue;
            }
            if (in_array($status, [CoMakerRegistrationService::STATUS_APPROVED, CoMakerRegistrationService::LEGACY_STATUS_ACTIVE], true)) {
                $summary['approved']++;
                continue;
            }
            if ($status === CoMakerRegistrationService::STATUS_REJECTED) {
                $summary['rejected']++;
            }
        }

        return $summary;
    }

    private function beneficiaryStatusDistribution(array $roster): array
    {
        $buckets = $this->beneficiaryStatusBuckets($roster);
        $segments = [
            ['key' => 'active', 'label' => 'Active', 'count' => $buckets['active']],
            ['key' => 'inactive', 'label' => 'Inactive', 'count' => $buckets['inactive']],
            ['key' => 'deceased', 'label' => 'Deceased', 'count' => $buckets['deceased']],
        ];

        return [
            'segments' => $segments,
            'total' => array_sum(array_column($segments, 'count')),
        ];
    }

    private function beneficiaryStatusBuckets(array $roster): array
    {
        $buckets = [
            'active' => 0,
            'inactive' => 0,
            'deceased' => 0,
        ];

        if ($roster === []) {
            return $buckets;
        }

        foreach ($roster as $beneficiary) {
            $status = strtolower(trim((string) ($beneficiary['programStatus'] ?? 'active')));
            if (array_key_exists($status, $buckets)) {
                $buckets[$status]++;
                continue;
            }

            $buckets['active']++;
        }

        return $buckets;
    }

    private function beneficiaryRepaymentSummaries(array $beneficiaryIds): array
    {
        if (!$beneficiaryIds) {
            return [];
        }

        $map = [];
        foreach ($beneficiaryIds as $beneficiaryId) {
            $map[$beneficiaryId] = $this->emptyBeneficiaryRepaymentSummary();
        }

        try {
            $placeholders = implode(',', array_fill(0, count($beneficiaryIds), '?'));
            $statement = db()->prepare(
                'SELECT repayments.id AS repayment_id,
                        repayments.beneficiary_profile_id,
                        repayments.status,
                        repayments.amount,
                        repayments.payment_date,
                        repayments.updated_at,
                        verification.verification_status,
                        repayment_coverage_months.coverage_month
                 FROM repayments
                 LEFT JOIN (
                    SELECT rv.repayment_id,
                           rv.verification_status
                    FROM repayment_verifications rv
                    INNER JOIN (
                        SELECT repayment_id, MAX(id) AS latest_id
                        FROM repayment_verifications
                        GROUP BY repayment_id
                    ) latest ON latest.latest_id = rv.id
                 ) verification ON verification.repayment_id = repayments.id
                 LEFT JOIN repayment_coverage_months ON repayment_coverage_months.repayment_id = repayments.id
                 WHERE repayments.beneficiary_profile_id IN (' . $placeholders . ')'
            );
            $statement->execute($beneficiaryIds);
            $rows = $statement->fetchAll(PDO::FETCH_ASSOC) ?: [];
        } catch (\Throwable $exception) {
            log_database_query_failure('dashboard_metrics.beneficiary_repayment_summaries', $exception);
            return $map;
        }

        foreach ($rows as $row) {
            $beneficiaryId = (int) ($row['beneficiary_profile_id'] ?? 0);
            if (!isset($map[$beneficiaryId])) {
                continue;
            }

            $stage = $this->normalizeRepaymentStage(
                (string) ($row['status'] ?? ''),
                (string) ($row['verification_status'] ?? '')
            );
            $coverageMonth = substr((string) ($row['coverage_month'] ?? ''), 0, 7);
            $paymentDate = (string) ($row['payment_date'] ?? '');
            $map[$beneficiaryId]['uploadedReceipts']++;
            $map[$beneficiaryId]['latestActivity'] = max(
                (string) ($map[$beneficiaryId]['latestActivity'] ?? ''),
                (string) ($row['updated_at'] ?? '')
            );

            if (in_array($stage, ['uploaded', 'pending'], true)) {
                $map[$beneficiaryId]['underReview']++;
                continue;
            }
            if (in_array($stage, ['needs_correction', 'rejected'], true)) {
                $map[$beneficiaryId]['needsFollowUp']++;
                continue;
            }
            if ($stage === 'credited') {
                $map[$beneficiaryId]['credited']++;
                $map[$beneficiaryId]['verifiedInstallments']++;
                $map[$beneficiaryId]['paidAmount'] += (float) ($row['amount'] ?? 0);
                if ($this->isRepaymentOnTime($paymentDate, $coverageMonth)) {
                    $map[$beneficiaryId]['onTimeInstallments']++;
                } else {
                    $map[$beneficiaryId]['lateInstallments']++;
                }
                continue;
            }
            if ($stage === 'verified') {
                $map[$beneficiaryId]['verified']++;
                $map[$beneficiaryId]['verifiedInstallments']++;
                $map[$beneficiaryId]['paidAmount'] += (float) ($row['amount'] ?? 0);
                if ($this->isRepaymentOnTime($paymentDate, $coverageMonth)) {
                    $map[$beneficiaryId]['onTimeInstallments']++;
                } else {
                    $map[$beneficiaryId]['lateInstallments']++;
                }
            }
        }

        foreach ($map as $beneficiaryId => $summary) {
            $map[$beneficiaryId] = $this->resolveBeneficiaryRepaymentSummary($summary);
        }

        return $map;
    }

    private function beneficiaryComplianceSummaries(array $beneficiaryIds): array
    {
        if (!$beneficiaryIds) {
            return [];
        }

        $map = [];
        foreach ($beneficiaryIds as $beneficiaryId) {
            $map[$beneficiaryId] = $this->emptyBeneficiaryComplianceSummary();
        }

        try {
            $placeholders = implode(',', array_fill(0, count($beneficiaryIds), '?'));
            $statement = db()->prepare(
                'SELECT beneficiary_profile_id, status, updated_at
                 FROM post_approval_tasks
                 WHERE beneficiary_profile_id IN (' . $placeholders . ')'
            );
            $statement->execute($beneficiaryIds);
            $rows = $statement->fetchAll(PDO::FETCH_ASSOC) ?: [];
        } catch (\Throwable $exception) {
            log_database_query_failure('dashboard_metrics.beneficiary_compliance_summaries', $exception);
            return $map;
        }

        foreach ($rows as $row) {
            $beneficiaryId = (int) ($row['beneficiary_profile_id'] ?? 0);
            if (!isset($map[$beneficiaryId])) {
                continue;
            }

            $stage = $this->normalizeComplianceStage((string) ($row['status'] ?? ''));
            $map[$beneficiaryId]['total']++;
            $map[$beneficiaryId]['latestActivity'] = max(
                (string) ($map[$beneficiaryId]['latestActivity'] ?? ''),
                (string) ($row['updated_at'] ?? '')
            );
            $map[$beneficiaryId][$stage]++;
        }

        foreach ($map as $beneficiaryId => $summary) {
            $map[$beneficiaryId] = $this->resolveBeneficiaryComplianceSummary($summary);
        }

        return $map;
    }

    private function emptyBeneficiaryRepaymentSummary(): array
    {
        return [
            'key' => 'no_upload',
            'label' => 'No Upload Yet',
            'uploadedReceipts' => 0,
            'underReview' => 0,
            'needsFollowUp' => 0,
            'verified' => 0,
            'credited' => 0,
            'verifiedInstallments' => 0,
            'onTimeInstallments' => 0,
            'lateInstallments' => 0,
            'paidAmount' => 0.0,
            'obligationAmount' => 15000.0,
            'totalDueInstallments' => self::REPAYMENT_PLAN_MONTHS,
            'latestActivity' => '',
        ];
    }

    private function resolveBeneficiaryRepaymentSummary(array $summary): array
    {
        if ((int) ($summary['uploadedReceipts'] ?? 0) <= 0) {
            $summary['key'] = 'no_upload';
            $summary['label'] = 'No Upload Yet';
        } elseif ((int) ($summary['needsFollowUp'] ?? 0) > 0) {
            $summary['key'] = 'needs_follow_up';
            $summary['label'] = 'Needs Follow-up';
        } elseif ((int) ($summary['underReview'] ?? 0) > 0) {
            $summary['key'] = 'under_review';
            $summary['label'] = 'Under Review';
        } elseif ((float) ($summary['paidAmount'] ?? 0) >= (float) ($summary['obligationAmount'] ?? 15000)) {
            $summary['key'] = 'fully_paid';
            $summary['label'] = 'Fully Paid';
        } elseif ((float) ($summary['paidAmount'] ?? 0) > 0) {
            $summary['key'] = 'partial_paid';
            $summary['label'] = 'Partial Paid';
        } else {
            $summary['key'] = 'under_review';
            $summary['label'] = 'Under Review';
        }

        $dueInstallments = max((int) ($summary['totalDueInstallments'] ?? self::REPAYMENT_PLAN_MONTHS), 0);
        $onTimeInstallments = max((int) ($summary['onTimeInstallments'] ?? 0), 0);
        $summary['repaymentRate'] = $dueInstallments > 0
            ? round(($onTimeInstallments / $dueInstallments) * 100, 2)
            : 0.0;

        return $summary;
    }

    private function emptyBeneficiaryComplianceSummary(): array
    {
        return [
            'key' => 'pending',
            'label' => 'Pending',
            'total' => 0,
            'pending' => 0,
            'inReview' => 0,
            'needsFollowUp' => 0,
            'completed' => 0,
            'latestActivity' => '',
        ];
    }

    private function resolveBeneficiaryComplianceSummary(array $summary): array
    {
        if ((int) ($summary['total'] ?? 0) <= 0) {
            $summary['key'] = 'pending';
            $summary['label'] = 'Pending';
        } elseif ((int) ($summary['needsFollowUp'] ?? 0) > 0) {
            $summary['key'] = 'needs_follow_up';
            $summary['label'] = 'Needs Follow-up';
        } elseif ((int) ($summary['completed'] ?? 0) >= (int) ($summary['total'] ?? 0)) {
            $summary['key'] = 'completed';
            $summary['label'] = 'Completed';
        } elseif ((int) ($summary['inReview'] ?? 0) > 0) {
            $summary['key'] = 'in_review';
            $summary['label'] = 'In Review';
        } else {
            $summary['key'] = 'pending';
            $summary['label'] = 'Pending';
        }

        return $summary;
    }

    private function workflowDistribution(array $applicationSummary, array $trainingSummary, array $beneficiarySummary): array
    {
        $stages = [
            ['key' => 'submitted', 'label' => 'Submitted', 'count' => (int) ($applicationSummary['submitted'] ?? 0)],
            ['key' => 'under_review', 'label' => 'Under Review', 'count' => (int) ($applicationSummary['underReview'] ?? 0)],
            ['key' => 'checked_by_pdo', 'label' => 'Checked by PDO', 'count' => (int) ($applicationSummary['forAssessment'] ?? 0)],
            ['key' => 'approved', 'label' => 'Approved', 'count' => (int) ($applicationSummary['approvedForTraining'] ?? 0)],
            ['key' => 'training_scheduled', 'label' => 'Training Scheduled', 'count' => (int) ($trainingSummary['scheduled'] ?? 0)],
            ['key' => 'training_completed', 'label' => 'Training Completed', 'count' => (int) ($trainingSummary['completed'] ?? 0)],
            ['key' => 'post_approval_compliance', 'label' => 'Post-Approval Compliance', 'count' => 0],
            ['key' => 'beneficiary_active', 'label' => 'Beneficiary Active', 'count' => (int) ($beneficiarySummary['active'] ?? 0)],
        ];

        return [
            'stages' => $stages,
            'total' => array_sum(array_column($stages, 'count')),
        ];
    }

    private function repaymentSummary(array $beneficiarySummary = []): array
    {
        $summary = [
            'isLive' => false,
            'pendingVerification' => 0,
            'verifiedThisMonth' => 0,
            'overdueAccounts' => 0,
            'creditedCases' => 0,
            'underReview' => 0,
            'needsCorrection' => 0,
            'partialPaid' => 0,
            'fullyPaid' => 0,
            'noUploadYet' => 0,
            'distribution' => [
                'segments' => [
                    ['key' => 'no_upload_yet', 'label' => 'No Upload Yet', 'count' => 0],
                    ['key' => 'under_review', 'label' => 'Under Review', 'count' => 0],
                    ['key' => 'needs_correction', 'label' => 'Needs Correction', 'count' => 0],
                    ['key' => 'partial_paid', 'label' => 'Partial Paid', 'count' => 0],
                    ['key' => 'fully_paid', 'label' => 'Fully Paid', 'count' => 0],
                ],
                'total' => 0,
            ],
        ];

        try {
            $beneficiaryIds = db()->query(
                'SELECT id
                 FROM beneficiary_profiles
                 WHERE replacement_for_beneficiary_profile_id IS NULL
                   AND (
                        approval_date IS NOT NULL
                        OR LOWER(COALESCE(beneficiary_status, "")) IN ("active", "inactive", "deceased")
                   )'
            )->fetchAll(PDO::FETCH_COLUMN) ?: [];
            $beneficiaryIds = array_values(array_filter(array_map('intval', $beneficiaryIds)));
            $repaymentMap = $this->beneficiaryRepaymentSummaries($beneficiaryIds);

            $distribution = [
                'no_upload_yet' => 0,
                'under_review' => 0,
                'needs_correction' => 0,
                'partial_paid' => 0,
                'fully_paid' => 0,
            ];

            foreach ($beneficiaryIds as $beneficiaryId) {
                $repayment = $repaymentMap[$beneficiaryId] ?? $this->emptyBeneficiaryRepaymentSummary();
                $key = (string) ($repayment['key'] ?? 'no_upload');
                if ($key === 'fully_paid') {
                    $distribution['fully_paid']++;
                    continue;
                }
                if ($key === 'partial_paid') {
                    $distribution['partial_paid']++;
                    continue;
                }
                if ($key === 'under_review') {
                    $distribution['under_review']++;
                    continue;
                }
                if (in_array($key, ['needs_follow_up', 'rejected'], true)) {
                    $distribution['needs_correction']++;
                    continue;
                }
                $distribution['no_upload_yet']++;
            }

            $summary['pendingVerification'] = $distribution['under_review'];
            $summary['verifiedThisMonth'] = (int) (db()->query(
                'SELECT COUNT(*) FROM repayments
                 LEFT JOIN (
                    SELECT rv.repayment_id,
                           rv.verification_status,
                           rv.verified_at
                    FROM repayment_verifications rv
                    INNER JOIN (
                        SELECT repayment_id, MAX(id) AS latest_id
                        FROM repayment_verifications
                        GROUP BY repayment_id
                    ) latest ON latest.latest_id = rv.id
                 ) verification ON verification.repayment_id = repayments.id
                 WHERE LOWER(COALESCE(verification.verification_status, repayments.status)) = "verified"
                   AND DATE_FORMAT(COALESCE(verification.verified_at, repayments.updated_at), "%Y-%m") = DATE_FORMAT(CURDATE(), "%Y-%m")'
            )->fetchColumn() ?: 0);
            $summary['overdueAccounts'] = $distribution['needs_correction'];
            $summary['creditedCases'] = $distribution['fully_paid'];
            $summary['underReview'] = $distribution['under_review'];
            $summary['needsCorrection'] = $distribution['needs_correction'];
            $summary['partialPaid'] = $distribution['partial_paid'];
            $summary['fullyPaid'] = $distribution['fully_paid'];
            $summary['noUploadYet'] = $distribution['no_upload_yet'];
            $summary['distribution'] = [
                'segments' => [
                    ['key' => 'no_upload_yet', 'label' => 'No Upload Yet', 'count' => $distribution['no_upload_yet']],
                    ['key' => 'under_review', 'label' => 'Under Review', 'count' => $distribution['under_review']],
                    ['key' => 'needs_correction', 'label' => 'Needs Correction', 'count' => $distribution['needs_correction']],
                    ['key' => 'partial_paid', 'label' => 'Partial Paid', 'count' => $distribution['partial_paid']],
                    ['key' => 'fully_paid', 'label' => 'Fully Paid', 'count' => $distribution['fully_paid']],
                ],
                'total' => array_sum($distribution),
            ];
            $summary['isLive'] = true;
        } catch (\Throwable $exception) {
            log_database_query_failure('dashboard_metrics.repayment_summary', $exception);
        }

        return $summary;
    }

    private function recentActivity(int $limit = 8): array
    {
        try {
            $statement = db()->prepare(
                'SELECT audit_logs.id, audit_logs.action, audit_logs.entity_type, audit_logs.entity_id, audit_logs.details, audit_logs.created_at, users.full_name
                 FROM audit_logs
                 LEFT JOIN users ON users.id = audit_logs.user_id
                 ORDER BY audit_logs.created_at DESC, audit_logs.id DESC
                 LIMIT :limit'
            );
            $statement->bindValue(':limit', $limit, PDO::PARAM_INT);
            $statement->execute();
            $rows = $statement->fetchAll(PDO::FETCH_ASSOC) ?: [];
        } catch (\Throwable $exception) {
            log_database_query_failure('dashboard_metrics.recent_activity', $exception);
            return [];
        }

        return array_map(function (array $row): array {
            $entityType = trim((string) ($row['entity_type'] ?? 'record'));

            return [
                'id' => (int) $row['id'],
                'actor' => $row['full_name'] ?: 'System',
                'action' => $this->formatAuditAction((string) ($row['action'] ?? 'updated')),
                'module' => $this->formatAuditModule($entityType),
                'target' => $this->formatAuditTarget($entityType, (string) ($row['entity_id'] ?? '')),
                'timestamp' => $row['created_at'],
            ];
        }, $rows);
    }

    private function formatAuditAction(string $action): string
    {
        $action = trim($action);
        if ($action === '') {
            return 'Updated';
        }

        $leaf = $action;
        if (str_contains($leaf, '.')) {
            $parts = explode('.', $leaf);
            $leaf = (string) end($parts);
        }

        return ucwords(strtolower(str_replace(['_', '-'], ' ', $leaf)));
    }

    private function formatAuditModule(string $entityType): string
    {
        $entityType = trim($entityType);
        if ($entityType === '') {
            return 'Record';
        }

        return match (strtolower($entityType)) {
            'training_programs' => 'Training Programs',
            'training_invitees' => 'Training Participants',
            'applications' => 'Applications',
            'beneficiary_profiles' => 'Beneficiaries',
            'repayments' => 'Repayments',
            'users' => 'Team',
            default => ucwords(strtolower(str_replace(['_', '-'], ' ', $entityType))),
        };
    }

    private function formatAuditTarget(string $entityType, string $entityId): string
    {
        $entityId = trim($entityId);
        $label = match (strtolower(trim($entityType))) {
            'training_programs' => 'Training Program',
            'training_invitees' => 'Training Participant',
            'applications' => 'Application',
            'beneficiary_profiles' => 'Beneficiary',
            'repayments' => 'Repayment',
            'users' => 'User',
            default => 'Record',
        };

        return $entityId !== '' ? $label . ' #' . $entityId : $label;
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

    private function isRepaymentOnTime(string $paymentDate, string $coverageMonth): bool
    {
        if ($paymentDate === '' || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $paymentDate)) {
            return false;
        }

        if ($coverageMonth === '' || !preg_match('/^\d{4}-\d{2}$/', $coverageMonth)) {
            return false;
        }

        try {
            $paidAt = new \DateTimeImmutable($paymentDate . ' 23:59:59');
            $dueAt = (new \DateTimeImmutable($coverageMonth . '-01 23:59:59'))->modify('last day of this month');
        } catch (\Throwable $exception) {
            return false;
        }

        return $paidAt <= $dueAt;
    }

    private function normalizeComplianceStage(string $status): string
    {
        return match (strtolower(trim(str_replace('_', ' ', $status)))) {
            'accepted', 'approved', 'completed', 'verified', 'complete' => 'completed',
            'rejected', 'needs correction', 'flagged' => 'needsFollowUp',
            'submitted', 'under review', 'reviewing', 'in review' => 'inReview',
            default => 'pending',
        };
    }

    private function labelizeStatus(string $status): string
    {
        $status = trim(str_replace('_', ' ', $status));
        return $status !== '' ? ucwords(strtolower($status)) : 'Not Set';
    }

    private function resolveAge(array $row): ?int
    {
        $age = (int) ($row['age'] ?? 0);
        if ($age > 0) {
            return $age;
        }

        $birthdate = trim((string) ($row['birthdate'] ?? ''));
        if ($birthdate === '') {
            return null;
        }

        try {
            $dob = new \DateTimeImmutable($birthdate);
            $today = new \DateTimeImmutable('today');
        } catch (\Throwable $exception) {
            return null;
        }

        return max(0, (int) $today->diff($dob)->y);
    }

    private function resolveAgeGroup(array $row): string
    {
        $age = $this->resolveAge($row);
        if ($age === null) {
            return 'Not Set';
        }

        return match (true) {
            $age < 18 => 'Below 18',
            $age <= 24 => '18-24',
            $age <= 34 => '25-34',
            $age <= 44 => '35-44',
            $age <= 54 => '45-54',
            default => '55+',
        };
    }

    private function normalizeServiceType(string $value): string
    {
        $text = strtolower(trim($value));
        if ($text === '') {
            return 'Unclassified';
        }
        if (str_contains($text, 'buy') || str_contains($text, 'sell')) {
            return 'Buy and Sell';
        }
        if (str_contains($text, 'food') || str_contains($text, 'beverage') || str_contains($text, 'balut') || str_contains($text, 'snack') || str_contains($text, 'eatery') || str_contains($text, 'carinderia')) {
            return 'Food and Beverages';
        }
        if (str_contains($text, 'livestock') || str_contains($text, 'animal') || str_contains($text, 'poultry') || str_contains($text, 'hog')) {
            return 'Livestock';
        }
        if (
            str_contains($text, 'paluwagan')
            || str_contains($text, 'microenterprise')
            || str_contains($text, 'micro enterprise')
            || str_contains($text, 'micro-enterprise')
            || str_contains($text, 'service')
            || str_contains($text, 'establishment')
            || str_contains($text, 'store')
            || str_contains($text, 'shop')
            || str_contains($text, 'home')
            || str_contains($text, 'production')
            || str_contains($text, 'homemade')
            || str_contains($text, 'processing')
        ) {
            return 'Establishment';
        }

        return ucwords($text);
    }

    private function normalizeApplicationStatus(string $status): string
    {
        return match (strtolower(trim($status))) {
            'draft' => APPLICATION_STATUS_DRAFT,
            'submitted' => APPLICATION_STATUS_SUBMITTED,
            'under review', 'under_review', 'underreview' => APPLICATION_STATUS_UNDER_REVIEW,
            'checked by pdo', 'checked_by_pdo', 'checkedbypdo' => APPLICATION_STATUS_CHECKED_BY_PDO,
            'requirements verified', 'requirements_verified', 'requirementsverified' => APPLICATION_STATUS_REQUIREMENTS_VERIFIED,
            'for assessment', 'for_assessment', 'forassessment' => APPLICATION_STATUS_FOR_ASSESSMENT,
            'approved' => APPLICATION_STATUS_APPROVED,
            'approved for training', 'approved_for_training', 'approvedfortraining' => APPLICATION_STATUS_APPROVED_FOR_TRAINING,
            'rejected' => APPLICATION_STATUS_REJECTED,
            'flagged' => APPLICATION_STATUS_FLAGGED,
            'needs correction', 'needs_correction', 'needscorrection' => APPLICATION_STATUS_NEEDS_CORRECTION,
            default => $status,
        };
    }

    private function applicantProfileColumns(): array
    {
        if (is_array($this->applicantProfileColumns)) {
            return $this->applicantProfileColumns;
        }

        try {
            $rows = db()->query('SHOW COLUMNS FROM applicant_profiles')->fetchAll(PDO::FETCH_ASSOC) ?: [];
        } catch (\Throwable $exception) {
            log_database_query_failure('dashboard_metrics.applicant_profile_columns', $exception);
            $this->applicantProfileColumns = [];
            return $this->applicantProfileColumns;
        }

        $this->applicantProfileColumns = array_values(array_filter(array_map(
            static fn (array $row): string => (string) ($row['Field'] ?? ''),
            $rows
        )));

        return $this->applicantProfileColumns;
    }

    private function selectApplicantEducationalAttainmentSql(): string
    {
        return in_array('educational_attainment', $this->applicantProfileColumns(), true)
            ? 'applicant_profiles.educational_attainment AS educational_attainment'
            : 'NULL AS educational_attainment';
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

    private function selectApplicantSectorOtherSpecifySql(): string
    {
        return in_array('sector_other_specify', $this->applicantProfileColumns(), true)
            ? 'applicant_profiles.sector_other_specify AS sector_other_specify'
            : 'NULL AS sector_other_specify';
    }

    private function publicUploadUrl(string $path): string
    {
        $trimmed = ltrim(str_replace('\\', '/', $path), '/');
        return $trimmed !== '' ? app_url($trimmed) : '';
    }
}
