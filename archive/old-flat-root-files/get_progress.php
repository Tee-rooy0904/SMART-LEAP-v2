<?php
declare(strict_types=1);

header('Content-Type: application/json');

$userId = isset($_GET['user_id']) ? (int)$_GET['user_id'] : 0;
if ($userId <= 0) {
    echo json_encode(['ok' => true, 'steps' => []]);
    exit;
}

if (!file_exists(__DIR__ . '/db_config.php')) {
    echo json_encode(['ok' => true, 'steps' => []]);
    exit;
}

require_once __DIR__ . '/db_config.php';

try {
    $db = get_db_connection();
    $stmt = $db->prepare(
        'SELECT fs.step_number, fs.status, fs.data_json, fs.admin_comment
         FROM smartleap_form_submissions s
         LEFT JOIN smartleap_form_steps fs ON fs.submission_id = s.id
         WHERE s.user_id = ?
         ORDER BY fs.step_number ASC'
    );
    $stmt->execute([$userId]);
    $rows = $stmt->fetchAll();

    $steps = [];
    foreach ($rows as $row) {
        if (!isset($row['step_number'])) {
            continue;
        }
        $steps[] = [
            'step' => (int)$row['step_number'],
            'status' => $row['status'] ?? 'Not started',
            'data' => json_decode((string)($row['data_json'] ?? '{}'), true) ?: [],
            'admin_comment' => $row['admin_comment'] ?? null
        ];
    }

    echo json_encode(['ok' => true, 'steps' => $steps]);
} catch (Throwable $e) {
    echo json_encode(['ok' => true, 'steps' => []]);
}
