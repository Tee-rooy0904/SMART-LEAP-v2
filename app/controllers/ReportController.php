<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Services\ReportService;

class ReportController extends Controller
{
    public function data(): never
    {
        response_json([
            'ok' => true,
            'data' => $this->resolveReport($this->filtersFromRequest()),
        ]);
    }

    public function exportCsv(): never
    {
        $report = $this->resolveReport($this->filtersFromRequest());
        $filename = 'smart-leap-report-' . date('Ymd-His') . '.csv';

        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="' . $filename . '"');

        $stream = fopen('php://output', 'wb');
        if ($stream === false) {
            exit;
        }

        fwrite($stream, "\xEF\xBB\xBF");
        $periodMetrics = $this->csvPeriodMetricsByBeneficiary($report['repaymentAnalytics']['obligations'] ?? []);
        $periodLabel = (string) (($report['filters']['periodLabel'] ?? '') ?: 'Selected period');
        fputcsv($stream, [
            'Record ID',
            'Population Stage',
            'Beneficiary Profile ID',
            'Name',
            'Email',
            'Contact Number',
            'Business Name',
            'Barangay',
            'Assigned PDO',
            'Specific Category',
            'General Category',
            'Sector',
            'Gender',
            'Age',
            'Age Group',
            'Program Status',
            'Approval Date',
            'Last Activity',
            'Repayment Key',
            'Repayment Status',
            'Verified Amount',
            'Expected To Date',
            'Gap To Date',
            'Months Passed',
            'Months Paid',
            'Repayment Rate Percent',
            'Latest Repayment Activity',
            'Report Period',
            'Period Obligation Count',
            'Period Target Amount',
            'Period Actual Collected',
            'Period Gap Amount',
            'Period ROI Percent',
        ]);

        foreach (($report['records'] ?? []) as $record) {
            $repayment = $record['repayment'] ?? [];
            $beneficiaryId = (int) ($record['id'] ?? 0);
            $period = $periodMetrics[$beneficiaryId] ?? [
                'count' => 0,
                'target' => 0.0,
                'actual' => 0.0,
                'gap' => 0.0,
                'roi' => 0.0,
            ];
            fputcsv($stream, [
                $beneficiaryId,
                (string) ($record['populationStage'] ?? ''),
                $record['beneficiaryId'] ?? '',
                (string) ($record['name'] ?? ''),
                (string) ($record['email'] ?? ''),
                $this->csvExcelText($record['contactNumber'] ?? ''),
                (string) ($record['businessName'] ?? ''),
                (string) ($record['barangay'] ?? ''),
                (string) ($record['assignedPdo'] ?? ''),
                (string) ($record['businessType'] ?? ''),
                (string) ($record['serviceType'] ?? ''),
                (string) ($record['sector'] ?? ''),
                (string) ($record['gender'] ?? ''),
                $record['age'] ?? '',
                (string) ($record['ageGroup'] ?? ''),
                (string) ($record['programStatus'] ?? ''),
                $this->csvExcelText($record['approvalDate'] ?? ''),
                $this->csvExcelText($record['lastActivity'] ?? ''),
                (string) ($repayment['key'] ?? ''),
                (string) ($repayment['label'] ?? ''),
                (float) ($repayment['paidAmount'] ?? 0),
                (float) ($repayment['expectedToDateAmount'] ?? 0),
                (float) ($repayment['gapToDateAmount'] ?? 0),
                (int) ($repayment['monthsPassed'] ?? 0),
                (int) ($repayment['monthsPaid'] ?? 0),
                (float) ($repayment['repaymentRate'] ?? 0),
                $this->csvExcelText($repayment['latestActivity'] ?? ''),
                $periodLabel,
                (int) $period['count'],
                (float) $period['target'],
                (float) $period['actual'],
                (float) $period['gap'],
                (float) $period['roi'],
            ]);
        }

        fputcsv($stream, []);
        fputcsv($stream, ['Repayment Period Breakdown']);
        fputcsv($stream, ['Period', 'Target Amount', 'Actual Collected', 'Gap Amount', 'ROI Percent']);
        $periodBreakdown = (string) (($report['filters']['period'] ?? 'monthly')) === 'monthly'
            ? ($report['repaymentAnalytics']['monthlyBreakdown'] ?? [])
            : ($report['repaymentAnalytics']['breakdown'] ?? []);
        foreach ($periodBreakdown as $row) {
            fputcsv($stream, [
                (string) ($row['label'] ?? $row['period'] ?? ''),
                (float) ($row['targetAmount'] ?? 0),
                (float) ($row['actualCollectedAmount'] ?? 0),
                (float) ($row['gapAmount'] ?? 0),
                (float) ($row['roiPercent'] ?? 0),
            ]);
        }

        $summary = is_array($report['summary'] ?? null) ? $report['summary'] : [];
        $this->writeCsvDistributionSection($stream, 'Donut Chart Data - Gender Segregation', $summary['genderDistribution'] ?? []);
        $this->writeCsvDistributionSection($stream, 'Donut Chart Data - Service Type Distribution', $summary['serviceTypeDistribution'] ?? []);
        $this->writeCsvDistributionSection($stream, 'Donut Chart Data - Sector Distribution', $summary['sectorDistribution'] ?? []);
        $this->writeCsvDemographicParticipantsSection($stream, $report['records'] ?? []);

        $trainingRows = $report['trainingAnalytics']['rows'] ?? [];
        fputcsv($stream, []);
        fputcsv($stream, ['Payment Participants']);
        fputcsv($stream, [
            'Beneficiary',
            'Business',
            'Barangay',
            'Assigned PDO',
            'Coverage Month',
            'Payment Date',
            'Expected Amount (PHP)',
            'Amount Paid (PHP)',
            'Status',
        ]);
        $obligations   = is_array($report['repaymentAnalytics']['obligations'] ?? null) ? $report['repaymentAnalytics']['obligations'] : [];
        $csvPeriod      = (string) ($report['filters']['period'] ?? 'monthly');
        $usePayDate     = $csvPeriod === 'custom';
        $paymentCsvRows = [];
        foreach ($obligations as $ob) {
            $hasActivity = in_array((string) ($ob['status'] ?? ''), ['paid_on_time', 'partial_delayed', 'pending_verification'], true);
            if ($usePayDate) {
                foreach ((array) ($ob['verifiedPayments'] ?? []) as $payment) {
                    $paymentCsvRows[] = [
                        (string) ($ob['beneficiaryName'] ?? ''),
                        (string) ($ob['businessName'] ?? ''),
                        (string) ($ob['barangay'] ?? ''),
                        (string) ($ob['assignedPdo'] ?? ''),
                        (string) ($ob['dueMonth'] ?? ''),
                        $this->csvExcelText($payment['paymentDate'] ?? ''),
                        (float)  ($ob['expectedAmount'] ?? 0),
                        (float)  ($payment['amount'] ?? 0),
                        (string) ($ob['statusLabel'] ?? $ob['status'] ?? ''),
                    ];
                }
            } elseif ($hasActivity) {
                $paymentCsvRows[] = [
                    (string) ($ob['beneficiaryName'] ?? ''),
                    (string) ($ob['businessName'] ?? ''),
                    (string) ($ob['barangay'] ?? ''),
                    (string) ($ob['assignedPdo'] ?? ''),
                    (string) ($ob['dueMonth'] ?? ''),
                    $this->csvExcelText($ob['paymentDate'] ?? ''),
                    (float)  ($ob['expectedAmount'] ?? 0),
                    (float)  ($ob['amountRepresented'] ?? 0),
                    (string) ($ob['statusLabel'] ?? $ob['status'] ?? ''),
                ];
            }
        }
        usort($paymentCsvRows, static fn (array $a, array $b): int => strcmp((string) ($a[4] ?? ''), (string) ($b[4] ?? '')) ?: strcmp((string) ($a[0] ?? ''), (string) ($b[0] ?? '')));
        foreach ($paymentCsvRows as $row) {
            $row[4] = $this->formatCoverageMonth($row[4] ?? '');
            fputcsv($stream, $row);
        }

        fputcsv($stream, []);
        fputcsv($stream, ['Training Attendance']);
        fputcsv($stream, [
            'Participant Name',
            'Business Name',
            'Session Number',
            'Group Number',
            'Assigned PDO',
            'Activity Name',
            'Location',
            'Start Date & Time',
            'End Date & Time',
            'Attendance',
            'Proof',
            'Remarks',
        ]);
        foreach ($trainingRows as $row) {
            fputcsv($stream, [
                (string) ($row['participantName'] ?? ''),
                (string) ($row['businessName'] ?? ''),
                (int) ($row['sessionNumber'] ?? 0),
                (int) ($row['groupNumber'] ?? 0),
                (string) ($row['assignedPdo'] ?? ''),
                (string) ($row['activityName'] ?? ''),
                (string) ($row['location'] ?? ''),
                $this->csvExcelText($row['startsAt'] ?? ''),
                $this->csvExcelText($row['endsAt'] ?? ''),
                (string) ($row['status'] ?? ''),
                (string) (($row['proofName'] ?? '') ?: ($row['proofPath'] ?? '')),
                (string) ($row['remarks'] ?? ''),
            ]);
        }

        fclose($stream);
        exit;
    }

