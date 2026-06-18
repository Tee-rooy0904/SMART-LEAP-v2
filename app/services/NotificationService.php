<?php
declare(strict_types=1);

namespace App\Services;

class NotificationService
{
    public function createInAppIfMissing(int $userId, string $title, string $message, string $channel = 'in_app'): bool
    {
        if ($this->channelExistsForUser($userId, $channel)) {
            return false;
        }

        $this->createInApp($userId, $title, $message, $channel);
        return true;
    }

    public function createInAppForUsers(array $userIds, string $title, string $message, string $channel = 'in_app'): int
    {
        $ids = array_values(array_unique(array_filter(array_map(
            static fn ($value): int => (int) $value,
            $userIds,
        ), static fn (int $value): bool => $value > 0)));

        foreach ($ids as $userId) {
            $this->createInApp($userId, $title, $message, $channel);
        }

        return count($ids);
    }

    public function activeUserIdsForRoles(array $roleNames): array
    {
        $roles = array_values(array_unique(array_filter(array_map(
            static fn ($value): string => trim((string) $value),
            $roleNames,
        ), static fn (string $value): bool => $value !== '')));

        if ($roles === []) {
            return [];
        }

        $placeholders = [];
        $params = [];
        foreach ($roles as $index => $roleName) {
            $key = 'role_' . $index;
            $placeholders[] = ':' . $key;
            $params[$key] = $roleName;
        }

        try {
            $statement = db()->prepare(
                'SELECT DISTINCT users.id
                 FROM users
                 INNER JOIN roles ON roles.id = users.role_id
                 WHERE users.is_active = 1
                   AND users.is_disabled = 0
                   AND roles.name IN (' . implode(', ', $placeholders) . ')'
            );
            $statement->execute($params);
            $rows = $statement->fetchAll(\PDO::FETCH_COLUMN) ?: [];
        } catch (\Throwable $exception) {
            log_database_query_failure('notifications.active_user_ids', $exception, ['roles' => $roles]);
            return [];
        }

        return array_values(array_unique(array_filter(array_map('intval', $rows), static fn (int $value): bool => $value > 0)));
    }

    public function userIdForStaffProfileId(int $staffProfileId): ?int
    {
        if ($staffProfileId <= 0) {
            return null;
        }

        try {
            $statement = db()->prepare('SELECT user_id FROM staff_profiles WHERE id = :staff_profile_id LIMIT 1');
            $statement->execute(['staff_profile_id' => $staffProfileId]);
            $value = $statement->fetchColumn();
        } catch (\Throwable $exception) {
            log_database_query_failure('notifications.user_id_for_staff_profile', $exception, ['staff_profile_id' => $staffProfileId]);
            return null;
        }

        return $value !== false ? (int) $value : null;
    }

    public function listForUser(int $userId): array
    {
        try {
            $statement = db()->prepare(
                'SELECT id, channel, title, message, is_read, sent_at, created_at
                 FROM notifications
                 WHERE user_id = :user_id
                 ORDER BY created_at DESC, id DESC
                 LIMIT 50'
            );
            $statement->execute(['user_id' => $userId]);
            $rows = $statement->fetchAll(\PDO::FETCH_ASSOC) ?: [];
        } catch (\Throwable $exception) {
            log_database_query_failure('notifications.list', $exception, ['user_id' => $userId]);
            return [];
        }

        $visibleRows = array_values(array_filter($rows, fn (array $row): bool => !$this->isHiddenSecurityNotification(
            (string) ($row['channel'] ?? ''),
            (string) ($row['title'] ?? ''),
            (string) ($row['message'] ?? '')
        )));

        return array_map(static function (array $row): array {
            return [
                'id' => (int) $row['id'],
                'channel' => $row['channel'],
                'title' => $row['title'],
                'message' => $row['message'],
                'isRead' => ((int) $row['is_read']) === 1,
                'sentAt' => $row['sent_at'],
                'createdAt' => $row['created_at'],
            ];
        }, $visibleRows);
    }

    public function createInApp(int $userId, string $title, string $message, string $channel = 'in_app'): void
    {
        if ($this->isHiddenSecurityNotification($channel, $title, $message)) {
            return;
        }

        try {
            $statement = db()->prepare(
                'INSERT INTO notifications (user_id, channel, title, message, is_read, sent_at)
                 VALUES (:user_id, :channel, :title, :message, 0, :sent_at)'
            );
            $statement->execute([
                'user_id' => $userId,
                'channel' => $channel,
                'title' => $title,
                'message' => $message,
                'sent_at' => date('Y-m-d H:i:s'),
            ]);
        } catch (\Throwable $exception) {
            log_database_query_failure('notifications.create', $exception, ['user_id' => $userId, 'channel' => $channel]);
        }
    }

