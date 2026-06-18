<?php
declare(strict_types=1);
header('Content-Type: application/json');
if (!file_exists(__DIR__ . '/db_config.php')) {
    http_response_code(503);
    echo json_encode(['ok' => false, 'error' => 'Storage backend unavailable']);
    exit;
}
require_once __DIR__ . '/db_config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'Invalid method']);
    exit;
}

$payload = json_decode(file_get_contents('php://input'), true);
if (!is_array($payload)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Invalid payload']);
    exit;
}

$userId = (int)($payload['user_id'] ?? 0);
$stepNumber = (int)($payload['step'] ?? 0);
$data = $payload['data'] ?? [];
$totals = $payload['totals'] ?? [];

if ($userId <= 0 || $stepNumber < 1 || $stepNumber > 6) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Missing user or step']);
    exit;
}

try {
    $db = get_db_connection();
    $db->beginTransaction();

    $stmt = $db->prepare('SELECT id FROM smartleap_form_submissions WHERE user_id = ? LIMIT 1');
    $stmt->execute([$userId]);
    $submission = $stmt->fetch();

    if (!$submission) {
        $stmt = $db->prepare('INSERT INTO smartleap_form_submissions (user_id, status, full_name, email) VALUES (?, ?, ?, ?)');
        $stmt->execute([$userId, 'Draft', $payload['full_name'] ?? null, $payload['email'] ?? null]);
        $submissionId = (int)$db->lastInsertId();
    } else {
        $submissionId = (int)$submission['id'];
    }

    $stepStmt = $db->prepare('SELECT id FROM smartleap_form_steps WHERE submission_id = ? AND step_number = ? LIMIT 1');
    $stepStmt->execute([$submissionId, $stepNumber]);
    $existingStep = $stepStmt->fetch();

    if ($existingStep) {
        $update = $db->prepare('UPDATE smartleap_form_steps SET status = ?, data_json = ?, totals_json = ? WHERE id = ?');
        $update->execute([
            'Completed',
            json_encode($data),
            json_encode($totals),
            $existingStep['id']
        ]);
    } else {
        $insert = $db->prepare('INSERT INTO smartleap_form_steps (submission_id, step_number, status, data_json, totals_json) VALUES (?, ?, ?, ?, ?)');
        $insert->execute([
            $submissionId,
            $stepNumber,
            'Completed',
            json_encode($data),
            json_encode($totals)
        ]);
    }

    $completedStmt = $db->prepare('SELECT COUNT(*) AS completed_steps FROM smartleap_form_steps WHERE submission_id = ? AND status = ?');
    $completedStmt->execute([$submissionId, 'Completed']);
    $completedCount = (int)$completedStmt->fetchColumn();

    if ($completedCount >= 6 && $stepNumber === 6) {
        $statusUpdate = $db->prepare('UPDATE smartleap_form_submissions SET status = ? WHERE id = ?');
        $statusUpdate->execute(['Submitted', $submissionId]);
    }

    $db->commit();
    echo json_encode(['ok' => true, 'submission_id' => $submissionId, 'completed' => $completedCount]);
} catch (Throwable $e) {
    if (isset($db) && $db->inTransaction()) {
        $db->rollBack();
    }
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Unable to submit step']);
}
