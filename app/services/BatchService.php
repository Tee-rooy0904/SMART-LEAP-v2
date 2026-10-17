<?php
/**
 * SMART LEAP FILE GUIDE
 * Batch management service.
 * Manages active intake batches, batch switching, capacity, group sizing, and applicant waitlist promotions.
 */

declare(strict_types=1);

namespace App\Services;

use PDO;

class BatchService
{
    public const DEFAULT_ACTIVE_BATCH = 'Batch 3';
    public const DEFAULT_ACTIVE_BATCH_NUMBER = 3;

    public function __construct()
    {
        $this->ensureSchema();
    }

    /**
     * Ensures system_settings table and batch_no columns exist idempotently.
     */
    public function ensureSchema(): void
    {
        static $schemaEnsured = false;
        if ($schemaEnsured) {
            return;
        }

        try {
            $pdo = db();
            $pdo->exec(
                'CREATE TABLE IF NOT EXISTS system_settings (
                    setting_key VARCHAR(100) NOT NULL PRIMARY KEY,
                    setting_value LONGTEXT NOT NULL,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
            );

            // Ensure active_batch exists in system_settings
            $statement = $pdo->prepare('SELECT setting_value FROM system_settings WHERE setting_key = :k LIMIT 1');
            $statement->execute(['k' => 'active_batch']);
            $existing = $statement->fetchColumn();
            if ($existing === false || trim((string) $existing) === '') {
                $insert = $pdo->prepare('INSERT INTO system_settings (setting_key, setting_value) VALUES (:k, :v)');
                $insert->execute(['k' => 'active_batch', 'v' => self::DEFAULT_ACTIVE_BATCH]);
            }

            // Check and add batch_no column to applicant_profiles
            $colCheck = $pdo->prepare("SHOW COLUMNS FROM applicant_profiles LIKE 'batch_no'");
            $colCheck->execute();
            if ($colCheck->fetch() === false) {
                $pdo->exec("ALTER TABLE applicant_profiles ADD COLUMN batch_no VARCHAR(50) NOT NULL DEFAULT 'Batch 3'");
            }

            // Check and add batch_no column to stage_one_registrations
            $stageColCheck = $pdo->prepare("SHOW COLUMNS FROM stage_one_registrations LIKE 'batch_no'");
            $stageColCheck->execute();
            if ($stageColCheck->fetch() === false) {
                $pdo->exec("ALTER TABLE stage_one_registrations ADD COLUMN batch_no VARCHAR(50) NOT NULL DEFAULT 'Batch 3'");
            }

            $schemaEnsured = true;
        } catch (\Throwable $e) {
            error_log('BatchService::ensureSchema error: ' . $e->getMessage());
        }
    }

    /**
     * Gets the current active batch string, e.g. "Batch 3".
     */
    public function getActiveBatch(): string
    {
        try {
            $statement = db()->prepare('SELECT setting_value FROM system_settings WHERE setting_key = :k LIMIT 1');
            $statement->execute(['k' => 'active_batch']);
            $val = trim((string) ($statement->fetchColumn() ?: ''));
            if ($val !== '') {
                return $this->formatBatchName($val);
            }
        } catch (\Throwable $e) {
            error_log('BatchService::getActiveBatch error: ' . $e->getMessage());
        }

        return self::DEFAULT_ACTIVE_BATCH;
    }

    /**
     * Gets the current active batch numeric index (e.g. 3).
     */
    public function getActiveBatchNumber(): int
    {
        $batch = $this->getActiveBatch();
        if (preg_match('/(\d+)/', $batch, $matches)) {
            return (int) $matches[1];
        }
        return self::DEFAULT_ACTIVE_BATCH_NUMBER;
    }

    /**
     * Gets the next batch string, e.g. "Batch 4".
     */
    public function getNextBatch(): string
    {
        $currentNum = $this->getActiveBatchNumber();
        return 'Batch ' . ($currentNum + 1);
    }

    /**
     * Gets all batches known to the system, from Batch 1 through active batch (or any found in data).
     */
    public function getAllBatches(): array
    {
        $activeNum = $this->getActiveBatchNumber();
        $batches = [];
        for ($i = 1; $i <= max(3, $activeNum); $i++) {
            $batches[] = 'Batch ' . $i;
        }

        try {
            $statement = db()->query("SELECT DISTINCT batch_no FROM applicant_profiles WHERE TRIM(COALESCE(batch_no, '')) <> ''");
            $rows = $statement ? $statement->fetchAll(PDO::FETCH_COLUMN) : [];
            foreach ($rows as $row) {
                $formatted = $this->formatBatchName((string) $row);
                if ($formatted !== '' && !in_array($formatted, $batches, true)) {
                    $batches[] = $formatted;
                }
            }
        } catch (\Throwable $e) {
            // Ignore optional column query error
        }

        usort($batches, function (string $a, string $b): int {
            preg_match('/(\d+)/', $a, $mA);
            preg_match('/(\d+)/', $b, $mB);
            return ((int) ($mA[1] ?? 0)) <=> ((int) ($mB[1] ?? 0));
        });

        return $batches;
    }

