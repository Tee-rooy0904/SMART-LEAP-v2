<?php
declare(strict_types=1);

namespace App\Services;

class ApplicationStatusService
{
    public function transition(int $applicationId, string $toStatus, int $actorUserId, ?string $remarks = null, bool $createComment = true): void
    {
        if (!in_array($toStatus, APPLICATION_ALLOWED_STATUSES, true)) {
            throw new \RuntimeException('Invalid application status.');
        }

        $application = $this->findApplication($applicationId);
        if ($application === null) {
            throw new \RuntimeException('Application not found.');
        }

        $fromStatus = (string) $application['status'];
        $statement = db()->prepare(
            'UPDATE applications
             SET status = :status, reviewed_at = NOW(), updated_at = NOW()
             WHERE id = :id'
        );
        $statement->execute([
            'status' => $toStatus,
            'id' => $applicationId,
        ]);

        $historyStatement = db()->prepare(
            'INSERT INTO application_status_history (application_id, changed_by_user_id, from_status, to_status, remarks)
             VALUES (:application_id, :changed_by_user_id, :from_status, :to_status, :remarks)'
        );
        $historyStatement->execute([
            'application_id' => $applicationId,
            'changed_by_user_id' => $actorUserId,
            'from_status' => $fromStatus !== '' ? $fromStatus : null,
            'to_status' => $toStatus,
            'remarks' => $remarks ?: null,
        ]);

        if ($createComment && $remarks !== null && trim($remarks) !== '') {
            $commentStatement = db()->prepare(
                'INSERT INTO application_comments (application_id, user_id, comment_text, visibility)
                 VALUES (:application_id, :user_id, :comment_text, :visibility)'
            );
            $commentStatement->execute([
                'application_id' => $applicationId,
                'user_id' => $actorUserId,
                'comment_text' => trim($remarks),
                'visibility' => 'internal',
            ]);
        }
    }

    private function findApplication(int $applicationId): ?array
    {
        $statement = db()->prepare('SELECT id, status FROM applications WHERE id = :id LIMIT 1');
        $statement->execute(['id' => $applicationId]);
        $row = $statement->fetch(\PDO::FETCH_ASSOC);
        return is_array($row) ? $row : null;
    }
}
