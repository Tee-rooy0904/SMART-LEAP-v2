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

        fclose($stream);
        exit;
    }

    private function csvExcelText(mixed $value): string
    {
        $text = trim((string) $value);
        return $text === '' ? '' : "\t" . $text;
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
            'month' => $_GET['month'] ?? '',
            'quarter' => $_GET['quarter'] ?? '',
            'year' => $_GET['year'] ?? '',
            'repaymentYear' => $_GET['repaymentYear'] ?? '',
            'trainingSession' => $_GET['trainingSession'] ?? '',
            'trainingGroup' => $_GET['trainingGroup'] ?? '',
        ];
    }

    private function resolveReport(array $filters): array
    {
        $actor = auth_user() ?? [];
        $role = strtolower(trim((string) ($actor['role'] ?? '')));
        if ($role === ROLE_PROJECT_OFFICER || $role === 'project_officer') {
            return (new ReportService())->buildForProjectOfficer($actor, $filters);
        }

        return (new ReportService())->build($filters);
    }

    private function buildExcelMarkup(array $report): string
    {
        $summary = $report['summary']['repaymentPerformance'] ?? ($report['repaymentAnalytics']['periodMetrics'] ?? []);
        $records = $report['records'] ?? [];

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
            . '</body></html>';
    }
}
