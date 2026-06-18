<?php
declare(strict_types=1);

namespace App\Services;

use PDO;
use Throwable;

class SupportChatService
{
    public function listForParticipant(array $actor, string $recipient): array
    {
        $this->ensureSchema();

        $participantId = (int) ($actor['id'] ?? 0);
        $recipientRole = $this->recipientRole($recipient);
        if ($participantId <= 0 || $recipientRole === null) {
            return [];
        }

        $statement = db()->prepare(
            'SELECT support_chat_messages.*, users.full_name AS sender_name, roles.name AS sender_role
             FROM support_chat_messages
             INNER JOIN users ON users.id = support_chat_messages.sender_user_id
             INNER JOIN roles ON roles.id = users.role_id
             WHERE support_chat_messages.participant_user_id = :participant_user_id
               AND support_chat_messages.recipient_role = :recipient_role
             ORDER BY support_chat_messages.created_at ASC, support_chat_messages.id ASC
             LIMIT 100'
        );
        $statement->execute([
            'participant_user_id' => $participantId,
            'recipient_role' => $recipientRole,
        ]);

        return array_map(fn (array $row): array => $this->formatMessage($row, $participantId), $statement->fetchAll(PDO::FETCH_ASSOC) ?: []);
    }

    public function sendFromParticipant(array $actor, string $recipient, string $body): array
    {
        $this->ensureSchema();

        $participantId = (int) ($actor['id'] ?? 0);
        $recipientRole = $this->recipientRole($recipient);
        $message = trim($body);

        if ($participantId <= 0 || $recipientRole === null || $message === '') {
            return ['ok' => false, 'message' => 'Choose a support contact and enter a message.'];
        }

        if (strlen($message) > 1000) {
            return ['ok' => false, 'message' => 'Messages can be up to 1000 characters only.'];
        }

        $statement = db()->prepare(
            'INSERT INTO support_chat_messages (participant_user_id, sender_user_id, recipient_role, body, created_at)
             VALUES (:participant_user_id, :sender_user_id, :recipient_role, :body, NOW())'
        );
        $statement->execute([
            'participant_user_id' => $participantId,
            'sender_user_id' => $participantId,
            'recipient_role' => $recipientRole,
            'body' => $message,
        ]);
        $this->notifySupportRole($actor, $recipientRole, $message);

        return [
            'ok' => true,
            'messages' => $this->listForParticipant($actor, $recipient),
        ];
    }

    private function recipientRole(string $recipient): ?string
    {
        return match (strtolower(trim($recipient))) {
            'social_worker', 'social-worker', 'social' => ROLE_SOCIAL_WORKER,
            'project_officer', 'project-officer', 'pdo', 'project' => ROLE_SOCIAL_WORKER,
            default => null,
        };
    }

    private function formatMessage(array $row, int $actorId): array
    {
        return [
            'id' => (int) $row['id'],
            'body' => (string) $row['body'],
            'senderName' => (string) ($row['sender_name'] ?? 'SMART LEAP user'),
            'senderRole' => (string) ($row['sender_role'] ?? ''),
            'recipientRole' => (string) $row['recipient_role'],
            'isOwn' => (int) $row['sender_user_id'] === $actorId,
            'createdAt' => (string) $row['created_at'],
        ];
    }

    private function notifySupportRole(array $actor, string $recipientRole, string $message): void
    {
        $notificationService = new NotificationService();
        $userIds = $notificationService->activeUserIdsForRoles([$recipientRole]);
        if ($userIds === []) {
            return;
        }

        $name = trim((string) ($actor['name'] ?? $actor['full_name'] ?? 'SMART LEAP participant'));
        $preview = strlen($message) > 120 ? substr($message, 0, 117) . '...' : $message;
        $notificationService->createInAppForUsers(
            $userIds,
            'New support chat message',
            $name . ' sent a support message: ' . $preview,
            'support_chat'
        );
    }

    private function ensureSchema(): void
    {
        static $ready = false;
        if ($ready) {
            return;
        }

        try {
            db()->exec(
                'CREATE TABLE IF NOT EXISTS support_chat_messages (
                    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                    participant_user_id BIGINT UNSIGNED NOT NULL,
                    sender_user_id BIGINT UNSIGNED NOT NULL,
                    recipient_role VARCHAR(80) NOT NULL,
                    body TEXT NOT NULL,
                    is_read TINYINT(1) NOT NULL DEFAULT 0,
                    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_support_chat_participant_role (participant_user_id, recipient_role),
                    INDEX idx_support_chat_sender (sender_user_id),
                    CONSTRAINT fk_support_chat_participant FOREIGN KEY (participant_user_id) REFERENCES users(id),
                    CONSTRAINT fk_support_chat_sender FOREIGN KEY (sender_user_id) REFERENCES users(id)
                )'
            );
            db()->exec(
                'UPDATE support_chat_messages
                 SET recipient_role = "' . ROLE_SOCIAL_WORKER . '"
                 WHERE LOWER(recipient_role) IN ("project officer", "project_officer", "project-officer", "pdo", "project")'
            );
            $ready = true;
        } catch (Throwable $exception) {
            log_database_query_failure('support_chat.ensure_schema', $exception);
            throw $exception;
        }
    }
}
