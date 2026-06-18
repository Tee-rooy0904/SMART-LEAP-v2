<?php
declare(strict_types=1);

namespace App\Services;

use PDO;

class ReportService
{
    private const REPAYMENT_PLAN_MONTHS = 24;
    private const MONTHLY_REPAYMENT_AMOUNT = 625.00;
    private const FIXED_TARGET_BENEFICIARY_CAPACITY = BeneficiaryProfileService::BASE_BATCH_CAPACITY;
    private ?array $applicantProfileColumns = null;

    public function build(array $filters = []): array
    {
        return $this->buildScopedReport($filters);
    }

    public function buildForBeneficiaryIds(array $beneficiaryIds, array $filters = []): array
    {
        return $this->buildScopedReport($filters, [
            'beneficiaryIds' => $beneficiaryIds,
        ]);
    }

    public function buildForProjectOfficer(array $actor, array $filters = []): array
    {
        $staffProfileId = $this->findStaffProfileIdForUser((int) ($actor['id'] ?? 0));
        if ($staffProfileId === null) {
            return $this->emptyReportPayload($this->normalizeFilters($filters));
        }

        return $this->buildScopedReport($filters, [
            'scopeStaffProfileId' => $staffProfileId,
            'useFixedRepaymentTarget' => false,
        ]);
    }

    private function buildScopedReport(array $filters, array $scope = []): array
    {
        (new BeneficiaryProfileService())->synchronizeSystemInactivityStatuses();
        $normalizedFilters = $this->normalizeFilters($filters);
        $useFixedRepaymentTarget = !array_key_exists('useFixedRepaymentTarget', $scope)
            || (bool) $scope['useFixedRepaymentTarget'];
        $records = $this->fetchRecords(
            isset($scope['beneficiaryIds']) && is_array($scope['beneficiaryIds']) ? $scope['beneficiaryIds'] : null,
            isset($scope['scopeStaffProfileId']) ? (int) $scope['scopeStaffProfileId'] : null
        );
        $filteredRecords = $this->applyFilters($records, $normalizedFilters);
        $repaymentAnalytics = $this->buildRepaymentAnalytics($filteredRecords, $normalizedFilters, $useFixedRepaymentTarget);
        $trainingAnalytics = $this->buildTrainingAnalytics($this->beneficiaryIdsFromRecords($filteredRecords), $normalizedFilters);

        return [
            'generatedAt' => date(DATE_ATOM),
            'filters' => $normalizedFilters,
            'options' => $this->buildOptions($records),
            'records' => $filteredRecords,
            'summary' => $this->buildSummary($filteredRecords, $repaymentAnalytics['summary'] ?? null),
            'repaymentAnalytics' => $repaymentAnalytics,
            'trainingAnalytics' => $trainingAnalytics,
        ];
    }

    private function emptyReportPayload(array $normalizedFilters): array
    {
        $repaymentAnalytics = $this->buildRepaymentAnalytics([], $normalizedFilters);

        return [
            'generatedAt' => date(DATE_ATOM),
            'filters' => $normalizedFilters,
            'options' => $this->buildOptions([]),
            'records' => [],
            'summary' => $this->buildSummary([], $repaymentAnalytics['summary'] ?? null),
            'repaymentAnalytics' => $repaymentAnalytics,
            'trainingAnalytics' => $this->emptyTrainingAnalytics($normalizedFilters),
        ];
    }

    private function fetchRecords(?array $beneficiaryIds = null, ?int $scopeStaffProfileId = null): array
    {
        if (is_array($beneficiaryIds) && $beneficiaryIds === []) {
            return [];
        }

        try {
            $params = [];
            $joins = [];
            $conditions = [];
            if (is_array($beneficiaryIds)) {
                $placeholders = implode(',', array_fill(0, count($beneficiaryIds), '?'));
                $conditions[] = 'beneficiary_profiles.id IN (' . $placeholders . ')';
                $params = $beneficiaryIds;
            }
            if ($scopeStaffProfileId !== null && $scopeStaffProfileId > 0) {
                $joins[] = 'INNER JOIN staff_barangay_assignments AS scope_assignments
                    ON scope_assignments.barangay_id = applicant_profiles.barangay_id
                   AND scope_assignments.staff_profile_id = ?
                   AND scope_assignments.ended_at IS NULL';
                $params[] = $scopeStaffProfileId;
            }

            $whereSql = $conditions === [] ? '' : 'WHERE ' . implode(' AND ', $conditions);

            $statement = db()->prepare(
                'SELECT
                    applicant_profiles.id AS applicant_profile_id,
                    beneficiary_profiles.id AS beneficiary_profile_id,
                    beneficiary_profiles.beneficiary_status,
                    beneficiary_profiles.replacement_for_beneficiary_profile_id,
                    COALESCE(beneficiary_profiles.approved_at, beneficiary_profiles.approval_date) AS approved_at,
                    beneficiary_profiles.approval_date,
                    beneficiary_profiles.updated_at AS beneficiary_updated_at,
                    applicant_users.full_name AS applicant_name,
                    applicant_users.email AS applicant_email,
                    applicant_profiles.business_name,
                    applicant_profiles.contact_number,
                    applicant_profiles.birthdate,
                    applicant_profiles.age,
                    applicant_profiles.address_line,
                    applicant_profiles.is_4ps,
                    applicant_profiles.livelihood_type,
                    ' . $this->selectApplicantLivelihoodCategorySql() . ',
                    applicant_profiles.sector,
                    ' . $this->selectApplicantSectorOtherSpecifySql() . ',
                    applicant_profiles.gender,
                    ' . $this->selectApplicantEducationalAttainmentSql() . ',
                    applicant_profiles.updated_at AS profile_updated_at,
                    barangays.name AS barangay_name,
                    barangays.district AS district_name,
                    assigned_users.full_name AS assigned_pdo_name,
                    latest_applications.updated_at AS application_updated_at,
                    LOWER(COALESCE(stage_one.validation_status, "")) AS stage_one_status
                 FROM applicant_profiles
                 INNER JOIN users AS applicant_users ON applicant_users.id = applicant_profiles.user_id
                 LEFT JOIN barangays ON barangays.id = applicant_profiles.barangay_id
                 LEFT JOIN (
                    SELECT applications.*
                    FROM applications
                    INNER JOIN (
                        SELECT applicant_profile_id, MAX(id) AS latest_id
                        FROM applications
                        GROUP BY applicant_profile_id
                    ) latest_application ON latest_application.latest_id = applications.id
                 ) AS latest_applications ON latest_applications.applicant_profile_id = applicant_profiles.id
                 LEFT JOIN staff_profiles AS assigned_staff ON assigned_staff.id = latest_applications.assigned_staff_profile_id
                 LEFT JOIN users AS assigned_users ON assigned_users.id = assigned_staff.user_id
                 LEFT JOIN beneficiary_profiles
                    ON beneficiary_profiles.applicant_profile_id = applicant_profiles.id
                   AND beneficiary_profiles.replacement_for_beneficiary_profile_id IS NULL
                 LEFT JOIN stage_one_registrations AS stage_one
                    ON LOWER(stage_one.email) COLLATE utf8mb4_unicode_ci
                     = LOWER(applicant_users.email) COLLATE utf8mb4_unicode_ci
                 ' . implode("\n", $joins) . '
                 ' . $whereSql . '
                 ORDER BY COALESCE(beneficiary_profiles.updated_at, latest_applications.updated_at, applicant_profiles.updated_at) DESC,
                          applicant_profiles.id DESC'
            );
            $statement->execute($params);
            $rows = $statement->fetchAll(PDO::FETCH_ASSOC) ?: [];
        } catch (\Throwable $exception) {
            log_database_query_failure('reports.fetch_records', $exception);
            return [];
        }

        if ($rows === []) {
            return [];
        }

        $beneficiaryIds = array_values(array_filter(array_map(
            static fn(array $row): int => (int) ($row['beneficiary_profile_id'] ?? 0),
            $rows
        )));
        $repaymentMap = $this->beneficiaryRepaymentSummaries($beneficiaryIds);

        $records = array_map(function (array $row) use ($repaymentMap): ?array {
            $beneficiaryId = (int) ($row['beneficiary_profile_id'] ?? 0);
            $applicantProfileId = (int) ($row['applicant_profile_id'] ?? 0);
            $profileComplete = $this->isProfileCompleteRow($row);
            $selected = in_array((string) ($row['stage_one_status'] ?? ''), ['selected', 'approved'], true);
            $beneficiaryStatus = strtolower(trim((string) ($row['beneficiary_status'] ?? '')));
            $isBeneficiary = $beneficiaryId > 0 && (
                trim((string) ($row['approved_at'] ?? '')) !== ''
                || trim((string) ($row['approval_date'] ?? '')) !== ''
                || in_array($beneficiaryStatus, ['active', 'inactive', 'deceased'], true)
            );

            if (!$isBeneficiary && !($selected && $profileComplete)) {
                return null;
            }

            $repayment = $this->appendLifecycleMetrics(
                $repaymentMap[$beneficiaryId] ?? $this->emptyRepaymentSummary(),
                $isBeneficiary ? (string) ($row['approval_date'] ?? '') : ''
            );
            $serviceTypeSource = (string) (($row['livelihood_category'] ?: ($row['livelihood_type'] ?: ($row['sector'] ?: ''))));
            $age = $this->resolveAge($row);

            return [
                'id' => $beneficiaryId > 0 ? $beneficiaryId : $applicantProfileId,
                'applicantProfileId' => $applicantProfileId,
                'beneficiaryId' => $beneficiaryId > 0 ? $beneficiaryId : null,
                'isBeneficiary' => $isBeneficiary,
                'profileComplete' => $profileComplete,
                'selectedForBatch' => $selected,
                'populationStage' => $isBeneficiary ? 'Beneficiary' : 'Selected / Profile Complete',
                'populationStageKey' => $isBeneficiary ? 'beneficiary' : 'pipeline_ready',
                'name' => (string) ($row['applicant_name'] ?: 'Unnamed person'),
                'email' => (string) ($row['applicant_email'] ?: ''),
                'contactNumber' => (string) ($row['contact_number'] ?: ''),
                'businessName' => (string) ($row['business_name'] ?: 'No business name'),
                'age' => $age,
                'ageGroup' => $this->resolveAgeGroupFromAge($age),
                'gender' => $this->normalizeGenderLabel((string) ($row['gender'] ?? '')),
                'barangay' => (string) ($row['barangay_name'] ?: 'Unassigned'),
                'district' => (string) ($row['district_name'] ?: 'Unassigned'),
                'assignedPdo' => (string) ($row['assigned_pdo_name'] ?: 'Unassigned'),
                'serviceType' => $this->normalizeServiceType($serviceTypeSource),
                'businessType' => $serviceTypeSource !== '' ? $serviceTypeSource : 'Not set',
                'sector' => $this->resolveSectorLabel((string) ($row['sector'] ?? ''), (string) ($row['sector_other_specify'] ?? '')),
                'programStatus' => $isBeneficiary
                    ? $this->labelizeStatus((string) ($row['beneficiary_status'] ?? 'active'))
                    : 'Selected / Profile Complete',
                'approvalDate' => (string) ($row['approval_date'] ?? ''),
                'lastActivity' => max(
                    (string) ($row['beneficiary_updated_at'] ?? ''),
                    (string) ($row['application_updated_at'] ?? ''),
                    (string) ($row['profile_updated_at'] ?? ''),
                    (string) ($repayment['latestActivity'] ?? '')
                ),
                'repayment' => $repayment,
            ];
        }, $rows);

        return array_values(array_filter($records, static fn(?array $record): bool => is_array($record)));
    }