    private function csvExcelText(mixed $value): string
    {
        $text = trim((string) $value);
        return $text === '' ? '' : "\t" . $text;
    }

    private function formatCoverageMonth(mixed $value): string
    {
        $month = trim((string) $value);
        if (preg_match('/^\d{4}-\d{2}$/', $month) !== 1) {
            return $month;
        }

        $date = \DateTimeImmutable::createFromFormat('!Y-m-d', $month . '-01');
        return $date instanceof \DateTimeImmutable ? $date->format('F Y') : $month;
    }

    private function writeCsvDistributionSection(mixed $stream, string $title, mixed $rows): void
    {
        $list = is_array($rows) ? $rows : [];
        $total = array_reduce($list, static function (float $sum, mixed $row): float {
            $data = (array) $row;
            return $sum + (float) ($data['count'] ?? 0);
        }, 0.0);

        fputcsv($stream, []);
        fputcsv($stream, [$title]);
        fputcsv($stream, ['Label', 'Count', 'Percentage']);

        if ($list === [] || $total <= 0) {
            fputcsv($stream, ['No data available', 0, 0]);
            return;
        }

        foreach ($list as $row) {
            $data = (array) $row;
            $count = (float) ($data['count'] ?? 0);
            fputcsv($stream, [
                (string) ($data['label'] ?? 'Not Set'),
                $count,
                round(($count / $total) * 100, 2),
            ]);
        }
    }

