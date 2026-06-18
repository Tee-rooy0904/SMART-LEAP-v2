<?php
declare(strict_types=1);

namespace App\Services;

use PDO;
use Throwable;

class SupportService
{
    private const CATEGORIES = [
        'Account/Login',
        'Application',
        'Upload/Requirement',
        'Training',
        'Repayment',
        'Receipt/OR Concern',
        'Business/Livelihood',
        'Correction Clarification',
        'Other',
    ];

    private const STATUSES = ['New', 'In Review', 'Waiting for Beneficiary', 'Referred', 'Resolved', 'Closed'];
    private const PRIORITIES = ['Low', 'Normal', 'Urgent'];
    private const ASSIGNED_ROLES = ['Social Worker'];

    public function createTicket(array $actor, array $input, ?array $attachmentFile = null): array
    {
        $this->ensureSchema();
        $errors = $this->validateTicketInput($input);
        if ($errors !== []) {
            return ['ok' => false, 'success' => false, 'message' => 'Please correct the highlighted fields.', 'errors' => $errors];
        }

        $userId = (int) ($actor['id'] ?? 0);
        if ($userId <= 0 || !$this->isRequester($actor)) {
            return ['ok' => false, 'success' => false, 'message' => 'Only applicants and beneficiaries can submit support concerns.'];
        }

        $pdo = db();
        $pdo->beginTransaction();

        try {
            $category = trim((string) $input['category']);
            $assignedRole = $this->routeCategory($category);
            $ticketNo = $this->generateTicketNoForCurrentYear();
            $now = date('Y-m-d H:i:s');
            $upload = (new SupportUploadService())->store($attachmentFile);

            $statement = $pdo->prepare(
                'INSERT INTO support_tickets
                 (ticket_no, requester_user_id, requester_role, category, subject, message, related_record_type, related_record_id,
                  assigned_role, assigned_user_id, priority, status, unread_for_requester, unread_for_staff, last_message_at, created_at, updated_at)
                 VALUES
                 (:ticket_no, :requester_user_id, :requester_role, :category, :subject, :message, :related_record_type, :related_record_id,
                  :assigned_role, NULL, :priority, :status, 0, 1, :last_message_at, :created_at, :updated_at)'
            );
            $statement->execute([
                'ticket_no' => $ticketNo,
                'requester_user_id' => $userId,
                'requester_role' => (string) ($actor['role'] ?? ''),
                'category' => $category,
                'subject' => trim((string) $input['subject']),
                'message' => trim((string) $input['message']),
                'related_record_type' => $this->nullableText($input['related_record_type'] ?? null, 80),
                'related_record_id' => $this->nullableText($input['related_record_id'] ?? null, 80),
                'assigned_role' => $assignedRole,
                'priority' => 'Normal',
                'status' => 'New',
                'last_message_at' => $now,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
            $ticketId = (int) $pdo->lastInsertId();

            $messageId = $this->insertMessage($ticketId, $actor, trim((string) $input['message']), false, $this->senderType($actor), $now);
            if ($upload !== null) {
                $this->insertAttachment($ticketId, $messageId, $userId, $upload);
            }

            $this->logActivity($ticketId, $userId, (string) ($actor['role'] ?? ''), 'ticket_created', null, 'New', 'Ticket created.');
            $this->logActivity($ticketId, $userId, (string) ($actor['role'] ?? ''), 'message_sent', null, null, 'Initial concern message submitted.');

            $pdo->commit();
        } catch (Throwable $exception) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            log_database_query_failure('support.create_ticket', $exception, ['user_id' => $userId]);
            return ['ok' => false, 'success' => false, 'message' => 'Unable to submit your concern right now.'];
        }

        $ticket = $this->getTicketDetailForRequester($actor, $ticketId);
        return [
            'ok' => true,
            'success' => true,
            'message' => 'Your concern has been submitted. Ticket No. ' . $ticketNo . '.',
            'ticket' => $ticket['ticket'] ?? null,
            'data' => $ticket,
        ];
    }

    public function listRequesterTickets(array $actor, array $filters = []): array
    {
        $this->ensureSchema();
        $userId = (int) ($actor['id'] ?? 0);
        if ($userId <= 0 || !$this->isRequester($actor)) {
            return ['tickets' => [], 'summary' => $this->emptySummary()];
        }

        $params = ['requester_user_id' => $userId];
        $where = ['requester_user_id = :requester_user_id'];
        $this->applyCommonFilters($where, $params, $filters, false);

        $sql = 'SELECT * FROM support_tickets WHERE ' . implode(' AND ', $where) . ' ORDER BY COALESCE(last_message_at, created_at) DESC, id DESC LIMIT 100';
        $statement = db()->prepare($sql);
        $statement->execute($params);
        $tickets = array_map([$this, 'formatTicket'], $statement->fetchAll(PDO::FETCH_ASSOC) ?: []);

        return [
            'tickets' => $tickets,
            'summary' => $this->summaryForRequester($userId),
        ];
    }

    public function getTicketDetailForRequester(array $actor, int $ticketId): ?array
    {
        $this->ensureSchema();
        $ticket = $this->fetchTicket($ticketId);
        if ($ticket === null || (int) $ticket['requester_user_id'] !== (int) ($actor['id'] ?? 0)) {
            return null;
        }

        db()->prepare('UPDATE support_tickets SET unread_for_requester = 0 WHERE id = :id')->execute(['id' => $ticketId]);
        $ticket['unread_for_requester'] = 0;

        return [
            'ticket' => $this->formatTicket($ticket),
            'messages' => $this->messagesForTicket($ticketId, false),
        ];
    }

    public function sendRequesterReply(array $actor, int $ticketId, string $message, ?array $attachmentFile = null): array
    {
        $this->ensureSchema();
        $ticket = $this->fetchTicket($ticketId);
        if ($ticket === null || (int) $ticket['requester_user_id'] !== (int) ($actor['id'] ?? 0)) {
            return ['ok' => false, 'success' => false, 'message' => 'Support ticket not found.'];
        }

        $status = (string) $ticket['status'];
        if ($status === 'Closed') {
            return ['ok' => false, 'success' => false, 'message' => 'This concern is closed. Create a new concern if you need further assistance.'];
        }

        $body = trim($message);
        if (strlen($body) < 2 || strlen($body) > 5000) {
            return ['ok' => false, 'success' => false, 'message' => 'Enter a reply between 2 and 5000 characters.'];
        }

        $pdo = db();
        $pdo->beginTransaction();
        try {
            $newStatus = in_array($status, ['Waiting for Beneficiary', 'Resolved'], true) ? 'In Review' : $status;
            $now = date('Y-m-d H:i:s');
            $upload = (new SupportUploadService())->store($attachmentFile);
            $messageId = $this->insertMessage($ticketId, $actor, $body, false, $this->senderType($actor), $now);
            if ($upload !== null) {
                $this->insertAttachment($ticketId, $messageId, (int) $actor['id'], $upload);
            }

            $update = $pdo->prepare(
                'UPDATE support_tickets
                 SET status = :status, unread_for_staff = 1, unread_for_requester = 0, last_message_at = :last_message_at, updated_at = NOW()
                 WHERE id = :id'
            );
            $update->execute(['status' => $newStatus, 'last_message_at' => $now, 'id' => $ticketId]);
            $this->logActivity($ticketId, (int) $actor['id'], (string) ($actor['role'] ?? ''), 'message_sent');
            if ($newStatus !== $status) {
                $this->logActivity($ticketId, (int) $actor['id'], (string) ($actor['role'] ?? ''), 'status_changed', $status, $newStatus);
            }
            $pdo->commit();
        } catch (Throwable $exception) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            log_database_query_failure('support.requester_reply', $exception, ['ticket_id' => $ticketId]);
            return ['ok' => false, 'success' => false, 'message' => 'Unable to send your reply right now.'];
        }

        return ['ok' => true, 'success' => true, 'message' => 'Reply sent.', 'data' => $this->getTicketDetailForRequester($actor, $ticketId)];
    }