    private function normalizeFilters(array $filters): array
    {
        $now = new \DateTimeImmutable('today');
        $currentYear = (int) $now->format('Y');
        $availableYears = $this->reportYearOptions();
        $period = strtolower(trim((string) ($filters['period'] ?? 'monthly')));
        if (!in_array($period, ['monthly', 'quarterly', 'yearly', 'custom'], true)) {
            $period = 'monthly';
        }

        $defaultCycleMonth = sprintf('%04d-05', $currentYear);
        $month = trim((string) ($filters['month'] ?? $defaultCycleMonth));
        if (!preg_match('/^\d{4}-\d{2}$/', $month)) {
            $month = $defaultCycleMonth;
        }

        $quarter = (int) ($filters['quarter'] ?? 1);
        if ($quarter < 1 || $quarter > 4) {
            $quarter = 1;
        }

        $repaymentYear = $this->normalizePositiveBoundedInt($filters['repaymentYear'] ?? 1, 1, 2);

        $year = (int) ($filters['year'] ?? $currentYear);
        if (!in_array($year, $availableYears, true)) {
            $year = $currentYear;
        }

        [$effectiveFrom, $effectiveTo, $periodLabel] = $this->resolvePeriodRange(
            $period,
            $month,
            $quarter,
            $year,
            $repaymentYear,
            trim((string) ($filters['from'] ?? '')),
            trim((string) ($filters['to'] ?? ''))
        );

        return [
            'from' => trim((string) ($filters['from'] ?? '')),
            'to' => trim((string) ($filters['to'] ?? '')),
            'effectiveFrom' => $effectiveFrom,
            'effectiveTo' => $effectiveTo,
            'district' => $this->normalizeValue($filters['district'] ?? ''),
            'barangay' => $this->normalizeValue($filters['barangay'] ?? ''),
            'serviceType' => $this->normalizeValue($filters['serviceType'] ?? ($filters['businessType'] ?? '')),
            'businessType' => $this->normalizeValue($filters['businessType'] ?? ($filters['serviceType'] ?? '')),
            'sector' => $this->normalizeValue($filters['sector'] ?? ''),
            'gender' => $this->normalizeValue($filters['gender'] ?? ''),
            'ageGroup' => $this->normalizeValue($filters['ageGroup'] ?? ''),
            'pdo' => $this->normalizeValue($filters['pdo'] ?? ''),
            'repayment' => $this->normalizeValue($filters['repayment'] ?? ''),
            'period' => $period,
            'periodLabel' => $periodLabel,
            'month' => $month,
            'quarter' => $quarter,
            'year' => $year,
            'repaymentYear' => $repaymentYear,
            'trainingSession' => $this->normalizePositiveBoundedInt($filters['trainingSession'] ?? 0, 1, 3),
            'trainingGroup' => $this->normalizePositiveBoundedInt($filters['trainingGroup'] ?? 0, 1, 3),
        ];
    }

    private function applyFilters(array $records, array $filters): array
    {
        return array_values(array_filter($records, function (array $record) use ($filters): bool {
            return ($filters['district'] === '' || $this->normalizeValue($record['district'] ?? 'Unassigned') === $filters['district'])
                && ($filters['barangay'] === '' || $this->normalizeValue($record['barangay'] ?? 'Unassigned') === $filters['barangay'])
                && ($filters['serviceType'] === '' || $this->normalizeValue($record['serviceType'] ?? '') === $filters['serviceType'])
                && ($filters['sector'] === '' || $this->normalizeValue($record['sector'] ?? 'Not Set') === $filters['sector'])
                && ($filters['gender'] === '' || $this->normalizeValue($record['gender'] ?? 'Not Set') === $filters['gender'])
                && ($filters['ageGroup'] === '' || $this->normalizeValue($record['ageGroup'] ?? 'Not Set') === $filters['ageGroup'])
                && ($filters['pdo'] === '' || $this->normalizeValue($record['assignedPdo'] ?? 'Unassigned') === $filters['pdo'])
                && (
                    $filters['repayment'] === ''
                    || (
                        (bool) ($record['isBeneficiary'] ?? false)
                        && $this->normalizeValue($record['repayment']['key'] ?? 'no_upload') === $filters['repayment']
                    )
                );
        }));
    }

    private function buildOptions(array $records): array
    {
        return [
            'districts' => $this->uniqueValues($records, 'district'),
            'barangays' => $this->uniqueValues($records, 'barangay'),
            'serviceTypes' => $this->uniqueValues($records, 'serviceType'),
            'sectors' => $this->uniqueValues($records, 'sector'),
            'genders' => $this->uniqueValues($records, 'gender'),
            'ageGroups' => $this->uniqueValues($records, 'ageGroup'),
            'pdos' => $this->reportPdoOptions($records),
            'years' => $this->reportYearOptions(),
            'repaymentStates' => [
                ['key' => 'no_upload', 'label' => 'No Upload Yet'],
                ['key' => 'under_review', 'label' => 'Under Review'],
                ['key' => 'needs_follow_up', 'label' => 'Needs Follow-up'],
                ['key' => 'partial_paid', 'label' => 'Partial Paid'],
                ['key' => 'fully_paid', 'label' => 'Fully Paid'],
            ],
        ];
    }

    private function reportPdoOptions(array $records): array
    {
        $values = [];

        foreach ($this->fetchAllProjectOfficerNames() as $name) {
            $trimmed = trim($name);
            if ($trimmed !== '') {
                $values[$trimmed] = true;
            }
        }

        foreach ($this->uniqueValues($records, 'assignedPdo') as $name) {
            $trimmed = trim($name);
            if ($trimmed !== '') {
                $values[$trimmed] = true;
            }
        }

        $result = array_keys($values);
        sort($result, SORT_NATURAL | SORT_FLAG_CASE);
        return array_values($result);
    }