    private function writeCsvDemographicParticipantsSection(mixed $stream, mixed $records): void
    {
        $rows = is_array($records) ? $records : [];
        usort($rows, static fn(array $a, array $b): int => strcmp((string) ($a['populationStage'] ?? ''), (string) ($b['populationStage'] ?? ''))
            ?: strcmp((string) ($a['name'] ?? ''), (string) ($b['name'] ?? '')));

        fputcsv($stream, []);
        fputcsv($stream, ['Demographic Participants']);
        fputcsv($stream, [
            'Population',
            'Name',
            'Email',
            'Business Name',
            'Barangay',
            'Assigned PDO',
            'Service Type',
            'Sector',
            'Gender',
            'Program Status',
        ]);

        if ($rows === []) {
            fputcsv($stream, ['No applicant or beneficiary records found for the selected filters.']);
            return;
        }

        foreach ($rows as $row) {
            fputcsv($stream, [
                (string) ($row['populationStage'] ?? ((bool) ($row['isBeneficiary'] ?? false) ? 'Beneficiary' : 'Applicant')),
                (string) ($row['name'] ?? ''),
                (string) ($row['email'] ?? ''),
                (string) ($row['businessName'] ?? ''),
                (string) ($row['barangay'] ?? ''),
                (string) ($row['assignedPdo'] ?? ''),
                (string) ($row['serviceType'] ?? ''),
                (string) ($row['sector'] ?? ''),
                (string) ($row['gender'] ?? ''),
                (string) ($row['programStatus'] ?? ''),
            ]);
        }
    }