    public function reopenRequesterTicket(array $actor, int $ticketId): array
    {
        $this->ensureSchema();
        $ticket = $this->fetchTicket($ticketId);
        if ($ticket === null || (int) $ticket['requester_user_id'] !== (int) ($actor['id'] ?? 0)) {
            return ['ok' => false, 'success' => false, 'message' => 'Support ticket not found.'];
        }
        if ((string) $ticket['status'] !== 'Resolved') {
            return ['ok' => false, 'success' => false, 'message' => 'Only resolved concerns can be reopened.'];
        }

        db()->prepare(
            'UPDATE support_tickets SET status = :status, resolved_at = NULL, unread_for_staff = 1, updated_at = NOW() WHERE id = :id'
        )->execute(['status' => 'In Review', 'id' => $ticketId]);
        $this->logActivity($ticketId, (int) $actor['id'], (string) ($actor['role'] ?? ''), 'ticket_reopened', 'Resolved', 'In Review');

        return ['ok' => true, 'success' => true, 'message' => 'Concern reopened.', 'data' => $this->getTicketDetailForRequester($actor, $ticketId)];
    }

    public function listStaffTickets(array $actor, array $filters = []): array
    {
        $this->ensureSchema();
        if (!$this->isStaff($actor)) {
            return ['tickets' => [], 'summary' => $this->emptySummary()];
        }

        $params = [];
        $where = [];
        if (!$this->isAdmin($actor)) {
            $role = $this->staffSupportRole($actor);
            $where[] = '(assigned_role = :assigned_role OR assigned_user_id = :assigned_user_id)';
            $params['assigned_role'] = $role;
            $params['assigned_user_id'] = (int) ($actor['id'] ?? 0);
        }
        $this->applyCommonFilters($where, $params, $filters, true);

        $sql = 'SELECT * FROM support_tickets';
        if ($where !== []) {
            $sql .= ' WHERE ' . implode(' AND ', $where);
        }
        $sql .= ' ORDER BY COALESCE(last_message_at, created_at) DESC, id DESC LIMIT 150';
        $statement = db()->prepare($sql);
        $statement->execute($params);

        return [
            'tickets' => array_map([$this, 'formatTicket'], $statement->fetchAll(PDO::FETCH_ASSOC) ?: []),
            'summary' => $this->summaryForStaff($actor),
        ];
    }