    private function fetchAllProjectOfficerNames(): array
    {
        try {
            $statement = db()->prepare(
                'SELECT DISTINCT users.full_name
                 FROM users
                 INNER JOIN roles ON roles.id = users.role_id
                 LEFT JOIN staff_profiles ON staff_profiles.user_id = users.id
                 WHERE roles.name = :role_name
                   AND TRIM(COALESCE(users.full_name, "")) <> ""
                 ORDER BY users.full_name ASC'
            );
            $statement->execute(['role_name' => ROLE_PROJECT_OFFICER]);
            $rows = $statement->fetchAll(PDO::FETCH_ASSOC) ?: [];
        } catch (\Throwable $exception) {
            log_database_query_failure('reports.fetch_project_officer_names', $exception);
            return [];
        }

        return array_values(array_filter(array_map(
            static fn(array $row): string => trim((string) ($row['full_name'] ?? '')),
            $rows
        ), static fn(string $name): bool => $name !== ''));
    }

    private function buildSummary(array $records, ?array $repaymentRate = null): array
    {
        $beneficiaryCount = count(array_filter($records, static fn(array $record): bool => (bool) ($record['isBeneficiary'] ?? false)));
        $pipelineOnlyCount = count(array_filter($records, static fn(array $record): bool => !((bool) ($record['isBeneficiary'] ?? false))));

        return [
            'totalPeople' => count($records),
            'totalBeneficiaries' => $beneficiaryCount,
            'beneficiaryCount' => $beneficiaryCount,
            'pipelineOnlyCount' => $pipelineOnlyCount,
            'serviceTypeDistribution' => $this->distribution($records, 'serviceType'),
            'sectorDistribution' => $this->distribution($records, 'sector'),
            'genderDistribution' => $this->distribution($records, 'gender'),
            'ageGroupDistribution' => $this->distribution($records, 'ageGroup'),
            'barangayDistribution' => $this->distribution($records, 'barangay'),
            'programStatusDistribution' => $this->distribution($records, 'programStatus'),
            'repaymentPerformance' => $repaymentRate ?? $this->repaymentRateStats($records),
            'repaymentRate' => $repaymentRate ?? $this->repaymentRateStats($records),
        ];
    }

    private function buildRepaymentAnalytics(array $records, array $filters, bool $useFixedRepaymentTarget = true): array
    {
        $beneficiaryIds = $this->beneficiaryIdsFromRecords($records);

        $repaymentRows = $this->fetchRepaymentRows($beneficiaryIds);
        $obligations = $this->buildRepaymentObligations($records, $repaymentRows);
        $filteredObligations = $this->applyRepaymentFilters($obligations, $filters);

        return [
            'obligations' => $filteredObligations,
            'summary' => $this->summarizeRepaymentObligations($filteredObligations, $filters, $useFixedRepaymentTarget),
            'periodMetrics' => $this->summarizeRepaymentObligations($filteredObligations, $filters, $useFixedRepaymentTarget),
            'breakdown' => $this->buildRepaymentBreakdown($filteredObligations, $filters, $useFixedRepaymentTarget),
            'monthlyBreakdown' => $this->buildRepaymentMonthlyBreakdown($filteredObligations, $filters, $useFixedRepaymentTarget),
        ];
    }

    private function buildTrainingAnalytics(?array $beneficiaryIds, array $filters): array
    {
        if (is_array($beneficiaryIds) && $beneficiaryIds === []) {
            return $this->emptyTrainingAnalytics($filters);
        }

        $rows = $this->fetchTrainingAttendanceRows($beneficiaryIds, $filters);
        $completionMap = $this->deriveTrainingCompletionMap($rows);
        $sessionFilter = (int) ($filters['trainingSession'] ?? 0);
        $breakdown = [
            1 => $this->emptyTrainingSessionBreakdown(1),
            2 => $this->emptyTrainingSessionBreakdown(2),
            3 => $this->emptyTrainingSessionBreakdown(3),
        ];

        foreach ($rows as $row) {
            $session = (int) ($row['sessionNumber'] ?? 0);
            if ($session < 1 || $session > 3) {
                continue;
            }
            if ($sessionFilter > 0 && $session !== $sessionFilter) {
                continue;
            }

            $status = $this->normalizeTrainingAttendanceStatus((string) ($row['status'] ?? ''));
            if ($status === 'present') {
                $breakdown[$session]['present']++;
            } elseif ($status === 'absent') {
                $breakdown[$session]['absent']++;
            } elseif ($status === 'excused') {
                $breakdown[$session]['excused']++;
            }

            $applicantProfileId = (int) ($row['applicantProfileId'] ?? 0);
            if ($session === 3 && $applicantProfileId > 0 && ($completionMap[$applicantProfileId] ?? false)) {
                $breakdown[$session]['completed']++;
            }
        }

        $visibleBreakdown = array_values(array_filter($breakdown, static function (array $item) use ($sessionFilter): bool {
            return $sessionFilter <= 0 || (int) ($item['session'] ?? 0) === $sessionFilter;
        }));

        $summary = [
            'participants' => 0,
            'present' => 0,
            'absent' => 0,
            'excused' => 0,
            'completed' => 0,
        ];
        foreach ($visibleBreakdown as $item) {
            $summary['present'] += (int) ($item['present'] ?? 0);
            $summary['absent'] += (int) ($item['absent'] ?? 0);
            $summary['excused'] += (int) ($item['excused'] ?? 0);
            $summary['completed'] += (int) ($item['completed'] ?? 0);
        }
        $participantIds = [];
        foreach ($rows as $row) {
            $session = (int) ($row['sessionNumber'] ?? 0);
            if ($sessionFilter > 0 && $session !== $sessionFilter) {
                continue;
            }
            $applicantProfileId = (int) ($row['applicantProfileId'] ?? 0);
            if ($applicantProfileId > 0) {
                $participantIds[$applicantProfileId] = true;
            }
        }
        $summary['participants'] = count($participantIds);

        return [
            'summary' => $summary,
            'breakdown' => $visibleBreakdown,
            'filters' => [
                'year' => $this->trainingAnalyticsYear($filters),
                'session' => $sessionFilter,
                'group' => (int) ($filters['trainingGroup'] ?? 0),
            ],
        ];
    }

    private function fetchTrainingAttendanceRows(?array $beneficiaryIds, array $filters): array
    {
        try {
            $conditions = [
                'training_programs.training_round_number BETWEEN 1 AND 3',
                'YEAR(training_programs.starts_at) = ?',
            ];
            $params = [$this->trainingAnalyticsYear($filters)];

            if (is_array($beneficiaryIds)) {
                $placeholders = implode(',', array_fill(0, count($beneficiaryIds), '?'));
                $applicantPlaceholders = implode(',', array_fill(0, count($beneficiaryIds), '?'));
                $conditions[] = '(training_invitees.beneficiary_profile_id IN (' . $placeholders . ')
                    OR training_invitees.applicant_profile_id IN (
                        SELECT beneficiary_profiles.applicant_profile_id
                        FROM beneficiary_profiles
                        WHERE beneficiary_profiles.id IN (' . $applicantPlaceholders . ')
                    ))';
                $params = array_merge($params, $beneficiaryIds, $beneficiaryIds);
            }

            $group = (int) ($filters['trainingGroup'] ?? 0);
            if ($group >= 1 && $group <= 3) {
                $conditions[] = 'COALESCE(training_invitees.batch_group_number, training_programs.target_group_number, 0) = ?';
                $params[] = $group;
            }

            $statement = db()->prepare(
                'SELECT training_invitees.applicant_profile_id,
                        training_invitees.beneficiary_profile_id,
                        training_programs.training_round_number,
                        COALESCE(training_invitees.batch_group_number, training_programs.target_group_number) AS group_number,
                        COALESCE(attendance_records.attendance_status, training_invitees.invite_status) AS attendance_status
                 FROM training_invitees
                 INNER JOIN training_programs ON training_programs.id = training_invitees.training_program_id
                 LEFT JOIN attendance_records ON attendance_records.training_invitee_id = training_invitees.id
                 WHERE ' . implode(' AND ', $conditions) . '
                 ORDER BY training_programs.training_round_number ASC, group_number ASC, training_invitees.id ASC'
            );
            $statement->execute($params);
            $rows = $statement->fetchAll(PDO::FETCH_ASSOC) ?: [];
        } catch (\Throwable $exception) {
            log_database_query_failure('reports.training_attendance_rows', $exception);
            return [];
        }