    /**
     * Returns batch metrics for display.
     */
    public function getBatchMetrics(): array
    {
        $activeBatch = $this->getActiveBatch();
        $activeNum = $this->getActiveBatchNumber();
        $nextBatch = $this->getNextBatch();
        $capacity = BeneficiaryProfileService::BASE_BATCH_CAPACITY;
        $groupCount = TRAINING_BATCH_GROUP_COUNT;
        $groupSize = TRAINING_BATCH_GROUP_SIZE;

        $waitlistedCount = 0;
        $enrolledCount = 0;

        try {
            $waitlistStmt = db()->prepare("SELECT COUNT(*) FROM stage_one_registrations WHERE validation_status = 'saved_next_batch'");
            $waitlistStmt->execute();
            $waitlistedCount = (int) ($waitlistStmt->fetchColumn() ?: 0);

            $enrolledStmt = db()->prepare("SELECT COUNT(*) FROM applicant_profiles WHERE batch_no = :batch");
            $enrolledStmt->execute(['batch' => $activeBatch]);
            $enrolledCount = (int) ($enrolledStmt->fetchColumn() ?: 0);
        } catch (\Throwable $e) {
            error_log('BatchService::getBatchMetrics error: ' . $e->getMessage());
        }

        return [
            'activeBatch' => $activeBatch,
            'activeBatchNumber' => $activeNum,
            'nextBatch' => $nextBatch,
            'capacity' => $capacity,
            'groupCount' => $groupCount,
            'groupSize' => $groupSize,
            'waitlistedCount' => $waitlistedCount,
            'enrolledCount' => $enrolledCount,
            'allBatches' => $this->getAllBatches(),
        ];
    }

    /**
     * Switches to a specific batch (e.g. "Batch 3", "Batch 4", etc.).
     * Promotes waitlisted registrants if advancing forward, updates active_batch, and logs to audit_logs.
     */
    public function switchBatchTo(string $targetBatch, int $actorUserId, ?string $actorIp = null, ?string $actorUserAgent = null): array
    {
        $targetBatch = $this->formatBatchName($targetBatch);
        if ($targetBatch === '') {
            return ['ok' => false, 'message' => 'Invalid batch name provided.'];
        }

        $currentBatch = $this->getActiveBatch();
        $targetNum = 0;
        if (preg_match('/(\d+)/', $targetBatch, $matches)) {
            $targetNum = (int) $matches[1];
        }

        $pdo = db();
        $inTransaction = $pdo->inTransaction();
        if (!$inTransaction) {
            $pdo->beginTransaction();
        }

        try {
            // 1. Update active_batch in system_settings
            $update = $pdo->prepare('INSERT INTO system_settings (setting_key, setting_value) VALUES (:k, :v) ON DUPLICATE KEY UPDATE setting_value = :v_update');
            $update->execute(['k' => 'active_batch', 'v' => $targetBatch, 'v_update' => $targetBatch]);

            // 2. If advancing forward to a higher batch, promote waitlisted applicants
            $promotedCount = 0;
            if ($targetNum > $this->getActiveBatchNumber()) {
                $promoteStmt = $pdo->prepare(
                    "UPDATE stage_one_registrations
                     SET validation_status = 'pending',
                         batch_no = :new_batch,
                         updated_at = NOW()
                     WHERE validation_status = 'saved_next_batch'"
                );
                $promoteStmt->execute(['new_batch' => $targetBatch]);
                $promotedCount = $promoteStmt->rowCount();
            }

            // 3. Log to audit_logs
            $details = json_encode([
                'action' => 'batch_switched',
                'previous_batch' => $currentBatch,
                'new_batch' => $targetBatch,
                'promoted_waitlist_count' => $promotedCount,
                'switched_by_user_id' => $actorUserId,
            ], JSON_UNESCAPED_SLASHES);

            $logStmt = $pdo->prepare(
                'INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, ip_address, user_agent, created_at)
                 VALUES (:user_id, :action, :entity_type, :entity_id, :details, :ip_address, :user_agent, NOW())'
            );
            $logStmt->execute([
                'user_id' => $actorUserId > 0 ? $actorUserId : null,
                'action' => 'batch_switch',
                'entity_type' => 'batch',
                'entity_id' => $targetNum,
                'details' => $details,
                'ip_address' => $actorIp ?: '127.0.0.1',
                'user_agent' => $actorUserAgent ?: 'Admin Dashboard',
            ]);

            if (!$inTransaction) {
                $pdo->commit();
            }

            return [
                'ok' => true,
                'message' => "Successfully set active intake batch to {$targetBatch}.",
                'previousBatch' => $currentBatch,
                'activeBatch' => $targetBatch,
                'activeBatchNumber' => $targetNum,
                'promotedCount' => $promotedCount,
            ];
        } catch (\Throwable $e) {
            if (!$inTransaction && $pdo->inTransaction()) {
                $pdo->rollBack();
            }
            error_log('BatchService::switchBatchTo failed: ' . $e->getMessage());
            return [
                'ok' => false,
                'message' => 'Failed to switch batch: ' . $e->getMessage(),
            ];
        }
    }

    /**
     * Advances to the next batch.
     */
    public function advanceBatch(int $actorUserId, ?string $actorIp = null, ?string $actorUserAgent = null): array
    {
        return $this->switchBatchTo($this->getNextBatch(), $actorUserId, $actorIp, $actorUserAgent);
    }

    private function formatBatchName(string $name): string
    {
        $trimmed = trim($name);
        if ($trimmed === '') {
            return self::DEFAULT_ACTIVE_BATCH;
        }
        if (preg_match('/^\d+$/', $trimmed)) {
            return 'Batch ' . $trimmed;
        }
        return $trimmed;
    }
}
