<?php
require __DIR__ . '/app/bootstrap.php';
$pdo = db();

$count = (int) $pdo->query('SELECT COUNT(*) FROM attendance_records')->fetchColumn();
echo 'attendance_records_count=' . $count . PHP_EOL;

$rows = $pdo->query('SELECT attendance_status, COUNT(*) c FROM attendance_records GROUP BY attendance_status LIMIT 50')->fetchAll(PDO::FETCH_ASSOC) ?: [];
foreach ($rows as $r) {
    $status = (string) ($r['attendance_status'] ?? '');
    $c = (int) ($r['c'] ?? 0);
    echo 'status=' . $status . ', c=' . $c . PHP_EOL;
}