    public function getTicketDetailForStaff(array $actor, int $ticketId): ?array
    {
        $this->ensureSchema();
        $ticket = $this->fetchTicket($ticketId);
        if ($ticket === null || !$this->canStaffAccessTicket($actor, $ticket)) {
            return null;
        }

        db()->prepare('UPDATE support_tickets SET unread_for_staff = 0 WHERE id = :id')->execute(['id' => $ticketId]);
        $ticket['unread_for_staff'] = 0;

        return [
            'ticket' => $this->formatTicket($ticket),
            'messages' => $this->messagesForTicket($ticketId, true),
            'activity' => $this->activityForTicket($ticketId),
        ];
    }

    public function sendStaffReply(array $actor, int $ticketId, string $message, ?array $attachmentFile = null, bool $internal = false): array
    {
        $this->ensureSchema();
        $ticket = $this->fetchTicket($ticketId);
        if ($ticket === null || !$this->canStaffAccessTicket($actor, $ticket)) {
            return ['ok' => false, 'success' => false, 'message' => 'Support ticket not found.'];
        }

        $body = trim($message);
        if (strlen($body) < 2 || strlen($body) > 5000) {
            return ['ok' => false, 'success' => false, 'message' => 'Enter a message between 2 and 5000 characters.'];
        }

        $pdo = db();
        $pdo->beginTransaction();
        try {
            $now = date('Y-m-d H:i:s');
            $upload = (new SupportUploadService())->store($attachmentFile);
            $messageId = $this->insertMessage($ticketId, $actor, $body, $internal, $this->senderType($actor), $now);
            if ($upload !== null) {
                $this->insertAttachment($ticketId, $messageId, (int) $actor['id'], $upload);
            }

            if ($internal) {
                $this->logActivity($ticketId, (int) $actor['id'], (string) ($actor['role'] ?? ''), 'internal_note_added');
            } else {
                $newStatus = (string) $ticket['status'] === 'New' ? 'In Review' : (string) $ticket['status'];
                db()->prepare(
                    'UPDATE support_tickets
                     SET status = :status, unread_for_requester = 1, unread_for_staff = 0, last_message_at = :last_message_at, updated_at = NOW()
                     WHERE id = :id'
                )->execute(['status' => $newStatus, 'last_message_at' => $now, 'id' => $ticketId]);
                $this->logActivity($ticketId, (int) $actor['id'], (string) ($actor['role'] ?? ''), 'message_sent');
            }

            $pdo->commit();
        } catch (Throwable $exception) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            log_database_query_failure('support.staff_reply', $exception, ['ticket_id' => $ticketId]);
            return ['ok' => false, 'success' => false, 'message' => 'Unable to save the message right now.'];
        }

