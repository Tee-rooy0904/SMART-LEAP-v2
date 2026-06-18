<?php
declare(strict_types=1);

namespace App\Services;

class AuditLogService
{
    public function record(?int $userId, string $action, ?string $entityType = null, ?int $entityId = null, array $details = []): void
    {
        try {
            $statement = db()->prepare(
                'INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, ip_address, user_agent)
                 VALUES (:user_id, :action, :entity_type, :entity_id, :details, :ip_address, :user_agent)'
            );
            $statement->execute([
                'user_id' => $userId,
                'action' => $action,
                'entity_type' => $entityType,
                'entity_id' => $entityId,
                'details' => $details === [] ? null : json_encode($details, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
                'ip_address' => $_SERVER['REMOTE_ADDR'] ?? null,
                'user_agent' => $_SERVER['HTTP_USER_AGENT'] ?? null,
            ]);
        } catch (\Throwable $exception) {
            write_app_log('audit', 'Failed to write audit log.', [
                'action' => $action,
                'entity_type' => $entityType,
                'entity_id' => $entityId,
                'error' => $exception->getMessage(),
            ]);
        }
    }
}
