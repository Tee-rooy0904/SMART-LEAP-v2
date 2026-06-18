<?php
declare(strict_types=1);

require __DIR__ . '/../app/bootstrap.php';

use App\Services\ReportService;

function user_by_name(string $fullName): array
{
    $statement = db()->prepare('SELECT id, full_name, email, role_id FROM users WHERE full_name = :full_name LIMIT 1');
    $statement->execute(['full_name' => $fullName]);
    $row = $statement->fetch(PDO::FETCH_ASSOC);
    if (!is_array($row)) {
        return [];
    }

    $roleStatement = db()->prepare('SELECT name FROM roles WHERE id = :id LIMIT 1');
    $roleStatement->execute(['id' => (int) ($row['role_id'] ?? 0)]);
    $row['role'] = (string) ($roleStatement->fetchColumn() ?: '');
    return $row;
}

function repayment_metrics(array $report): array
{
    return $report['repaymentAnalytics']['summary'] ?? [];
}

$service = new ReportService();
$year = (int) date('Y');
$month = date('Y-m');

$adminMonthly = repayment_metrics($service->build([
    'period' => 'monthly',
    'month' => $month,
    'year' => $year,
    'repaymentYear' => 1,
]));

$adminQuarterly = repayment_metrics($service->build([
    'period' => 'quarterly',
    'quarter' => 1,
    'year' => $year,
    'repaymentYear' => 1,
]));

$adminYearly = repayment_metrics($service->build([
    'period' => 'yearly',
    'year' => $year,
    'repaymentYear' => 1,
]));

$pdoActor = user_by_name('Brian Neil Cruz');
$pdoMonthly = $pdoActor !== []
    ? repayment_metrics($service->buildForProjectOfficer($pdoActor, [
        'period' => 'monthly',
        'month' => $month,
        'year' => $year,
        'repaymentYear' => 1,
    ]))
    : [];

echo json_encode([
    'generated_at' => date('c'),
    'admin_sw' => [
        'monthly_target' => $adminMonthly['targetAmount'] ?? null,
        'quarterly_target' => $adminQuarterly['targetAmount'] ?? null,
        'yearly_target' => $adminYearly['targetAmount'] ?? null,
    ],
    'pdo_sample' => [
        'actor' => $pdoActor['full_name'] ?? null,
        'monthly_target' => $pdoMonthly['targetAmount'] ?? null,
        'scoped_beneficiaries' => $pdoMonthly['scopedBeneficiaries'] ?? null,
    ],
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), PHP_EOL;