    private function channelExistsForUser(int $userId, string $channel): bool
    {
        if ($userId <= 0 || trim($channel) === '') {
            return false;
        }

        try {
            $statement = db()->prepare(
                'SELECT COUNT(*)
                 FROM notifications
                 WHERE user_id = :user_id
                   AND channel = :channel'
            );
            $statement->execute([
                'user_id' => $userId,
                'channel' => $channel,
            ]);

            return ((int) $statement->fetchColumn()) > 0;
        } catch (\Throwable $exception) {
            log_database_query_failure('notifications.channel_exists', $exception, [
                'user_id' => $userId,
                'channel' => $channel,
            ]);

            return false;
        }
    }

    public function markReadForUser(int $userId, array $notificationIds): int
    {
        $ids = array_values(array_unique(array_map(
            static fn ($value): int => (int) $value,
            array_filter($notificationIds, static fn ($value): bool => (int) $value > 0)
        )));

        if ($ids === []) {
            return 0;
        }

        $placeholders = [];
        $params = ['user_id' => $userId];
        foreach ($ids as $index => $id) {
            $key = 'id_' . $index;
            $placeholders[] = ':' . $key;
            $params[$key] = $id;
        }

        try {
            $statement = db()->prepare(
                'UPDATE notifications
                 SET is_read = 1,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE user_id = :user_id
                   AND id IN (' . implode(', ', $placeholders) . ')'
            );
            $statement->execute($params);
            return $statement->rowCount();
        } catch (\Throwable $exception) {
            log_database_query_failure('notifications.mark_read', $exception, ['user_id' => $userId, 'notification_ids' => $ids]);
            return 0;
        }
    }

    private function isHiddenSecurityNotification(string $channel, string $title, string $message): bool
    {
        $normalizedChannel = strtolower(trim($channel));
        $normalizedTitle = strtolower(trim($title));
        $normalizedMessage = strtolower(trim($message));

        if (in_array($normalizedChannel, ['login_2fa', 'two_factor_auth', 'account_verification', 'login_verification'], true)) {
            return true;
        }

        if ($normalizedTitle === 'two-factor authentication required') {
            return true;
        }

        if (str_contains($normalizedMessage, 'six-digit code') && str_contains($normalizedMessage, 'sign-in')) {
            return true;
        }

        if (str_contains($normalizedMessage, 'verification code') && str_contains($normalizedMessage, 'registered email')) {
            return true;
        }

        return false;
    }

    public function sendTrainingNotice(array $user, array $program, array $invitee): bool
    {
        $title = 'Training Notice';
        $formattedDate = $this->formatTrainingDate((string) ($program['date'] ?? ''));
        $formattedTime = $this->formatTrainingTimeRange(
            (string) ($program['startTime'] ?? ''),
            (string) ($program['endTime'] ?? '')
        );
        $message = sprintf(
            'You are scheduled for %s on %s at %s in %s.',
            $program['programName'] ?? $program['title'] ?? 'training',
            $formattedDate,
            $formattedTime,
            $program['venue'] ?? 'TBA'
        );

        $this->createInApp((int) $user['id'], $title, $message, 'training_notice');
        $actorUserId = (int) ($invitee['updatedByUserId'] ?? 0);
        if ($actorUserId > 0 && $actorUserId !== (int) $user['id']) {
            $this->createInApp(
                $actorUserId,
                'Training Notice Sent',
                sprintf('Training notice sent to %s for %s.', $user['name'] ?? 'participant', $program['programName'] ?? $program['title'] ?? 'training'),
                'training_activity'
            );
        }
        $sent = (new MailService())->sendTrainingNotice($user, $program, $invitee);

        (new AuditLogService())->record(
            $actorUserId,
            'training.notice_sent',
            'training_invitees',
            (int) ($invitee['id'] ?? 0),
            ['mail_sent' => $sent]
        );

        return $sent;
    }

    private function formatTrainingDate(string $date): string
    {
        $value = trim($date);
        if ($value === '') {
            return '--';
        }

        $timestamp = strtotime($value);
        if ($timestamp === false) {
            return $value;
        }

        return date('F j, Y', $timestamp);
    }

    private function formatTrainingTimeRange(string $startTime, string $endTime): string
    {
        $start = $this->formatTrainingTime($startTime);
        $end = $this->formatTrainingTime($endTime);

        if ($start === '--' && $end === '--') {
            return '--';
        }

        if ($end === '--') {
            return $start;
        }

        if ($start === '--') {
            return $end;
        }

        return $start . ' - ' . $end;
    }

    private function formatTrainingTime(string $time): string
    {
        $value = trim($time);
        if ($value === '') {
            return '--';
        }

        $timestamp = strtotime($value);
        if ($timestamp === false) {
            return $value;
        }

        return date('g:i A', $timestamp);
    }
}
