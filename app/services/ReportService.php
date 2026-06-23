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
            return $this->emptyReportPayload($this->normalizeFilters($filters), true);
        }

        return $this->buildScopedReport($filters, [
            'scopeStaffProfileId' => $staffProfileId,
            'scopePdoOptionsToRecords' => true,
            'useFixedRepaymentTarget' => false,
            'suppressPdoFilter' => true,
        ]);
    }

    private function buildScopedReport(array $filters, array $scope = []): array
    {
        (new BeneficiaryProfileService())->synchronizeSystemInactivityStatuses();
        $normalizedFilters = $this->normalizeFilters($filters);
        $useFixedRepaymentTarget = array_key_exists('useFixedRepaymentTarget', $scope)
            ? (bool) $scope['useFixedRepaymentTarget']
            : true;
        $scopePdoOptionsToRecords = (bool) ($scope['scopePdoOptionsToRecords'] ?? false);
        $suppressPdoFilter = (bool) ($scope['suppressPdoFilter'] ?? false);
        $records = $this->fetchRecords(
            isset($scope['beneficiaryIds']) && is_array($scope['beneficiaryIds']) ? $scope['beneficiaryIds'] : null,
            isset($scope['scopeStaffProfileId']) ? (int) $scope['scopeStaffProfileId'] : null
        );
        $normalizedFilters = $this->normalizeRepaymentPeriodFiltersForRecords($normalizedFilters, $records);
        $filteredRecords = $this->applyFilters($records, $normalizedFilters, $suppressPdoFilter);
        $repaymentAnalytics = $this->buildRepaymentAnalytics($filteredRecords, $normalizedFilters, $useFixedRepaymentTarget);
        // Pass scopeStaffProfileId so training analytics scopes by PDO barangay assignment
        // at the SQL level — not by a flat applicant ID list which can leak cross-scope rows.
        $scopeStaffProfileId = isset($scope['scopeStaffProfileId']) ? (int) $scope['scopeStaffProfileId'] : null;
        $trainingAnalytics = $this->buildTrainingAnalytics(
            $this->beneficiaryIdsFromRecords($filteredRecords),
            $normalizedFilters,
            $scopeStaffProfileId
        );

        return [
            'generatedAt' => date(DATE_ATOM),
            'filters' => $normalizedFilters,
            'options' => $this->buildOptions($records, $scopePdoOptionsToRecords),
            'records' => $filteredRecords,
            'summary' => $this->buildSummary($filteredRecords, $repaymentAnalytics['summary'] ?? null),
            'repaymentAnalytics' => $repaymentAnalytics,
            'trainingAnalytics' => $trainingAnalytics,
        ];
    }

    private function emptyReportPayload(array $normalizedFilters, bool $scopePdoOptionsToRecords = false): array
    {
        $repaymentAnalytics = $this->buildRepaymentAnalytics([], $normalizedFilters);

        return [
            'generatedAt' => date(DATE_ATOM),
            'filters' => $normalizedFilters,
            'options' => $this->buildOptions([], $scopePdoOptionsToRecords),
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
                    latest_applications.id AS application_id,
                    latest_applications.status AS application_status,
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
                 LEFT JOIN (
                    SELECT stage_one_registrations.*
                    FROM stage_one_registrations
                    INNER JOIN (
                        SELECT LOWER(email) COLLATE utf8mb4_unicode_ci AS email_key, MAX(id) AS latest_id
                        FROM stage_one_registrations
                        WHERE validation_status <> "archived"
                        GROUP BY LOWER(email) COLLATE utf8mb4_unicode_ci
                    ) latest_registration ON latest_registration.latest_id = stage_one_registrations.id
                 ) AS stage_one
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
            $applicationStatus = (string) ($row['application_status'] ?? '');
            $hasCurrentApplication = $this->isCurrentApplicantStatus($applicationStatus);
            $beneficiaryStatus = strtolower(trim((string) ($row['beneficiary_status'] ?? '')));
            $isCurrentRepaymentBeneficiary = $beneficiaryStatus === ''
                || in_array($beneficiaryStatus, ['active', 'inactive', 'deceased'], true);
            $isBeneficiary = $beneficiaryId > 0 && $isCurrentRepaymentBeneficiary && (
                trim((string) ($row['approved_at'] ?? '')) !== ''
                || trim((string) ($row['approval_date'] ?? '')) !== ''
                || in_array($beneficiaryStatus, ['active', 'inactive', 'deceased'], true)
            );
            $isCurrentPopulation = $isBeneficiary
                ? in_array($beneficiaryStatus === '' ? 'active' : $beneficiaryStatus, ['active', 'inactive'], true)
                : $hasCurrentApplication;

            if (!$isBeneficiary && !$hasCurrentApplication) {
                return null;
            }

            $repayment = $this->appendLifecycleMetrics(
                $repaymentMap[$beneficiaryId] ?? $this->emptyRepaymentSummary(),
                $isBeneficiary ? (string) ($row['approved_at'] ?? '') : '',
                $isBeneficiary ? (string) ($row['approval_date'] ?? '') : ''
            );
            $serviceTypeSource = (string) (($row['livelihood_category'] ?: ($row['livelihood_type'] ?: ($row['sector'] ?: ''))));
            $age = $this->resolveAge($row);

            return [
                'id' => $beneficiaryId > 0 ? $beneficiaryId : $applicantProfileId,
                'applicantProfileId' => $applicantProfileId,
                'beneficiaryId' => $beneficiaryId > 0 ? $beneficiaryId : null,
                'isBeneficiary' => $isBeneficiary,
                'isCurrentPopulation' => $isCurrentPopulation,
                'profileComplete' => $profileComplete,
                'selectedForBatch' => $selected,
                'populationStage' => $isBeneficiary ? 'Beneficiary' : 'Current Applicant',
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
                    : $this->labelizeStatus($applicationStatus),
                'approvalDate' => (string) ($row['approval_date'] ?? ''),
                'approvedAt' => (string) ($row['approved_at'] ?? ''),
                'lastActivity' => max(
                    (string) ($row['beneficiary_updated_at'] ?? ''),
                    (string) ($row['application_updated_at'] ?? ''),
                    (string) ($row['profile_updated_at'] ?? ''),
                    (string) ($repayment['latestActivity'] ?? '')
                ),
                'repayment' => $repayment,
            ];
        }, $rows);

        return $this->deduplicatePopulationRecords(array_values(array_filter($records, static fn(?array $record): bool => is_array($record))));
    }

    private function normalizeFilters(array $filters): array
    {
        $now = new \DateTimeImmutable('today');
        $currentYear = (int) $now->format('Y');
        $availableYears = $this->reportYearOptions();
        $period = strtolower(trim((string) ($filters['period'] ?? 'monthly')));
        if ($period === 'all' || !in_array($period, ['daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'custom'], true)) {
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

        $date = trim((string) ($filters['date'] ?? $now->format('Y-m-d')));
        if (!$this->isValidDate($date)) {
            $date = $now->format('Y-m-d');
        }

        $week = trim((string) ($filters['week'] ?? $now->format('o-\WW')));
        if (!preg_match('/^\d{4}-W\d{2}$/', $week)) {
            $week = $now->format('o-\WW');
        }

        $rawFrom = trim((string) ($filters['from'] ?? ''));
        $rawTo = trim((string) ($filters['to'] ?? ''));

        [$effectiveFrom, $effectiveTo, $periodLabel] = $this->resolvePeriodRange(
            $period,
            $month,
            $quarter,
            $year,
            $repaymentYear,
            $rawFrom,
            $rawTo,
            $date,
            $week
        );

        return [
            'from' => $rawFrom,
            'to' => $rawTo,
            'date' => $date,
            'week' => $week,
            'search' => strtolower(trim((string) ($filters['search'] ?? ''))),
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

    private function applyFilters(array $records, array $filters, bool $suppressPdoFilter = false): array
    {
        return array_values(array_filter($records, function (array $record) use ($filters, $suppressPdoFilter): bool {
            $search = (string) ($filters['search'] ?? '');
            $searchMatches = true;
            if ($search !== '') {
                $haystack = strtolower(implode(' ', [
                    (string) ($record['name'] ?? ''),
                    (string) ($record['email'] ?? ''),
                    (string) ($record['businessName'] ?? ''),
                    (string) ($record['barangay'] ?? ''),
                    (string) ($record['assignedPdo'] ?? ''),
                    (string) ($record['serviceType'] ?? ''),
                    (string) ($record['sector'] ?? ''),
                    (string) ($record['programStatus'] ?? ''),
                ]));
                $searchMatches = str_contains($haystack, $search);
            }

            // When a PDO scope is already applied via staff_barangay_assignments, the pdo
            // filter is meaningless (all records belong to this PDO's barangays) and must
            // not further restrict the dataset.
            $pdoMatches = $suppressPdoFilter
                || $filters['pdo'] === ''
                || $this->normalizeValue($record['assignedPdo'] ?? 'Unassigned') === $filters['pdo'];

            return ($filters['district'] === '' || $this->normalizeValue($record['district'] ?? 'Unassigned') === $filters['district'])
                && ($filters['barangay'] === '' || $this->normalizeValue($record['barangay'] ?? 'Unassigned') === $filters['barangay'])
                && ($filters['serviceType'] === '' || $this->normalizeValue($record['serviceType'] ?? '') === $filters['serviceType'])
                && ($filters['sector'] === '' || $this->normalizeValue($record['sector'] ?? 'Not Set') === $filters['sector'])
                && ($filters['gender'] === '' || $this->normalizeValue($record['gender'] ?? 'Not Set') === $filters['gender'])
                && ($filters['ageGroup'] === '' || $this->normalizeValue($record['ageGroup'] ?? 'Not Set') === $filters['ageGroup'])
                && $pdoMatches
                && (
                    $filters['repayment'] === ''
                    || (
                        (bool) ($record['isBeneficiary'] ?? false)
                        && $this->normalizeValue($record['repayment']['key'] ?? 'no_upload') === $filters['repayment']
                    )
                )
                && $searchMatches;
        }));
    }

    private function normalizeRepaymentPeriodFiltersForRecords(array $filters, array $records): array
    {
        $period = (string) ($filters['period'] ?? 'all');
        if (!in_array($period, ['daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'custom'], true) || $records === []) {
            return $filters;
        }

        $periods = $this->repaymentPeriodOptions($records);
        $scheduledMonths = (array) ($periods['months'] ?? []);
        sort($scheduledMonths, SORT_STRING);
        $year = (int) ($filters['year'] ?? ($scheduledMonths !== [] ? substr((string) $scheduledMonths[0], 0, 4) : date('Y')));

        if ($scheduledMonths !== []) {
            if ($period === 'daily' && !$this->isValidDate((string) ($filters['date'] ?? ''))) {
                $filters['date'] = $scheduledMonths[0] . '-01';
            }

            if ($period === 'weekly' && !preg_match('/^\d{4}-W\d{2}$/', (string) ($filters['week'] ?? ''))) {
                try {
                    $filters['week'] = (new \DateTimeImmutable($scheduledMonths[0] . '-01'))->format('o-\WW');
                } catch (\Throwable $exception) {
                    $filters['week'] = date('o-\WW');
                }
            }

            if ($period === 'custom') {
                if (!$this->isValidDate((string) ($filters['from'] ?? ''))) {
                    $filters['from'] = $scheduledMonths[0] . '-01';
                }
                if (!$this->isValidDate((string) ($filters['to'] ?? ''))) {
                    $filters['to'] = $this->monthEndDate($scheduledMonths[count($scheduledMonths) - 1]);
                }
            }
        }

        if ($period === 'monthly') {
            $months = array_values(array_filter(
                (array) ($periods['months'] ?? []),
                static fn(string $month): bool => str_starts_with($month, sprintf('%04d-', $year))
            ));
            if ($months === []) {
                $months = (array) ($periods['months'] ?? []);
            }
            sort($months, SORT_STRING);

            if ($months !== [] && !in_array((string) ($filters['month'] ?? ''), $months, true)) {
                $filters['month'] = $months[0];
                $filters['year'] = (int) substr($months[0], 0, 4);
            }
        }

        if ($period === 'quarterly') {
            $quarters = array_values(array_filter(
                (array) ($periods['quarters'] ?? []),
                static fn(array $quarter): bool => (int) ($quarter['year'] ?? 0) === $year
            ));
            if ($quarters === []) {
                $quarters = (array) ($periods['quarters'] ?? []);
            }
            usort($quarters, static fn(array $left, array $right): int => [(int) ($left['year'] ?? 0), (int) ($left['quarter'] ?? 0)] <=> [(int) ($right['year'] ?? 0), (int) ($right['quarter'] ?? 0)]);

            $selectedQuarterKey = sprintf('%04d-Q%d', (int) ($filters['year'] ?? $year), (int) ($filters['quarter'] ?? 0));
            $validQuarterKeys = array_map(static fn(array $quarter): string => (string) ($quarter['key'] ?? ''), $quarters);
            if ($quarters !== [] && !in_array($selectedQuarterKey, $validQuarterKeys, true)) {
                $filters['year'] = (int) ($quarters[0]['year'] ?? $year);
                $filters['quarter'] = (int) ($quarters[0]['quarter'] ?? 1);
            }

            $selectedQuarterKey = sprintf('%04d-Q%d', (int) ($filters['year'] ?? $year), (int) ($filters['quarter'] ?? 1));
            foreach ($quarters as $quarterRow) {
                if ((string) ($quarterRow['key'] ?? '') !== $selectedQuarterKey) {
                    continue;
                }
                $startMonth = (string) ($quarterRow['startMonth'] ?? '');
                $endMonth = (string) ($quarterRow['endMonth'] ?? '');
                if (preg_match('/^\d{4}-\d{2}$/', $startMonth) && preg_match('/^\d{4}-\d{2}$/', $endMonth)) {
                    $filters['effectiveFrom'] = $startMonth . '-01';
                    $filters['effectiveTo'] = $this->monthEndDate($endMonth);
                    $filters['periodLabel'] = (string) ($quarterRow['label'] ?? $this->formatRepaymentPeriodLabel($selectedQuarterKey, 'quarterly'));
                    return $filters;
                }
            }
        }

        if ($period === 'yearly') {
            $repaymentYear = $this->normalizePositiveBoundedInt($filters['repaymentYear'] ?? 1, 1, 2);
            $repaymentYear = $repaymentYear > 0 ? $repaymentYear : 1;
            $filters['repaymentYear'] = $repaymentYear;
            $yearMonths = $scheduledMonths !== [] ? array_slice($scheduledMonths, ($repaymentYear - 1) * 12, 12) : [];
            if ($yearMonths !== []) {
                $filters['effectiveFrom'] = $yearMonths[0] . '-01';
                $filters['effectiveTo'] = $this->monthEndDate($yearMonths[count($yearMonths) - 1]);
                $filters['periodLabel'] = sprintf(
                    'Repayment Year %d (%s)',
                    $repaymentYear,
                    $this->formatRepaymentWindowLabel($yearMonths[0], $yearMonths[count($yearMonths) - 1])
                );
                return $filters;
            }
        }

        [$effectiveFrom, $effectiveTo, $periodLabel] = $this->resolvePeriodRange(
            (string) ($filters['period'] ?? 'all'),
            (string) ($filters['month'] ?? ''),
            (int) ($filters['quarter'] ?? 1),
            (int) ($filters['year'] ?? date('Y')),
            (int) ($filters['repaymentYear'] ?? 1),
            (string) ($filters['from'] ?? ''),
            (string) ($filters['to'] ?? ''),
            (string) ($filters['date'] ?? date('Y-m-d')),
            (string) ($filters['week'] ?? date('o-\WW'))
        );
        $filters['effectiveFrom'] = $effectiveFrom;
        $filters['effectiveTo'] = $effectiveTo;
        $filters['periodLabel'] = $periodLabel;
        if (($filters['period'] ?? '') === 'quarterly') {
            $filters['periodLabel'] = $this->scheduledQuarterPeriodLabel(
                (int) ($filters['year'] ?? date('Y')),
                (int) ($filters['quarter'] ?? 1),
                (array) ($periods['months'] ?? []),
                $periodLabel
            );
        }

        return $filters;
    }

    private function scheduledQuarterPeriodLabel(int $year, int $quarter, array $months, string $fallback): string
    {
        [$startMonth, $endMonth] = $this->calendarQuarterMonthRange($year, $quarter);
        $matchingMonths = array_values(array_filter($months, static function (string $month) use ($startMonth, $endMonth): bool {
            return preg_match('/^\d{4}-\d{2}$/', $month) && strcmp($month, $startMonth) >= 0 && strcmp($month, $endMonth) <= 0;
        }));
        sort($matchingMonths, SORT_STRING);

        if ($matchingMonths === []) {
            return $fallback;
        }

        return sprintf(
            'Q%d %d (%s)',
            $quarter,
            $year,
            $this->formatRepaymentWindowLabel($matchingMonths[0], $matchingMonths[count($matchingMonths) - 1])
        );
    }

    private function buildOptions(array $records, bool $scopePdoOptionsToRecords = false): array
    {
        $repaymentPeriods = $this->repaymentPeriodOptions($records);
        $populationRecords = $this->currentPopulationRecords($records);

        return [
            'districts' => $this->uniqueValues($populationRecords, 'district'),
            'barangays' => $this->uniqueValues($populationRecords, 'barangay'),
            'serviceTypes' => $this->uniqueValues($populationRecords, 'serviceType'),
            'sectors' => $this->uniqueValues($populationRecords, 'sector'),
            'genders' => $this->uniqueValues($populationRecords, 'gender'),
            'ageGroups' => $this->uniqueValues($populationRecords, 'ageGroup'),
            'pdos' => $this->reportPdoOptions($records, $scopePdoOptionsToRecords),
            'years' => $this->reportYearOptions($repaymentPeriods['years'] ?? []),
            'repaymentMonths' => $repaymentPeriods['months'] ?? [],
            'repaymentQuarters' => $repaymentPeriods['quarters'] ?? [],
            'repaymentStates' => [
                ['key' => 'no_upload', 'label' => 'No Upload Yet'],
                ['key' => 'under_review', 'label' => 'Under Review'],
                ['key' => 'needs_follow_up', 'label' => 'Needs Follow-up'],
                ['key' => 'partial_paid', 'label' => 'Partial Paid'],
                ['key' => 'fully_paid', 'label' => 'Fully Paid'],
            ],
            'trainingSessions' => [1, 2, 3],
            'trainingGroups' => [1, 2, 3],
        ];
    }

    private function reportPdoOptions(array $records, bool $scopeToRecords = false): array
    {
        $values = [];

        if (!$scopeToRecords) {
            foreach ($this->fetchAllProjectOfficerNames() as $name) {
                $trimmed = trim($name);
                if ($trimmed !== '') {
                    $values[$trimmed] = true;
                }
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
        $populationRecords = $this->currentPopulationRecords($records);
        $beneficiaryCount = count(array_filter($populationRecords, static fn(array $record): bool => (bool) ($record['isBeneficiary'] ?? false)));
        $pipelineOnlyCount = count(array_filter($populationRecords, static fn(array $record): bool => !((bool) ($record['isBeneficiary'] ?? false))));

        return [
            'totalPeople' => count($populationRecords),
            'totalBeneficiaries' => $beneficiaryCount,
            'beneficiaryCount' => $beneficiaryCount,
            'pipelineOnlyCount' => $pipelineOnlyCount,
            'serviceTypeDistribution' => $this->distribution($populationRecords, 'serviceType'),
            'sectorDistribution' => $this->distribution($populationRecords, 'sector'),
            'genderDistribution' => $this->distribution($populationRecords, 'gender'),
            'ageGroupDistribution' => $this->distribution($populationRecords, 'ageGroup'),
            'barangayDistribution' => $this->distribution($populationRecords, 'barangay'),
            'programStatusDistribution' => $this->distribution($populationRecords, 'programStatus'),
            'repaymentPerformance' => $repaymentRate ?? $this->repaymentRateStats($records),
            'repaymentRate' => $repaymentRate ?? $this->repaymentRateStats($records),
        ];
    }

    private function currentPopulationRecords(array $records): array
    {
        return array_values(array_filter(
            $records,
            static fn(array $record): bool => (bool) ($record['isCurrentPopulation'] ?? false)
        ));
    }

    private function buildRepaymentAnalytics(array $records, array $filters, bool $useFixedRepaymentTarget = true): array
    {
        $beneficiaryIds = $this->beneficiaryIdsFromRecords($records);

        $repaymentRows = $this->fetchRepaymentRows($beneficiaryIds);
        $repaymentSchedules = $this->fetchRepaymentSchedules($beneficiaryIds);
        $obligations = $this->buildRepaymentObligations($records, $repaymentRows, $repaymentSchedules);
        $filteredObligations = $this->applyRepaymentFilters($obligations, $filters);

        return [
            'obligations' => $filteredObligations,
            'summary' => $this->summarizeRepaymentObligations($filteredObligations, $filters, $useFixedRepaymentTarget),
            'periodMetrics' => $this->summarizeRepaymentObligations($filteredObligations, $filters, $useFixedRepaymentTarget),
            'breakdown' => $this->buildRepaymentBreakdown($filteredObligations, $filters, $useFixedRepaymentTarget),
            'monthlyBreakdown' => $this->buildRepaymentMonthlyBreakdown($filteredObligations, $filters, $useFixedRepaymentTarget),
        ];
    }

    private function buildTrainingAnalytics(?array $beneficiaryIds, array $filters, ?int $scopeStaffProfileId = null): array
    {
        if (is_array($beneficiaryIds) && $beneficiaryIds === [] && $scopeStaffProfileId === null) {
            return $this->emptyTrainingAnalytics($filters);
        }

        $rows = $this->fetchTrainingAttendanceRows($beneficiaryIds, $filters, $scopeStaffProfileId);
        $completionMap = $this->deriveTrainingCompletionMap($rows);
        $sessionFilter = (int) ($filters['trainingSession'] ?? 0);
        $breakdown = [
            1 => $this->emptyTrainingSessionBreakdown(1),
            2 => $this->emptyTrainingSessionBreakdown(2),
            3 => $this->emptyTrainingSessionBreakdown(3),
        ];

        $visibleRows = [];
        $groupFilter = (int) ($filters['trainingGroup'] ?? 0);

        foreach ($rows as $row) {
            $session = (int) ($row['sessionNumber'] ?? 0);
            if ($session < 1 || $session > 3) {
                continue;
            }
            if ($sessionFilter > 0 && $session !== $sessionFilter) {
                continue;
            }
            $groupNumber = (int) ($row['groupNumber'] ?? 0);
            if ($groupFilter > 0 && $groupNumber !== $groupFilter) {
                continue;
            }

            $visibleRows[] = $row;

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
        foreach ($visibleRows as $row) {
            $applicantProfileId = (int) ($row['applicantProfileId'] ?? 0);
            if ($applicantProfileId > 0) {
                $participantIds[$applicantProfileId] = true;
            }
        }
        $summary['participants'] = count($participantIds);

        return [
            'summary' => $summary,
            'breakdown' => $visibleBreakdown,
            'rows' => $visibleRows,
            'filters' => [
                'year' => $this->trainingAnalyticsYear($filters),
                'session' => $sessionFilter,
                'group' => $groupFilter,
            ],
        ];
    }

    private function fetchTrainingAttendanceRows(?array $beneficiaryIds, array $filters, ?int $scopeStaffProfileId = null): array
    {
        try {
            $conditions = [
                'training_programs.training_round_number BETWEEN 1 AND 3',
                'YEAR(training_programs.starts_at) = ?',
            ];
            $params = [$this->trainingAnalyticsYear($filters)];

            // Scope training rows to the PDO's assigned barangays when a staff profile is given.
            // This is authoritative scoping — it prevents cross-PDO leakage that occurs when
            // scoping only by a flat applicant ID list.
            if ($scopeStaffProfileId !== null && $scopeStaffProfileId > 0) {
                $conditions[] = 'EXISTS (
                    SELECT 1
                    FROM staff_barangay_assignments AS training_scope
                    WHERE training_scope.staff_profile_id = ?
                      AND training_scope.ended_at IS NULL
                      AND training_scope.barangay_id = applicant_profiles.barangay_id
                )';
                $params[] = $scopeStaffProfileId;
            } elseif (is_array($beneficiaryIds) && $beneficiaryIds !== []) {
                // Non-PDO scoped call (e.g. admin filtered by beneficiary list).
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
                        training_programs.title,
                        training_programs.venue,
                        training_programs.starts_at,
                        training_programs.ends_at,
                        COALESCE(training_invitees.batch_group_number, training_programs.target_group_number) AS group_number,
                        COALESCE(attendance_records.attendance_status, training_invitees.invite_status) AS attendance_status,
                        COALESCE(applicant_users.full_name, "") AS participant_name,
                        COALESCE(applicant_profiles.business_name, "") AS business_name,
                        COALESCE(assigned_pdo_users.full_name, "") AS assigned_pdo_name,
                        COALESCE(attendance_records.remarks, training_invitees.remarks, "") AS attendance_remarks,
                        attendance_records.proof_file_path,
                        attendance_records.proof_original_name
                 FROM training_invitees
                 INNER JOIN training_programs ON training_programs.id = training_invitees.training_program_id
                 LEFT JOIN applicant_profiles ON applicant_profiles.id = training_invitees.applicant_profile_id
                 LEFT JOIN users AS applicant_users ON applicant_users.id = applicant_profiles.user_id
                 LEFT JOIN (
                    SELECT applications.applicant_profile_id, MAX(applications.id) AS latest_application_id
                    FROM applications
                    GROUP BY applications.applicant_profile_id
                 ) AS latest_applications ON latest_applications.applicant_profile_id = applicant_profiles.id
                 LEFT JOIN applications AS latest_application ON latest_application.id = latest_applications.latest_application_id
                 LEFT JOIN staff_profiles AS assigned_staff ON assigned_staff.id = latest_application.assigned_staff_profile_id
                 LEFT JOIN users AS assigned_pdo_users ON assigned_pdo_users.id = assigned_staff.user_id
                 LEFT JOIN attendance_records ON attendance_records.training_invitee_id = training_invitees.id
                 WHERE ' . implode(' AND ', $conditions) . '
                 ORDER BY training_programs.training_round_number ASC, group_number ASC, applicant_users.full_name ASC, training_invitees.id ASC'
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
                'participantName' => (string) ($row['participant_name'] ?? ''),
                'businessName' => (string) ($row['business_name'] ?? ''),
                'sessionNumber' => (int) ($row['training_round_number'] ?? 0),
                'groupNumber' => $row['group_number'] !== null ? (int) $row['group_number'] : null,
                'activityName' => (string) ($row['title'] ?? ''),
                'location' => (string) ($row['venue'] ?? ''),
                'startsAt' => (string) ($row['starts_at'] ?? ''),
                'endsAt' => (string) ($row['ends_at'] ?? ''),
                'status' => (string) ($row['attendance_status'] ?? ''),
                'assignedPdo' => (string) ($row['assigned_pdo_name'] ?? ''),
                'proofPath' => (string) ($row['proof_file_path'] ?? ''),
                'proofName' => (string) ($row['proof_original_name'] ?? ''),
                'remarks' => (string) ($row['attendance_remarks'] ?? ''),
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
            'rows' => [],
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

    private function fetchRepaymentSchedules(array $beneficiaryIds): array
    {
        if ($beneficiaryIds === []) {
            return [];
        }

        try {
            $placeholders = implode(',', array_fill(0, count($beneficiaryIds), '?'));
            $statement = db()->prepare(
                'SELECT beneficiary_profile_id,
                        coverage_month,
                        due_date,
                        expected_amount
                 FROM repayment_schedules
                 WHERE beneficiary_profile_id IN (' . $placeholders . ')
                   AND LOWER(COALESCE(schedule_status, "scheduled")) = "scheduled"
                 ORDER BY beneficiary_profile_id ASC, coverage_month ASC'
            );
            $statement->execute($beneficiaryIds);
            $rows = $statement->fetchAll(PDO::FETCH_ASSOC) ?: [];
        } catch (\Throwable $exception) {
            log_database_query_failure('reports.repayment_schedules', $exception);
            return [];
        }

        $schedules = [];
        foreach ($rows as $row) {
            $beneficiaryId = (int) ($row['beneficiary_profile_id'] ?? 0);
            $coverageMonth = substr((string) ($row['coverage_month'] ?? ''), 0, 7);
            $dueDate = substr((string) ($row['due_date'] ?? ''), 0, 10);
            if ($beneficiaryId <= 0 || !preg_match('/^\d{4}-\d{2}$/', $coverageMonth) || !$this->isValidDate($dueDate)) {
                continue;
            }

            $schedules[$beneficiaryId][$coverageMonth] = [
                'coverageMonth' => $coverageMonth,
                'dueDate' => $dueDate,
                'expectedAmount' => (float) ($row['expected_amount'] ?? self::MONTHLY_REPAYMENT_AMOUNT),
            ];
        }

        return $schedules;
    }

    private function buildRepaymentObligations(array $records, array $repaymentRows, array $repaymentSchedules = []): array
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
            if ($beneficiaryId <= 0 || !((bool) ($record['isBeneficiary'] ?? false))) {
                continue;
            }

            $scheduledMonths = array_keys($repaymentSchedules[$beneficiaryId] ?? []);
            $knownMonths = array_keys($entriesByBeneficiaryMonth[$beneficiaryId] ?? []);
            $startMonth = $this->deriveRepaymentStartMonth($record, $knownMonths);
            if ($startMonth === null) {
                continue;
            }

            $planMonths = $scheduledMonths !== []
                ? array_values(array_filter(
                    $scheduledMonths,
                    static fn(string $month): bool => strcmp($month, $startMonth) >= 0
                ))
                : [];
            if ($planMonths === []) {
                $planMonths = $this->enumerateRepaymentMonths($startMonth, self::REPAYMENT_PLAN_MONTHS);
            }
            $planMonths = array_slice($planMonths, 0, self::REPAYMENT_PLAN_MONTHS);
            sort($planMonths, SORT_STRING);

            if ($planMonths === []) {
                continue;
            }

            foreach ($planMonths as $index => $dueMonth) {
                if (!preg_match('/^\d{4}-\d{2}$/', (string) $dueMonth)) {
                    continue;
                }
                $schedule = $repaymentSchedules[$beneficiaryId][$dueMonth] ?? [];
                $dueDate = (string) ($schedule['dueDate'] ?? '');
                if (!$this->isValidDate($dueDate)) {
                    $dueDate = (string) $this->dueDateForMonth((string) $dueMonth);
                }
                if (!$this->isValidDate($dueDate)) {
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
                    'expectedAmount' => (float) ($schedule['expectedAmount'] ?? self::MONTHLY_REPAYMENT_AMOUNT),
                    'barangay' => (string) ($record['barangay'] ?? 'Unassigned'),
                    'assignedPdo' => (string) ($record['assignedPdo'] ?? 'Unassigned'),
                    'serviceType' => (string) ($record['serviceType'] ?? 'Unclassified'),
                    'sector' => (string) ($record['sector'] ?? 'Not Set'),
                    'gender' => (string) ($record['gender'] ?? 'Not Set'),
                    'ageGroup' => (string) ($record['ageGroup'] ?? 'Not Set'),
                    'status' => $status['status'],
                    'statusLabel' => $status['label'],
                    'amountRepresented' => $status['amount'],
                    'paymentDate' => $status['paymentDate'] ?? '',
                    'verifiedPayments' => $status['verifiedPayments'] ?? [],
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
            $periodMatches = $this->repaymentObligationHasReportActivity($obligation, $filters, $effectiveFrom, $effectiveTo);
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
        $targetObligationCount = 0;
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
            $beneficiaryIds[(int) ($obligation['beneficiaryId'] ?? 0)] = true;
            if ($this->repaymentTargetInReportRange($obligation, $filters)) {
                $targetObligationCount++;
                $statusCounts[$status]++;
            }
            foreach ($this->verifiedPaymentsForReport($obligation, $filters) as $payment) {
                $actualCollectedAmount += (float) ($payment['amount'] ?? 0.0);
            }
        }

        $targetAmount = $useFixedRepaymentTarget
            ? $this->fixedRepaymentTargetAmountFromObligations($obligations, $filters)
            : 0.0;
        if (!$useFixedRepaymentTarget) {
            foreach ($obligations as $obligation) {
                if ($this->repaymentTargetInReportRange($obligation, $filters)) {
                    $targetAmount += (float) ($obligation['expectedAmount'] ?? self::MONTHLY_REPAYMENT_AMOUNT);
                }
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
            'obligationCount' => $targetObligationCount,
            'scopedBeneficiaries' => count(array_filter(array_keys($beneficiaryIds))),
            'statusCounts' => $statusCounts,
        ];
    }

    private function buildRepaymentBreakdown(array $obligations, array $filters, bool $useFixedRepaymentTarget = true): array
    {
        $period = (string) ($filters['period'] ?? 'monthly');
        $breakdownPeriod = $period === 'all'
            ? 'monthly'
            : ($period === 'custom' ? $this->customBreakdownPeriod($filters) : $period);
        $periods = in_array($period, ['all', 'custom'], true)
            ? []
            : $this->seedRepaymentBreakdownPeriods($filters + ['period' => $breakdownPeriod]);
        $fixedTargetMonthsByPeriod = [];

        foreach ($obligations as $obligation) {
            if ($this->repaymentTargetInReportRange($obligation, $filters)) {
                $periodKey = $period === 'yearly'
                    ? 'repayment-year-' . (string) ($filters['repaymentYear'] ?? ($obligation['repaymentYearNumber'] ?? 1))
                    : $this->repaymentBreakdownKey($obligation, $breakdownPeriod);
                if ($periodKey !== '') {
                    if (!isset($periods[$periodKey])) {
                        $periods[$periodKey] = [
                            'period' => $periodKey,
                            'label' => $this->formatRepaymentPeriodLabel($periodKey, $breakdownPeriod),
                            'targetAmount' => 0.0,
                            'actualCollectedAmount' => 0.0,
                            'gapAmount' => 0.0,
                            'roiPercent' => 0.0,
                        ];
                    }

                    if ($useFixedRepaymentTarget) {
                        $dueMonth = (string) ($obligation['dueMonth'] ?? '');
                        if (preg_match('/^\d{4}-\d{2}$/', $dueMonth)) {
                            $fixedTargetMonthsByPeriod[$periodKey][$dueMonth] = true;
                        }
                    } else {
                        $periods[$periodKey]['targetAmount'] += (float) ($obligation['expectedAmount'] ?? self::MONTHLY_REPAYMENT_AMOUNT);
                    }
                }
            }

            foreach ($this->verifiedPaymentsForReport($obligation, $filters) as $payment) {
                $paymentKey = $this->repaymentActualUsesPaymentDate($filters)
                    ? $this->repaymentBreakdownKeyForDate((string) ($payment['paymentDate'] ?? ''), $breakdownPeriod, $filters)
                    : $this->repaymentBreakdownKey($obligation, $breakdownPeriod);
                if ($paymentKey === '') {
                    continue;
                }
                if (!isset($periods[$paymentKey])) {
                    $periods[$paymentKey] = [
                        'period' => $paymentKey,
                        'label' => $this->formatRepaymentPeriodLabel($paymentKey, $breakdownPeriod),
                        'targetAmount' => 0.0,
                        'actualCollectedAmount' => 0.0,
                        'gapAmount' => 0.0,
                        'roiPercent' => 0.0,
                    ];
                }
                $periods[$paymentKey]['actualCollectedAmount'] += (float) ($payment['amount'] ?? 0.0);
            }
        }

        ksort($periods, SORT_STRING);

        if ($useFixedRepaymentTarget) {
            $monthlyTarget = $this->fixedRepaymentMonthlyTarget();
            foreach ($periods as $key => &$periodRow) {
                $periodRow['targetAmount'] = $monthlyTarget * count($fixedTargetMonthsByPeriod[(string) $key] ?? []);
            }
            unset($periodRow);
        }

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

    private function repaymentPeriodOptions(array $records): array
    {
        $beneficiaryIds = $this->beneficiaryIdsFromRecords($records);
        $schedules = $this->fetchRepaymentSchedules($beneficiaryIds);
        $months = [];

        foreach ($records as $record) {
            $beneficiaryId = (int) ($record['beneficiaryId'] ?? ($record['id'] ?? 0));
            if ($beneficiaryId <= 0 || !((bool) ($record['isBeneficiary'] ?? false))) {
                continue;
            }

            $scheduledMonths = array_keys($schedules[$beneficiaryId] ?? []);
            $firstDueMonth = $this->deriveRepaymentStartMonth($record, []);
            if ($firstDueMonth !== null && $scheduledMonths !== []) {
                $scheduledMonths = array_values(array_filter(
                    $scheduledMonths,
                    static fn(string $month): bool => strcmp($month, $firstDueMonth) >= 0
                ));
                $scheduledMonths = array_slice($scheduledMonths, 0, self::REPAYMENT_PLAN_MONTHS);
            }
            if ($scheduledMonths === []) {
                $scheduledMonths = $firstDueMonth !== null
                    ? $this->enumerateRepaymentMonths($firstDueMonth, self::REPAYMENT_PLAN_MONTHS)
                    : [];
            }

            foreach ($scheduledMonths as $month) {
                if (preg_match('/^\d{4}-\d{2}$/', (string) $month)) {
                    $months[(string) $month] = true;
                }
            }
        }

        $monthValues = array_keys($months);
        sort($monthValues, SORT_STRING);

        $quarters = [];
        $years = [];
        foreach ($monthValues as $index => $month) {
            $year = substr($month, 0, 4);
            $years[$year] = true;
            $repaymentQuarter = (int) floor((($index % 12) / 3)) + 1;
            $quarterStartIndex = (int) (floor($index / 3) * 3);
            $startMonth = $monthValues[$quarterStartIndex] ?? $month;
            $endMonth = $monthValues[min($quarterStartIndex + 2, count($monthValues) - 1)] ?? $month;
            $quarterYear = (int) substr($startMonth, 0, 4);
            $quarterKey = sprintf('%04d-Q%d', $quarterYear, $repaymentQuarter);
            if (!isset($quarters[$quarterKey])) {
                $quarters[$quarterKey] = [
                    'year' => $quarterYear,
                    'quarter' => $repaymentQuarter,
                    'key' => $quarterKey,
                    'startMonth' => $startMonth,
                    'endMonth' => $endMonth,
                    'label' => sprintf(
                        'Q%d %d (%s)',
                        $repaymentQuarter,
                        $quarterYear,
                        $this->formatRepaymentWindowLabel($startMonth, $endMonth)
                    ),
                ];
            }
        }

        return [
            'months' => $monthValues,
            'quarters' => array_values($quarters),
            'years' => array_map('intval', array_keys($years)),
        ];
    }

    private function repaymentObligationHasReportActivity(array $obligation, array $filters, string $from, string $to): bool
    {
        if ($this->inDateRange((string) ($obligation['dueDate'] ?? ''), $from, $to)) {
            return true;
        }

        if (!$this->repaymentActualUsesPaymentDate($filters)) {
            return false;
        }

        foreach ((array) ($obligation['verifiedPayments'] ?? []) as $payment) {
            $paymentDate = (string) ($payment['paymentDate'] ?? '');
            if ($this->isValidDate($paymentDate) && $this->inDateRange($paymentDate, $from, $to)) {
                return true;
            }
        }

        return false;
    }

    private function repaymentTargetInReportRange(array $obligation, array $filters): bool
    {
        // For daily and weekly periods, actuals use the exact date range but the target
        // must cover the entire month containing that date/week — because repayment
        // obligations are always due on the 1st of a month, never on a specific day.
        $period = (string) ($filters['period'] ?? 'monthly');
        [$targetFrom, $targetTo] = $this->repaymentTargetMonthRange($period, $filters);

        return $this->inDateRange(
            (string) ($obligation['dueDate'] ?? ''),
            $targetFrom,
            $targetTo
        );
    }

    /**
     * For daily and weekly periods the obligation due-date is always the 1st of a month.
     * Expand the filter range to the full calendar month(s) that contain effectiveFrom/effectiveTo
     * so target calculation is not zero when no obligation falls exactly on the selected day.
     */
    private function repaymentTargetMonthRange(string $period, array $filters): array
    {
        $from = (string) ($filters['effectiveFrom'] ?? '');
        $to   = (string) ($filters['effectiveTo']   ?? '');

        if (!in_array($period, ['daily', 'weekly'], true)) {
            return [$from, $to];
        }

        // Expand from → start of its month, to → end of its month
        $expandedFrom = $this->isValidDate($from) ? substr($from, 0, 7) . '-01' : $from;
        $expandedTo   = $this->isValidDate($to)   ? $this->monthEndDate(substr($to, 0, 7)) : $to;

        return [$expandedFrom, $expandedTo];
    }

    private function verifiedPaymentsForReport(array $obligation, array $filters): array
    {
        if (!$this->repaymentActualUsesPaymentDate($filters)) {
            return $this->repaymentTargetInReportRange($obligation, $filters)
                ? array_values((array) ($obligation['verifiedPayments'] ?? []))
                : [];
        }

        return $this->verifiedPaymentsInPaymentDateRange($obligation, $filters);
    }

    private function verifiedPaymentsInPaymentDateRange(array $obligation, array $filters): array
    {
        $from = (string) ($filters['effectiveFrom'] ?? '');
        $to = (string) ($filters['effectiveTo'] ?? '');
        $payments = [];

        foreach ((array) ($obligation['verifiedPayments'] ?? []) as $payment) {
            $paymentDate = (string) ($payment['paymentDate'] ?? '');
            if (!$this->isValidDate($paymentDate) || !$this->inDateRange($paymentDate, $from, $to)) {
                continue;
            }
            $payments[] = $payment;
        }

        return $payments;
    }

    private function repaymentActualUsesPaymentDate(array $filters): bool
    {
        return in_array((string) ($filters['period'] ?? ''), ['daily', 'weekly', 'custom'], true);
    }

    private function repaymentBreakdownKeyForDate(string $date, string $period, array $filters): string
    {
        if (!$this->isValidDate($date)) {
            return '';
        }

        if ($period === 'daily') {
            return $date;
        }

        if ($period === 'weekly') {
            try {
                return (new \DateTimeImmutable($date))->format('o-\WW');
            } catch (\Throwable $exception) {
                return '';
            }
        }

        if ($period === 'monthly') {
            return substr($date, 0, 7);
        }

        if ($period === 'quarterly') {
            return $this->quarterKeyForMonth(substr($date, 0, 7));
        }

        if ($period === 'yearly') {
            return 'repayment-year-' . (string) ($filters['repaymentYear'] ?? 1);
        }

        return substr($date, 0, 7);
    }

    private function customBreakdownPeriod(array $filters): string
    {
        $from = (string) ($filters['effectiveFrom'] ?? '');
        $to = (string) ($filters['effectiveTo'] ?? '');
        if (!$this->isValidDate($from) || !$this->isValidDate($to)) {
            return 'monthly';
        }

        try {
            $fromDate = new \DateTimeImmutable($from);
            $toDate = new \DateTimeImmutable($to);
            $days = (int) $fromDate->diff($toDate)->format('%a') + 1;
            return $days <= 31 ? 'daily' : 'monthly';
        } catch (\Throwable $exception) {
            return 'monthly';
        }
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
        if ($period === 'daily') {
            return $this->formatDateLabel($periodKey);
        }
        if ($period === 'weekly' && preg_match('/^(\d{4})-W(\d{2})$/', $periodKey, $matches)) {
            return sprintf('Week %d, %s', (int) $matches[2], $matches[1]);
        }
        if ($period === 'yearly') {
            if (preg_match('/^repayment-year-([12])$/', $periodKey, $matches)) {
                return 'Repayment Year ' . $matches[1];
            }
            return $periodKey;
        }
        if ($period === 'quarterly' && preg_match('/^(\d{4})-Q([1-4])$/', $periodKey, $matches)) {
            return sprintf('Q%s %s', $matches[2], $matches[1]);
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
        $periods = [];

        if ($period === 'daily') {
            $key = (string) ($filters['date'] ?? ($filters['effectiveFrom'] ?? date('Y-m-d')));
            if ($this->isValidDate($key)) {
                $periods[$key] = [
                    'period' => $key,
                    'label' => $this->formatRepaymentPeriodLabel($key, 'daily'),
                    'targetAmount' => 0.0,
                    'actualCollectedAmount' => 0.0,
                    'gapAmount' => 0.0,
                    'roiPercent' => 0.0,
                ];
            }
            return $periods;
        }

        if ($period === 'weekly') {
            $key = (string) ($filters['week'] ?? date('o-\WW'));
            if (preg_match('/^\d{4}-W\d{2}$/', $key)) {
                $periods[$key] = [
                    'period' => $key,
                    'label' => $this->formatRepaymentPeriodLabel($key, 'weekly'),
                    'targetAmount' => 0.0,
                    'actualCollectedAmount' => 0.0,
                    'gapAmount' => 0.0,
                    'roiPercent' => 0.0,
                ];
            }
            return $periods;
        }

        if ($period === 'monthly') {
            $key = (string) ($filters['month'] ?? sprintf('%04d-01', $year));
            if (!preg_match('/^\d{4}-\d{2}$/', $key)) {
                $key = sprintf('%04d-01', $year);
            }
            $periods[$key] = [
                'period' => $key,
                'label' => $this->formatRepaymentPeriodLabel($key, 'monthly'),
                'targetAmount' => 0.0,
                'actualCollectedAmount' => 0.0,
                'gapAmount' => 0.0,
                'roiPercent' => 0.0,
            ];
            return $periods;
        }

        if ($period === 'quarterly') {
            $quarter = (int) ($filters['quarter'] ?? 1);
            if ($quarter < 1 || $quarter > 4) {
                $quarter = 1;
            }
            $key = sprintf('%04d-Q%d', $year, $quarter);
            $periods[$key] = [
                'period' => $key,
                'label' => $this->formatRepaymentPeriodLabel($key, 'quarterly'),
                'targetAmount' => 0.0,
                'actualCollectedAmount' => 0.0,
                'gapAmount' => 0.0,
                'roiPercent' => 0.0,
            ];
            return $periods;
        }

        if ($period === 'yearly') {
            $key = 'repayment-year-' . (string) ($filters['repaymentYear'] ?? 1);
            $periods[$key] = [
                'period' => $key,
                'label' => 'Repayment Year ' . (string) ($filters['repaymentYear'] ?? 1),
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
        $dueDate = (string) ($obligation['dueDate'] ?? '');
        if ($period === 'daily') {
            return $this->isValidDate($dueDate) ? $dueDate : '';
        }
        if ($period === 'weekly') {
            try {
                return (new \DateTimeImmutable($dueDate))->format('o-\WW');
            } catch (\Throwable $exception) {
                return '';
            }
        }

        if (!preg_match('/^\d{4}-\d{2}$/', $dueMonth)) {
            return '';
        }

        if ($period === 'monthly') {
            return $dueMonth;
        }

        if ($period === 'quarterly') {
            $installmentNumber = max((int) ($obligation['installmentNumber'] ?? 1), 1);
            $quarterNumber = (int) floor((($installmentNumber - 1) % 12) / 3) + 1;
            $quarterStartMonth = $this->shiftMonth($dueMonth, -((($installmentNumber - 1) % 3))) ?? $dueMonth;
            $dueYear = (int) substr($quarterStartMonth, 0, 4);
            if ($quarterNumber < 1 || $quarterNumber > 4) {
                return '';
            }
            return sprintf('%04d-Q%d', $dueYear, $quarterNumber);
        }

        if ($period === 'yearly') {
            return '';
        }

        return $dueMonth;
    }

    private function deriveRepaymentStartMonth(array $record, array $knownMonths): ?string
    {
        $approvedAt = trim((string) ($record['approvedAt'] ?? ''));
        $approvalDate = trim((string) ($record['approvalDate'] ?? ''));
        $firstDueMonth = $this->deriveFirstDueMonthFromApproval($approvedAt, $approvalDate);
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
                    'paymentDate' => $firstPaymentDate,
                    'verifiedPayments' => $verifiedEntries,
                ];
            }

            return [
                'status' => 'partial_delayed',
                'label' => 'Partial / Delayed',
                'amount' => $verifiedAmount,
                'paymentDate' => $firstPaymentDate,
                'verifiedPayments' => $verifiedEntries,
            ];
        }

        if ($pendingAmount > 0) {
            return [
                'status' => 'pending_verification',
                'label' => 'Pending Verification',
                'amount' => $pendingAmount,
                'paymentDate' => '',
                'verifiedPayments' => [],
            ];
        }

        if ($dueDate > $today) {
            return [
                'status' => 'upcoming',
                'label' => 'Upcoming',
                'amount' => 0.0,
                'paymentDate' => '',
                'verifiedPayments' => [],
            ];
        }

        return [
            'status' => 'overdue_unpaid',
            'label' => 'Overdue / Unpaid',
            'amount' => self::MONTHLY_REPAYMENT_AMOUNT,
            'paymentDate' => '',
            'verifiedPayments' => [],
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
                    ? (int) (($record['repayment']['calendarMonthsPassed'] ?? ($record['repayment']['monthsPassed'] ?? 0)))
                    : 0,
                $records
            )),
            'scopedBeneficiaries' => $beneficiaryCount,
        ];
    }

    private function resolvePeriodRange(
        string $period,
        string $month,
        int $quarter,
        int $year,
        int $repaymentYear,
        string $from,
        string $to,
        string $date,
        string $week
    ): array
    {
        if ($period === 'all') {
            return ['', '', 'All repayment records'];
        }

        if ($period === 'daily') {
            return [$date, $date, $this->formatDateLabel($date)];
        }

        if ($period === 'weekly') {
            [$weekStart, $weekEnd] = $this->weekDateRange($week);
            return [$weekStart, $weekEnd, $this->formatRepaymentPeriodLabel($week, 'weekly')];
        }

        if ($period === 'monthly') {
            $selectedMonth = preg_match('/^\d{4}-\d{2}$/', $month) ? $month : sprintf('%04d-%02d', $year, 1);

            return [$selectedMonth . '-01', $this->monthEndDate($selectedMonth), $this->formatRepaymentPeriodLabel($selectedMonth, 'monthly')];
        }

        if ($period === 'quarterly') {
            [$startMonth, $endMonth] = $this->calendarQuarterMonthRange($year, $quarter);
            return [
                $startMonth . '-01',
                $this->monthEndDate($endMonth),
                sprintf('Q%d %d (%s)', $quarter, $year, $this->formatRepaymentWindowLabel($startMonth, $endMonth)),
            ];
        }

        if ($period === 'yearly') {
            return [sprintf('%04d-01-01', $year), sprintf('%04d-12-31', $year), sprintf('Year %d', $year)];
        }

        if ($period === 'custom') {
            $from = $this->isValidDate(trim($from)) ? trim($from) : '';
            $to = $this->isValidDate(trim($to)) ? trim($to) : '';
            if ($from === '' && $to === '') {
                $from = $date;
                $to = $date;
            }
            if ($from !== '' && $to === '') {
                $to = $from;
            }
            if ($to !== '' && $from === '') {
                $from = $to;
            }
            if (strcmp($from, $to) > 0) {
                [$from, $to] = [$to, $from];
            }

            return [$from, $to, sprintf('Custom Range: %s - %s', $this->formatDateLabel($from), $this->formatDateLabel($to))];
        }

        return ['', '', 'All repayment records'];
    }

    private function isValidDate(string $date): bool
    {
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
            return false;
        }

        $parsed = \DateTimeImmutable::createFromFormat('!Y-m-d', $date);
        return $parsed instanceof \DateTimeImmutable && $parsed->format('Y-m-d') === $date;
    }

    private function formatDateLabel(string $date): string
    {
        try {
            return (new \DateTimeImmutable($date))->format('M j, Y');
        } catch (\Throwable $exception) {
            return $date;
        }
    }

    private function weekDateRange(string $week): array
    {
        if (!preg_match('/^(\d{4})-W(\d{2})$/', $week, $matches)) {
            $today = new \DateTimeImmutable('today');
            return [$today->modify('monday this week')->format('Y-m-d'), $today->modify('sunday this week')->format('Y-m-d')];
        }

        $start = (new \DateTimeImmutable())->setISODate((int) $matches[1], (int) $matches[2], 1);
        $end = $start->modify('+6 days');

        return [$start->format('Y-m-d'), $end->format('Y-m-d')];
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

    private function calendarQuarterMonthRange(int $year, int $quarter): array
    {
        $quarterIndex = min(max($quarter, 1), 4) - 1;
        $startMonthNumber = ($quarterIndex * 3) + 1;
        $startMonth = sprintf('%04d-%02d', $year, $startMonthNumber);
        $endMonth = sprintf('%04d-%02d', $year, $startMonthNumber + 2);

        return [$startMonth, $endMonth];
    }

    private function reportYearOptions(array $scheduledYears = []): array
    {
        $currentYear = (int) date('Y');
        $endYear = max($currentYear, 2029);
        $years = array_fill_keys(range($currentYear, $endYear), true);
        foreach ($scheduledYears as $year) {
            $year = (int) $year;
            if ($year > 0) {
                $years[$year] = true;
            }
        }

        $result = array_map('intval', array_keys($years));
        sort($result, SORT_NUMERIC);
        return $result;
    }

    private function fixedRepaymentTargetAmount(string $period, array $filters = [], ?string $periodKey = null): float
    {
        $monthlyTarget = $this->fixedRepaymentMonthlyTarget();

        return round($monthlyTarget * $this->fixedRepaymentTargetMonths($period, $filters, $periodKey), 2);
    }

    private function fixedRepaymentMonthlyTarget(): float
    {
        return self::FIXED_TARGET_BENEFICIARY_CAPACITY * self::MONTHLY_REPAYMENT_AMOUNT;
    }

    private function fixedRepaymentTargetAmountFromObligations(array $obligations, array $filters): float
    {
        $dueMonths = [];
        foreach ($obligations as $obligation) {
            if (!$this->repaymentTargetInReportRange($obligation, $filters)) {
                continue;
            }
            $dueMonth = (string) ($obligation['dueMonth'] ?? '');
            if (preg_match('/^\d{4}-\d{2}$/', $dueMonth)) {
                $dueMonths[$dueMonth] = true;
            }
        }

        return round($this->fixedRepaymentMonthlyTarget() * count($dueMonths), 2);
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

    private function appendLifecycleMetrics(array $summary, string $approvedAt, string $approvalDate = ''): array
    {
        $firstDueMonth = $this->deriveFirstDueMonthFromApproval($approvedAt, $approvalDate);
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
        $monthsPaidToDate = 0;
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
            $monthsPaid++;
            if (strcmp($month, $currentMonth) <= 0) {
                $monthsPaidToDate++;
                $paidAmountToDate += (float) (($summary['verifiedAmountByMonth'][$month] ?? 0.0));
            }
        }

        $calendarMonthsPassed = $monthsPassed;
        $remainingMonths = max(self::REPAYMENT_PLAN_MONTHS - $monthsPaid, 0);
        $rateDenominator = max($calendarMonthsPassed, $monthsPaid);
        $expectedToDateAmount = round($calendarMonthsPassed * self::MONTHLY_REPAYMENT_AMOUNT, 2);
        $gapToDateAmount = round($expectedToDateAmount - $paidAmountToDate, 2);

        $summary['firstDueMonth'] = $firstDueMonth;
        $summary['calendarMonthsPassed'] = $calendarMonthsPassed;
        $summary['monthsPassed'] = $rateDenominator;
        $summary['monthsPaid'] = $monthsPaid;
        $summary['monthsPaidToDate'] = $monthsPaidToDate;
        $summary['remainingMonths'] = $remainingMonths;
        $summary['paidAmountToDate'] = round($paidAmountToDate, 2);
        $summary['expectedToDateAmount'] = $expectedToDateAmount;
        $summary['gapToDateAmount'] = $gapToDateAmount;
        $summary['progressLabel'] = sprintf('%d / %d months', $monthsPaid, $rateDenominator);
        $summary['repaymentRate'] = $rateDenominator > 0 ? round(($monthsPaid / $rateDenominator) * 100, 2) : 0.0;
        $summary['monthsPaidFraction'] = sprintf('%d/%d', $monthsPaid, $rateDenominator);
        $summary['outstandingBalance'] = round(max((float) ($summary['obligationAmount'] ?? 15000.0) - (float) ($summary['paidAmount'] ?? 0.0), 0.0), 2);

        return $summary;
    }

    private function deriveFirstDueMonthFromApproval(string $approvedAt, string $approvalDate = ''): ?string
    {
        $anchor = trim($approvedAt) !== '' ? trim($approvedAt) : trim($approvalDate);
        if (!preg_match('/^\d{4}-\d{2}-\d{2}/', $anchor)) {
            return null;
        }

        return $this->shiftMonth(substr($anchor, 0, 7), 1);
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
        if (str_contains($text, 'food') || str_contains($text, 'beverage') || str_contains($text, 'balut') || str_contains($text, 'snack') || str_contains($text, 'eatery') || str_contains($text, 'carinderia') || str_contains($text, 'restaurant')) {
            return 'Homemade';
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
        ) {
            return 'Establishment';
        }
        if (
            str_contains($text, 'home')
            || str_contains($text, 'production')
            || str_contains($text, 'homemade')
            || str_contains($text, 'processing')
        ) {
            return 'Homemade';
        }

        return 'Establishment';
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

    private function isCurrentApplicantStatus(string $status): bool
    {
        $normalized = strtolower(trim(str_replace('_', ' ', $status)));
        if ($normalized === '') {
            return false;
        }

        return !in_array($normalized, [
            'draft',
            'completed',
            'rejected',
            'denied',
            'cancelled',
            'canceled',
            'withdrawn',
            'archived',
        ], true);
    }

    private function deduplicatePopulationRecords(array $records): array
    {
        $deduped = [];
        foreach ($records as $record) {
            $email = strtolower(trim((string) ($record['email'] ?? '')));
            $applicantProfileId = (int) ($record['applicantProfileId'] ?? 0);
            $key = $email !== '' ? 'email:' . $email : 'applicant:' . $applicantProfileId;
            if ($key === 'applicant:0') {
                $key = 'record:' . count($deduped);
            }

            if (!isset($deduped[$key])) {
                $deduped[$key] = $record;
                continue;
            }

            $existingIsBeneficiary = (bool) ($deduped[$key]['isBeneficiary'] ?? false);
            $incomingIsBeneficiary = (bool) ($record['isBeneficiary'] ?? false);
            if ($incomingIsBeneficiary && !$existingIsBeneficiary) {
                $deduped[$key] = $record;
                continue;
            }

            $existingActivity = (string) ($deduped[$key]['lastActivity'] ?? '');
            $incomingActivity = (string) ($record['lastActivity'] ?? '');
            if ($incomingActivity !== '' && strcmp($incomingActivity, $existingActivity) > 0) {
                $deduped[$key] = $record;
            }
        }

        return array_values($deduped);
    }

    private function beneficiaryIdsFromRecords(array $records): array
    {
        $ids = [];
        foreach ($records as $record) {
            if (!((bool) ($record['isBeneficiary'] ?? false))) {
                continue;
            }
            $beneficiaryId = (int) ($record['beneficiaryId'] ?? 0);
            if ($beneficiaryId > 0) {
                $ids[$beneficiaryId] = true;
            }
        }

        return array_keys($ids);
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