    private function csvPeriodMetricsByBeneficiary(array $obligations): array
    {
        $metrics = [];
        foreach ($obligations as $obligation) {
            $beneficiaryId = (int) ($obligation['beneficiaryId'] ?? 0);
            if ($beneficiaryId <= 0) {
                continue;
            }
            if (!isset($metrics[$beneficiaryId])) {
                $metrics[$beneficiaryId] = [
                    'count' => 0,
                    'target' => 0.0,
                    'actual' => 0.0,
                    'gap' => 0.0,
                    'roi' => 0.0,
                ];
            }

            $expected = (float) ($obligation['expectedAmount'] ?? 0);
            $actual = in_array((string) ($obligation['status'] ?? ''), ['paid_on_time', 'partial_delayed'], true)
                ? (float) ($obligation['amountRepresented'] ?? 0)
                : 0.0;
            $metrics[$beneficiaryId]['count']++;
            $metrics[$beneficiaryId]['target'] += $expected;
            $metrics[$beneficiaryId]['actual'] += $actual;
        }

        foreach ($metrics as &$metric) {
            $metric['target'] = round((float) $metric['target'], 2);
            $metric['actual'] = round((float) $metric['actual'], 2);
            $metric['gap'] = round($metric['target'] - $metric['actual'], 2);
            $metric['roi'] = $metric['target'] > 0 ? round(($metric['actual'] / $metric['target']) * 100, 2) : 0.0;
        }
        unset($metric);

        return $metrics;
    }

    public function exportExcel(): never
    {
        $report = $this->resolveReport($this->filtersFromRequest());
        $filename = 'smart-leap-report-' . date('Ymd-His') . '.xls';

        header('Content-Type: application/vnd.ms-excel; charset=UTF-8');
        header('Content-Disposition: attachment; filename="' . $filename . '"');

        echo $this->buildExcelMarkup($report);
        exit;
    }

    public function exportPdf(): never
    {
        $this->view('reports/print', [
            'authUser' => auth_user(),
            'report' => $this->resolveReport($this->filtersFromRequest()),
            'filters' => $this->filtersFromRequest(),
            'autoPrint' => isset($_GET['autoprint']) && $_GET['autoprint'] === '1',
        ]);
    }

    private function filtersFromRequest(): array
    {
        return [
            'from' => $_GET['from'] ?? '',
            'to' => $_GET['to'] ?? '',
            'district' => $_GET['district'] ?? '',
            'barangay' => $_GET['barangay'] ?? '',
            'serviceType' => $_GET['serviceType'] ?? ($_GET['businessType'] ?? ''),
            'businessType' => $_GET['businessType'] ?? ($_GET['serviceType'] ?? ''),
            'sector' => $_GET['sector'] ?? '',
            'gender' => $_GET['gender'] ?? '',
            'ageGroup' => $_GET['ageGroup'] ?? '',
            'pdo' => $_GET['pdo'] ?? '',
            'repayment' => $_GET['repayment'] ?? '',
            'period' => $_GET['period'] ?? '',
            'date' => $_GET['date'] ?? '',
            'week' => $_GET['week'] ?? '',
            'month' => $_GET['month'] ?? '',
            'quarter' => $_GET['quarter'] ?? '',
            'year' => $_GET['year'] ?? '',
            'repaymentYear' => $_GET['repaymentYear'] ?? '',
            'search' => $_GET['search'] ?? '',
            'trainingSession' => $_GET['trainingSession'] ?? '',
            'trainingGroup' => $_GET['trainingGroup'] ?? '',
        ];
    }