        return ['ok' => true, 'success' => true, 'message' => $internal ? 'Internal note added.' : 'Reply sent.', 'data' => $this->getTicketDetailForStaff($actor, $ticketId)];
    }

    public function updateStatus(array $actor, int $ticketId, string $status): array
    {
        $this->ensureSchema();
        $ticket = $this->fetchTicket($ticketId);
        if ($ticket === null || !$this->canStaffAccessTicket($actor, $ticket)) {
            return ['ok' => false, 'success' => false, 'message' => 'Support ticket not found.'];
        }
        if (!in_array($status, self::STATUSES, true)) {
            return ['ok' => false, 'success' => false, 'message' => 'Invalid support status.'];
        }

        $oldStatus = (string) $ticket['status'];
        db()->prepare(
            'UPDATE support_tickets
             SET status = :status,
                 resolved_at = CASE WHEN :status_resolved = \'Resolved\' THEN NOW() WHEN status = \'Resolved\' AND :status_clear <> \'Resolved\' THEN NULL ELSE resolved_at END,
                 closed_at = CASE WHEN :status_closed = \'Closed\' THEN NOW() ELSE closed_at END,
                 updated_at = NOW()
             WHERE id = :id'
        )->execute([
            'status' => $status,
            'status_resolved' => $status,
            'status_clear' => $status,
            'status_closed' => $status,
            'id' => $ticketId,
        ]);
        if ($oldStatus !== $status) {
            $this->logActivity($ticketId, (int) ($actor['id'] ?? 0), (string) ($actor['role'] ?? ''), 'status_changed', $oldStatus, $status);
        }

        return ['ok' => true, 'success' => true, 'message' => 'Ticket status updated.', 'data' => $this->getTicketDetailForStaff($actor, $ticketId)];
    }

    public function referTicket(array $actor, int $ticketId, string $assignedRole, ?int $assignedUserId, ?string $note): array
    {
        $this->ensureSchema();
        $ticket = $this->fetchTicket($ticketId);
        if ($ticket === null || !$this->canStaffAccessTicket($actor, $ticket)) {
            return ['ok' => false, 'success' => false, 'message' => 'Support ticket not found.'];
        }
        if (!in_array($assignedRole, self::ASSIGNED_ROLES, true)) {
            return ['ok' => false, 'success' => false, 'message' => 'Invalid assigned role.'];
        }

        $assignedUserId = $assignedUserId !== null && $assignedUserId > 0 ? $assignedUserId : null;
        db()->prepare(
            'UPDATE support_tickets
             SET assigned_role = :assigned_role, assigned_user_id = :assigned_user_id, status = :status, unread_for_requester = 1, updated_at = NOW()
             WHERE id = :id'
        )->execute([
            'assigned_role' => $assignedRole,
            'assigned_user_id' => $assignedUserId,
            'status' => 'Referred',
            'id' => $ticketId,
        ]);

        $systemMessage = 'Your concern has been referred to the appropriate SMART LEAP staff for review.';
        $this->insertMessage($ticketId, ['id' => (int) ($actor['id'] ?? 0), 'role' => (string) ($actor['role'] ?? '')], $systemMessage, false, 'System');
        $this->logActivity($ticketId, (int) ($actor['id'] ?? 0), (string) ($actor['role'] ?? ''), 'ticket_referred', (string) $ticket['assigned_role'], $assignedRole, $note);

        return ['ok' => true, 'success' => true, 'message' => 'Ticket referred.', 'data' => $this->getTicketDetailForStaff($actor, $ticketId)];
    }

    public function assignTicket(array $actor, int $ticketId, string $assignedRole, ?int $assignedUserId): array
    {
        $this->ensureSchema();
        $ticket = $this->fetchTicket($ticketId);
        if ($ticket === null || !$this->isAdmin($actor)) {
            return ['ok' => false, 'success' => false, 'message' => 'Only admins can assign support tickets.'];
        }
        if (!in_array($assignedRole, self::ASSIGNED_ROLES, true)) {
            return ['ok' => false, 'success' => false, 'message' => 'Invalid assigned role.'];
        }

        $assignedUserId = $assignedUserId !== null && $assignedUserId > 0 ? $assignedUserId : null;
        db()->prepare(
            'UPDATE support_tickets SET assigned_role = :assigned_role, assigned_user_id = :assigned_user_id, updated_at = NOW() WHERE id = :id'
        )->execute(['assigned_role' => $assignedRole, 'assigned_user_id' => $assignedUserId, 'id' => $ticketId]);
        $this->logActivity($ticketId, (int) ($actor['id'] ?? 0), (string) ($actor['role'] ?? ''), 'ticket_assigned', (string) $ticket['assigned_role'], $assignedRole);

        return ['ok' => true, 'success' => true, 'message' => 'Ticket assignment updated.', 'data' => $this->getTicketDetailForStaff($actor, $ticketId)];
    }

    public function downloadAttachment(array $actor, int $attachmentId): ?array
    {
        $this->ensureSchema();
        $statement = db()->prepare(
            'SELECT support_ticket_attachments.*, support_ticket_messages.is_internal, support_tickets.requester_user_id,
                    support_tickets.assigned_role, support_tickets.assigned_user_id
             FROM support_ticket_attachments
             INNER JOIN support_tickets ON support_tickets.id = support_ticket_attachments.ticket_id
             LEFT JOIN support_ticket_messages ON support_ticket_messages.id = support_ticket_attachments.message_id
             WHERE support_ticket_attachments.id = :id
             LIMIT 1'
        );
        $statement->execute(['id' => $attachmentId]);
        $row = $statement->fetch(PDO::FETCH_ASSOC);
        if (!is_array($row)) {
            return null;
        }

        $isRequester = (int) $row['requester_user_id'] === (int) ($actor['id'] ?? 0);
        $canStaffAccess = $this->canStaffAccessTicket($actor, $row);
        if ((!$isRequester && !$canStaffAccess) || ($isRequester && (int) ($row['is_internal'] ?? 0) === 1)) {
            return null;
        }

        return $row;
    }

    private function validateTicketInput(array $input): array
    {
        $errors = [];
        $category = trim((string) ($input['category'] ?? ''));
        $subject = trim((string) ($input['subject'] ?? ''));
        $message = trim((string) ($input['message'] ?? ''));

        if (!in_array($category, self::CATEGORIES, true)) {
            $errors['category'] = 'Choose a valid concern category.';
        }
        if (strlen($subject) < 5 || strlen($subject) > 180) {
            $errors['subject'] = 'Subject must be between 5 and 180 characters.';
        }
        if (strlen($message) < 10 || strlen($message) > 5000) {
            $errors['message'] = 'Message must be between 10 and 5000 characters.';
        }

        return $errors;
    }

    private function routeCategory(string $category): string
    {
        return 'Social Worker';
    }

    private function generateTicketNoForCurrentYear(): string
    {
        $year = date('Y');
        $statement = db()->prepare(
            'SELECT ticket_no FROM support_tickets WHERE ticket_no LIKE :prefix ORDER BY ticket_no DESC LIMIT 1 FOR UPDATE'
        );
        $statement->execute(['prefix' => 'HD-' . $year . '-%']);
        $latest = (string) ($statement->fetchColumn() ?: '');
        $next = 1;
        if (preg_match('/^HD-' . preg_quote($year, '/') . '-(\d{4,})$/', $latest, $matches)) {
            $next = (int) $matches[1] + 1;
        }

        return 'HD-' . $year . '-' . str_pad((string) $next, 4, '0', STR_PAD_LEFT);
    }

    private function applyCommonFilters(array &$where, array &$params, array $filters, bool $allowStaffFilters): void
    {
        $status = trim((string) ($filters['status'] ?? ''));
        if ($status !== '' && in_array($status, self::STATUSES, true)) {
            $where[] = 'status = :status';
            $params['status'] = $status;
        }

        $category = trim((string) ($filters['category'] ?? ''));
        if ($category !== '' && in_array($category, self::CATEGORIES, true)) {
            $where[] = 'category = :category';
            $params['category'] = $category;
        }

        $search = trim((string) ($filters['search'] ?? ''));
        if ($search !== '') {
            $where[] = '(ticket_no LIKE :search OR subject LIKE :search OR message LIKE :search)';
            $params['search'] = '%' . $search . '%';
        }

        if ($allowStaffFilters) {
            $priority = trim((string) ($filters['priority'] ?? ''));
            if ($priority !== '' && in_array($priority, self::PRIORITIES, true)) {
                $where[] = 'priority = :priority';
                $params['priority'] = $priority;
            }
            $assignedRole = trim((string) ($filters['assigned_role'] ?? ''));
            if ($assignedRole !== '' && in_array($assignedRole, self::ASSIGNED_ROLES, true)) {
                $where[] = 'assigned_role = :filter_assigned_role';
                $params['filter_assigned_role'] = $assignedRole;
            }
        }
    }

    private function summaryForRequester(int $userId): array
    {
        $statement = db()->prepare(
            'SELECT
                SUM(CASE WHEN status NOT IN ("Resolved", "Closed") THEN 1 ELSE 0 END) AS open_count,
                SUM(CASE WHEN unread_for_staff = 1 THEN 1 ELSE 0 END) AS waiting_staff,
                SUM(CASE WHEN status = "Resolved" THEN 1 ELSE 0 END) AS resolved_count,
                SUM(CASE WHEN unread_for_requester = 1 THEN 1 ELSE 0 END) AS unread_count
             FROM support_tickets
             WHERE requester_user_id = :user_id'
        );
        $statement->execute(['user_id' => $userId]);
        $row = $statement->fetch(PDO::FETCH_ASSOC) ?: [];

        return [
            'open' => (int) ($row['open_count'] ?? 0),
            'waitingForStaff' => (int) ($row['waiting_staff'] ?? 0),
            'resolved' => (int) ($row['resolved_count'] ?? 0),
            'unread' => (int) ($row['unread_count'] ?? 0),
        ];
    }

    private function summaryForStaff(array $actor): array
    {
        $params = [];
        $where = [];
        if (!$this->isAdmin($actor)) {
            $where[] = '(assigned_role = :assigned_role OR assigned_user_id = :assigned_user_id)';
            $params['assigned_role'] = $this->staffSupportRole($actor);
            $params['assigned_user_id'] = (int) ($actor['id'] ?? 0);
        }

        $sql = 'SELECT
                SUM(CASE WHEN status NOT IN ("Resolved", "Closed") THEN 1 ELSE 0 END) AS open_count,
                SUM(CASE WHEN unread_for_staff = 1 THEN 1 ELSE 0 END) AS waiting_staff,
                SUM(CASE WHEN status = "Resolved" THEN 1 ELSE 0 END) AS resolved_count,
                SUM(CASE WHEN unread_for_staff = 1 THEN 1 ELSE 0 END) AS unread_count
             FROM support_tickets';
        if ($where !== []) {
            $sql .= ' WHERE ' . implode(' AND ', $where);
        }
        $statement = db()->prepare($sql);
        $statement->execute($params);
        $row = $statement->fetch(PDO::FETCH_ASSOC) ?: [];

        return [
            'open' => (int) ($row['open_count'] ?? 0),
            'waitingForStaff' => (int) ($row['waiting_staff'] ?? 0),
            'resolved' => (int) ($row['resolved_count'] ?? 0),
            'unread' => (int) ($row['unread_count'] ?? 0),
        ];
    }

    private function emptySummary(): array
    {
        return ['open' => 0, 'waitingForStaff' => 0, 'resolved' => 0, 'unread' => 0];
    }

    private function fetchTicket(int $ticketId): ?array
    {
        $statement = db()->prepare('SELECT * FROM support_tickets WHERE id = :id LIMIT 1');
        $statement->execute(['id' => $ticketId]);
        $ticket = $statement->fetch(PDO::FETCH_ASSOC);
        return is_array($ticket) ? $ticket : null;
    }

    private function insertMessage(int $ticketId, array $actor, string $message, bool $internal, string $senderType, ?string $createdAt = null): int
    {
        $statement = db()->prepare(
            'INSERT INTO support_ticket_messages (ticket_id, sender_user_id, sender_role, sender_type, message, is_internal, created_at)
             VALUES (:ticket_id, :sender_user_id, :sender_role, :sender_type, :message, :is_internal, :created_at)'
        );
        $statement->execute([
            'ticket_id' => $ticketId,
            'sender_user_id' => (int) ($actor['id'] ?? 0),
            'sender_role' => (string) ($actor['role'] ?? ''),
            'sender_type' => $senderType,
            'message' => $message,
            'is_internal' => $internal ? 1 : 0,
            'created_at' => $createdAt ?? date('Y-m-d H:i:s'),
        ]);

        return (int) db()->lastInsertId();
    }

    private function insertAttachment(int $ticketId, ?int $messageId, int $userId, array $upload): void
    {
        db()->prepare(
            'INSERT INTO support_ticket_attachments
             (ticket_id, message_id, uploaded_by_user_id, original_name, stored_name, file_path, mime_type, file_size, created_at)
             VALUES (:ticket_id, :message_id, :uploaded_by_user_id, :original_name, :stored_name, :file_path, :mime_type, :file_size, NOW())'
        )->execute([
            'ticket_id' => $ticketId,
            'message_id' => $messageId,
            'uploaded_by_user_id' => $userId,
            'original_name' => $upload['original_name'],
            'stored_name' => $upload['stored_name'],
            'file_path' => $upload['file_path'],
            'mime_type' => $upload['mime_type'],
            'file_size' => $upload['file_size'],
        ]);
    }

    private function messagesForTicket(int $ticketId, bool $includeInternal): array
    {
        $sql = 'SELECT support_ticket_messages.*, users.full_name AS sender_name
                FROM support_ticket_messages
                LEFT JOIN users ON users.id = support_ticket_messages.sender_user_id
                WHERE support_ticket_messages.ticket_id = :ticket_id';
        if (!$includeInternal) {
            $sql .= ' AND support_ticket_messages.is_internal = 0';
        }
        $sql .= ' ORDER BY support_ticket_messages.created_at ASC, support_ticket_messages.id ASC';
        $statement = db()->prepare($sql);
        $statement->execute(['ticket_id' => $ticketId]);
        $messages = $statement->fetchAll(PDO::FETCH_ASSOC) ?: [];

        $attachments = $this->attachmentsGroupedByMessage($ticketId, $includeInternal);
        return array_map(function (array $row) use ($attachments): array {
            return [
                'id' => (int) $row['id'],
                'senderUserId' => (int) $row['sender_user_id'],
                'senderRole' => (string) $row['sender_role'],
                'senderType' => (string) $row['sender_type'],
                'senderName' => (string) ($row['sender_name'] ?? $row['sender_type']),
                'body' => (string) $row['message'],
                'message' => (string) $row['message'],
                'isInternal' => (int) $row['is_internal'] === 1,
                'createdAt' => (string) $row['created_at'],
                'attachments' => $attachments[(int) $row['id']] ?? [],
            ];
        }, $messages);
    }

    private function attachmentsGroupedByMessage(int $ticketId, bool $includeInternal): array
    {
        $sql = 'SELECT support_ticket_attachments.*, support_ticket_messages.is_internal
                FROM support_ticket_attachments
                LEFT JOIN support_ticket_messages ON support_ticket_messages.id = support_ticket_attachments.message_id
                WHERE support_ticket_attachments.ticket_id = :ticket_id';
        if (!$includeInternal) {
            $sql .= ' AND COALESCE(support_ticket_messages.is_internal, 0) = 0';
        }
        $statement = db()->prepare($sql);
        $statement->execute(['ticket_id' => $ticketId]);

        $grouped = [];
        foreach ($statement->fetchAll(PDO::FETCH_ASSOC) ?: [] as $row) {
            $messageId = (int) ($row['message_id'] ?? 0);
            $grouped[$messageId][] = $this->formatAttachment($row);
        }

        return $grouped;
    }

    private function activityForTicket(int $ticketId): array
    {
        $statement = db()->prepare('SELECT * FROM support_ticket_activity_logs WHERE ticket_id = :ticket_id ORDER BY created_at DESC, id DESC LIMIT 100');
        $statement->execute(['ticket_id' => $ticketId]);
        return array_map(static fn (array $row): array => [
            'id' => (int) $row['id'],
            'action' => (string) $row['action'],
            'oldValue' => $row['old_value'],
            'newValue' => $row['new_value'],
            'note' => $row['note'],
            'createdAt' => (string) $row['created_at'],
        ], $statement->fetchAll(PDO::FETCH_ASSOC) ?: []);
    }

    private function logActivity(int $ticketId, ?int $actorUserId, ?string $actorRole, string $action, ?string $oldValue = null, ?string $newValue = null, ?string $note = null): void
    {
        db()->prepare(
            'INSERT INTO support_ticket_activity_logs (ticket_id, actor_user_id, actor_role, action, old_value, new_value, note, created_at)
             VALUES (:ticket_id, :actor_user_id, :actor_role, :action, :old_value, :new_value, :note, NOW())'
        )->execute([
            'ticket_id' => $ticketId,
            'actor_user_id' => $actorUserId,
            'actor_role' => $actorRole,
            'action' => $action,
            'old_value' => $oldValue,
            'new_value' => $newValue,
            'note' => $note,
        ]);
    }

    private function formatTicket(array $row): array
    {
        return [
            'id' => (int) $row['id'],
            'ticketNo' => (string) $row['ticket_no'],
            'ticket_no' => (string) $row['ticket_no'],
            'category' => (string) $row['category'],
            'subject' => (string) $row['subject'],
            'message' => (string) $row['message'],
            'relatedRecordType' => $row['related_record_type'],
            'relatedRecordId' => $row['related_record_id'],
            'assignedRole' => (string) $row['assigned_role'],
            'assignedUserId' => $row['assigned_user_id'] !== null ? (int) $row['assigned_user_id'] : null,
            'priority' => (string) $row['priority'],
            'status' => (string) $row['status'],
            'unreadForRequester' => (int) $row['unread_for_requester'] === 1,
            'unreadForStaff' => (int) $row['unread_for_staff'] === 1,
            'unread' => (int) $row['unread_for_requester'] === 1,
            'createdAt' => (string) $row['created_at'],
            'updatedAt' => (string) $row['updated_at'],
            'lastMessageAt' => $row['last_message_at'],
            'resolvedAt' => $row['resolved_at'],
            'closedAt' => $row['closed_at'],
        ];
    }

    private function formatAttachment(array $row): array
    {
        return [
            'id' => (int) $row['id'],
            'name' => (string) $row['original_name'],
            'originalName' => (string) $row['original_name'],
            'mimeType' => (string) $row['mime_type'],
            'fileSize' => (int) $row['file_size'],
            'downloadUrl' => 'support/attachments/download?id=' . (int) $row['id'],
            'createdAt' => (string) $row['created_at'],
        ];
    }

    private function canStaffAccessTicket(array $actor, array $ticket): bool
    {
        if ($this->isAdmin($actor)) {
            return true;
        }
        if (!$this->isStaff($actor)) {
            return false;
        }

        $staffRole = $this->staffSupportRole($actor);
        return (string) ($ticket['assigned_role'] ?? '') === $staffRole
            || (int) ($ticket['assigned_user_id'] ?? 0) === (int) ($actor['id'] ?? 0);
    }

    private function isRequester(array $actor): bool
    {
        $role = strtolower((string) ($actor['role'] ?? ''));
        return str_contains($role, 'applicant') || str_contains($role, 'beneficiary');
    }

    private function isStaff(array $actor): bool
    {
        $role = strtolower((string) ($actor['role'] ?? ''));
        return str_contains($role, 'admin') || str_contains($role, 'project') || str_contains($role, 'social');
    }

    private function isAdmin(array $actor): bool
    {
        return str_contains(strtolower((string) ($actor['role'] ?? '')), 'admin');
    }

    private function isSocialWorker(array $actor): bool
    {
        return str_contains(strtolower((string) ($actor['role'] ?? '')), 'social');
    }

    private function staffSupportRole(array $actor): string
    {
        $role = strtolower((string) ($actor['role'] ?? ''));
        if (str_contains($role, 'admin')) {
            return 'Admin';
        }
        if (str_contains($role, 'project') || str_contains($role, 'pdo')) {
            return 'PDO';
        }
        return 'Social Worker';
    }

    private function senderType(array $actor): string
    {
        $role = strtolower((string) ($actor['role'] ?? ''));
        if (str_contains($role, 'beneficiary')) {
            return 'Beneficiary';
        }
        if (str_contains($role, 'applicant')) {
            return 'Applicant';
        }
        if (str_contains($role, 'admin')) {
            return 'Admin';
        }
        if (str_contains($role, 'project') || str_contains($role, 'pdo')) {
            return 'PDO';
        }
        if (str_contains($role, 'social')) {
            return 'Social Worker';
        }
        return 'System';
    }

    private function nullableText(mixed $value, int $max): ?string
    {
        $text = trim((string) $value);
        if ($text === '') {
            return null;
        }
        return substr($text, 0, $max);
    }

    private function ensureSchema(): void
    {
        static $ready = false;
        if ($ready) {
            return;
        }

        try {
            db()->exec(
                'CREATE TABLE IF NOT EXISTS support_tickets (
                    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                    ticket_no VARCHAR(30) NOT NULL UNIQUE,
                    requester_user_id BIGINT UNSIGNED NOT NULL,
                    requester_role VARCHAR(50) NOT NULL,
                    category VARCHAR(80) NOT NULL,
                    subject VARCHAR(180) NOT NULL,
                    message TEXT NOT NULL,
                    related_record_type VARCHAR(80) NULL,
                    related_record_id VARCHAR(80) NULL,
                    assigned_role VARCHAR(50) NOT NULL,
                    assigned_user_id BIGINT UNSIGNED NULL,
                    priority ENUM("Low","Normal","Urgent") NOT NULL DEFAULT "Normal",
                    status ENUM("New","In Review","Waiting for Beneficiary","Referred","Resolved","Closed") NOT NULL DEFAULT "New",
                    unread_for_requester TINYINT(1) NOT NULL DEFAULT 0,
                    unread_for_staff TINYINT(1) NOT NULL DEFAULT 1,
                    last_message_at DATETIME NULL,
                    resolved_at DATETIME NULL,
                    closed_at DATETIME NULL,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_support_tickets_requester (requester_user_id),
                    INDEX idx_support_tickets_assigned_role (assigned_role),
                    INDEX idx_support_tickets_assigned_user (assigned_user_id),
                    INDEX idx_support_tickets_category (category),
                    INDEX idx_support_tickets_status (status),
                    INDEX idx_support_tickets_priority (priority),
                    INDEX idx_support_tickets_created (created_at),
                    INDEX idx_support_tickets_last_message (last_message_at),
                    CONSTRAINT fk_support_tickets_requester FOREIGN KEY (requester_user_id) REFERENCES users(id),
                    CONSTRAINT fk_support_tickets_assigned_user FOREIGN KEY (assigned_user_id) REFERENCES users(id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
            );

            db()->exec(
                'CREATE TABLE IF NOT EXISTS support_ticket_messages (
                    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                    ticket_id BIGINT UNSIGNED NOT NULL,
                    sender_user_id BIGINT UNSIGNED NOT NULL,
                    sender_role VARCHAR(50) NOT NULL,
                    sender_type ENUM("Beneficiary","Applicant","Social Worker","PDO","Admin","System") NOT NULL,
                    message TEXT NOT NULL,
                    is_internal TINYINT(1) NOT NULL DEFAULT 0,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_support_messages_ticket (ticket_id),
                    INDEX idx_support_messages_sender (sender_user_id),
                    INDEX idx_support_messages_sender_role (sender_role),
                    INDEX idx_support_messages_internal (is_internal),
                    INDEX idx_support_messages_created (created_at),
                    CONSTRAINT fk_support_messages_ticket FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE,
                    CONSTRAINT fk_support_messages_sender FOREIGN KEY (sender_user_id) REFERENCES users(id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
            );

            db()->exec(
                'CREATE TABLE IF NOT EXISTS support_ticket_attachments (
                    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                    ticket_id BIGINT UNSIGNED NOT NULL,
                    message_id BIGINT UNSIGNED NULL,
                    uploaded_by_user_id BIGINT UNSIGNED NOT NULL,
                    original_name VARCHAR(255) NOT NULL,
                    stored_name VARCHAR(255) NOT NULL,
                    file_path VARCHAR(500) NOT NULL,
                    mime_type VARCHAR(120) NOT NULL,
                    file_size INT NOT NULL,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_support_attachments_ticket (ticket_id),
                    INDEX idx_support_attachments_message (message_id),
                    INDEX idx_support_attachments_user (uploaded_by_user_id),
                    INDEX idx_support_attachments_created (created_at),
                    CONSTRAINT fk_support_attachments_ticket FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE,
                    CONSTRAINT fk_support_attachments_message FOREIGN KEY (message_id) REFERENCES support_ticket_messages(id) ON DELETE SET NULL,
                    CONSTRAINT fk_support_attachments_user FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
            );

            db()->exec(
                'CREATE TABLE IF NOT EXISTS support_ticket_activity_logs (
                    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                    ticket_id BIGINT UNSIGNED NOT NULL,
                    actor_user_id BIGINT UNSIGNED NULL,
                    actor_role VARCHAR(50) NULL,
                    action VARCHAR(120) NOT NULL,
                    old_value VARCHAR(255) NULL,
                    new_value VARCHAR(255) NULL,
                    note TEXT NULL,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_support_activity_ticket (ticket_id),
                    INDEX idx_support_activity_created (created_at),
                    CONSTRAINT fk_support_activity_ticket FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE,
                    CONSTRAINT fk_support_activity_actor FOREIGN KEY (actor_user_id) REFERENCES users(id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
            );

            db()->exec(
                'UPDATE support_tickets
                 SET assigned_role = "Social Worker",
                     assigned_user_id = NULL,
                     updated_at = NOW()
                 WHERE assigned_role <> "Social Worker"'
            );

            $ready = true;
        } catch (Throwable $exception) {
            log_database_query_failure('support.ensure_schema', $exception);
            throw $exception;
        }
    }
}
