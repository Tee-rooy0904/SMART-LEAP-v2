<?php
declare(strict_types=1);

require __DIR__ . '/../app/bootstrap.php';

$pdo = db();

$statement = $pdo->prepare(
    'UPDATE applicant_profiles
     INNER JOIN users ON users.id = applicant_profiles.user_id
     SET applicant_profiles.sector = :sector,
         applicant_profiles.sector_other_specify = NULL,
         applicant_profiles.updated_at = NOW()
     WHERE users.email LIKE :applicant_pattern
        OR users.email LIKE :beneficiary_pattern'
);

$statement->execute([
    'sector' => 'None',
    'applicant_pattern' => 'seed.applicant.%@smartleap.local',
    'beneficiary_pattern' => 'seed.beneficiary.%@smartleap.local',
]);

$distributionStatement = $pdo->query(
    "SELECT applicant_profiles.sector, COUNT(*) AS total
     FROM applicant_profiles
     INNER JOIN users ON users.id = applicant_profiles.user_id
     WHERE users.email LIKE 'seed.applicant.%@smartleap.local'
        OR users.email LIKE 'seed.beneficiary.%@smartleap.local'
     GROUP BY applicant_profiles.sector
     ORDER BY total DESC, applicant_profiles.sector ASC"
);

$distribution = [];
foreach ($distributionStatement ?: [] as $row) {
    $distribution[] = [
        'sector' => (string) ($row['sector'] ?? ''),
        'total' => (int) ($row['total'] ?? 0),
    ];
}

echo json_encode([
    'ok' => true,
    'updatedApplicantProfiles' => $statement->rowCount(),
    'sector' => 'None',
    'sectorDistribution' => $distribution,
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), PHP_EOL;