    private function resolveReport(array $filters): array
    {
        $actor = auth_user() ?? [];
        // Compare against the constant directly — do NOT lowercase, because ROLE_PROJECT_OFFICER
        // is 'Project Officer' (with a space and mixed case) and strtolower would produce
        // 'project officer' which matches neither the constant nor 'project_officer'.
        $role = (string) ($actor['role'] ?? '');
        if ($role === ROLE_PROJECT_OFFICER) {
            return (new ReportService())->buildForProjectOfficer($actor, $filters);
        }

        return (new ReportService())->build($filters);
    }

    private function buildExcelMarkup(array $report): string
    {
        $summary = $report['summary']['repaymentPerformance'] ?? ($report['repaymentAnalytics']['periodMetrics'] ?? []);
        $records = $report['records'] ?? [];
        $trainingRows = $report['trainingAnalytics']['rows'] ?? [];

        $rows = array_map(function (array $record): string {
            $repayment = $record['repayment'] ?? [];
            return '<tr>'
                . '<td>' . htmlspecialchars((string) ($record['populationStage'] ?? ''), ENT_QUOTES) . '</td>'
                . '<td>' . htmlspecialchars((string) ($record['name'] ?? ''), ENT_QUOTES) . '</td>'
                . '<td>' . htmlspecialchars((string) ($record['email'] ?? ''), ENT_QUOTES) . '</td>'
                . '<td>' . htmlspecialchars((string) ($record['barangay'] ?? ''), ENT_QUOTES) . '</td>'
                . '<td>' . htmlspecialchars((string) ($record['assignedPdo'] ?? ''), ENT_QUOTES) . '</td>'
                . '<td>' . htmlspecialchars((string) ($record['serviceType'] ?? ''), ENT_QUOTES) . '</td>'
                . '<td>' . htmlspecialchars((string) ($record['gender'] ?? ''), ENT_QUOTES) . '</td>'
                . '<td>' . htmlspecialchars((string) ($record['age'] ?? ''), ENT_QUOTES) . '</td>'
                . '<td>' . htmlspecialchars((string) ($record['ageGroup'] ?? ''), ENT_QUOTES) . '</td>'
                . '<td>' . htmlspecialchars((string) ($record['programStatus'] ?? ''), ENT_QUOTES) . '</td>'
                . '<td>' . htmlspecialchars((string) ($repayment['label'] ?? ''), ENT_QUOTES) . '</td>'
                . '<td>' . htmlspecialchars(number_format((float) ($repayment['paidAmount'] ?? 0), 2), ENT_QUOTES) . '</td>'
                . '<td>' . htmlspecialchars((string) ($repayment['monthsPassed'] ?? 0), ENT_QUOTES) . '</td>'
                . '<td>' . htmlspecialchars((string) ($repayment['monthsPaid'] ?? 0), ENT_QUOTES) . '</td>'
                . '<td>' . htmlspecialchars((string) ($repayment['repaymentRate'] ?? 0), ENT_QUOTES) . '</td>'
                . '<td>' . htmlspecialchars(number_format((float) ($repayment['expectedToDateAmount'] ?? 0), 2), ENT_QUOTES) . '</td>'
                . '<td>' . htmlspecialchars(number_format((float) ($repayment['gapToDateAmount'] ?? 0), 2), ENT_QUOTES) . '</td>'
                . '</tr>';
        }, $records);

        $trainingTableRows = array_map(static function (array $row): string {
            return '<tr>'
                . '<td>' . htmlspecialchars((string) ($row['participantName'] ?? ''), ENT_QUOTES) . '</td>'
                . '<td>' . htmlspecialchars((string) ($row['businessName'] ?? ''), ENT_QUOTES) . '</td>'
                . '<td>' . htmlspecialchars((string) ($row['sessionNumber'] ?? ''), ENT_QUOTES) . '</td>'
                . '<td>' . htmlspecialchars((string) ($row['groupNumber'] ?? ''), ENT_QUOTES) . '</td>'
                . '<td>' . htmlspecialchars((string) ($row['assignedPdo'] ?? ''), ENT_QUOTES) . '</td>'
                . '<td>' . htmlspecialchars((string) ($row['activityName'] ?? ''), ENT_QUOTES) . '</td>'
                . '<td>' . htmlspecialchars((string) ($row['location'] ?? ''), ENT_QUOTES) . '</td>'
                . '<td>' . htmlspecialchars((string) ($row['startsAt'] ?? ''), ENT_QUOTES) . '</td>'
                . '<td>' . htmlspecialchars((string) ($row['endsAt'] ?? ''), ENT_QUOTES) . '</td>'
                . '<td>' . htmlspecialchars((string) ($row['status'] ?? ''), ENT_QUOTES) . '</td>'
                . '<td>' . htmlspecialchars((string) (($row['proofName'] ?? '') ?: ($row['proofPath'] ?? '')), ENT_QUOTES) . '</td>'
                . '<td>' . htmlspecialchars((string) ($row['remarks'] ?? ''), ENT_QUOTES) . '</td>'
                . '</tr>';
        }, is_array($trainingRows) ? $trainingRows : []);

        return '<html><head><meta charset="UTF-8"><style>'
            . 'body{font-family:Arial,sans-serif;font-size:12px;color:#102347;}'
            . 'table{border-collapse:collapse;width:100%;}'
            . 'th,td{border:1px solid #cbd5e1;padding:8px;vertical-align:top;}'
            . 'th{background:#eff6ff;text-align:left;}'
            . '.summary{margin-bottom:18px;}'
            . '.summary td{width:25%;font-weight:700;}'
            . '</style></head><body>'
            . '<h2>SMART LEAP Report Export</h2>'
            . '<p>Generated ' . htmlspecialchars(date('M j, Y g:i A'), ENT_QUOTES) . '</p>'
            . '<table class="summary"><tr>'
            . '<td>Target Amount: ' . htmlspecialchars(number_format((float) ($summary['targetAmount'] ?? 0), 2), ENT_QUOTES) . '</td>'
            . '<td>Actual Collected: ' . htmlspecialchars(number_format((float) ($summary['actualCollectedAmount'] ?? 0), 2), ENT_QUOTES) . '</td>'
            . '<td>Gap: ' . htmlspecialchars(number_format((float) ($summary['gapAmount'] ?? 0), 2), ENT_QUOTES) . '</td>'
            . '<td>ROI: ' . htmlspecialchars(number_format((float) ($summary['roiPercent'] ?? 0), 2), ENT_QUOTES) . '%</td>'
            . '</tr></table>'
            . '<table><thead><tr>'
            . '<th>Population Stage</th><th>Name</th><th>Email</th><th>Barangay</th><th>Assigned PDO</th><th>Service Type</th><th>Gender</th><th>Age</th><th>Age Group</th><th>Program Status</th><th>Repayment Status</th><th>Verified Amount</th><th>Months Passed</th><th>Months Paid</th><th>Repayment Rate (%)</th><th>Expected To Date</th><th>Gap To Date</th>'
            . '</tr></thead><tbody>'
            . implode('', $rows)
            . '</tbody></table>'
            . '<h3>Payment Participants</h3>'
            . '<table><thead><tr>'
            . '<th>Beneficiary</th><th>Business</th><th>Barangay</th><th>Assigned PDO</th><th>Coverage Month</th><th>Payment Date</th><th>Expected (PHP)</th><th>Amount Paid (PHP)</th><th>Status</th>'
            . '</tr></thead><tbody>'
            . (static function () use ($report): string {
                $obligations = is_array($report['repaymentAnalytics']['obligations'] ?? null) ? $report['repaymentAnalytics']['obligations'] : [];
                $xlPeriod    = (string) ($report['filters']['period'] ?? 'monthly');
                $usePayDate  = in_array($xlPeriod, ['daily', 'weekly', 'custom'], true);
                $xlRows      = [];
                foreach ($obligations as $ob) {
                    $hasActivity = in_array((string) ($ob['status'] ?? ''), ['paid_on_time', 'partial_delayed', 'pending_verification'], true);
                    if ($usePayDate) {
                        foreach ((array) ($ob['verifiedPayments'] ?? []) as $payment) {
                            $xlRows[] = '<tr>'
                                . '<td>' . htmlspecialchars((string) ($ob['beneficiaryName'] ?? ''), ENT_QUOTES) . '</td>'
                                . '<td>' . htmlspecialchars((string) ($ob['businessName'] ?? ''), ENT_QUOTES) . '</td>'
                                . '<td>' . htmlspecialchars((string) ($ob['barangay'] ?? ''), ENT_QUOTES) . '</td>'
                                . '<td>' . htmlspecialchars((string) ($ob['assignedPdo'] ?? ''), ENT_QUOTES) . '</td>'
                                . '<td>' . htmlspecialchars((string) ($ob['dueMonth'] ?? ''), ENT_QUOTES) . '</td>'
                                . '<td>' . htmlspecialchars((string) ($payment['paymentDate'] ?? ''), ENT_QUOTES) . '</td>'
                                . '<td>' . htmlspecialchars(number_format((float) ($ob['expectedAmount'] ?? 0), 2), ENT_QUOTES) . '</td>'
                                . '<td>' . htmlspecialchars(number_format((float) ($payment['amount'] ?? 0), 2), ENT_QUOTES) . '</td>'
                                . '<td>' . htmlspecialchars((string) ($ob['statusLabel'] ?? $ob['status'] ?? ''), ENT_QUOTES) . '</td>'
                                . '</tr>';
                        }
                    } elseif ($hasActivity) {
                        $xlRows[] = '<tr>'
                            . '<td>' . htmlspecialchars((string) ($ob['beneficiaryName'] ?? ''), ENT_QUOTES) . '</td>'
                            . '<td>' . htmlspecialchars((string) ($ob['businessName'] ?? ''), ENT_QUOTES) . '</td>'
                            . '<td>' . htmlspecialchars((string) ($ob['barangay'] ?? ''), ENT_QUOTES) . '</td>'
                            . '<td>' . htmlspecialchars((string) ($ob['assignedPdo'] ?? ''), ENT_QUOTES) . '</td>'
                            . '<td>' . htmlspecialchars((string) ($ob['dueMonth'] ?? ''), ENT_QUOTES) . '</td>'
                            . '<td>' . htmlspecialchars((string) ($ob['paymentDate'] ?? ''), ENT_QUOTES) . '</td>'
                            . '<td>' . htmlspecialchars(number_format((float) ($ob['expectedAmount'] ?? 0), 2), ENT_QUOTES) . '</td>'
                            . '<td>' . htmlspecialchars(number_format((float) ($ob['amountRepresented'] ?? 0), 2), ENT_QUOTES) . '</td>'
                            . '<td>' . htmlspecialchars((string) ($ob['statusLabel'] ?? $ob['status'] ?? ''), ENT_QUOTES) . '</td>'
                            . '</tr>';
                    }
                }
                return $xlRows !== []
                    ? implode('', $xlRows)
                    : '<tr><td colspan="9">No verified payments for the selected period.</td></tr>';
            })()
            . '</tbody></table>'
            . '<h3>Training Attendance</h3>'
            . '<table><thead><tr>'
            . '<th>Participant Name</th><th>Business Name</th><th>Session</th><th>Group</th><th>Assigned PDO</th><th>Activity Name</th><th>Location</th><th>Starts At</th><th>Ends At</th><th>Attendance</th><th>Proof</th><th>Remarks</th>'
            . '</tr></thead><tbody>'
            . ($trainingTableRows !== [] ? implode('', $trainingTableRows) : '<tr><td colspan="12">No training attendance rows for the selected filters.</td></tr>')
            . '</tbody></table>'
            . '</body></html>';
    }
}
