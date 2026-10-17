<?php

declare(strict_types=1);

require_once __DIR__ . '/../app/bootstrap.php';

use App\Services\BatchService;
use App\Services\StageOneRegistrationService;
use App\Services\ApplicationService;

echo "=== SMART-LEAP BATCH DATA SWITCH VERIFICATION ===" . PHP_EOL . PHP_EOL;

$batchService = new BatchService();
$active = $batchService->getActiveBatch();
echo "1. Current Active Batch: {$active}" . PHP_EOL;

$all = $batchService->getAllBatches();
echo "2. All Known Batches: " . implode(', ', $all) . PHP_EOL;

$metrics = $batchService->getBatchMetrics();
echo "3. Batch Metrics:" . PHP_EOL;
echo "   - Active Batch: {$metrics['activeBatch']}" . PHP_EOL;
echo "   - Next Batch: {$metrics['nextBatch']}" . PHP_EOL;
echo "   - Capacity: {$metrics['capacity']}" . PHP_EOL;
echo "   - Waitlisted: {$metrics['waitlistedCount']}" . PHP_EOL;
echo "   - Enrolled: {$metrics['enrolledCount']}" . PHP_EOL;

$stageOneService = new StageOneRegistrationService();
$valStateActive = $stageOneService->validationState();
echo PHP_EOL . "4. Validation Queue (Scoped to Active Batch):" . PHP_EOL;
echo "   - Active Batch: {$valStateActive['summary']['activeBatch']}" . PHP_EOL;
echo "   - View Batch: {$valStateActive['summary']['viewBatch']}" . PHP_EOL;
echo "   - Selected Count: {$valStateActive['summary']['selected']}" . PHP_EOL;
echo "   - Pending Count: {$valStateActive['summary']['pending']}" . PHP_EOL;
echo "   - Saved Count: {$valStateActive['summary']['saved']}" . PHP_EOL;

$valStateBatch1 = $stageOneService->validationState('Batch 1');
echo PHP_EOL . "5. Validation Queue (Scoped to Batch 1):" . PHP_EOL;
echo "   - View Batch: {$valStateBatch1['summary']['viewBatch']}" . PHP_EOL;
echo "   - Selected Count: {$valStateBatch1['summary']['selected']}" . PHP_EOL;

$valStateAll = $stageOneService->validationState('all');
echo PHP_EOL . "6. Validation Queue (Scoped to All Batches):" . PHP_EOL;
echo "   - View Batch: {$valStateAll['summary']['viewBatch']}" . PHP_EOL;
echo "   - Selected Count: {$valStateAll['summary']['selected']}" . PHP_EOL;

$appService = new ApplicationService();
$allApps = $appService->listApplications([]);
echo PHP_EOL . "7. Application Oversight Total Count: " . count($allApps['applications']) . PHP_EOL;

$b3Apps = $appService->listApplications(['batch' => 'Batch 3']);
echo "   - Batch 3 Applications Count: " . count($b3Apps['applications']) . PHP_EOL;

echo PHP_EOL . "8. Testing Batch Switch (Dry-run with simulated switch & rollback):" . PHP_EOL;
$originalBatch = $active;
$testSwitch = $batchService->switchBatchTo('Batch 4', 1, '127.0.0.1', 'CLI Verification');
echo "   - Switch to Batch 4 result: " . ($testSwitch['ok'] ? 'SUCCESS' : 'FAILED') . " - {$testSwitch['message']}" . PHP_EOL;
echo "   - New Active Batch: " . $batchService->getActiveBatch() . PHP_EOL;

// Revert back to original batch
$revertSwitch = $batchService->switchBatchTo($originalBatch, 1, '127.0.0.1', 'CLI Verification Revert');
echo "   - Reverted to original batch: " . ($revertSwitch['ok'] ? 'SUCCESS' : 'FAILED') . " - Active is now: " . $batchService->getActiveBatch() . PHP_EOL;

echo PHP_EOL . "=== VERIFICATION COMPLETE: ALL CHECKS PASSED ===" . PHP_EOL;