        return array_map(static function (array $row): array {
            return [
                'applicantProfileId' => (int) ($row['applicant_profile_id'] ?? 0),
                'beneficiaryProfileId' => (int) ($row['beneficiary_profile_id'] ?? 0),
                'sessionNumber' => (int) ($row['training_round_number'] ?? 0),
                'groupNumber' => $row['group_number'] !== null ? (int) $row['group_number'] : null,
                'status' => (string) ($row['attendance_status'] ?? ''),
            ];
        }, $rows);
    }

    private function deriveTrainingCompletionMap(array $rows): array
    {
        $presentRounds = [];
        foreach ($rows as $row) {
            if ($this->normalizeTrainingAttendanceStatus((string) ($row['status'] ?? '')) !== 'present') {
                continue;
            }
            $applicantProfileId = (int) ($row['applicantProfileId'] ?? 0);
            $session = (int) ($row['sessionNumber'] ?? 0);
            if ($applicantProfileId <= 0 || $session < 1 || $session > 3) {
                continue;
            }
            $presentRounds[$applicantProfileId][$session] = true;
        }

        $completed = [];
        foreach ($presentRounds as $applicantProfileId => $rounds) {
            $completed[$applicantProfileId] = isset($rounds[1], $rounds[2], $rounds[3]);
        }

        return $completed;
    }

    private function normalizeTrainingAttendanceStatus(string $status): string
    {
        $value = strtolower(trim($status));
        return match ($value) {
            'attended', 'completed', 'present' => 'present',
            'missed', 'absent' => 'absent',
            'excused' => 'excused',
            default => 'pending',
        };
    }

    private function emptyTrainingAnalytics(array $filters): array
    {
        $sessionFilter = (int) ($filters['trainingSession'] ?? 0);
        $items = [
            $this->emptyTrainingSessionBreakdown(1),
            $this->emptyTrainingSessionBreakdown(2),
            $this->emptyTrainingSessionBreakdown(3),
        ];
        if ($sessionFilter >= 1 && $sessionFilter <= 3) {
            $items = [$this->emptyTrainingSessionBreakdown($sessionFilter)];
        }

        return [
            'summary' => [
                'participants' => 0,
                'present' => 0,
                'absent' => 0,
                'excused' => 0,
                'completed' => 0,
            ],
            'breakdown' => $items,
            'filters' => [
                'year' => $this->trainingAnalyticsYear($filters),
                'session' => $sessionFilter,
                'group' => (int) ($filters['trainingGroup'] ?? 0),
            ],
        ];
    }

    private function emptyTrainingSessionBreakdown(int $session): array
    {
        return [
            'session' => $session,
            'label' => 'Session ' . $session,
            'present' => 0,
            'absent' => 0,
            'excused' => 0,
            'completed' => 0,
        ];
    }

    private function trainingAnalyticsYear(array $filters): int
    {
        if (($filters['period'] ?? '') === 'monthly') {
            $month = (string) ($filters['month'] ?? '');
            if (preg_match('/^(\d{4})-\d{2}$/', $month, $matches)) {
                return (int) $matches[1];
            }
        }

        return (int) ($filters['year'] ?? date('Y'));
    }

    private function fetchRepaymentRows(array $beneficiaryIds): array
    {
        if ($beneficiaryIds === []) {
            return [];
        }

        try {
            $placeholders = implode(',', array_fill(0, count($beneficiaryIds), '?'));
            $statement = db()->prepare(
                'SELECT repayments.id,
                        repayments.beneficiary_profile_id,
                        repayments.status,
                        repayments.amount,
                        repayments.payment_date,
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
            return $statement->fetchAll(PDO::FETCH_ASSOC) ?: [];
        } catch (\Throwable $exception) {
            log_database_query_failure('reports.repayment_rows', $exception);
            return [];
        }
    }

    private function buildRepaymentObligations(array $records, array $repaymentRows): array
    {
        $entriesByBeneficiaryMonth = [];

        foreach ($repaymentRows as $row) {
            $beneficiaryId = (int) ($row['beneficiary_profile_id'] ?? 0);
            $coverageMonth = substr((string) ($row['coverage_month'] ?? ''), 0, 7);
            if ($beneficiaryId <= 0 || !preg_match('/^\d{4}-\d{2}$/', $coverageMonth)) {
                continue;
            }

            $entriesByBeneficiaryMonth[$beneficiaryId][$coverageMonth][] = [
                'stage' => $this->normalizeRepaymentStage(
                    (string) ($row['status'] ?? ''),
                    (string) ($row['verification_status'] ?? '')
                ),
                'amount' => (float) ($row['amount'] ?? 0),
                'paymentDate' => (string) ($row['payment_date'] ?? ''),
            ];
        }

        $obligations = [];

        foreach ($records as $record) {
            $beneficiaryId = (int) ($record['id'] ?? 0);
            if ($beneficiaryId <= 0) {
                continue;
            }

            $knownMonths = array_keys($entriesByBeneficiaryMonth[$beneficiaryId] ?? []);
            $startMonth = $this->deriveRepaymentStartMonth($record, $knownMonths);
            if ($startMonth === null) {
                continue;
            }

            foreach ($this->enumerateRepaymentMonths($startMonth, self::REPAYMENT_PLAN_MONTHS) as $index => $dueMonth) {
                $dueDate = $this->dueDateForMonth($dueMonth);
                if ($dueDate === null) {
                    continue;
                }

                $installmentNumber = $index + 1;
                $entries = $entriesByBeneficiaryMonth[$beneficiaryId][$dueMonth] ?? [];
                $status = $this->resolveRepaymentObligationStatus($entries, $dueDate);
                $obligations[] = [
                    'beneficiaryId' => $beneficiaryId,
                    'dueMonth' => $dueMonth,
                    'dueYear' => substr($dueMonth, 0, 4),
                    'dueDate' => $dueDate,
                    'installmentNumber' => $installmentNumber,
                    'repaymentYearNumber' => (int) ceil($installmentNumber / 12),
                    'repaymentQuarter' => (int) floor(((($installmentNumber - 1) % 12) / 3)) + 1,
                    'expectedAmount' => self::MONTHLY_REPAYMENT_AMOUNT,
                    'barangay' => (string) ($record['barangay'] ?? 'Unassigned'),
                    'assignedPdo' => (string) ($record['assignedPdo'] ?? 'Unassigned'),
                    'serviceType' => (string) ($record['serviceType'] ?? 'Unclassified'),
                    'sector' => (string) ($record['sector'] ?? 'Not Set'),
                    'gender' => (string) ($record['gender'] ?? 'Not Set'),
                    'ageGroup' => (string) ($record['ageGroup'] ?? 'Not Set'),
                    'status' => $status['status'],
                    'statusLabel' => $status['label'],
                    'amountRepresented' => $status['amount'],
                ];
            }
        }

        usort($obligations, static fn(array $left, array $right): int => strcmp(
            (string) ($left['dueMonth'] ?? ''),
            (string) ($right['dueMonth'] ?? '')
        ));

        return $obligations;
    }

    private function applyRepaymentFilters(array $obligations, array $filters): array
    {
        $effectiveFrom = trim((string) ($filters['effectiveFrom'] ?? ($filters['from'] ?? '')));
        $effectiveTo = trim((string) ($filters['effectiveTo'] ?? ($filters['to'] ?? '')));
        return array_values(array_filter($obligations, function (array $obligation) use ($filters, $effectiveFrom, $effectiveTo): bool {
            $periodMatches = $this->inDateRange((string) ($obligation['dueDate'] ?? ''), $effectiveFrom, $effectiveTo);
            return $periodMatches
                && ($filters['barangay'] === '' || $this->normalizeValue($obligation['barangay'] ?? 'Unassigned') === $filters['barangay'])
                && ($filters['serviceType'] === '' || $this->normalizeValue($obligation['serviceType'] ?? 'Unclassified') === $filters['serviceType'])
                && ($filters['sector'] === '' || $this->normalizeValue($obligation['sector'] ?? 'Not Set') === $filters['sector'])
                && ($filters['gender'] === '' || $this->normalizeValue($obligation['gender'] ?? 'Not Set') === $filters['gender'])
                && ($filters['ageGroup'] === '' || $this->normalizeValue($obligation['ageGroup'] ?? 'Not Set') === $filters['ageGroup'])
                && ($filters['pdo'] === '' || $this->normalizeValue($obligation['assignedPdo'] ?? 'Unassigned') === $filters['pdo']);
        }));
    }

    private function summarizeRepaymentObligations(array $obligations, array $filters = [], bool $useFixedRepaymentTarget = true): array
    {
        $actualCollectedAmount = 0.0;
        $statusCounts = [
            'paid_on_time' => 0,
            'partial_delayed' => 0,
            'pending_verification' => 0,
            'overdue_unpaid' => 0,
            'upcoming' => 0,
        ];
        $beneficiaryIds = [];

        foreach ($obligations as $obligation) {
            $status = (string) ($obligation['status'] ?? 'overdue_unpaid');
            if (!isset($statusCounts[$status])) {
                $status = 'overdue_unpaid';
            }
            $statusCounts[$status]++;
            $beneficiaryIds[(int) ($obligation['beneficiaryId'] ?? 0)] = true;
            if (in_array($status, ['paid_on_time', 'partial_delayed'], true)) {
                $actualCollectedAmount += (float) ($obligation['amountRepresented'] ?? 0.0);
            }
        }

        $targetAmount = $useFixedRepaymentTarget
            ? $this->fixedRepaymentTargetAmount((string) ($filters['period'] ?? 'monthly'), $filters)
            : 0.0;
        if (!$useFixedRepaymentTarget) {
            foreach ($obligations as $obligation) {
                $targetAmount += (float) ($obligation['expectedAmount'] ?? self::MONTHLY_REPAYMENT_AMOUNT);
            }
        }
        $gapAmount = $targetAmount - $actualCollectedAmount;
        $roiPercent = $targetAmount > 0 ? round(($actualCollectedAmount / $targetAmount) * 100, 2) : 0.0;

        return [
            'period' => (string) ($filters['period'] ?? 'monthly'),
            'label' => (string) ($filters['periodLabel'] ?? 'Selected period'),
            'from' => (string) ($filters['effectiveFrom'] ?? ''),
            'to' => (string) ($filters['effectiveTo'] ?? ''),
            'targetAmount' => round($targetAmount, 2),
            'actualCollectedAmount' => round($actualCollectedAmount, 2),
            'gapAmount' => round($gapAmount, 2),
            'varianceAmount' => round($gapAmount, 2),
            'roiPercent' => $roiPercent,
            'obligationCount' => count($obligations),
            'scopedBeneficiaries' => count(array_filter(array_keys($beneficiaryIds))),
            'statusCounts' => $statusCounts,
        ];
    }

    private function buildRepaymentBreakdown(array $obligations, array $filters, bool $useFixedRepaymentTarget = true): array
    {
        $period = (string) ($filters['period'] ?? 'monthly');
        $periods = $this->seedRepaymentBreakdownPeriods($filters);
        if ($useFixedRepaymentTarget) {
            foreach ($periods as $key => &$periodRow) {
                $periodRow['targetAmount'] = $this->fixedRepaymentTargetAmount($period, $filters, (string) $key);
            }
            unset($periodRow);
        }

        foreach ($obligations as $obligation) {
            $periodKey = $period === 'yearly'
                ? (string) ($filters['year'] ?? '')
                : $this->repaymentBreakdownKey($obligation, $period);
            if ($periodKey === '') {
                continue;
            }

            if (!isset($periods[$periodKey])) {
                $periods[$periodKey] = [
                    'period' => $periodKey,
                    'label' => $this->formatRepaymentPeriodLabel($periodKey, $period),
                    'targetAmount' => $useFixedRepaymentTarget
                        ? $this->fixedRepaymentTargetAmount($period, $filters, $periodKey)
                        : 0.0,
                    'actualCollectedAmount' => 0.0,
                    'gapAmount' => 0.0,
                    'roiPercent' => 0.0,
                ];
            }

            if (!$useFixedRepaymentTarget) {
                $periods[$periodKey]['targetAmount'] += (float) ($obligation['expectedAmount'] ?? self::MONTHLY_REPAYMENT_AMOUNT);
            }

            $status = (string) ($obligation['status'] ?? 'overdue_unpaid');
            if (in_array($status, ['paid_on_time', 'partial_delayed'], true)) {
                $periods[$periodKey]['actualCollectedAmount'] += (float) ($obligation['amountRepresented'] ?? 0.0);
            }
        }

        ksort($periods, SORT_STRING);

        return array_map(static function (array $period): array {
            $period['targetAmount'] = round((float) ($period['targetAmount'] ?? 0.0), 2);
            $period['actualCollectedAmount'] = round((float) ($period['actualCollectedAmount'] ?? 0.0), 2);
            $period['gapAmount'] = round($period['targetAmount'] - $period['actualCollectedAmount'], 2);
            $period['roiPercent'] = $period['targetAmount'] > 0
                ? round(($period['actualCollectedAmount'] / $period['targetAmount']) * 100, 2)
                : 0.0;
            return $period;
        }, array_values($periods));
    }

    private function buildRepaymentMonthlyBreakdown(array $obligations, array $filters, bool $useFixedRepaymentTarget = true): array
    {
        return $this->buildRepaymentBreakdown($obligations, $filters + ['period' => 'monthly'], $useFixedRepaymentTarget);
    }

    private function repaymentStackedStatuses(): array
    {
        return [
            'paid_on_time' => [
                'key' => 'paid_on_time',
                'label' => 'Paid / On-time',
                'count' => 0,
                'percent' => 0.0,
                'amount' => 0.0,
            ],
            'partial_delayed' => [
                'key' => 'partial_delayed',
                'label' => 'Partial / Delayed',
                'count' => 0,
                'percent' => 0.0,
                'amount' => 0.0,
            ],
            'pending_verification' => [
                'key' => 'pending_verification',
                'label' => 'Pending Verification',
                'count' => 0,
                'percent' => 0.0,
                'amount' => 0.0,
            ],
            'overdue_unpaid' => [
                'key' => 'overdue_unpaid',
                'label' => 'Overdue / Unpaid',
                'count' => 0,
                'percent' => 0.0,
                'amount' => 0.0,
            ],
        ];
    }

    private function formatRepaymentPeriodLabel(string $periodKey, string $period): string
    {
        if ($period === 'yearly') {
            return $periodKey;
        }
        if ($period === 'quarterly' && preg_match('/(?:^|-)Q([1-4])$/', $periodKey, $matches)) {
            return sprintf('Q%s', $matches[1]);
        }

        try {
            return (new \DateTimeImmutable($periodKey . '-01'))->format('M Y');
        } catch (\Throwable $exception) {
            return $periodKey;
        }
    }

    private function seedRepaymentBreakdownPeriods(array $filters): array
    {
        $period = (string) ($filters['period'] ?? 'monthly');
        $year = (int) ($filters['year'] ?? date('Y'));
        $repaymentYear = (int) ($filters['repaymentYear'] ?? 1);
        $periods = [];

        if ($period === 'monthly') {
            [$cycleStartMonth, ] = $this->repaymentCycleMonthRange($year, $repaymentYear);
            for ($month = 0; $month < 12; $month++) {
                $key = (string) ($this->shiftMonth($cycleStartMonth, $month) ?? '');
                if ($key === '') {
                    continue;
                }
                $periods[$key] = [
                    'period' => $key,
                    'label' => $this->formatRepaymentPeriodLabel($key, 'monthly'),
                    'targetAmount' => 0.0,
                    'actualCollectedAmount' => 0.0,
                    'gapAmount' => 0.0,
                    'roiPercent' => 0.0,
                ];
            }
            return $periods;
        }

        if ($period === 'quarterly') {
            for ($quarter = 1; $quarter <= 4; $quarter++) {
                $key = sprintf('RY%d-Q%d', $repaymentYear, $quarter);
                $periods[$key] = [
                    'period' => $key,
                    'label' => $this->formatRepaymentPeriodLabel($key, 'quarterly'),
                    'targetAmount' => 0.0,
                    'actualCollectedAmount' => 0.0,
                    'gapAmount' => 0.0,
                    'roiPercent' => 0.0,
                ];
            }
            return $periods;
        }

        if ($period === 'yearly') {
            $key = (string) $year;
            $periods[$key] = [
                'period' => $key,
                'label' => $key,
                'targetAmount' => 0.0,
                'actualCollectedAmount' => 0.0,
                'gapAmount' => 0.0,
                'roiPercent' => 0.0,
            ];
        }

        return $periods;
    }

    private function repaymentBreakdownKey(array $obligation, string $period): string
    {
        $dueMonth = (string) ($obligation['dueMonth'] ?? '');
        if (!preg_match('/^\d{4}-\d{2}$/', $dueMonth)) {
            return '';
        }

        if ($period === 'monthly' || $period === 'custom') {
            return $dueMonth;
        }

        if ($period === 'quarterly') {
            $quarterNumber = (int) ($obligation['repaymentQuarter'] ?? 0);
            $repaymentYear = (int) ($obligation['repaymentYearNumber'] ?? 1);
            if ($quarterNumber < 1 || $quarterNumber > 4) {
                return '';
            }
            return sprintf('RY%d-Q%d', max(1, $repaymentYear), $quarterNumber);
        }

        if ($period === 'yearly') {
            return '';
        }

        return $dueMonth;
    }

    private function deriveRepaymentStartMonth(array $record, array $knownMonths): ?string
    {
        $approvalDate = trim((string) ($record['approvalDate'] ?? ''));
        $firstDueMonth = $this->deriveFirstDueMonthFromApproval($approvalDate);
        if ($firstDueMonth !== null) {
            return $firstDueMonth;
        }

        if ($knownMonths === []) {
            return null;
        }

        sort($knownMonths, SORT_STRING);
        $firstMonth = (string) $knownMonths[0];
        return preg_match('/^\d{4}-\d{2}$/', $firstMonth) ? $firstMonth : null;
    }

    private function enumerateRepaymentMonths(string $startMonth, int $count): array
    {
        $months = [];

        for ($offset = 0; $offset < $count; $offset++) {
            $month = $this->shiftMonth($startMonth, $offset);
            if ($month !== null) {
                $months[] = $month;
            }
        }

        return $months;
    }

    private function shiftMonth(string $month, int $offset): ?string
    {
        if (!preg_match('/^\d{4}-\d{2}$/', $month)) {
            return null;
        }

        try {
            $date = new \DateTimeImmutable($month . '-01 00:00:00');
            if ($offset !== 0) {
                $date = $date->modify(($offset > 0 ? '+' : '') . $offset . ' month');
            }
        } catch (\Throwable $exception) {
            return null;
        }

        return $date->format('Y-m');
    }

    private function dueDateForMonth(string $month): ?string
    {
        if (!preg_match('/^\d{4}-\d{2}$/', $month)) {
            return null;
        }

        try {
            return (new \DateTimeImmutable($month . '-01 23:59:59'))
                ->modify('last day of this month')
                ->format('Y-m-d');
        } catch (\Throwable $exception) {
            return null;
        }
    }

    private function resolveRepaymentObligationStatus(array $entries, string $dueDate): array
    {
        $verifiedEntries = [];
        $pendingAmount = 0.0;
        $today = date('Y-m-d');

        foreach ($entries as $entry) {
            $stage = (string) ($entry['stage'] ?? '');
            $amount = (float) ($entry['amount'] ?? 0);

            if (in_array($stage, ['pending', 'uploaded'], true)) {
                $pendingAmount += $amount;
                continue;
            }

            $paymentDate = trim((string) ($entry['paymentDate'] ?? ''));
            if ($stage === 'partial_verified') {
                $verifiedEntries[] = [
                    'paymentDate' => preg_match('/^\d{4}-\d{2}-\d{2}$/', $paymentDate) ? $paymentDate : '',
                    'amount' => $amount,
                    'partial' => true,
                ];
                continue;
            }

            if (!in_array($stage, ['verified', 'credited'], true)) {
                continue;
            }

            $verifiedEntries[] = [
                'paymentDate' => preg_match('/^\d{4}-\d{2}-\d{2}$/', $paymentDate) ? $paymentDate : '',
                'amount' => $amount,
                'partial' => false,
            ];
        }

        if ($verifiedEntries !== []) {
            usort($verifiedEntries, static fn(array $left, array $right): int => strcmp(
                (string) ($left['paymentDate'] ?? ''),
                (string) ($right['paymentDate'] ?? '')
            ));

            $verifiedAmount = array_sum(array_map(static fn(array $entry): float => (float) ($entry['amount'] ?? 0), $verifiedEntries));
            $firstPaymentDate = (string) ($verifiedEntries[0]['paymentDate'] ?? '');
            $hasPartialVerification = in_array(true, array_map(static fn(array $entry): bool => (bool) ($entry['partial'] ?? false), $verifiedEntries), true);

            if (!$hasPartialVerification && $verifiedAmount >= self::MONTHLY_REPAYMENT_AMOUNT && $firstPaymentDate !== '' && $firstPaymentDate <= $dueDate) {
                return [
                    'status' => 'paid_on_time',
                    'label' => 'Paid / On-time',
                    'amount' => $verifiedAmount,
                ];
            }

            return [
                'status' => 'partial_delayed',
                'label' => 'Partial / Delayed',
                'amount' => $verifiedAmount,
            ];
        }

        if ($pendingAmount > 0) {
            return [
                'status' => 'pending_verification',
                'label' => 'Pending Verification',
                'amount' => $pendingAmount,
            ];
        }

        if ($dueDate > $today) {
            return [
                'status' => 'upcoming',
                'label' => 'Upcoming',
                'amount' => 0.0,
            ];
        }

        return [
            'status' => 'overdue_unpaid',
            'label' => 'Overdue / Unpaid',
            'amount' => self::MONTHLY_REPAYMENT_AMOUNT,
        ];
    }

    private function beneficiaryRepaymentSummaries(array $beneficiaryIds): array
    {
        if ($beneficiaryIds === []) {
            return [];
        }

        $map = [];
        foreach ($beneficiaryIds as $beneficiaryId) {
            $map[$beneficiaryId] = $this->emptyRepaymentSummary();
        }

        try {
            $placeholders = implode(',', array_fill(0, count($beneficiaryIds), '?'));
            $statement = db()->prepare(
                'SELECT repayments.beneficiary_profile_id,
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
            log_database_query_failure('reports.repayment_summaries', $exception);
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
            if (in_array($stage, ['verified', 'credited', 'partial_verified'], true)) {
                if (in_array($stage, ['verified', 'partial_verified'], true)) {
                    $map[$beneficiaryId]['verified']++;
                } else {
                    $map[$beneficiaryId]['credited']++;
                }

                $map[$beneficiaryId]['verifiedInstallments']++;
                $map[$beneficiaryId]['paidAmount'] += (float) ($row['amount'] ?? 0);
                if (preg_match('/^\d{4}-\d{2}$/', $coverageMonth)) {
                    $map[$beneficiaryId]['verifiedMonths'][$coverageMonth] = true;
                    $map[$beneficiaryId]['verifiedAmountByMonth'][$coverageMonth] = ($map[$beneficiaryId]['verifiedAmountByMonth'][$coverageMonth] ?? 0.0)
                        + (float) ($row['amount'] ?? 0);
                }

                if ($this->isRepaymentOnTime($paymentDate, $coverageMonth)) {
                    $map[$beneficiaryId]['onTimeInstallments']++;
                } else {
                    $map[$beneficiaryId]['lateInstallments']++;
                }
            }
        }

        foreach ($map as $beneficiaryId => $summary) {
            $map[$beneficiaryId] = $this->resolveRepaymentSummary($summary);
        }

        return $map;
    }

    private function emptyRepaymentSummary(): array
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
            'verifiedMonths' => [],
            'verifiedAmountByMonth' => [],
            'repaymentRate' => 0.0,
            'latestActivity' => '',
        ];
    }

    private function resolveRepaymentSummary(array $summary): array
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
        } elseif ((float) ($summary['paidAmount'] ?? 0) >= (float) ($summary['obligationAmount'] ?? 15000.0)) {
            $summary['key'] = 'fully_paid';
            $summary['label'] = 'Fully Paid';
        } elseif ((float) ($summary['paidAmount'] ?? 0) > 0) {
            $summary['key'] = 'partial_paid';
            $summary['label'] = 'Partial Paid';
        } else {
            $summary['key'] = 'under_review';
            $summary['label'] = 'Under Review';
        }

        $summary['repaymentRate'] = 0.0;

        return $summary;
    }

    private function repaymentRateStats(array $records): array
    {
        $targetAmount = 0.0;
        $actualCollectedAmount = 0.0;
        $beneficiaryCount = 0;

        foreach ($records as $record) {
            if (!((bool) ($record['isBeneficiary'] ?? false))) {
                continue;
            }
            $beneficiaryCount++;
            $repayment = $record['repayment'] ?? [];
            $targetAmount += (float) ($repayment['expectedToDateAmount'] ?? 0.0);
            $actualCollectedAmount += (float) ($repayment['paidAmountToDate'] ?? 0.0);
        }

        $gapAmount = $targetAmount - $actualCollectedAmount;

        return [
            'label' => 'Current to-date snapshot',
            'targetAmount' => round($targetAmount, 2),
            'actualCollectedAmount' => round($actualCollectedAmount, 2),
            'gapAmount' => round($gapAmount, 2),
            'varianceAmount' => round($gapAmount, 2),
            'roiPercent' => $targetAmount > 0 ? round(($actualCollectedAmount / $targetAmount) * 100, 2) : 0.0,
            'obligationCount' => array_sum(array_map(
                static fn(array $record): int => (bool) ($record['isBeneficiary'] ?? false)
                    ? (int) (($record['repayment']['monthsPassed'] ?? 0))
                    : 0,
                $records
            )),
            'scopedBeneficiaries' => $beneficiaryCount,
        ];
    }

    private function resolvePeriodRange(string $period, string $month, int $quarter, int $year, int $repaymentYear, string $from, string $to): array
    {
        if ($period === 'monthly') {
            [$cycleStartMonth, $cycleEndMonth] = $this->repaymentCycleMonthRange($year, $repaymentYear);
            $selectedMonth = preg_match('/^\d{4}-\d{2}$/', $month) ? $month : $cycleStartMonth;
            if (strcmp($selectedMonth, $cycleStartMonth) < 0 || strcmp($selectedMonth, $cycleEndMonth) > 0) {
                $selectedMonth = $cycleStartMonth;
            }

            return [$selectedMonth . '-01', $this->monthEndDate($selectedMonth), $this->formatRepaymentPeriodLabel($selectedMonth, 'monthly')];
        }

        if ($period === 'quarterly') {
            [$startMonth, $endMonth] = $this->repaymentQuarterMonthRange($year, $repaymentYear, $quarter);
            return [
                $startMonth . '-01',
                $this->monthEndDate($endMonth),
                sprintf(
                    'Q%d - Year %d (%s)',
                    $quarter,
                    $repaymentYear,
                    $this->formatRepaymentWindowLabel($startMonth, $endMonth)
                ),
            ];
        }

        if ($period === 'yearly') {
            [$startMonth, $endMonth] = $this->repaymentCycleMonthRange($year, $repaymentYear);
            return [
                $startMonth . '-01',
                $this->monthEndDate($endMonth),
                sprintf('Year %d (%s)', $repaymentYear, $this->formatRepaymentWindowLabel($startMonth, $endMonth)),
            ];
        }

        $from = trim($from);
        $to = trim($to);
        if ($from === '' && $to === '') {
            $from = $month . '-01';
            $to = $this->monthEndDate($month);
        }
        if ($from !== '' && $to === '') {
            $to = $from;
        }
        if ($to !== '' && $from === '') {
            $from = $to;
        }

        return [$from, $to, 'Custom range'];
    }

    private function monthEndDate(string $month): string
    {
        try {
            return (new \DateTimeImmutable($month . '-01'))->modify('last day of this month')->format('Y-m-d');
        } catch (\Throwable $exception) {
            return $month . '-28';
        }
    }

    private function repaymentCycleMonthRange(int $year, int $repaymentYear = 1): array
    {
        $cycleStartYear = $year + max($repaymentYear - 1, 0);
        $startMonth = sprintf('%04d-05', $cycleStartYear);
        $endMonth = (string) ($this->shiftMonth($startMonth, 11) ?? sprintf('%04d-04', $cycleStartYear + 1));

        return [$startMonth, $endMonth];
    }

    private function repaymentQuarterMonthRange(int $year, int $repaymentYear, int $quarter): array
    {
        [$cycleStartMonth, ] = $this->repaymentCycleMonthRange($year, $repaymentYear);
        $quarterIndex = min(max($quarter, 1), 4) - 1;
        $startMonth = (string) ($this->shiftMonth($cycleStartMonth, $quarterIndex * 3) ?? $cycleStartMonth);
        $endMonth = (string) ($this->shiftMonth($startMonth, 2) ?? $startMonth);

        return [$startMonth, $endMonth];
    }

    private function reportYearOptions(): array
    {
        $currentYear = (int) date('Y');
        return [$currentYear];
    }

    private function fixedRepaymentTargetAmount(string $period, array $filters = [], ?string $periodKey = null): float
    {
        $monthlyTarget = self::FIXED_TARGET_BENEFICIARY_CAPACITY * self::MONTHLY_REPAYMENT_AMOUNT;

        return round($monthlyTarget * $this->fixedRepaymentTargetMonths($period, $filters, $periodKey), 2);
    }

    private function fixedRepaymentTargetMonths(string $period, array $filters = [], ?string $periodKey = null): int
    {
        if ($period === 'monthly') {
            return 1;
        }

        if ($period === 'quarterly') {
            return 3;
        }

        if ($period === 'yearly') {
            return 12;
        }

        if ($period === 'custom') {
            $effectiveFrom = substr((string) ($filters['effectiveFrom'] ?? ($filters['from'] ?? '')), 0, 7);
            $effectiveTo = substr((string) ($filters['effectiveTo'] ?? ($filters['to'] ?? '')), 0, 7);
            if (preg_match('/^\d{4}-\d{2}$/', $effectiveFrom) && preg_match('/^\d{4}-\d{2}$/', $effectiveTo)) {
                return max($this->countMonthsInclusive($effectiveFrom, $effectiveTo), 1);
            }
        }

        if ($periodKey !== null && preg_match('/^\d{4}-\d{2}$/', $periodKey)) {
            return 1;
        }

        return 1;
    }

    private function formatRepaymentWindowLabel(string $startMonth, string $endMonth): string
    {
        try {
            $start = new \DateTimeImmutable($startMonth . '-01');
            $end = new \DateTimeImmutable($endMonth . '-01');
            return sprintf('%s - %s', $start->format('M Y'), $end->format('M Y'));
        } catch (\Throwable $exception) {
            return $startMonth . ' - ' . $endMonth;
        }
    }

    private function appendLifecycleMetrics(array $summary, string $approvalDate): array
    {
        $firstDueMonth = $this->deriveFirstDueMonthFromApproval($approvalDate);
        $currentMonth = date('Y-m');
        $lastPlanMonth = $firstDueMonth !== null
            ? $this->shiftMonth($firstDueMonth, self::REPAYMENT_PLAN_MONTHS - 1)
            : null;
        $effectiveEndMonth = $firstDueMonth !== null && $lastPlanMonth !== null
            ? $this->minMonth($currentMonth, $lastPlanMonth)
            : null;

        $monthsPassed = $firstDueMonth !== null && $effectiveEndMonth !== null && strcmp($effectiveEndMonth, $firstDueMonth) >= 0
            ? $this->countMonthsInclusive($firstDueMonth, $effectiveEndMonth)
            : 0;

        $paidAmountToDate = 0.0;
        $monthsPaid = 0;
        $verifiedMonths = array_keys(array_filter((array) ($summary['verifiedMonths'] ?? [])));
        sort($verifiedMonths, SORT_STRING);

        foreach ($verifiedMonths as $month) {
            if (!preg_match('/^\d{4}-\d{2}$/', $month)) {
                continue;
            }
            if ($firstDueMonth !== null && strcmp($month, $firstDueMonth) < 0) {
                continue;
            }
            if ($lastPlanMonth !== null && strcmp($month, $lastPlanMonth) > 0) {
                continue;
            }
            if (strcmp($month, $currentMonth) > 0) {
                continue;
            }
            $monthsPaid++;
            $paidAmountToDate += (float) (($summary['verifiedAmountByMonth'][$month] ?? 0.0));
        }

        $remainingMonths = max(self::REPAYMENT_PLAN_MONTHS - $monthsPaid, 0);
        $expectedToDateAmount = round($monthsPassed * self::MONTHLY_REPAYMENT_AMOUNT, 2);
        $gapToDateAmount = round($expectedToDateAmount - $paidAmountToDate, 2);

        $summary['firstDueMonth'] = $firstDueMonth;
        $summary['monthsPassed'] = $monthsPassed;
        $summary['monthsPaid'] = $monthsPaid;
        $summary['remainingMonths'] = $remainingMonths;
        $summary['paidAmountToDate'] = round($paidAmountToDate, 2);
        $summary['expectedToDateAmount'] = $expectedToDateAmount;
        $summary['gapToDateAmount'] = $gapToDateAmount;
        $summary['progressLabel'] = sprintf('%d / %d months', $monthsPaid, $monthsPassed);
        $summary['repaymentRate'] = $monthsPassed > 0 ? round(($monthsPaid / $monthsPassed) * 100, 2) : 0.0;
        $summary['monthsPaidFraction'] = sprintf('%d/%d', $monthsPaid, $monthsPassed);
        $summary['outstandingBalance'] = round(max((float) ($summary['obligationAmount'] ?? 15000.0) - (float) ($summary['paidAmount'] ?? 0.0), 0.0), 2);

        return $summary;
    }

    private function deriveFirstDueMonthFromApproval(string $approvalDate): ?string
    {
        $approvalDate = trim($approvalDate);
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $approvalDate)) {
            return null;
        }

        return $this->shiftMonth(substr($approvalDate, 0, 7), 1);
    }

    private function countMonthsInclusive(string $fromMonth, string $toMonth): int
    {
        try {
            $from = new \DateTimeImmutable($fromMonth . '-01');
            $to = new \DateTimeImmutable($toMonth . '-01');
        } catch (\Throwable $exception) {
            return 0;
        }

        $difference = ((int) $to->format('Y') - (int) $from->format('Y')) * 12;
        $difference += (int) $to->format('n') - (int) $from->format('n');

        return $difference >= 0 ? ($difference + 1) : 0;
    }

    private function minMonth(string $left, string $right): string
    {
        return strcmp($left, $right) <= 0 ? $left : $right;
    }

    private function quarterKeyForMonth(string $month): string
    {
        if (!preg_match('/^(\d{4})-(\d{2})$/', $month, $matches)) {
            return '';
        }

        $quarter = (int) ceil(((int) $matches[2]) / 3);
        return sprintf('%s-Q%d', $matches[1], $quarter);
    }

    private function distribution(array $records, string $field): array
    {
        $counts = [];
        foreach ($records as $record) {
            $label = trim((string) ($record[$field] ?? 'Not Set'));
            if ($label === '') {
                $label = 'Not Set';
            }
            $counts[$label] = ($counts[$label] ?? 0) + 1;
        }

        $items = [];
        foreach ($counts as $label => $count) {
            $items[] = ['label' => $label, 'count' => $count];
        }

        usort($items, static fn(array $left, array $right): int => ($right['count'] <=> $left['count']) ?: strcmp($left['label'], $right['label']));
        return $items;
    }

    private function uniqueValues(array $records, string $field): array
    {
        $values = [];
        foreach ($records as $record) {
            $value = trim((string) ($record[$field] ?? ''));
            if ($value !== '') {
                $values[$value] = true;
            }
        }

        $result = array_keys($values);
        sort($result, SORT_NATURAL | SORT_FLAG_CASE);
        return array_values($result);
    }

    private function normalizeValue(mixed $value): string
    {
        return strtolower(trim((string) $value));
    }

    private function normalizePositiveBoundedInt(mixed $value, int $min, int $max): int
    {
        $number = (int) $value;
        return $number >= $min && $number <= $max ? $number : 0;
    }

    private function inDateRange(string $value, string $from, string $to): bool
    {
        $date = $this->parseDate($value);
        if ($date === null) {
            return $from === '' && $to === '';
        }

        if ($from !== '') {
            $fromDate = $this->parseDate($from);
            if ($fromDate !== null && $date < $fromDate) {
                return false;
            }
        }

        if ($to !== '') {
            $toDate = $this->parseDate($to);
            if ($toDate !== null) {
                $toDate = $toDate->setTime(23, 59, 59);
                if ($date > $toDate) {
                    return false;
                }
            }
        }

        return true;
    }

    private function parseDate(string $value): ?\DateTimeImmutable
    {
        $value = trim($value);
        if ($value === '') {
            return null;
        }

        try {
            return new \DateTimeImmutable($value);
        } catch (\Throwable $exception) {
            return null;
        }
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

    private function resolveAgeGroupFromAge(?int $age): string
    {
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
            str_contains($text, 'service')
            || str_contains($text, 'repair')
            || str_contains($text, 'salon')
        ) {
            return 'Services';
        }
        if (
            str_contains($text, 'paluwagan')
            || str_contains($text, 'microenterprise')
            || str_contains($text, 'micro enterprise')
            || str_contains($text, 'micro-enterprise')
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

    private function resolveSectorLabel(string $sector, string $otherSectorSpecify): string
    {
        $base = $this->labelizeStatus($sector);
        if (strcasecmp(trim($sector), 'Other') !== 0) {
            return $base;
        }

        $detail = trim($otherSectorSpecify);
        return $detail !== '' ? 'Other - ' . $this->labelizeStatus($detail) : $base;
    }

    private function normalizeGenderLabel(string $value): string
    {
        $raw = trim($value);
        if ($raw === '') {
            return 'Not Set';
        }

        $key = strtolower(str_replace(['-', '_'], ' ', $raw));
        $key = preg_replace('/\s+/', ' ', $key) ?: $key;

        return match ($key) {
            'male', 'lalaki', 'lalake' => 'Male',
            'female', 'babaye', 'babae' => 'Female',
            'non binary', 'nonbinary' => 'Non-binary',
            'prefer not to say', 'dili gustong mosulti' => 'Prefer not to say',
            'not set', 'unknown', 'n/a', 'na' => 'Not Set',
            default => $this->labelizeStatus($raw),
        };
    }

    private function labelizeStatus(string $status): string
    {
        $status = trim(str_replace('_', ' ', $status));
        return $status !== '' ? ucwords(strtolower($status)) : 'Not Set';
    }

    private function beneficiaryIdsFromRecords(array $records): array
    {
        return array_values(array_filter(array_map(
            static fn(array $record): int => (int) ($record['beneficiaryId'] ?? 0),
            $records
        )));
    }

    private function isProfileCompleteRow(array $row): bool
    {
        $required = [
            'birthdate' => $this->isValidDateValue($row['birthdate'] ?? null),
            'gender' => $this->hasTextValue($row['gender'] ?? null),
            'contactNumber' => $this->isValidContactNumber($row['contact_number'] ?? null),
            'address' => $this->hasTextValue($row['address_line'] ?? null),
            'barangay' => $this->hasTextValue($row['barangay_name'] ?? null),
            'is4ps' => ($row['is_4ps'] ?? null) !== null && trim((string) ($row['is_4ps'] ?? '')) !== '',
            'sector' => $this->hasTextValue($row['sector'] ?? null),
            'livelihood' => $this->hasTextValue(($row['livelihood_category'] ?? null) ?: ($row['livelihood_type'] ?? null)),
            'businessName' => $this->hasTextValue($row['business_name'] ?? null),
        ];

        if (in_array('educational_attainment', $this->applicantProfileColumns(), true)) {
            $required['educationalAttainment'] = $this->hasTextValue($row['educational_attainment'] ?? null);
        }
        if (strcasecmp(trim((string) ($row['sector'] ?? '')), 'Other') === 0) {
            $required['sectorOtherSpecify'] = $this->hasTextValue($row['sector_other_specify'] ?? null);
        }

        foreach ($required as $isComplete) {
            if (!$isComplete) {
                return false;
            }
        }

        return true;
    }

    private function hasTextValue(mixed $value): bool
    {
        return trim((string) $value) !== '';
    }

    private function isValidDateValue(mixed $value): bool
    {
        $date = trim((string) $value);
        return $date !== '' && strtotime($date) !== false;
    }

    private function isValidContactNumber(mixed $value): bool
    {
        $digits = preg_replace('/\D+/', '', (string) $value);
        $length = strlen($digits);

        return $length >= 10 && $length <= 13;
    }

    private function applicantProfileColumns(): array
    {
        if (is_array($this->applicantProfileColumns)) {
            return $this->applicantProfileColumns;
        }

        try {
            $rows = db()->query('SHOW COLUMNS FROM applicant_profiles')->fetchAll(PDO::FETCH_ASSOC) ?: [];
        } catch (\Throwable $exception) {
            log_database_query_failure('reports.applicant_profile_columns', $exception);
            $this->applicantProfileColumns = [];
            return $this->applicantProfileColumns;
        }

        $this->applicantProfileColumns = array_values(array_filter(array_map(
            static fn(array $row): string => (string) ($row['Field'] ?? ''),
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

    private function findStaffProfileIdForUser(int $userId): ?int
    {
        if ($userId <= 0) {
            return null;
        }

        try {
            $statement = db()->prepare('SELECT id FROM staff_profiles WHERE user_id = :user_id LIMIT 1');
            $statement->execute(['user_id' => $userId]);
            $value = $statement->fetchColumn();
        } catch (\Throwable $exception) {
            log_database_query_failure('reports.staff_profile_id', $exception, ['user_id' => $userId]);
            return null;
        }

        $staffProfileId = (int) $value;
        return $staffProfileId > 0 ? $staffProfileId : null;
    }

    private function normalizeRepaymentStage(string $status, string $verificationStatus): string
    {
        $value = strtolower(trim($verificationStatus !== '' ? $verificationStatus : $status));
        $value = str_replace('-', '_', $value);
        return match ($value) {
            'verified', 'fully_verified', 'fully verified', 'full_verified', 'full verified' => 'verified',
            'credited' => 'credited',
            'partially_verified', 'partially verified', 'partial_verified', 'partial verified' => 'partial_verified',
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
}
