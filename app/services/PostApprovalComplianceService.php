<?php
declare(strict_types=1);

namespace App\Services;

use PDO;

class PostApprovalComplianceService
{
    private const APPLICATION_FORM_CODES = [
        POST_APPROVAL_TASK_AVAILMENT_FORM,
        POST_APPROVAL_TASK_VALIDATION_FORM,
        POST_APPROVAL_TASK_MUNGKAHING_PROYEKTO,
        POST_APPROVAL_TASK_BUSINESS_PLAN,
        POST_APPROVAL_TASK_BUHAT_SA_PAGPANUMPA,
    ];

    public function stateForApplicant(int $userId): array
    {
        $applicationGate = (new ApplicationService())->applicationFormsGateForUser($userId);
        if (!($applicationGate['unlocked'] ?? false)) {
            return $this->emptyState();
        }

        $context = $this->resolveApplicantContext($userId);
        if ($context === null) {
            return $this->emptyState();
        }

        (new PostApprovalTaskProvisioningService())->ensureUnlockedApplicantTasks(
            (int) $context['beneficiary_profile_id'],
            $userId,
            $applicationGate['reviewedAt'] ?? null,
            true
        );
        $seminarAccess = $this->openedSeminarAccessForApplicant((int) $context['applicant_profile_id']);
        if (($seminarAccess['codes'] ?? []) === []) {
            return $this->emptyState();
        }

        $tasks = $this->fetchTasks((int) $context['beneficiary_profile_id'], $context, $seminarAccess);

        return [
            'isUnlocked' => $tasks !== [],
            'unlockedAt' => $seminarAccess['openedAt'] ?? ($applicationGate['reviewedAt'] ?? null),
            'schedule' => [
                'openedAt' => $seminarAccess['openedAt'] ?? ($applicationGate['reviewedAt'] ?? null),
                'closesAt' => $seminarAccess['closesAt'] ?? null,
                'programs' => $seminarAccess['programs'] ?? [],
            ],
            'beneficiaryProfileId' => (int) $context['beneficiary_profile_id'],
            'tasks' => $tasks,
            'summary' => $this->buildSummary($tasks),
        ];
    }

    public function taskForApplicant(int $userId, string $code): ?array
    {
        $applicationGate = (new ApplicationService())->applicationFormsGateForUser($userId);
        if (!($applicationGate['unlocked'] ?? false)) {
            return null;
        }

        $context = $this->resolveApplicantContext($userId);
        if ($context === null) {
            return null;
        }

        (new PostApprovalTaskProvisioningService())->ensureUnlockedApplicantTasks(
            (int) $context['beneficiary_profile_id'],
            $userId,
            $applicationGate['reviewedAt'] ?? null,
            true
        );
        $seminarAccess = $this->openedSeminarAccessForApplicant((int) $context['applicant_profile_id']);
        if (!in_array($code, $seminarAccess['codes'] ?? [], true)) {
            return null;
        }

        $task = $this->findTaskByCode((int) $context['beneficiary_profile_id'], $code);
        if ($task === null) {
            return null;
        }

        $definition = $this->taskDefinitions()[$code] ?? null;
        if ($definition === null || !(bool) ($definition['interactive'] ?? false)) {
            return null;
        }

        $task = $this->clearDraftSignatureUploadsOnLoad($task);
        $mappedTask = $this->mapTask($task, $context);
        $scheduleByCode = $this->scheduleByCode($seminarAccess);
        $mappedTask['schedule'] = $scheduleByCode[$code] ?? [
            'openedAt' => $seminarAccess['openedAt'] ?? null,
            'closesAt' => $mappedTask['dueDate'] ?? ($seminarAccess['closesAt'] ?? null),
            'programTitle' => '',
            'trainingStartsAt' => null,
            'trainingEndsAt' => null,
        ];
        if (empty($mappedTask['dueDate']) && !empty($mappedTask['schedule']['closesAt'])) {
            $mappedTask['dueDate'] = $mappedTask['schedule']['closesAt'];
        }

        return $mappedTask;
    }

    public function saveApplicantTask(int $userId, string $code, array $payload): array
    {
        $applicationGate = (new ApplicationService())->applicationFormsGateForUser($userId);
        if (!($applicationGate['unlocked'] ?? false)) {
            return ['ok' => false, 'errors' => ['task' => 'Your required uploads must be fully verified before seminar forms can be used.']];
        }

        $context = $this->resolveApplicantContext($userId);
        if ($context === null) {
            return ['ok' => false, 'errors' => ['general' => 'Applicant record not found.']];
        }

        (new PostApprovalTaskProvisioningService())->ensureUnlockedApplicantTasks(
            (int) $context['beneficiary_profile_id'],
            $userId,
            $applicationGate['reviewedAt'] ?? null,
            true
        );
        $seminarAccess = $this->openedSeminarAccessForApplicant((int) $context['applicant_profile_id']);
        if (!in_array($code, $seminarAccess['codes'] ?? [], true)) {
            return ['ok' => false, 'errors' => ['task' => 'This application form is not yet opened for your assigned training session.']];
        }

        $task = $this->findTaskByCode((int) $context['beneficiary_profile_id'], $code);
        if ($task === null) {
            return ['ok' => false, 'errors' => ['task' => 'Post-approval task not found.']];
        }

        $definition = $this->taskDefinitions()[$code] ?? null;
        if ($definition === null) {
            return ['ok' => false, 'errors' => ['task' => 'Unsupported post-approval task.']];
        }
        if (!(bool) ($definition['interactive'] ?? false)) {
            return ['ok' => false, 'errors' => ['task' => 'This task is not yet available as a digital form.']];
        }

        $status = $this->normalizeStatus((string) $task['status']);
        if ($status === POST_APPROVAL_STATUS_LOCKED) {
            return ['ok' => false, 'errors' => ['task' => 'This final requirement is still locked until the earlier forms are verified.']];
        }
        if (!$this->isApplicantTaskEditable($task)) {
            return ['ok' => false, 'errors' => ['task' => 'This form cannot be edited right now.']];
        }

        $validation = $this->validatePayload($code, $payload, $context, false);
        if ($validation['errors'] !== []) {
            return ['ok' => false, 'errors' => $validation['errors']];
        }

        $persistedPayload = $this->mergePersistedPayload($task, $validation['payload']);

        try {
            db()->prepare(
                'UPDATE post_approval_tasks
                 SET form_payload = :form_payload,
                     status = :status,
                     applicant_started_at = COALESCE(applicant_started_at, NOW()),
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = :id'
            )->execute([
                'form_payload' => json_encode($persistedPayload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
                'status' => POST_APPROVAL_STATUS_IN_PROGRESS,
                'id' => (int) $task['id'],
            ]);
        } catch (\Throwable $exception) {
            log_database_query_failure('post_approval.save_draft', $exception, ['task_code' => $code, 'task_id' => (int) $task['id']]);
            return ['ok' => false, 'errors' => ['general' => 'Unable to save this form right now.']];
        }

        return ['ok' => true];
    }

    public function submitApplicantTask(int $userId, string $code, array $payload): array
    {
        $applicationGate = (new ApplicationService())->applicationFormsGateForUser($userId);
        if (!($applicationGate['unlocked'] ?? false)) {
            return ['ok' => false, 'errors' => ['task' => 'Your required uploads must be fully verified before seminar forms can be used.']];
        }

        $context = $this->resolveApplicantContext($userId);
        if ($context === null) {
            return ['ok' => false, 'errors' => ['general' => 'Applicant record not found.']];
        }

        (new PostApprovalTaskProvisioningService())->ensureUnlockedApplicantTasks(
            (int) $context['beneficiary_profile_id'],
            $userId,
            $applicationGate['reviewedAt'] ?? null,
            true
        );
        $seminarAccess = $this->openedSeminarAccessForApplicant((int) $context['applicant_profile_id']);
        if (!in_array($code, $seminarAccess['codes'] ?? [], true)) {
            return ['ok' => false, 'errors' => ['task' => 'This application form is not yet opened for your assigned training session.']];
        }

        $task = $this->findTaskByCode((int) $context['beneficiary_profile_id'], $code);
        if ($task === null) {
            return ['ok' => false, 'errors' => ['task' => 'Post-approval task not found.']];
        }

        $definition = $this->taskDefinitions()[$code] ?? null;
        if ($definition === null) {
            return ['ok' => false, 'errors' => ['task' => 'Unsupported post-approval task.']];
        }
        if (!(bool) ($definition['interactive'] ?? false)) {
            return ['ok' => false, 'errors' => ['task' => 'This task is not yet available as a digital form.']];
        }

        $status = $this->normalizeStatus((string) $task['status']);
        if ($status === POST_APPROVAL_STATUS_LOCKED) {
            return ['ok' => false, 'errors' => ['task' => 'This final requirement is still locked until the earlier forms are verified.']];
        }
        if ($status === POST_APPROVAL_STATUS_VERIFIED) {
            return ['ok' => false, 'errors' => ['task' => 'This form has already been verified.']];
        }
        if ($status === POST_APPROVAL_STATUS_SUBMITTED && $this->hasApplicantTaskBeenChecked($task)) {
            return ['ok' => false, 'errors' => ['task' => 'This form has already been submitted and is awaiting review.']];
        }

        $validation = $this->validatePayload($code, $payload, $context, true);
        if ($validation['errors'] !== []) {
            return ['ok' => false, 'errors' => $validation['errors']];
        }

        $persistedPayload = $this->mergePersistedPayload($task, $validation['payload']);

        $pdo = db();
        $pdo->beginTransaction();

        try {
            $pdo->prepare(
                'UPDATE post_approval_tasks
                 SET form_payload = :form_payload,
                     status = :status,
                     applicant_started_at = COALESCE(applicant_started_at, NOW()),
                     applicant_submitted_at = NOW(),
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = :id'
            )->execute([
                'form_payload' => json_encode($persistedPayload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
                'status' => POST_APPROVAL_STATUS_SUBMITTED,
                'id' => (int) $task['id'],
            ]);

            $pdo->prepare(
                'INSERT INTO post_approval_submissions
                 (post_approval_task_id, submission_kind, file_path, original_name, payload_json, submitted_by_user_id, review_status, submitted_at)
                 VALUES (:post_approval_task_id, :submission_kind, :file_path, :original_name, :payload_json, :submitted_by_user_id, :review_status, :submitted_at)'
            )->execute([
                'post_approval_task_id' => (int) $task['id'],
                'submission_kind' => 'form',
                'file_path' => null,
                'original_name' => null,
                'payload_json' => json_encode($persistedPayload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
                'submitted_by_user_id' => $userId,
                'review_status' => POST_APPROVAL_STATUS_SUBMITTED,
                'submitted_at' => date('Y-m-d H:i:s'),
            ]);

            $pdo->commit();
        } catch (\Throwable $exception) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            log_database_query_failure('post_approval.submit', $exception, ['task_code' => $code, 'task_id' => (int) $task['id']]);
            return ['ok' => false, 'errors' => ['general' => 'Unable to submit this form right now.']];
        }

        (new NotificationService())->createInApp(
            $userId,
            $definition['title'] . ' submitted',
            'Your post-approval form was submitted successfully and is now awaiting review.',
            'post_approval'
        );

        $this->notifyPostApprovalSubmission($context, $definition['title']);

        return ['ok' => true];
    }

    public function saveApplicantUpload(int $userId, string $code, string $fieldKey, array $file): array
    {
        $applicationGate = (new ApplicationService())->applicationFormsGateForUser($userId);
        if (!($applicationGate['unlocked'] ?? false)) {
            return ['ok' => false, 'errors' => ['task' => 'Your required uploads must be fully verified before seminar forms can be used.']];
        }

        $context = $this->resolveApplicantContext($userId);
        if ($context === null) {
            return ['ok' => false, 'errors' => ['general' => 'Applicant record not found.']];
        }

        (new PostApprovalTaskProvisioningService())->ensureUnlockedApplicantTasks(
            (int) $context['beneficiary_profile_id'],
            $userId,
            $applicationGate['reviewedAt'] ?? null,
            true
        );
        $seminarAccess = $this->openedSeminarAccessForApplicant((int) $context['applicant_profile_id']);
        if (!in_array($code, $seminarAccess['codes'] ?? [], true)) {
            return ['ok' => false, 'errors' => ['task' => 'This application form is not yet opened for your assigned training session.']];
        }

        $task = $this->findTaskByCode((int) $context['beneficiary_profile_id'], $code);
        if ($task === null) {
            return ['ok' => false, 'errors' => ['task' => 'Post-approval task not found.']];
        }

        $definition = $this->taskDefinitions()[$code] ?? null;
        if ($definition === null || !(bool) ($definition['interactive'] ?? false)) {
            return ['ok' => false, 'errors' => ['task' => 'Unsupported post-approval task.']];
        }

        $status = $this->normalizeStatus((string) $task['status']);
        if ($status === POST_APPROVAL_STATUS_LOCKED) {
            return ['ok' => false, 'errors' => ['task' => 'This final requirement is still locked until the earlier forms are verified.']];
        }
        if (!$this->isApplicantTaskEditable($task)) {
            return ['ok' => false, 'errors' => ['task' => 'This form cannot be edited right now.']];
        }

        $allowed = $this->allowedApplicantUploadFields()[$code] ?? [];
        $fieldConfig = $allowed[$fieldKey] ?? null;
        if ($fieldConfig === null) {
            return ['ok' => false, 'errors' => ['field' => 'Unsupported upload field.']];
        }

        $bucket = is_array($fieldConfig)
            ? (string) ($fieldConfig['bucket'] ?? '')
            : (string) $fieldConfig;
        $persistPath = is_array($fieldConfig)
            ? (string) ($fieldConfig['persistPath'] ?? $fieldKey)
            : $fieldKey;

        if ($bucket === '') {
            return ['ok' => false, 'errors' => ['field' => 'Unsupported upload field.']];
        }

        try {
            $metadata = (new UploadService())->storePostApprovalAsset($bucket, $file);
        } catch (\Throwable $exception) {
            log_database_query_failure('post_approval.upload', $exception, ['task_code' => $code, 'field_key' => $fieldKey]);
            return ['ok' => false, 'errors' => ['general' => $exception->getMessage() ?: 'Unable to upload file.']];
        }

        $persistedPayload = $this->mergePersistedPayload(
            $task,
            $this->payloadWithFieldValue($persistPath, $metadata)
        );

        try {
            db()->prepare(
                'UPDATE post_approval_tasks
                 SET form_payload = :form_payload,
                     status = :status,
                     applicant_started_at = COALESCE(applicant_started_at, NOW()),
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = :id'
            )->execute([
                'form_payload' => json_encode($persistedPayload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
                'status' => in_array($status, [POST_APPROVAL_STATUS_UNLOCKED, 'Pending'], true) ? POST_APPROVAL_STATUS_IN_PROGRESS : $status,
                'id' => (int) $task['id'],
            ]);
        } catch (\Throwable $exception) {
            log_database_query_failure('post_approval.persist_upload', $exception, ['task_code' => $code, 'field_key' => $fieldKey, 'task_id' => (int) $task['id']]);
            return ['ok' => false, 'errors' => ['general' => 'Unable to save this upload right now.']];
        }

        return ['ok' => true, 'upload' => $metadata];
    }

    public function clearApplicantUpload(int $userId, string $code, string $fieldKey): array
    {
        $applicationGate = (new ApplicationService())->applicationFormsGateForUser($userId);
        if (!($applicationGate['unlocked'] ?? false)) {
            return ['ok' => false, 'errors' => ['task' => 'Your required uploads must be fully verified before seminar forms can be used.']];
        }

        $context = $this->resolveApplicantContext($userId);
        if ($context === null) {
            return ['ok' => false, 'errors' => ['general' => 'Applicant record not found.']];
        }

        (new PostApprovalTaskProvisioningService())->ensureUnlockedApplicantTasks(
            (int) $context['beneficiary_profile_id'],
            $userId,
            $applicationGate['reviewedAt'] ?? null,
            true
        );
        $seminarAccess = $this->openedSeminarAccessForApplicant((int) $context['applicant_profile_id']);
        if (!in_array($code, $seminarAccess['codes'] ?? [], true)) {
            return ['ok' => false, 'errors' => ['task' => 'This application form is not yet opened for your assigned training session.']];
        }

        $task = $this->findTaskByCode((int) $context['beneficiary_profile_id'], $code);
        if ($task === null) {
            return ['ok' => false, 'errors' => ['task' => 'Post-approval task not found.']];
        }

        $definition = $this->taskDefinitions()[$code] ?? null;
        if ($definition === null || !(bool) ($definition['interactive'] ?? false)) {
            return ['ok' => false, 'errors' => ['task' => 'Unsupported post-approval task.']];
        }

        $status = $this->normalizeStatus((string) $task['status']);
        if ($status === POST_APPROVAL_STATUS_LOCKED) {
            return ['ok' => false, 'errors' => ['task' => 'This final requirement is still locked until the earlier forms are verified.']];
        }
        if (!$this->isApplicantTaskEditable($task)) {
            return ['ok' => false, 'errors' => ['task' => 'This form cannot be edited right now.']];
        }

        $allowed = $this->allowedApplicantUploadFields()[$code] ?? [];
        $fieldConfig = $allowed[$fieldKey] ?? null;
        if ($fieldConfig === null) {
            return ['ok' => false, 'errors' => ['field' => 'Unsupported upload field.']];
        }

        $persistPath = is_array($fieldConfig)
            ? (string) ($fieldConfig['persistPath'] ?? $fieldKey)
            : $fieldKey;
        if ($persistPath === '') {
            return ['ok' => false, 'errors' => ['field' => 'Unsupported upload field.']];
        }

        $persistedPayload = $this->decodePayload($task['form_payload'] ?? null) ?? [];
        $this->unsetPayloadPath($persistedPayload, $persistPath);

        try {
            db()->prepare(
                'UPDATE post_approval_tasks
                 SET form_payload = :form_payload,
                     status = :status,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = :id'
            )->execute([
                'form_payload' => json_encode($persistedPayload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
                'status' => in_array($status, [POST_APPROVAL_STATUS_UNLOCKED, 'Pending'], true) ? POST_APPROVAL_STATUS_IN_PROGRESS : $status,
                'id' => (int) $task['id'],
            ]);
        } catch (\Throwable $exception) {
            log_database_query_failure('post_approval.clear_upload', $exception, ['task_code' => $code, 'field_key' => $fieldKey, 'task_id' => (int) $task['id']]);
            return ['ok' => false, 'errors' => ['general' => 'Unable to remove this saved signature right now.']];
        }

        return ['ok' => true];
    }

    private function isApplicantTaskEditable(array $task): bool
    {
        $status = $this->normalizeStatus((string) ($task['status'] ?? ''));
        if ($status === POST_APPROVAL_STATUS_LOCKED || $status === POST_APPROVAL_STATUS_VERIFIED) {
            return false;
        }

        if (in_array($status, [POST_APPROVAL_STATUS_NEEDS_CORRECTION, POST_APPROVAL_STATUS_REJECTED, POST_APPROVAL_STATUS_IN_PROGRESS, POST_APPROVAL_STATUS_UNLOCKED], true)) {
            return true;
        }

        if ($status === POST_APPROVAL_STATUS_SUBMITTED) {
            return !$this->hasApplicantTaskBeenChecked($task);
        }

        return true;
    }

    private function hasApplicantTaskBeenChecked(array $task): bool
    {
        if (!empty($task['reviewed_at'] ?? null) || !empty($task['reviewedAt'] ?? null)) {
            return true;
        }

        $status = $this->normalizeStatus((string) ($task['status'] ?? ''));
        return in_array($status, [POST_APPROVAL_STATUS_NEEDS_CORRECTION, POST_APPROVAL_STATUS_REJECTED, POST_APPROVAL_STATUS_VERIFIED], true);
    }

    private function resolveApplicantContext(int $userId): ?array
    {
        $this->ensureStaffProfileSignatureColumns();
        $statement = db()->prepare(
            'SELECT
                users.id AS user_id,
                users.full_name,
                users.email,
                applicant_profiles.id AS applicant_profile_id,
                applicant_profiles.contact_number,
                applicant_profiles.address_line,
                applicant_profiles.birthdate,
                applicant_profiles.age,
                applicant_profiles.business_name,
                applicant_profiles.livelihood_type,
                applicant_profiles.is_4ps,
                barangays.name AS barangay_name,
                beneficiary_profiles.id AS beneficiary_profile_id,
                assigned_staff.id AS assigned_staff_profile_id,
                assigned_staff.position_title AS assigned_pdo_title,
                assigned_staff.signature_file_path AS assigned_pdo_signature_file_path,
                assigned_staff.signature_original_name AS assigned_pdo_signature_original_name,
                assigned_staff.signature_mime_type AS assigned_pdo_signature_mime_type,
                assigned_staff.signature_file_size AS assigned_pdo_signature_file_size,
                assigned_staff.signature_uploaded_at AS assigned_pdo_signature_uploaded_at,
                assigned_pdo_users.full_name AS assigned_pdo_name
             FROM users
             INNER JOIN applicant_profiles ON applicant_profiles.user_id = users.id
             LEFT JOIN barangays ON barangays.id = applicant_profiles.barangay_id
             LEFT JOIN beneficiary_profiles ON beneficiary_profiles.applicant_profile_id = applicant_profiles.id
             LEFT JOIN applications ON applications.applicant_profile_id = applicant_profiles.id
             LEFT JOIN staff_profiles AS assigned_staff
                ON assigned_staff.id = COALESCE(beneficiary_profiles.assigned_staff_profile_id, applications.assigned_staff_profile_id)
             LEFT JOIN users AS assigned_pdo_users ON assigned_pdo_users.id = assigned_staff.user_id
             WHERE users.id = :user_id
             LIMIT 1'
        );
        $statement->execute(['user_id' => $userId]);
        $row = $statement->fetch(PDO::FETCH_ASSOC);

        if (!is_array($row)) {
            return null;
        }

        if ($row['beneficiary_profile_id'] === null) {
            $beneficiaryProfileId = (new ApplicationService())->ensureApplicationFormsForUser($userId, $userId);
            if ($beneficiaryProfileId === null) {
                return null;
            }
            $row['beneficiary_profile_id'] = $beneficiaryProfileId;
        }

        return $row;
    }

    private function notifyPostApprovalSubmission(array $context, string $formTitle): void
    {
        $notificationService = new NotificationService();

        $recipientIds = $notificationService->activeUserIdsForRoles([ROLE_ADMIN]);
        $assignedStaffProfileId = (int) ($context['assigned_staff_profile_id'] ?? 0);
        $assignedUserId = $notificationService->userIdForStaffProfileId($assignedStaffProfileId);
        if ($assignedUserId !== null) {
            $recipientIds[] = $assignedUserId;
        }

        $applicantName = trim((string) ($context['full_name'] ?? ''));
        $businessName = trim((string) ($context['business_name'] ?? ''));
        $barangayName = trim((string) ($context['barangay_name'] ?? ''));

        $recipientIds = array_values(array_unique(array_filter($recipientIds, static fn (int $value): bool => $value > 0)));
        if ($recipientIds === []) {
            return;
        }

        $subject = trim($formTitle) !== '' ? $formTitle : 'Post-approval form';
        $recipientLabelParts = [];
        if ($applicantName !== '') {
            $recipientLabelParts[] = $applicantName;
        }
        if ($businessName !== '') {
            $recipientLabelParts[] = 'from ' . $businessName;
        }
        if ($barangayName !== '') {
            $recipientLabelParts[] = 'in ' . $barangayName;
        }
        $recipientLabel = $recipientLabelParts !== [] ? implode(' ', $recipientLabelParts) : 'A beneficiary';

        $notificationService->createInAppForUsers(
            $recipientIds,
            'Post-approval submission received',
            sprintf('%s submitted %s and it is awaiting review.', $recipientLabel, $subject),
            'post_approval'
        );
    }

    private function ensureStaffProfileSignatureColumns(): void
    {
        static $ensured = false;
        if ($ensured) {
            return;
        }

        $columns = [
            'signature_file_path' => 'ALTER TABLE staff_profiles ADD COLUMN signature_file_path VARCHAR(255) NULL AFTER position_title',
            'signature_original_name' => 'ALTER TABLE staff_profiles ADD COLUMN signature_original_name VARCHAR(255) NULL AFTER signature_file_path',
            'signature_mime_type' => 'ALTER TABLE staff_profiles ADD COLUMN signature_mime_type VARCHAR(120) NULL AFTER signature_original_name',
            'signature_file_size' => 'ALTER TABLE staff_profiles ADD COLUMN signature_file_size BIGINT UNSIGNED NULL AFTER signature_mime_type',
            'signature_uploaded_at' => 'ALTER TABLE staff_profiles ADD COLUMN signature_uploaded_at DATETIME NULL AFTER signature_file_size',
        ];

        foreach ($columns as $column => $sql) {
            $statement = db()->prepare(
                'SELECT COUNT(*) FROM information_schema.columns
                 WHERE table_schema = DATABASE()
                   AND table_name = :table_name
                   AND column_name = :column_name'
            );
            $statement->execute([
                'table_name' => 'staff_profiles',
                'column_name' => $column,
            ]);
            if ((int) $statement->fetchColumn() > 0) {
                continue;
            }

            db()->exec($sql);
        }

        $ensured = true;
    }

    private function assignedPdoName(array $context): string
    {
        return trim((string) ($context['assigned_pdo_name'] ?? ''));
    }

    private function assignedPdoTitle(array $context): string
    {
        $title = trim((string) ($context['assigned_pdo_title'] ?? ''));
        return $title !== '' ? $title : 'Project Officer';
    }

    private function assignedPdoSignature(array $context, ?array $fallback = null): ?array
    {
        $filePath = trim((string) ($context['assigned_pdo_signature_file_path'] ?? ''));
        if ($filePath !== '') {
            return [
                'file_path' => $filePath,
                'original_name' => trim((string) ($context['assigned_pdo_signature_original_name'] ?? basename($filePath))),
                'mime_type' => trim((string) ($context['assigned_pdo_signature_mime_type'] ?? '')),
                'file_size' => (int) ($context['assigned_pdo_signature_file_size'] ?? 0),
                'uploaded_at' => trim((string) ($context['assigned_pdo_signature_uploaded_at'] ?? '')),
            ];
        }

        return $fallback;
    }

    private function assignedPdoSignedDate(array $signoff, ?string $reviewedAt = null): string
    {
        $existing = trim((string) ($signoff['signedDate'] ?? $signoff['approvedDate'] ?? $signoff['reviewerDate'] ?? ''));
        if ($existing !== '') {
            return $existing;
        }

        if ($reviewedAt !== null && trim($reviewedAt) !== '') {
            $timestamp = strtotime($reviewedAt);
            if ($timestamp !== false) {
                return date('Y-m-d', $timestamp);
            }
        }

        return '';
    }

    private function applyAssignedPdoSignoffDefaults(string $code, array $payload, array $context, ?string $reviewedAt = null): array
    {
        $assignedName = $this->assignedPdoName($context);
        if ($assignedName === '') {
            return $payload;
        }

        $assignedTitle = $this->assignedPdoTitle($context);

        if ($code === POST_APPROVAL_TASK_AVAILMENT_FORM) {
            $payload['staffReview'] = $payload['staffReview'] ?? [];

            $pageOne = $payload['staffReview']['pageOneCertification'] ?? [];
            $payload['staffReview']['pageOneCertification'] = array_replace($pageOne, [
                'directWorkerName' => $assignedName,
                'directWorkerTitle' => $assignedTitle,
                'signedDate' => $this->assignedPdoSignedDate($pageOne, $reviewedAt),
                'signatureUpload' => $this->assignedPdoSignature($context, $pageOne['signatureUpload'] ?? null),
            ]);

            $food = $payload['staffReview']['physicalRequirements']['foodRelatedCertification'] ?? [];
            $payload['staffReview']['physicalRequirements']['foodRelatedCertification'] = array_replace($food, [
                'certifyingOfficerName' => $assignedName,
                'certifyingOfficerTitle' => $assignedTitle,
                'signedDate' => $this->assignedPdoSignedDate($food, $reviewedAt),
                'signatureUpload' => $this->assignedPdoSignature($context, $food['signatureUpload'] ?? null),
            ]);

            $residency = $payload['staffReview']['psychoSocialRequirements']['residencyAndCharacter'] ?? [];
            $payload['staffReview']['psychoSocialRequirements']['residencyAndCharacter'] = array_replace($residency, [
                'certifyingOfficerName' => $assignedName,
                'certifyingOfficerTitle' => $assignedTitle,
                'signedDate' => $this->assignedPdoSignedDate($residency, $reviewedAt),
                'signatureUpload' => $this->assignedPdoSignature($context, $residency['signatureUpload'] ?? null),
            ]);

            $relationships = $payload['staffReview']['psychoSocialRequirements']['familyRelationshipsWorkHabitsAspiration'] ?? [];
            $payload['staffReview']['psychoSocialRequirements']['familyRelationshipsWorkHabitsAspiration'] = array_replace($relationships, [
                'directWorkerName' => $assignedName,
                'directWorkerTitle' => $assignedTitle,
                'signedDate' => $this->assignedPdoSignedDate($relationships, $reviewedAt),
                'signatureUpload' => $this->assignedPdoSignature($context, $relationships['signatureUpload'] ?? null),
            ]);

            return $payload;
        }

        if ($code === POST_APPROVAL_TASK_VALIDATION_FORM) {
            $payload['staffReview'] = $payload['staffReview'] ?? [];
            $identity = $payload['staffReview']['validatorIdentity'] ?? [];
            $payload['staffReview']['validatorIdentity'] = array_replace($identity, [
                'validatorName' => $assignedName,
                'validatorTitle' => $assignedTitle,
                'signedDate' => $this->assignedPdoSignedDate($identity, $reviewedAt),
                'signatureUpload' => $this->assignedPdoSignature($context, $identity['signatureUpload'] ?? null),
            ]);

            return $payload;
        }

        if ($code === POST_APPROVAL_TASK_MUNGKAHING_PROYEKTO) {
            return $payload;
        }

        if ($code === POST_APPROVAL_TASK_BUSINESS_PLAN) {
            $payload['staffReview'] = $payload['staffReview'] ?? [];
            $approval = $payload['staffReview']['approval'] ?? [];
            $payload['staffReview']['approval'] = array_replace($approval, [
                'approverName' => $assignedName,
                'approverTitle' => $assignedTitle,
                'approvedDate' => $this->assignedPdoSignedDate($approval, $reviewedAt),
                'signatureUpload' => $this->assignedPdoSignature($context, $approval['signatureUpload'] ?? null),
            ]);

            return $payload;
        }

        if ($code === POST_APPROVAL_TASK_BUHAT_SA_PAGPANUMPA) {
            $payload['staffReview'] = $payload['staffReview'] ?? [];
            $verification = $payload['staffReview']['verification'] ?? [];
            $payload['staffReview']['verification'] = array_replace($verification, [
                'reviewerName' => $assignedName,
                'reviewerTitle' => $assignedTitle,
                'reviewerDate' => $this->assignedPdoSignedDate($verification, $reviewedAt),
                'signatureUpload' => $this->assignedPdoSignature($context, $verification['signatureUpload'] ?? null),
            ]);

            return $payload;
        }

        return $payload;
    }

    private function findLatestUnlockAt(int $applicantProfileId): ?string
    {
        $statement = db()->prepare(
            'SELECT MAX(post_approval_unlocked_at)
             FROM training_invitees
             WHERE applicant_profile_id = :applicant_profile_id'
        );
        $statement->execute(['applicant_profile_id' => $applicantProfileId]);
        $value = $statement->fetchColumn();

        return is_string($value) && trim($value) !== '' ? $value : null;
    }

    private function openedSeminarAccessForApplicant(int $applicantProfileId): array
    {
        if ($applicantProfileId <= 0) {
            return ['codes' => [], 'openedAt' => null, 'programs' => []];
        }

        $statement = db()->prepare(
            'SELECT
                training_programs.id AS training_program_id,
                training_programs.title,
                training_programs.starts_at,
                training_programs.ends_at,
                training_programs.updated_at,
                training_programs.created_at,
                training_programs.seminar_form_codes,
                training_invitees.invite_status
             FROM training_invitees
             INNER JOIN training_programs ON training_programs.id = training_invitees.training_program_id
             WHERE training_invitees.applicant_profile_id = :applicant_profile_id
               AND training_invitees.invite_status IN ("Scheduled", "Notified", "Attended", "Completed")
             ORDER BY training_programs.starts_at ASC, training_invitees.id ASC'
        );
        $statement->execute(['applicant_profile_id' => $applicantProfileId]);
        $rows = $statement->fetchAll(PDO::FETCH_ASSOC) ?: [];

        $codes = [];
        $openedAt = null;
        $closesAt = null;
        $programs = [];

        foreach ($rows as $row) {
            $programCodes = $this->sanitizeSeminarFormCodes($this->decodeJsonArray($row['seminar_form_codes'] ?? null));
            if ($programCodes === []) {
                continue;
            }

            foreach ($programCodes as $code) {
                $codes[$code] = true;
            }

            $candidateOpenedAt = trim((string) ($row['updated_at'] ?? $row['created_at'] ?? $row['starts_at'] ?? ''));
            if ($candidateOpenedAt !== '' && ($openedAt === null || strtotime($candidateOpenedAt) > strtotime($openedAt))) {
                $openedAt = $candidateOpenedAt;
            }

            $candidateClosesAt = trim((string) ($row['starts_at'] ?? ''));
            if ($candidateClosesAt !== '' && ($closesAt === null || strtotime($candidateClosesAt) < strtotime($closesAt))) {
                $closesAt = $candidateClosesAt;
            }

            $programs[] = [
                'id' => (int) ($row['training_program_id'] ?? 0),
                'title' => (string) ($row['title'] ?? ''),
                'startsAt' => (string) ($row['starts_at'] ?? ''),
                'endsAt' => (string) ($row['ends_at'] ?? ''),
                'openedAt' => $candidateOpenedAt,
                'closesAt' => $candidateClosesAt,
                'codes' => $programCodes,
            ];
        }

        return [
            'codes' => array_keys($codes),
            'openedAt' => $openedAt,
            'closesAt' => $closesAt,
            'programs' => $programs,
        ];
    }

    private function scheduleByCode(array $seminarAccess): array
    {
        $byCode = [];
        foreach (($seminarAccess['programs'] ?? []) as $program) {
            if (!is_array($program)) {
                continue;
            }

            $codes = is_array($program['codes'] ?? null) ? $program['codes'] : [];
            foreach ($codes as $code) {
                $candidate = [
                    'openedAt' => $program['openedAt'] ?? ($seminarAccess['openedAt'] ?? null),
                    'closesAt' => $program['closesAt'] ?? null,
                    'programTitle' => (string) ($program['title'] ?? ''),
                    'trainingStartsAt' => $program['startsAt'] ?? null,
                    'trainingEndsAt' => $program['endsAt'] ?? null,
                ];

                $existingCloseAt = strtotime((string) ($byCode[$code]['closesAt'] ?? ''));
                $candidateCloseAt = strtotime((string) ($candidate['closesAt'] ?? ''));
                if (!isset($byCode[$code]) || ($candidateCloseAt !== false && ($existingCloseAt === false || $candidateCloseAt < $existingCloseAt))) {
                    $byCode[$code] = $candidate;
                }
            }
        }

        return $byCode;
    }

    private function fetchTasks(int $beneficiaryProfileId, array $context, array $seminarAccess): array
    {
        $statement = db()->prepare(
            'SELECT
                post_approval_tasks.id,
                post_approval_tasks.status,
                post_approval_tasks.due_date,
                post_approval_tasks.form_payload,
                post_approval_tasks.applicant_started_at,
                post_approval_tasks.applicant_submitted_at,
                post_approval_tasks.reviewed_at,
                post_approval_tasks.reviewer_remarks,
                post_approval_task_types.code,
                post_approval_task_types.label
             FROM post_approval_tasks
             INNER JOIN post_approval_task_types ON post_approval_task_types.id = post_approval_tasks.task_type_id
             WHERE post_approval_tasks.beneficiary_profile_id = :beneficiary_profile_id
               AND post_approval_task_types.code <> "seminar_attendance"
            ORDER BY FIELD(
                  post_approval_task_types.code,
                  "availment_form",
                  "validation_form",
                  "mungkahing_proyekto",
                  "business_plan",
                  "buhat_sa_pagpanumpa"
              ), post_approval_tasks.id ASC'
        );
        $statement->execute(['beneficiary_profile_id' => $beneficiaryProfileId]);
        $rows = $statement->fetchAll(PDO::FETCH_ASSOC) ?: [];
        $allowedMap = array_fill_keys($seminarAccess['codes'] ?? [], true);
        $rows = array_values(array_filter($rows, static fn (array $row): bool => isset($allowedMap[(string) ($row['code'] ?? '')])));

        $scheduleByCode = $this->scheduleByCode($seminarAccess);

        return array_map(function (array $row) use ($context, $scheduleByCode): array {
            $task = $this->mapTask($row, $context);
            $task['schedule'] = $scheduleByCode[(string) ($row['code'] ?? '')] ?? [
                'openedAt' => null,
                'closesAt' => $task['dueDate'] ?? null,
                'programTitle' => '',
                'trainingStartsAt' => null,
                'trainingEndsAt' => null,
            ];
            if (empty($task['dueDate']) && !empty($task['schedule']['closesAt'])) {
                $task['dueDate'] = $task['schedule']['closesAt'];
            }
            return $task;
        }, $rows);
    }

    private function findTaskByCode(int $beneficiaryProfileId, string $code): ?array
    {
        $statement = db()->prepare(
            'SELECT
                post_approval_tasks.id,
                post_approval_tasks.status,
                post_approval_tasks.due_date,
                post_approval_tasks.form_payload,
                post_approval_tasks.applicant_started_at,
                post_approval_tasks.applicant_submitted_at,
                post_approval_tasks.reviewed_at,
                post_approval_tasks.reviewer_remarks,
                post_approval_task_types.code,
                post_approval_task_types.label
             FROM post_approval_tasks
             INNER JOIN post_approval_task_types ON post_approval_task_types.id = post_approval_tasks.task_type_id
             WHERE post_approval_tasks.beneficiary_profile_id = :beneficiary_profile_id
               AND post_approval_task_types.code = :code
             LIMIT 1'
        );
        $statement->execute([
            'beneficiary_profile_id' => $beneficiaryProfileId,
            'code' => $code,
        ]);
        $row = $statement->fetch(PDO::FETCH_ASSOC);

        return is_array($row) ? $row : null;
    }

    private function mapTask(array $row, array $context): array
    {
        $code = (string) $row['code'];
        $definition = $this->taskDefinitions()[$code] ?? [
            'title' => $row['label'] ?? ucfirst(str_replace('_', ' ', $code)),
            'summary' => '',
            'helpText' => '',
            'interactive' => false,
            'applicantSections' => [],
            'staffSections' => [],
        ];

        $payload = $this->decodePayload($row['form_payload'] ?? null) ?? $this->defaultPayload($code, $context);
        $payload = $this->applyKnownApplicantDefaults($code, $payload, $context);
        if ($code === POST_APPROVAL_TASK_MUNGKAHING_PROYEKTO) {
            $payload['sectoralClassification'] = $this->normalizeMungkahingSectoralClassification($payload['sectoralClassification'] ?? []);
        }
        $payload = $this->applyAssignedPdoSignoffDefaults(
            $code,
            $payload,
            $context,
            is_string($row['reviewed_at'] ?? null) ? (string) $row['reviewed_at'] : null
        );
        $status = $this->normalizeStatus((string) ($row['status'] ?? POST_APPROVAL_STATUS_UNLOCKED));
        if ($this->shouldHideSignatureUploadsForApplicant($status)) {
            $this->removeSignatureUploadsFromPayload($payload);
        }

        return [
            'id' => (int) $row['id'],
            'code' => $code,
            'title' => $definition['title'],
            'summary' => $definition['summary'],
            'helpText' => $definition['helpText'],
            'status' => $status,
            'interactive' => (bool) ($definition['interactive'] ?? false),
            'staged' => !((bool) ($definition['interactive'] ?? false)),
            'dueDate' => $row['due_date'],
            'startedAt' => $row['applicant_started_at'],
            'submittedAt' => $row['applicant_submitted_at'],
            'reviewedAt' => $row['reviewed_at'],
            'reviewerRemarks' => $row['reviewer_remarks'],
            'applicantSections' => $definition['applicantSections'],
            'staffSections' => $definition['staffSections'],
            'assignedPdo' => [
                'name' => $this->assignedPdoName($context),
                'title' => $this->assignedPdoTitle($context),
                'signatureUpload' => $this->assignedPdoSignature($context),
                'hasSavedSignature' => $this->assignedPdoSignature($context) !== null,
            ],
            'file' => $this->normalizeUploadMetadata($payload['staffReview']['reviewAttachment'] ?? null),
            'payload' => $payload,
            'completion' => $this->completionForTask($code, $payload),
        ];
    }

    private function applyKnownApplicantDefaults(string $code, array $payload, array $context): array
    {
        $fullName = trim((string) ($context['full_name'] ?? ''));
        $age = $context['age'] !== null ? trim((string) $context['age']) : '';
        $address = $this->buildDefaultAddress($context);
        $barangay = trim((string) ($context['barangay_name'] ?? ''));
        $birthdate = trim((string) ($context['birthdate'] ?? ''));
        $contactNumber = trim((string) ($context['contact_number'] ?? ''));
        $businessName = trim((string) ($context['business_name'] ?? ''));

        if ($code === POST_APPROVAL_TASK_AVAILMENT_FORM) {
            $this->fillBlankPayloadPath($payload, 'clientIdentifyingData.name', $fullName);
            $this->fillBlankPayloadPath($payload, 'clientIdentifyingData.age', $age);
            $this->fillBlankPayloadPath($payload, 'clientIdentifyingData.address', $address);
            $this->fillBlankPayloadPath($payload, 'clientIdentifyingData.city', 'Butuan City');
            $this->fillBlankPayloadPath($payload, 'applicantSignature.signedName', $fullName);
            $this->fillBlankPayloadPath($payload, 'applicantSignature.signedDate', date('Y-m-d'));
            $this->fillBlankPayloadPath($payload, 'pageOneCertification.eligibilityStatementName', $fullName);
            $this->fillBlankPayloadPath($payload, 'physicalRequirements.foodRelatedCertification.applicantName', $fullName);
            $this->fillBlankPayloadPath($payload, 'psychoSocialRequirements.residencyAndCharacter.residentName', $fullName);
            $this->fillBlankPayloadPath($payload, 'psychoSocialRequirements.familyRelationshipsWorkHabitsAspiration.applicantName', $fullName);
            return $payload;
        }

        if ($code === POST_APPROVAL_TASK_VALIDATION_FORM) {
            $name = $this->splitName($fullName);
            $this->fillBlankPayloadPath($payload, 'applicantDetails.validationDate', date('Y-m-d'));
            $this->fillBlankPayloadPath($payload, 'applicantDetails.lastName', $name['lastName']);
            $this->fillBlankPayloadPath($payload, 'applicantDetails.firstName', $name['firstName']);
            $this->fillBlankPayloadPath($payload, 'applicantDetails.middleName', $name['middleName']);
            $this->fillBlankPayloadPath($payload, 'applicantDetails.barangay', $barangay);
            $this->fillBlankPayloadPath($payload, 'applicantDetails.birthdate', $birthdate);
            $this->fillBlankPayloadPath($payload, 'applicantDetails.contactNumber', $contactNumber);
            if (((int) ($context['is_4ps'] ?? 0)) === 1) {
                $this->fillBlankPayloadPath($payload, 'membershipChecklist.pantawidMember', 'Yes');
            }
            $this->fillBlankPayloadPath($payload, 'participantSignature.signedName', $fullName);
            $this->fillBlankPayloadPath($payload, 'participantSignature.signedDate', date('Y-m-d'));
            return $payload;
        }

        if ($code === POST_APPROVAL_TASK_MUNGKAHING_PROYEKTO) {
            $this->fillBlankPayloadPath($payload, 'projectInformation.participantName', $fullName);
            $this->fillBlankPayloadPath($payload, 'projectInformation.projectTitle', $businessName);
            $this->fillBlankPayloadPath($payload, 'projectInformation.projectLocation', $address);
            $this->fillBlankPayloadPath($payload, 'projectInformation.projectDate', date('Y-m-d'));
            $this->fillBlankPayloadPath($payload, 'applicantSignature.signedName', $fullName);
            $this->fillBlankPayloadPath($payload, 'applicantSignature.signedDate', date('Y-m-d'));
            return $payload;
        }

        if ($code === POST_APPROVAL_TASK_BUSINESS_PLAN) {
            $this->fillBlankPayloadPath($payload, 'applicantSignature.signedName', $fullName);
            $this->fillBlankPayloadPath($payload, 'applicantSignature.signedDate', date('Y-m-d'));
            return $payload;
        }

        if ($code === POST_APPROVAL_TASK_BUHAT_SA_PAGPANUMPA) {
            $this->fillBlankPayloadPath($payload, 'beneficiary.fullName', $fullName);
            $this->fillBlankPayloadPath($payload, 'beneficiary.addressLine', trim((string) ($context['address_line'] ?? '')));
            $this->fillBlankPayloadPath($payload, 'beneficiary.barangay', $barangay);
            $this->fillBlankPayloadPath($payload, 'beneficiary.city', 'Butuan City');
            $this->fillBlankPayloadPath($payload, 'project.programStatement', $this->buhatProgramStatement());
            $this->fillBlankPayloadPath($payload, 'project.programShortName', $this->buhatProgramShortName());
            $this->fillBlankPayloadPath($payload, 'project.amountInWords', $this->buhatAmountInWords());
            $this->fillBlankPayloadPath($payload, 'project.amountNumeric', $this->buhatAmountNumeric());
            $this->fillBlankPayloadPath($payload, 'agreement.currentDateWords', $this->formatBuhatDateWords());
            $this->fillBlankPayloadPath($payload, 'applicantSignature.signedName', $fullName);
        }

        return $payload;
    }

    private function clearDraftSignatureUploadsOnLoad(array $task): array
    {
        $status = $this->normalizeStatus((string) ($task['status'] ?? ''));
        if (!$this->shouldHideSignatureUploadsForApplicant($status)) {
            return $task;
        }

        $payload = $this->decodePayload($task['form_payload'] ?? null);
        if ($payload === null) {
            return $task;
        }

        $originalPayload = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        $this->removeSignatureUploadsFromPayload($payload);
        $updatedPayload = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if ($originalPayload === $updatedPayload) {
            return $task;
        }

        try {
            db()->prepare(
                'UPDATE post_approval_tasks
                 SET form_payload = :form_payload,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = :id'
            )->execute([
                'form_payload' => $updatedPayload,
                'id' => (int) $task['id'],
            ]);
            $task['form_payload'] = $updatedPayload;
        } catch (\Throwable $exception) {
            log_database_query_failure('post_approval.clear_draft_signatures_on_load', $exception, ['task_id' => (int) $task['id']]);
            $task['form_payload'] = $updatedPayload;
        }

        return $task;
    }

    private function shouldHideSignatureUploadsForApplicant(string $status): bool
    {
        return in_array($status, [
            POST_APPROVAL_STATUS_UNLOCKED,
            POST_APPROVAL_STATUS_IN_PROGRESS,
            POST_APPROVAL_STATUS_NEEDS_CORRECTION,
            POST_APPROVAL_STATUS_REJECTED,
        ], true);
    }

    private function removeSignatureUploadsFromPayload(array &$payload): void
    {
        foreach ($payload as $key => &$value) {
            if ($key === 'signatureUpload') {
                unset($payload[$key]);
                continue;
            }

            if (is_array($value)) {
                $this->removeSignatureUploadsFromPayload($value);
            }
        }
        unset($value);
    }

    private function buildSummary(array $tasks): array
    {
        $summary = [
            'total' => count($tasks),
            'unlocked' => 0,
            'inProgress' => 0,
            'submitted' => 0,
            'verified' => 0,
            'needsCorrection' => 0,
            'rejected' => 0,
        ];

        foreach ($tasks as $task) {
            switch ($task['status']) {
                case POST_APPROVAL_STATUS_UNLOCKED:
                    $summary['unlocked']++;
                    break;
                case POST_APPROVAL_STATUS_IN_PROGRESS:
                    $summary['inProgress']++;
                    break;
                case POST_APPROVAL_STATUS_SUBMITTED:
                    $summary['submitted']++;
                    break;
                case POST_APPROVAL_STATUS_VERIFIED:
                    $summary['verified']++;
                    break;
                case POST_APPROVAL_STATUS_NEEDS_CORRECTION:
                    $summary['needsCorrection']++;
                    break;
                case POST_APPROVAL_STATUS_REJECTED:
                    $summary['rejected']++;
                    break;
            }
        }

        return $summary;
    }

    private function validatePayload(string $code, array $payload, array $context, bool $strict): array
    {
        $result = match ($code) {
            POST_APPROVAL_TASK_AVAILMENT_FORM => $this->validateAvailmentPayload($payload, $context, $strict),
            POST_APPROVAL_TASK_VALIDATION_FORM => $this->validateValidationPayload($payload, $context, $strict),
            POST_APPROVAL_TASK_MUNGKAHING_PROYEKTO => $this->validateMungkahingPayload($payload, $context, $strict),
            POST_APPROVAL_TASK_BUSINESS_PLAN => $this->validateBusinessPlanPayload($payload, $context, $strict),
            POST_APPROVAL_TASK_BUHAT_SA_PAGPANUMPA => $this->validateBuhatSaPagpanumpaPayload($payload, $context, $strict),
            POST_APPROVAL_TASK_FUND_RELEASE_EVIDENCE => $this->validateFundReleaseEvidencePayload($payload, $context, $strict),
            default => ['payload' => $payload, 'errors' => ['task' => 'Unsupported digital form.']],
        };

        if (isset($result['payload']) && is_array($result['payload'])) {
            $result['payload'] = $this->applyAssignedPdoSignoffDefaults($code, $result['payload'], $context);
        }

        return $result;
    }

    private function validateAvailmentPayload(array $payload, array $context, bool $strict): array
    {
        $rows = [];
        foreach (($payload['familyEnterprise']['members'] ?? []) as $row) {
            if (!is_array($row)) {
                continue;
            }
            $name = trim((string) ($row['name'] ?? ''));
            $age = trim((string) ($row['age'] ?? ''));
            $activities = trim((string) ($row['activities'] ?? ''));
            if ($name === '' && $age === '' && $activities === '') {
                continue;
            }
            $rows[] = ['name' => $name, 'age' => $age, 'activities' => $activities];
        }

        $incomeRows = [];
        foreach (($payload['incomeEligibility']['rows'] ?? []) as $row) {
            if (!is_array($row)) {
                continue;
            }
            $memberName = trim((string) ($row['memberName'] ?? ''));
            $cashIncome = trim((string) ($row['cashIncome'] ?? ''));
            $nonCashIncome = trim((string) ($row['nonCashIncome'] ?? ''));
            $totalIncome = trim((string) ($row['totalIncome'] ?? ''));
            if ($memberName === '' && $cashIncome === '' && $nonCashIncome === '' && $totalIncome === '') {
                continue;
            }
            $incomeRows[] = [
                'memberName' => $memberName,
                'cashIncome' => $cashIncome,
                'nonCashIncome' => $nonCashIncome,
                'totalIncome' => $totalIncome,
            ];
        }

        $healthRows = [];
        foreach (($payload['staffReview']['physicalRequirements']['healthAgeRows'] ?? []) as $row) {
            if (!is_array($row)) {
                continue;
            }
            $requirement = trim((string) ($row['requirement'] ?? ''));
            $age = trim((string) ($row['age'] ?? ''));
            $healthStatus = trim((string) ($row['healthStatus'] ?? ''));
            if ($requirement === '' && $age === '' && $healthStatus === '') {
                continue;
            }
            $healthRows[] = [
                'requirement' => $requirement,
                'age' => $age,
                'healthStatus' => $healthStatus,
            ];
        }

        $approval = $payload['staffReview']['approval'] ?? [];
        $clean = [
            'clientIdentifyingData' => [
                'name' => trim((string) ($payload['clientIdentifyingData']['name'] ?? ($context['full_name'] ?? ''))),
                'age' => trim((string) ($payload['clientIdentifyingData']['age'] ?? ($context['age'] ?? ''))),
                'address' => trim((string) ($payload['clientIdentifyingData']['address'] ?? $this->buildDefaultAddress($context))),
                'spouseName' => trim((string) ($payload['clientIdentifyingData']['spouseName'] ?? '')),
                'city' => 'Butuan City',
            ],
            'familyEnterprise' => [
                'members' => $rows,
            ],
            'individualAssistance' => [
                'clienteleCategory' => trim((string) ($payload['individualAssistance']['clienteleCategory'] ?? '')),
                'natureOfDifficultCircumstances' => trim((string) ($payload['individualAssistance']['natureOfDifficultCircumstances'] ?? '')),
            ],
            'incomeEligibility' => [
                'rows' => $incomeRows,
                'totalFamilyIncome' => trim((string) ($payload['incomeEligibility']['totalFamilyIncome'] ?? '')),
            ],
            'clientCommitment' => [
                // Preserve the payload shape for existing records, but the applicant
                // now reviews this as a paper-faithful certification statement instead
                // of three separate checkboxes and a notes field.
                'agreedToPolicies' => true,
                'agreedToRollBackSchedule' => true,
                'agreedToWeeklySavings' => true,
                'notes' => '',
            ],
            'applicantSignature' => [
                'signedName' => trim((string) ($payload['applicantSignature']['signedName'] ?? ($context['full_name'] ?? ''))),
                'signedDate' => trim((string) ($payload['applicantSignature']['signedDate'] ?? '')) !== ''
                    ? trim((string) $payload['applicantSignature']['signedDate'])
                    : date('Y-m-d'),
                'signatureUpload' => $this->normalizeUploadMetadata($payload['applicantSignature']['signatureUpload'] ?? null),
            ],
            'staffReview' => [
                'pageOneCertification' => [
                    'eligibilityStatementName' => trim((string) ($payload['staffReview']['pageOneCertification']['eligibilityStatementName'] ?? ($context['full_name'] ?? ''))),
                    'directWorkerName' => trim((string) ($payload['staffReview']['pageOneCertification']['directWorkerName'] ?? '')),
                    'directWorkerTitle' => trim((string) ($payload['staffReview']['pageOneCertification']['directWorkerTitle'] ?? '')),
                    'signedDate' => trim((string) ($payload['staffReview']['pageOneCertification']['signedDate'] ?? '')),
                    'signatureUpload' => $this->normalizeUploadMetadata($payload['staffReview']['pageOneCertification']['signatureUpload'] ?? null),
                ],
                'physicalRequirements' => [
                    'healthAgeRows' => $healthRows,
                    'foodRelatedCertification' => [
                        'applicantName' => trim((string) ($payload['staffReview']['physicalRequirements']['foodRelatedCertification']['applicantName'] ?? ($context['full_name'] ?? ''))),
                        'requiresMedicalClearance' => trim((string) ($payload['staffReview']['physicalRequirements']['foodRelatedCertification']['requiresMedicalClearance'] ?? '')),
                        'medicalCheckupCompleted' => trim((string) ($payload['staffReview']['physicalRequirements']['foodRelatedCertification']['medicalCheckupCompleted'] ?? '')),
                        'medicallyFit' => trim((string) ($payload['staffReview']['physicalRequirements']['foodRelatedCertification']['medicallyFit'] ?? '')),
                        'certifyingOfficerName' => trim((string) ($payload['staffReview']['physicalRequirements']['foodRelatedCertification']['certifyingOfficerName'] ?? '')),
                        'certifyingOfficerTitle' => trim((string) ($payload['staffReview']['physicalRequirements']['foodRelatedCertification']['certifyingOfficerTitle'] ?? '')),
                        'signedDate' => trim((string) ($payload['staffReview']['physicalRequirements']['foodRelatedCertification']['signedDate'] ?? '')),
                        'signatureUpload' => $this->normalizeUploadMetadata($payload['staffReview']['physicalRequirements']['foodRelatedCertification']['signatureUpload'] ?? null),
                    ],
                ],
                'psychoSocialRequirements' => [
                    'residencyAndCharacter' => [
                        'residentName' => trim((string) ($payload['staffReview']['psychoSocialRequirements']['residencyAndCharacter']['residentName'] ?? ($context['full_name'] ?? ''))),
                        'barangay' => trim((string) ($payload['staffReview']['psychoSocialRequirements']['residencyAndCharacter']['barangay'] ?? ($context['barangay_name'] ?? ''))),
                        'isBonaFideResident' => trim((string) ($payload['staffReview']['psychoSocialRequirements']['residencyAndCharacter']['isBonaFideResident'] ?? '')),
                        'goodMoralCharacter' => trim((string) ($payload['staffReview']['psychoSocialRequirements']['residencyAndCharacter']['goodMoralCharacter'] ?? '')),
                        'hasNoAdverseReputation' => trim((string) ($payload['staffReview']['psychoSocialRequirements']['residencyAndCharacter']['hasNoAdverseReputation'] ?? '')),
                        'certifyingOfficerName' => trim((string) ($payload['staffReview']['psychoSocialRequirements']['residencyAndCharacter']['certifyingOfficerName'] ?? '')),
                        'certifyingOfficerTitle' => trim((string) ($payload['staffReview']['psychoSocialRequirements']['residencyAndCharacter']['certifyingOfficerTitle'] ?? '')),
                        'signedDate' => trim((string) ($payload['staffReview']['psychoSocialRequirements']['residencyAndCharacter']['signedDate'] ?? '')),
                        'signatureUpload' => $this->normalizeUploadMetadata($payload['staffReview']['psychoSocialRequirements']['residencyAndCharacter']['signatureUpload'] ?? null),
                    ],
                    'familyRelationshipsWorkHabitsAspiration' => [
                        'applicantName' => trim((string) ($payload['staffReview']['psychoSocialRequirements']['familyRelationshipsWorkHabitsAspiration']['applicantName'] ?? ($context['full_name'] ?? ''))),
                        'positiveRelationships' => trim((string) ($payload['staffReview']['psychoSocialRequirements']['familyRelationshipsWorkHabitsAspiration']['positiveRelationships'] ?? '')),
                        'goodWorkHabitsAndAttitude' => trim((string) ($payload['staffReview']['psychoSocialRequirements']['familyRelationshipsWorkHabitsAspiration']['goodWorkHabitsAndAttitude'] ?? '')),
                        'adequateEconomicAspiration' => trim((string) ($payload['staffReview']['psychoSocialRequirements']['familyRelationshipsWorkHabitsAspiration']['adequateEconomicAspiration'] ?? '')),
                        'findingText' => trim((string) ($payload['staffReview']['psychoSocialRequirements']['familyRelationshipsWorkHabitsAspiration']['findingText'] ?? '')),
                        'directWorkerName' => trim((string) ($payload['staffReview']['psychoSocialRequirements']['familyRelationshipsWorkHabitsAspiration']['directWorkerName'] ?? '')),
                        'directWorkerTitle' => trim((string) ($payload['staffReview']['psychoSocialRequirements']['familyRelationshipsWorkHabitsAspiration']['directWorkerTitle'] ?? '')),
                        'signedDate' => trim((string) ($payload['staffReview']['psychoSocialRequirements']['familyRelationshipsWorkHabitsAspiration']['signedDate'] ?? '')),
                        'signatureUpload' => $this->normalizeUploadMetadata($payload['staffReview']['psychoSocialRequirements']['familyRelationshipsWorkHabitsAspiration']['signatureUpload'] ?? null),
                    ],
                    'socialResponsibility' => [
                        'abidePolicies' => trim((string) ($payload['staffReview']['psychoSocialRequirements']['socialResponsibility']['abidePolicies'] ?? '')),
                        'payRollBackOnTime' => trim((string) ($payload['staffReview']['psychoSocialRequirements']['socialResponsibility']['payRollBackOnTime'] ?? '')),
                        'generateWeeklySavings' => trim((string) ($payload['staffReview']['psychoSocialRequirements']['socialResponsibility']['generateWeeklySavings'] ?? '')),
                        'acknowledgementText' => trim((string) ($payload['staffReview']['psychoSocialRequirements']['socialResponsibility']['acknowledgementText'] ?? '')),
                    ],
                ],
            ],
        ];

        $errors = [];
        if ($strict) {
            if ($clean['clientIdentifyingData']['name'] === '') {
                $errors['clientIdentifyingData.name'] = 'Client name is required.';
            }
            if ($clean['clientIdentifyingData']['age'] === '') {
                $errors['clientIdentifyingData.age'] = 'Age is required.';
            }
            if ($clean['clientIdentifyingData']['address'] === '') {
                $errors['clientIdentifyingData.address'] = 'Address is required.';
            }
            if ($clean['individualAssistance']['clienteleCategory'] === '') {
                $errors['individualAssistance.clienteleCategory'] = 'Clientele category is required.';
            }
            if ($clean['individualAssistance']['natureOfDifficultCircumstances'] === '') {
                $errors['individualAssistance.natureOfDifficultCircumstances'] = 'Nature of difficult circumstances is required.';
            }
            if ($clean['incomeEligibility']['rows'] === []) {
                $errors['incomeEligibility.rows'] = 'Add at least one family income row.';
            }
            if ($clean['applicantSignature']['signedName'] === '') {
                $errors['applicantSignature.signedName'] = 'Type the applicant name for the signature block.';
            }
            if ($clean['applicantSignature']['signedDate'] === '') {
                $errors['applicantSignature.signedDate'] = 'Date signed is required.';
            }
            if ($clean['applicantSignature']['signatureUpload'] === null) {
                $errors['applicantSignature.signatureUpload'] = 'Upload the applicant e-signature file.';
            }
        }

        return ['payload' => $clean, 'errors' => $errors];
    }

    private function validateValidationPayload(array $payload, array $context, bool $strict): array
    {
        $name = $this->splitName((string) ($context['full_name'] ?? ''));
        $validatorIdentity = $payload['staffReview']['validatorIdentity'] ?? [];
        $eligibility = $payload['staffReview']['eligibilityAssessment'] ?? [];
        $clean = [
            'applicantDetails' => [
                'validationDate' => trim((string) ($payload['applicantDetails']['validationDate'] ?? date('Y-m-d'))),
                'lastName' => trim((string) ($payload['applicantDetails']['lastName'] ?? $name['lastName'])),
                'firstName' => trim((string) ($payload['applicantDetails']['firstName'] ?? $name['firstName'])),
                'middleName' => trim((string) ($payload['applicantDetails']['middleName'] ?? $name['middleName'])),
                'purok' => trim((string) ($payload['applicantDetails']['purok'] ?? '')),
                'barangay' => trim((string) ($payload['applicantDetails']['barangay'] ?? ($context['barangay_name'] ?? ''))),
                'birthdate' => trim((string) ($payload['applicantDetails']['birthdate'] ?? ($context['birthdate'] ?? ''))),
                'educationalAttainment' => trim((string) ($payload['applicantDetails']['educationalAttainment'] ?? '')),
                'contactNumber' => trim((string) ($payload['applicantDetails']['contactNumber'] ?? ($context['contact_number'] ?? ''))),
            ],
            'membershipChecklist' => [
                'pantawidMember' => $this->normalizeYesNo((string) ($payload['membershipChecklist']['pantawidMember'] ?? (((int) ($context['is_4ps'] ?? 0)) === 1 ? 'Yes' : 'No'))),
                'pantawidSpecify' => trim((string) ($payload['membershipChecklist']['pantawidSpecify'] ?? '')),
                'slpaMember' => $this->normalizeYesNo((string) ($payload['membershipChecklist']['slpaMember'] ?? '')),
                'slpaSpecify' => trim((string) ($payload['membershipChecklist']['slpaSpecify'] ?? '')),
            ],
            'participantSignature' => [
                'signedName' => trim((string) ($payload['participantSignature']['signedName'] ?? ($context['full_name'] ?? ''))),
                'signedDate' => trim((string) ($payload['participantSignature']['signedDate'] ?? date('Y-m-d'))),
                'signatureUpload' => $this->normalizeUploadMetadata($payload['participantSignature']['signatureUpload'] ?? null),
            ],
            'staffReview' => [
                'validatorRecommendation' => trim((string) ($payload['staffReview']['validatorRecommendation'] ?? '')),
                'eligibilityAssessment' => [
                    'residentName' => trim((string) ($eligibility['residentName'] ?? ($context['full_name'] ?? ''))),
                    'age' => trim((string) ($eligibility['age'] ?? ($context['age'] ?? ''))),
                    'barangay' => trim((string) ($eligibility['barangay'] ?? ($context['barangay_name'] ?? ''))),
                    'understandsAssistanceProcess' => $this->normalizeYesNo((string) ($eligibility['understandsAssistanceProcess'] ?? '')),
                    'assistanceProcessUnderstanding' => trim((string) ($eligibility['assistanceProcessUnderstanding'] ?? '')),
                    'eligibilityDecision' => trim((string) ($eligibility['eligibilityDecision'] ?? '')),
                ],
                'validatorIdentity' => [
                    'validatorName' => trim((string) ($validatorIdentity['validatorName'] ?? '')),
                    'validatorTitle' => trim((string) ($validatorIdentity['validatorTitle'] ?? '')),
                    'signedDate' => trim((string) ($validatorIdentity['signedDate'] ?? '')),
                    'signatureUpload' => $this->normalizeUploadMetadata($validatorIdentity['signatureUpload'] ?? null),
                ],
            ],
        ];

        $errors = [];
        if ($strict) {
            foreach (['validationDate', 'lastName', 'firstName', 'barangay', 'birthdate', 'contactNumber'] as $field) {
                if ($clean['applicantDetails'][$field] === '') {
                    $errors['applicantDetails.' . $field] = 'This field is required.';
                }
            }
            foreach (['pantawidMember', 'slpaMember'] as $field) {
                if ($clean['membershipChecklist'][$field] === '') {
                    $errors['membershipChecklist.' . $field] = 'Select Yes or No.';
                }
            }
            if ($clean['participantSignature']['signedName'] === '') {
                $errors['participantSignature.signedName'] = 'Type the participant name for the signature block.';
            }
            if ($clean['participantSignature']['signedDate'] === '') {
                $errors['participantSignature.signedDate'] = 'Date signed is required.';
            }
            if ($clean['participantSignature']['signatureUpload'] === null) {
                $errors['participantSignature.signatureUpload'] = 'Upload the participant e-signature file.';
            }
        }

        return ['payload' => $clean, 'errors' => $errors];
    }

    private function validateMungkahingPayload(array $payload, array $context, bool $strict): array
    {
        $modalityRows = [];
        foreach (($payload['modalityApplications']['rows'] ?? []) as $row) {
            if (!is_array($row)) {
                continue;
            }
            $fundSource = trim((string) ($row['fundSource'] ?? ''));
            $contributionType = trim((string) ($row['contributionType'] ?? ''));
            $amount = trim((string) ($row['amount'] ?? ''));
            if ($fundSource === '' && $contributionType === '' && $amount === '') {
                continue;
            }
            $modalityRows[] = [
                'fundSource' => $fundSource,
                'contributionType' => $contributionType,
                'amount' => $amount,
            ];
        }

        $materialsRows = [];
        foreach (($payload['businessOperation']['materials']['rows'] ?? []) as $row) {
            if (!is_array($row)) {
                continue;
            }
            $material = trim((string) ($row['material'] ?? ''));
            $quality = trim((string) ($row['quality'] ?? ''));
            $unit = trim((string) ($row['unit'] ?? ''));
            $unitPrice = trim((string) ($row['unitPrice'] ?? ''));
            $cycles = trim((string) ($row['cyclesPerProduction'] ?? ''));
            $projectedCost = trim((string) ($row['projectedCost'] ?? ''));
            if ($material === '' && $quality === '' && $unit === '' && $unitPrice === '' && $cycles === '' && $projectedCost === '') {
                continue;
            }
            $materialsRows[] = [
                'material' => $material,
                'quality' => $quality,
                'unit' => $unit,
                'unitPrice' => $unitPrice,
                'cyclesPerProduction' => $cycles,
                'projectedCost' => $projectedCost,
            ];
        }

        $laborRows = [];
        foreach (($payload['businessOperation']['labor']['rows'] ?? []) as $row) {
            if (!is_array($row)) {
                continue;
            }
            $workerName = trim((string) ($row['workerName'] ?? ''));
            $position = trim((string) ($row['position'] ?? ''));
            $dailyWage = trim((string) ($row['dailyWage'] ?? ''));
            if ($workerName === '' && $position === '' && $dailyWage === '') {
                continue;
            }
            $laborRows[] = [
                'workerName' => $workerName,
                'position' => $position,
                'dailyWage' => $dailyWage,
            ];
        }

        $equipmentRows = [];
        foreach (($payload['businessOperation']['toolsEquipment']['rows'] ?? []) as $row) {
            if (!is_array($row)) {
                continue;
            }
            $equipment = trim((string) ($row['equipment'] ?? ''));
            $capacity = trim((string) ($row['capacity'] ?? ''));
            $unit = trim((string) ($row['unit'] ?? ''));
            $quantityOrPrice = trim((string) ($row['quantityOrPrice'] ?? ''));
            $projectedAmount = trim((string) ($row['projectedAmount'] ?? ''));
            $usefulLifeDays = trim((string) ($row['usefulLifeDays'] ?? ''));
            $productionCycle = trim((string) ($row['productionCycle'] ?? ''));
            $depreciationCost = trim((string) ($row['depreciationCost'] ?? ''));
            if ($equipment === '' && $capacity === '' && $unit === '' && $quantityOrPrice === '' && $projectedAmount === '' && $usefulLifeDays === '' && $productionCycle === '' && $depreciationCost === '') {
                continue;
            }
            $equipmentRows[] = [
                'equipment' => $equipment,
                'capacity' => $capacity,
                'unit' => $unit,
                'quantityOrPrice' => $quantityOrPrice,
                'projectedAmount' => $projectedAmount,
                'usefulLifeDays' => $usefulLifeDays,
                'productionCycle' => $productionCycle,
                'depreciationCost' => $depreciationCost,
            ];
        }

        $rawExpenseRows = $payload['businessOperation']['operatingExpenses']['rows'] ?? [];
        $expenseRows = [];
        foreach ($this->defaultMungkahingExpenseRows() as $index => $defaultExpense) {
            $row = is_array($rawExpenseRows[$index] ?? null) ? $rawExpenseRows[$index] : [];
            $projectedCost = trim((string) ($row['projectedCost'] ?? ''));
            $expenseRows[] = [
                'expenseName' => $defaultExpense['expenseName'],
                'paymentFrequency' => trim((string) ($row['paymentFrequency'] ?? '')),
                'projectedCost' => $projectedCost,
            ];
        }

        $salesRows = [];
        foreach (($payload['businessOperation']['salesProjection']['rows'] ?? []) as $row) {
            if (!is_array($row)) {
                continue;
            }
            $product = trim((string) ($row['product'] ?? ''));
            $capacity = trim((string) ($row['capacity'] ?? ''));
            $unit = trim((string) ($row['unit'] ?? ''));
            $sellingPrice = trim((string) ($row['sellingPrice'] ?? ''));
            $projectedSales = trim((string) ($row['projectedSales'] ?? ''));
            if ($product === '' && $capacity === '' && $unit === '' && $sellingPrice === '' && $projectedSales === '') {
                continue;
            }
            $salesRows[] = [
                'product' => $product,
                'capacity' => $capacity,
                'unit' => $unit,
                'sellingPrice' => $sellingPrice,
                'projectedSales' => $projectedSales,
            ];
        }

        $spendingRows = [];
        foreach (($payload['spendingPlan']['rows'] ?? []) as $row) {
            if (!is_array($row)) {
                continue;
            }
            $expense = trim((string) ($row['expense'] ?? ''));
            $amount = trim((string) ($row['amount'] ?? ''));
            $usageSchedule = trim((string) ($row['usageSchedule'] ?? ''));
            if ($expense === '' && $amount === '' && $usageSchedule === '') {
                continue;
            }
            $spendingRows[] = [
                'expense' => $expense,
                'amount' => $amount,
                'usageSchedule' => $usageSchedule,
            ];
        }

        $projectTitle = trim((string) ($payload['projectInformation']['projectTitle'] ?? ($context['business_name'] ?? '')));
        $projectedAmount = trim((string) ($payload['projectInformation']['projectedAmount'] ?? ''));
        $recommendation = $payload['staffReview']['recommendation'] ?? [];

        $clean = [
            'projectInformation' => [
                'participantName' => trim((string) ($payload['projectInformation']['participantName'] ?? ($context['full_name'] ?? ''))),
                'projectTitle' => $projectTitle,
                'projectLocation' => trim((string) ($payload['projectInformation']['projectLocation'] ?? $this->buildDefaultAddress($context))),
                'projectDate' => trim((string) ($payload['projectInformation']['projectDate'] ?? date('Y-m-d'))),
                'projectedAmount' => $projectedAmount,
                'cswddAmount' => trim((string) ($payload['projectInformation']['cswddAmount'] ?? '')),
                'otherFundingSource' => trim((string) ($payload['projectInformation']['otherFundingSource'] ?? '')),
                'savingsAccountNumber' => trim((string) ($payload['projectInformation']['savingsAccountNumber'] ?? 'NONE')),
            ],
            'sectoralClassification' => $this->normalizeMungkahingSectoralClassification($payload['sectoralClassification'] ?? []),
            'rationale' => trim((string) ($payload['rationale'] ?? '')),
            'modalityApplications' => [
                'rows' => $modalityRows,
            ],
            'businessOperation' => [
                'materials' => [
                    'rows' => $materialsRows,
                    'totalCost' => trim((string) ($payload['businessOperation']['materials']['totalCost'] ?? '')),
                ],
                'labor' => [
                    'rows' => $laborRows,
                    'totalDailyWage' => trim((string) ($payload['businessOperation']['labor']['totalDailyWage'] ?? '')),
                    'totalProductionCycleWage' => trim((string) ($payload['businessOperation']['labor']['totalProductionCycleWage'] ?? '')),
                ],
                'toolsEquipment' => [
                    'rows' => $equipmentRows,
                    'totalCost' => trim((string) ($payload['businessOperation']['toolsEquipment']['totalCost'] ?? '')),
                ],
                'operatingExpenses' => [
                    'rows' => $expenseRows,
                    'grandTotal' => trim((string) ($payload['businessOperation']['operatingExpenses']['grandTotal'] ?? '')),
                ],
                'salesProjection' => [
                    'rows' => $salesRows,
                    'grossSales' => trim((string) ($payload['businessOperation']['salesProjection']['grossSales'] ?? '')),
                ],
                'incomeComputation' => [
                    'projectedIncomePerCycle' => trim((string) ($payload['businessOperation']['incomeComputation']['projectedIncomePerCycle'] ?? '')),
                    'rawMaterialsCost' => trim((string) ($payload['businessOperation']['incomeComputation']['rawMaterialsCost'] ?? '')),
                    'manpowerLaborCost' => trim((string) ($payload['businessOperation']['incomeComputation']['manpowerLaborCost'] ?? '')),
                    'depreciationCost' => trim((string) ($payload['businessOperation']['incomeComputation']['depreciationCost'] ?? '')),
                    'otherExpenses' => trim((string) ($payload['businessOperation']['incomeComputation']['otherExpenses'] ?? '')),
                    'totalOperatingCost' => trim((string) ($payload['businessOperation']['incomeComputation']['totalOperatingCost'] ?? '')),
                    'grossProfit' => trim((string) ($payload['businessOperation']['incomeComputation']['grossProfit'] ?? '')),
                    'netProfit' => trim((string) ($payload['businessOperation']['incomeComputation']['netProfit'] ?? '')),
                ],
            ],
            'spendingPlan' => [
                'rows' => $spendingRows,
            ],
            'applicantSignature' => [
                'signedName' => trim((string) ($payload['applicantSignature']['signedName'] ?? ($context['full_name'] ?? ''))),
                'signedDate' => trim((string) ($payload['applicantSignature']['signedDate'] ?? date('Y-m-d'))),
                'signatureUpload' => $this->normalizeUploadMetadata($payload['applicantSignature']['signatureUpload'] ?? null),
            ],
            'staffReview' => [
                'recommendation' => [
                    'projectName' => trim((string) ($recommendation['projectName'] ?? $projectTitle)),
                    'recommendedAmount' => trim((string) ($recommendation['recommendedAmount'] ?? '')),
                    'recommendationText' => trim((string) ($recommendation['recommendationText'] ?? '')),
                    'approverName' => trim((string) ($recommendation['approverName'] ?? '')),
                    'approverTitle' => trim((string) ($recommendation['approverTitle'] ?? '')),
                    'approvedDate' => trim((string) ($recommendation['approvedDate'] ?? '')),
                    'signatureUpload' => $this->normalizeUploadMetadata($recommendation['signatureUpload'] ?? null),
                ],
            ],
        ];

        $assignedName = $this->assignedPdoName($context);
        if ($assignedName !== '' && $clean['staffReview']['recommendation']['approverName'] === $assignedName) {
            $clean['staffReview']['recommendation']['approverName'] = '';
        }

        $assignedSignature = $this->assignedPdoSignature($context);
        $assignedSignaturePath = is_array($assignedSignature) ? trim((string) ($assignedSignature['file_path'] ?? '')) : '';
        $recommendationSignaturePath = is_array($clean['staffReview']['recommendation']['signatureUpload'])
            ? trim((string) ($clean['staffReview']['recommendation']['signatureUpload']['file_path'] ?? ''))
            : '';
        if ($assignedSignaturePath !== '' && $recommendationSignaturePath === $assignedSignaturePath) {
            $clean['staffReview']['recommendation']['signatureUpload'] = null;
        }

        $errors = [];
        if ($strict) {
            foreach ([
                'participantName' => 'Participant name is required.',
                'projectTitle' => 'Project title is required.',
                'projectLocation' => 'Project location is required.',
                'projectDate' => 'Project date is required.',
                'projectedAmount' => 'Projected amount is required.',
            ] as $field => $message) {
                if ($clean['projectInformation'][$field] === '') {
                    $errors['projectInformation.' . $field] = $message;
                }
            }
            if ($clean['rationale'] === '') {
                $errors['rationale'] = 'Project rationale is required.';
            }
            if (($clean['sectoralClassification']['membershipType'] ?? '') === '') {
                $errors['sectoralClassification.membershipType'] = 'Select Pantawid or Non-Pantawid.';
            }
            if (($clean['sectoralClassification']['sex'] ?? '') === '') {
                $errors['sectoralClassification.sex'] = 'Select Babae or Lalake.';
            }
            if ($clean['modalityApplications']['rows'] === []) {
                $errors['modalityApplications.rows'] = 'Add at least one partner or participant contribution row.';
            }
            if ($clean['businessOperation']['materials']['rows'] === []) {
                $errors['businessOperation.materials.rows'] = 'Add at least one materials row.';
            }
            if ($clean['applicantSignature']['signedName'] === '') {
                $errors['applicantSignature.signedName'] = 'Type the participant name for the signature block.';
            }
            if ($clean['applicantSignature']['signedDate'] === '') {
                $errors['applicantSignature.signedDate'] = 'Date signed is required.';
            }
            if ($clean['applicantSignature']['signatureUpload'] === null) {
                $errors['applicantSignature.signatureUpload'] = 'Upload the participant e-signature file.';
            }
        }

        return ['payload' => $clean, 'errors' => $errors];
    }

    private function validateBusinessPlanPayload(array $payload, array $context, bool $strict): array
    {
        $approval = $payload['staffReview']['approval'] ?? [];
        $executiveSummaryInput = is_array($payload['executiveSummary'] ?? null) ? $payload['executiveSummary'] : [];
        $marketingPlanInput = is_array($payload['marketingPlan'] ?? null) ? $payload['marketingPlan'] : [];
        $productionPlanInput = is_array($payload['productionPlan'] ?? null) ? $payload['productionPlan'] : [];
        $organizationInput = is_array($payload['organizationAndManagementPlan'] ?? null) ? $payload['organizationAndManagementPlan'] : [];
        $financialPlanInput = is_array($payload['financialPlan'] ?? null) ? $payload['financialPlan'] : [];
        $applicantSignatureInput = is_array($payload['applicantSignature'] ?? null) ? $payload['applicantSignature'] : [];
        $overviewInput = is_array($payload['overview'] ?? null) ? $payload['overview'] : [];
        $marketStrategyInput = is_array($payload['marketStrategy'] ?? null) ? $payload['marketStrategy'] : [];
        $operationsPlanInput = is_array($payload['operationsPlan'] ?? null) ? $payload['operationsPlan'] : [];
        $riskManagementInput = is_array($payload['riskManagement'] ?? null) ? $payload['riskManagement'] : [];
        $legacyProducts = [];
        foreach (($payload['productsServices']['rows'] ?? []) as $row) {
            if (!is_array($row)) {
                continue;
            }
            $parts = array_filter([
                $this->normalizeOptionalString($row['name'] ?? ''),
                $this->normalizeOptionalString($row['description'] ?? ''),
                $this->normalizeOptionalString($row['price'] ?? ''),
                $this->normalizeOptionalString($row['targetMarket'] ?? ''),
            ], static fn ($value): bool => $value !== '');
            if ($parts !== []) {
                $legacyProducts[] = implode(' | ', $parts);
            }
        }

        $legacySchedule = [];
        foreach (($payload['implementationSchedule']['rows'] ?? []) as $row) {
            if (!is_array($row)) {
                continue;
            }
            $parts = array_filter([
                $this->normalizeOptionalString($row['activity'] ?? ''),
                $this->normalizeOptionalString($row['targetDate'] ?? ''),
                $this->normalizeOptionalString($row['responsiblePerson'] ?? ''),
            ], static fn ($value): bool => $value !== '');
            if ($parts !== []) {
                $legacySchedule[] = implode(' | ', $parts);
            }
        }

        $legacyExecutiveSummary = $this->normalizeOptionalString($payload['executiveSummary'] ?? '');

        $clean = [
            'executiveSummary' => [
                'briefDescriptionOfBusinessProject' => $this->normalizeOptionalString($executiveSummaryInput['briefDescriptionOfBusinessProject'] ?? $legacyExecutiveSummary),
                'briefProfileOfEntrepreneur' => $this->normalizeOptionalString($executiveSummaryInput['briefProfileOfEntrepreneur'] ?? ($overviewInput['businessGoal'] ?? '')),
                'projectContributionsToEconomy' => $this->normalizeOptionalString($executiveSummaryInput['projectContributionsToEconomy'] ?? ($riskManagementInput['mitigation'] ?? '')),
            ],
            'marketingPlan' => [
                'descriptionOfProduct' => $this->normalizeOptionalString($marketingPlanInput['descriptionOfProduct'] ?? implode(PHP_EOL, $legacyProducts)),
                'comparisonWithCompetitors' => $this->normalizeOptionalString($marketingPlanInput['comparisonWithCompetitors'] ?? ($marketStrategyInput['competitors'] ?? '')),
                'location' => $this->normalizeOptionalString($marketingPlanInput['location'] ?? ($operationsPlanInput['businessLocation'] ?? '')),
                'marketArea' => $this->normalizeOptionalString($marketingPlanInput['marketArea'] ?? ($marketStrategyInput['salesChannel'] ?? '')),
                'mainCustomers' => $this->normalizeOptionalString($marketingPlanInput['mainCustomers'] ?? ($marketStrategyInput['customerProfile'] ?? '')),
                'totalDemand' => $this->normalizeOptionalString($marketingPlanInput['totalDemand'] ?? ($financialPlanInput['monthlySalesProjection'] ?? '')),
                'sellingPrice' => $this->normalizeOptionalString($marketingPlanInput['sellingPrice'] ?? ($financialPlanInput['projectedNetIncome'] ?? '')),
                'promotionalMeasures' => $this->normalizeOptionalString($marketingPlanInput['promotionalMeasures'] ?? ($marketStrategyInput['marketingApproach'] ?? '')),
                'marketingStrategy' => $this->normalizeOptionalString($marketingPlanInput['marketingStrategy'] ?? ($marketStrategyInput['salesChannel'] ?? '')),
                'marketingBudget' => $this->normalizeOptionalString($marketingPlanInput['marketingBudget'] ?? ($financialPlanInput['monthlyExpenseProjection'] ?? '')),
            ],
            'productionPlan' => [
                'productionServiceProcess' => $this->normalizeOptionalString($productionPlanInput['productionServiceProcess'] ?? ($operationsPlanInput['productionProcess'] ?? '')),
                'fixedCapital' => $this->normalizeOptionalString($productionPlanInput['fixedCapital'] ?? ($operationsPlanInput['equipmentNeeded'] ?? '')),
                'lifeOfFixedCapital' => $this->normalizeOptionalString($productionPlanInput['lifeOfFixedCapital'] ?? ($financialPlanInput['breakEvenNotes'] ?? '')),
                'sourcesOfEquipment' => $this->normalizeOptionalString($productionPlanInput['sourcesOfEquipment'] ?? ($operationsPlanInput['equipmentNeeded'] ?? '')),
                'plannedCapacity' => $this->normalizeOptionalString($productionPlanInput['plannedCapacity'] ?? ($financialPlanInput['breakEvenNotes'] ?? '')),
                'futureCapacity' => $this->normalizeOptionalString($productionPlanInput['futureCapacity'] ?? ($financialPlanInput['breakEvenNotes'] ?? '')),
                'rawMaterials' => $this->normalizeOptionalString($productionPlanInput['rawMaterials'] ?? ($operationsPlanInput['productionProcess'] ?? '')),
                'costOfRawMaterials' => $this->normalizeOptionalString($productionPlanInput['costOfRawMaterials'] ?? ($financialPlanInput['projectedNetIncome'] ?? '')),
                'rawMaterialsAvailability' => $this->normalizeOptionalString($productionPlanInput['rawMaterialsAvailability'] ?? ($riskManagementInput['risks'] ?? '')),
                'labor' => $this->normalizeOptionalString($productionPlanInput['labor'] ?? ($operationsPlanInput['staffingPlan'] ?? '')),
                'costOfLabor' => $this->normalizeOptionalString($productionPlanInput['costOfLabor'] ?? ($financialPlanInput['monthlyExpenseProjection'] ?? '')),
                'laborAvailability' => $this->normalizeOptionalString($productionPlanInput['laborAvailability'] ?? ($operationsPlanInput['staffingPlan'] ?? '')),
            ],
            'organizationAndManagementPlan' => [
                'preOperatingActivities' => $this->normalizeOptionalString($organizationInput['preOperatingActivities'] ?? implode(PHP_EOL, $legacySchedule)),
                'preOperatingExpenses' => $this->normalizeOptionalString($organizationInput['preOperatingExpenses'] ?? ($financialPlanInput['monthlyExpenseProjection'] ?? '')),
            ],
            'financialPlan' => [
                'projectCost' => $this->normalizeOptionalString($financialPlanInput['projectCost'] ?? ($financialPlanInput['startupCapital'] ?? '')),
            ],
            'applicantSignature' => [
                'signedName' => $this->normalizeOptionalString($applicantSignatureInput['signedName'] ?? ($context['full_name'] ?? '')),
                'signedDate' => $this->normalizeOptionalString($applicantSignatureInput['signedDate'] ?? date('Y-m-d')),
                'signatureUpload' => $this->normalizeUploadMetadata($applicantSignatureInput['signatureUpload'] ?? null),
            ],
            'staffReview' => [
                'approval' => [
                    'reviewSummary' => $this->normalizeOptionalString($approval['reviewSummary'] ?? ''),
                    'recommendedAction' => $this->normalizeOptionalString($approval['recommendedAction'] ?? ''),
                    'approverName' => $this->normalizeOptionalString($approval['approverName'] ?? ''),
                    'approverTitle' => $this->normalizeOptionalString($approval['approverTitle'] ?? ''),
                    'approvedDate' => $this->normalizeOptionalString($approval['approvedDate'] ?? ''),
                    'signatureUpload' => $this->normalizeUploadMetadata($approval['signatureUpload'] ?? null),
                ],
            ],
        ];

        $errors = [];
        if ($strict) {
            foreach ([
                'executiveSummary.briefDescriptionOfBusinessProject' => 'Brief description of the business/project is required.',
                'executiveSummary.briefProfileOfEntrepreneur' => 'Brief profile of the entrepreneur is required.',
                'executiveSummary.projectContributionsToEconomy' => 'Project contributions to the economy are required.',
                'marketingPlan.descriptionOfProduct' => 'Description of the product is required.',
                'marketingPlan.comparisonWithCompetitors' => 'Comparison with competitors is required.',
                'marketingPlan.location' => 'Location is required.',
                'marketingPlan.marketArea' => 'Market area is required.',
                'marketingPlan.mainCustomers' => 'Main customers are required.',
                'marketingPlan.totalDemand' => 'Total demand is required.',
                'marketingPlan.sellingPrice' => 'Selling price is required.',
                'marketingPlan.promotionalMeasures' => 'Promotional measures are required.',
                'marketingPlan.marketingStrategy' => 'Marketing strategy is required.',
                'marketingPlan.marketingBudget' => 'Marketing budget is required.',
                'productionPlan.productionServiceProcess' => 'Production/service process is required.',
                'productionPlan.fixedCapital' => 'Fixed capital is required.',
                'productionPlan.lifeOfFixedCapital' => 'Life of fixed capital is required.',
                'productionPlan.sourcesOfEquipment' => 'Sources of equipment are required.',
                'productionPlan.plannedCapacity' => 'Planned capacity is required.',
                'productionPlan.futureCapacity' => 'Future capacity is required.',
                'productionPlan.rawMaterials' => 'Raw materials are required.',
                'productionPlan.costOfRawMaterials' => 'Cost of raw materials is required.',
                'productionPlan.rawMaterialsAvailability' => 'Raw materials availability is required.',
                'productionPlan.labor' => 'Labor information is required.',
                'productionPlan.costOfLabor' => 'Cost of labor is required.',
                'productionPlan.laborAvailability' => 'Labor availability is required.',
                'organizationAndManagementPlan.preOperatingActivities' => 'Pre-operating activities are required.',
                'organizationAndManagementPlan.preOperatingExpenses' => 'Pre-operating expenses are required.',
                'financialPlan.projectCost' => 'Project cost is required.',
            ] as $field => $message) {
                if ($this->arrayGet($clean, $field) === '') {
                    $errors[$field] = $message;
                }
            }
            if ($clean['applicantSignature']['signedName'] === '') {
                $errors['applicantSignature.signedName'] = 'Type the applicant name for the signature block.';
            }
            if ($clean['applicantSignature']['signedDate'] === '') {
                $errors['applicantSignature.signedDate'] = 'Date signed is required.';
            }
            if ($clean['applicantSignature']['signatureUpload'] === null) {
                $errors['applicantSignature.signatureUpload'] = 'Upload the applicant e-signature file.';
            }
        }

        return ['payload' => $clean, 'errors' => $errors];
    }

    private function validateBuhatSaPagpanumpaPayload(array $payload, array $context, bool $strict): array
    {
        $beneficiaryAddress = trim((string) ($payload['beneficiary']['addressLine'] ?? ($context['address_line'] ?? '')));
        $beneficiaryBarangay = trim((string) ($payload['beneficiary']['barangay'] ?? ($context['barangay_name'] ?? '')));
        $beneficiaryCity = trim((string) ($payload['beneficiary']['city'] ?? 'Butuan City'));
        $coMakerAddress = trim((string) ($payload['coMaker']['addressLine'] ?? ''));
        $coMakerBarangay = trim((string) ($payload['coMaker']['barangay'] ?? ''));
        $coMakerCity = trim((string) ($payload['coMaker']['city'] ?? ''));
        $agreementDateWords = $this->resolveBuhatDateWords($payload['agreement'] ?? []);
        $verification = $payload['staffReview']['verification'] ?? [];

        $clean = [
            'beneficiary' => [
                'fullName' => trim((string) ($payload['beneficiary']['fullName'] ?? ($context['full_name'] ?? ''))),
                'addressLine' => $beneficiaryAddress,
                'barangay' => $beneficiaryBarangay,
                'city' => $beneficiaryCity,
            ],
            'project' => [
                'programName' => trim((string) ($payload['project']['programName'] ?? ($payload['project']['programShortName'] ?? $this->buhatProgramShortName()))),
                'projectName' => trim((string) ($payload['project']['projectName'] ?? '')),
                'programStatement' => $this->buhatProgramStatement(),
                'programShortName' => trim((string) ($payload['project']['programShortName'] ?? ($payload['project']['programName'] ?? $this->buhatProgramShortName()))),
                'amountInWords' => trim((string) ($payload['project']['amountInWords'] ?? $this->buhatAmountInWords())),
                'amountNumeric' => trim((string) ($payload['project']['amountNumeric'] ?? $this->buhatAmountNumeric())),
            ],
            'coMaker' => [
                'fullName' => trim((string) ($payload['coMaker']['fullName'] ?? '')),
                'addressLine' => $coMakerAddress,
                'barangay' => $coMakerBarangay,
                'city' => $coMakerCity,
            ],
            'agreement' => [
                'dateSigned' => trim((string) ($payload['agreement']['dateSigned'] ?? '')),
                'yearSigned' => trim((string) ($payload['agreement']['yearSigned'] ?? '')),
                'currentDateWords' => $agreementDateWords,
            ],
            'applicantSignature' => [
                'signedName' => trim((string) ($payload['applicantSignature']['signedName'] ?? ($context['full_name'] ?? ''))),
                'signatureUpload' => $this->normalizeUploadMetadata($payload['applicantSignature']['signatureUpload'] ?? null),
            ],
            'coMakerSignature' => [
                'signedName' => trim((string) ($payload['coMakerSignature']['signedName'] ?? '')),
                'signatureUpload' => $this->normalizeUploadMetadata($payload['coMakerSignature']['signatureUpload'] ?? null),
            ],
            'staffReview' => [
                'verification' => [
                    'reviewerName' => trim((string) ($verification['reviewerName'] ?? '')),
                    'reviewerTitle' => trim((string) ($verification['reviewerTitle'] ?? '')),
                    'reviewerDate' => trim((string) ($verification['reviewerDate'] ?? '')),
                    'remarks' => trim((string) ($verification['remarks'] ?? '')),
                    'signatureUpload' => $this->normalizeUploadMetadata($verification['signatureUpload'] ?? null),
                ],
            ],
        ];

        $errors = [];
        if ($strict) {
            foreach ([
                'beneficiary.fullName' => 'Beneficiary name is required.',
                'beneficiary.addressLine' => 'Beneficiary address is required.',
                'coMaker.fullName' => 'Co-maker name is required.',
                'applicantSignature.signedName' => 'Beneficiary signature name is required.',
                'coMakerSignature.signedName' => 'Co-maker signature name is required.',
            ] as $field => $message) {
                if ($this->arrayGet($clean, $field) === '') {
                    $errors[$field] = $message;
                }
            }

            if ($clean['applicantSignature']['signatureUpload'] === null) {
                $errors['applicantSignature.signatureUpload'] = 'Upload the beneficiary e-signature file.';
            }
            if ($clean['coMakerSignature']['signatureUpload'] === null) {
                $errors['coMakerSignature.signatureUpload'] = 'Upload the co-maker e-signature file.';
            }
        }

        return ['payload' => $clean, 'errors' => $errors];
    }

    private function validateFundReleaseEvidencePayload(array $payload, array $context, bool $strict): array
    {
        $clean = [
            'fundReleaseEvidence' => [
                'releaseDate' => trim((string) ($payload['fundReleaseEvidence']['releaseDate'] ?? date('Y-m-d'))),
                'notes' => trim((string) ($payload['fundReleaseEvidence']['notes'] ?? '')),
                'releaseAttachment' => $this->normalizeUploadMetadata($payload['fundReleaseEvidence']['releaseAttachment'] ?? null),
            ],
        ];

        $errors = [];
        if ($strict) {
            if ($clean['fundReleaseEvidence']['releaseAttachment'] === null) {
                $errors['fundReleaseEvidence.releaseAttachment'] = 'Upload the proof of fund release attachment.';
            }
            if ($clean['fundReleaseEvidence']['releaseDate'] === '') {
                $errors['fundReleaseEvidence.releaseDate'] = 'Release date is required.';
            }
        }

        return ['payload' => $clean, 'errors' => $errors];
    }

    private function defaultPayload(string $code, array $context): array
    {
        return match ($code) {
            POST_APPROVAL_TASK_AVAILMENT_FORM => [
                'clientIdentifyingData' => [
                    'name' => $context['full_name'] ?? '',
                    'age' => $context['age'] !== null ? (string) $context['age'] : '',
                    'address' => $this->buildDefaultAddress($context),
                    'spouseName' => '',
                    'city' => 'Butuan City',
                ],
                'familyEnterprise' => ['members' => [['name' => '', 'age' => '', 'activities' => '']]],
                'individualAssistance' => [
                    'clienteleCategory' => '',
                    'natureOfDifficultCircumstances' => '',
                ],
                'incomeEligibility' => [
                    'rows' => [['memberName' => '', 'cashIncome' => '', 'nonCashIncome' => '', 'totalIncome' => '']],
                    'totalFamilyIncome' => '',
                ],
                'clientCommitment' => [
                    'agreedToPolicies' => false,
                    'agreedToRollBackSchedule' => false,
                    'agreedToWeeklySavings' => false,
                    'notes' => '',
                ],
                'applicantSignature' => [
                    'signedName' => $context['full_name'] ?? '',
                    'signedDate' => date('Y-m-d'),
                    'signatureUpload' => null,
                ],
                'staffReview' => [
                    'pageOneCertification' => [
                        'eligibilityStatementName' => $context['full_name'] ?? '',
                        'directWorkerName' => '',
                        'directWorkerTitle' => '',
                        'signedDate' => '',
                        'signatureUpload' => null,
                    ],
                    'physicalRequirements' => [
                        'healthAgeRows' => [[
                            'requirement' => 'Health Certificate / Medical Check-up',
                            'age' => $context['age'] !== null ? (string) $context['age'] : '',
                            'healthStatus' => 'See submitted health certificate',
                        ]],
                        'foodRelatedCertification' => [
                            'applicantName' => $context['full_name'] ?? '',
                            'requiresMedicalClearance' => '',
                            'medicalCheckupCompleted' => '',
                            'medicallyFit' => '',
                            'certifyingOfficerName' => '',
                            'certifyingOfficerTitle' => '',
                            'signedDate' => '',
                            'signatureUpload' => null,
                        ],
                    ],
                    'psychoSocialRequirements' => [
                        'residencyAndCharacter' => [
                            'residentName' => $context['full_name'] ?? '',
                            'barangay' => $context['barangay_name'] ?? '',
                            'isBonaFideResident' => '',
                            'goodMoralCharacter' => '',
                            'hasNoAdverseReputation' => '',
                            'certifyingOfficerName' => '',
                            'certifyingOfficerTitle' => '',
                            'signedDate' => '',
                            'signatureUpload' => null,
                        ],
                        'familyRelationshipsWorkHabitsAspiration' => [
                            'applicantName' => $context['full_name'] ?? '',
                            'positiveRelationships' => '',
                            'goodWorkHabitsAndAttitude' => '',
                            'adequateEconomicAspiration' => '',
                            'findingText' => '',
                            'directWorkerName' => '',
                            'directWorkerTitle' => '',
                            'signedDate' => '',
                            'signatureUpload' => null,
                        ],
                        'socialResponsibility' => [
                            'abidePolicies' => '',
                            'payRollBackOnTime' => '',
                            'generateWeeklySavings' => '',
                            'acknowledgementText' => '',
                        ],
                    ],
                ],
            ],
            POST_APPROVAL_TASK_VALIDATION_FORM => [
                'applicantDetails' => [
                    'validationDate' => date('Y-m-d'),
                    'lastName' => $this->splitName((string) ($context['full_name'] ?? ''))['lastName'],
                    'firstName' => $this->splitName((string) ($context['full_name'] ?? ''))['firstName'],
                    'middleName' => $this->splitName((string) ($context['full_name'] ?? ''))['middleName'],
                    'purok' => '',
                    'barangay' => $context['barangay_name'] ?? '',
                    'birthdate' => $context['birthdate'] ?? '',
                    'educationalAttainment' => '',
                    'contactNumber' => $context['contact_number'] ?? '',
                ],
                'membershipChecklist' => [
                    'pantawidMember' => ((int) ($context['is_4ps'] ?? 0)) === 1 ? 'Yes' : 'No',
                    'pantawidSpecify' => '',
                    'slpaMember' => '',
                    'slpaSpecify' => '',
                ],
                'participantSignature' => [
                    'signedName' => $context['full_name'] ?? '',
                    'signedDate' => date('Y-m-d'),
                    'signatureUpload' => null,
                ],
                'staffReview' => [
                    'validatorRecommendation' => '',
                    'eligibilityAssessment' => [
                        'residentName' => $context['full_name'] ?? '',
                        'age' => $context['age'] !== null ? (string) $context['age'] : '',
                        'barangay' => $context['barangay_name'] ?? '',
                        'understandsAssistanceProcess' => '',
                        'assistanceProcessUnderstanding' => '',
                        'eligibilityDecision' => '',
                    ],
                    'validatorIdentity' => [
                        'validatorName' => '',
                        'validatorTitle' => '',
                        'signedDate' => '',
                        'signatureUpload' => null,
                    ],
                ],
            ],
            POST_APPROVAL_TASK_MUNGKAHING_PROYEKTO => [
                'projectInformation' => [
                    'participantName' => $context['full_name'] ?? '',
                    'projectTitle' => $context['business_name'] ?? '',
                    'projectLocation' => $this->buildDefaultAddress($context),
                    'projectDate' => date('Y-m-d'),
                    'projectedAmount' => '',
                    'cswddAmount' => '',
                    'otherFundingSource' => '',
                    'savingsAccountNumber' => 'NONE',
                ],
                'sectoralClassification' => [
                    'membershipType' => '',
                    'sex' => '',
                    'seniorCitizen' => false,
                    'pwd' => false,
                    'ip' => false,
                    'soloParent' => false,
                ],
                'rationale' => '',
                'modalityApplications' => [
                    'rows' => [
                        ['fundSource' => 'Sumasalmot/Partisipante', 'contributionType' => '', 'amount' => ''],
                        ['fundSource' => 'Katimbang nga Ahensya/Institusyon', 'contributionType' => '', 'amount' => ''],
                    ],
                ],
                'businessOperation' => [
                    'materials' => [
                        'rows' => [['material' => '', 'quality' => '', 'unit' => '', 'unitPrice' => '', 'cyclesPerProduction' => '', 'projectedCost' => '']],
                        'totalCost' => '',
                    ],
                    'labor' => [
                        'rows' => [['workerName' => '', 'position' => '', 'dailyWage' => '']],
                        'totalDailyWage' => '',
                        'totalProductionCycleWage' => '',
                    ],
                    'toolsEquipment' => [
                        'rows' => [[
                            'equipment' => '',
                            'capacity' => '',
                            'unit' => '',
                            'quantityOrPrice' => '',
                            'projectedAmount' => '',
                            'usefulLifeDays' => '',
                            'productionCycle' => '',
                            'depreciationCost' => '',
                        ]],
                        'totalCost' => '',
                    ],
                    'operatingExpenses' => [
                        'rows' => $this->defaultMungkahingExpenseRows(),
                        'grandTotal' => '',
                    ],
                    'salesProjection' => [
                        'rows' => [['product' => '', 'capacity' => '', 'unit' => '', 'sellingPrice' => '', 'projectedSales' => '']],
                        'grossSales' => '',
                    ],
                    'incomeComputation' => [
                        'projectedIncomePerCycle' => '',
                        'rawMaterialsCost' => '',
                        'manpowerLaborCost' => '',
                        'depreciationCost' => '',
                        'otherExpenses' => '',
                        'totalOperatingCost' => '',
                        'grossProfit' => '',
                        'netProfit' => '',
                    ],
                ],
                'spendingPlan' => [
                    'rows' => [['expense' => '', 'amount' => '', 'usageSchedule' => '']],
                ],
                'applicantSignature' => [
                    'signedName' => $context['full_name'] ?? '',
                    'signedDate' => date('Y-m-d'),
                    'signatureUpload' => null,
                ],
                'staffReview' => [
                    'recommendation' => [
                        'projectName' => $context['business_name'] ?? '',
                        'recommendedAmount' => '',
                        'recommendationText' => '',
                        'approverName' => '',
                        'approverTitle' => 'CSWDO',
                        'approvedDate' => '',
                        'signatureUpload' => null,
                    ],
                ],
            ],
            POST_APPROVAL_TASK_BUSINESS_PLAN => [
                'executiveSummary' => [
                    'briefDescriptionOfBusinessProject' => '',
                    'briefProfileOfEntrepreneur' => '',
                    'projectContributionsToEconomy' => '',
                ],
                'marketingPlan' => [
                    'descriptionOfProduct' => '',
                    'comparisonWithCompetitors' => '',
                    'location' => '',
                    'marketArea' => '',
                    'mainCustomers' => '',
                    'totalDemand' => '',
                    'sellingPrice' => '',
                    'promotionalMeasures' => '',
                    'marketingStrategy' => '',
                    'marketingBudget' => '',
                ],
                'productionPlan' => [
                    'productionServiceProcess' => '',
                    'fixedCapital' => '',
                    'lifeOfFixedCapital' => '',
                    'sourcesOfEquipment' => '',
                    'plannedCapacity' => '',
                    'futureCapacity' => '',
                    'rawMaterials' => '',
                    'costOfRawMaterials' => '',
                    'rawMaterialsAvailability' => '',
                    'labor' => '',
                    'costOfLabor' => '',
                    'laborAvailability' => '',
                ],
                'organizationAndManagementPlan' => [
                    'preOperatingActivities' => '',
                    'preOperatingExpenses' => '',
                ],
                'financialPlan' => [
                    'projectCost' => '',
                ],
                'applicantSignature' => [
                    'signedName' => $context['full_name'] ?? '',
                    'signedDate' => date('Y-m-d'),
                    'signatureUpload' => null,
                ],
                'staffReview' => [
                    'approval' => [
                        'reviewSummary' => '',
                        'recommendedAction' => '',
                        'approverName' => '',
                        'approverTitle' => 'CSWDO',
                        'approvedDate' => '',
                        'signatureUpload' => null,
                    ],
                ],
            ],
            POST_APPROVAL_TASK_BUHAT_SA_PAGPANUMPA => [
                'beneficiary' => [
                    'fullName' => $context['full_name'] ?? '',
                    'addressLine' => trim((string) ($context['address_line'] ?? '')),
                    'barangay' => trim((string) ($context['barangay_name'] ?? '')),
                    'city' => 'Butuan City',
                ],
                'project' => [
                    'programName' => $this->buhatProgramShortName(),
                    'projectName' => '',
                    'programStatement' => $this->buhatProgramStatement(),
                    'programShortName' => $this->buhatProgramShortName(),
                    'amountInWords' => $this->buhatAmountInWords(),
                    'amountNumeric' => $this->buhatAmountNumeric(),
                ],
                'coMaker' => [
                    'fullName' => '',
                    'addressLine' => '',
                    'barangay' => '',
                    'city' => '',
                ],
                'agreement' => [
                    'dateSigned' => '',
                    'yearSigned' => '',
                    'currentDateWords' => $this->formatBuhatDateWords(),
                ],
                'applicantSignature' => [
                    'signedName' => $context['full_name'] ?? '',
                    'signatureUpload' => null,
                ],
                'coMakerSignature' => [
                    'signedName' => '',
                    'signatureUpload' => null,
                ],
                'staffReview' => [
                    'verification' => [
                        'reviewerName' => '',
                        'reviewerTitle' => '',
                        'reviewerDate' => '',
                        'remarks' => '',
                        'signatureUpload' => null,
                    ],
                ],
            ],
            POST_APPROVAL_TASK_FUND_RELEASE_EVIDENCE => [
                'fundReleaseEvidence' => [
                    'releaseDate' => date('Y-m-d'),
                    'notes' => '',
                    'releaseAttachment' => null,
                ],
            ],
            default => [],
        };
    }

    private function completionForTask(string $code, array $payload): int
    {
        $required = match ($code) {
            POST_APPROVAL_TASK_AVAILMENT_FORM => [
                'clientIdentifyingData.name',
                'clientIdentifyingData.age',
                'clientIdentifyingData.address',
                'individualAssistance.clienteleCategory',
                'individualAssistance.natureOfDifficultCircumstances',
                'applicantSignature.signedName',
                'applicantSignature.signedDate',
            ],
            POST_APPROVAL_TASK_VALIDATION_FORM => [
                'applicantDetails.validationDate',
                'applicantDetails.lastName',
                'applicantDetails.firstName',
                'applicantDetails.barangay',
                'applicantDetails.birthdate',
                'applicantDetails.contactNumber',
                'membershipChecklist.pantawidMember',
                'membershipChecklist.slpaMember',
                'participantSignature.signedName',
                'participantSignature.signedDate',
            ],
            POST_APPROVAL_TASK_MUNGKAHING_PROYEKTO => [
                'projectInformation.participantName',
                'projectInformation.projectTitle',
                'projectInformation.projectLocation',
                'projectInformation.projectDate',
                'projectInformation.projectedAmount',
                'rationale',
                'applicantSignature.signedName',
                'applicantSignature.signedDate',
            ],
            POST_APPROVAL_TASK_BUSINESS_PLAN => [
                'executiveSummary.briefDescriptionOfBusinessProject',
                'executiveSummary.briefProfileOfEntrepreneur',
                'executiveSummary.projectContributionsToEconomy',
                'marketingPlan.descriptionOfProduct',
                'marketingPlan.comparisonWithCompetitors',
                'marketingPlan.location',
                'marketingPlan.marketArea',
                'marketingPlan.mainCustomers',
                'marketingPlan.totalDemand',
                'marketingPlan.sellingPrice',
                'marketingPlan.promotionalMeasures',
                'marketingPlan.marketingStrategy',
                'marketingPlan.marketingBudget',
                'productionPlan.productionServiceProcess',
                'productionPlan.fixedCapital',
                'productionPlan.lifeOfFixedCapital',
                'productionPlan.sourcesOfEquipment',
                'productionPlan.plannedCapacity',
                'productionPlan.futureCapacity',
                'productionPlan.rawMaterials',
                'productionPlan.costOfRawMaterials',
                'productionPlan.rawMaterialsAvailability',
                'productionPlan.labor',
                'productionPlan.costOfLabor',
                'productionPlan.laborAvailability',
                'organizationAndManagementPlan.preOperatingActivities',
                'organizationAndManagementPlan.preOperatingExpenses',
                'financialPlan.projectCost',
                'applicantSignature.signedName',
                'applicantSignature.signedDate',
            ],
            POST_APPROVAL_TASK_BUHAT_SA_PAGPANUMPA => [
                'beneficiary.fullName',
                'beneficiary.addressLine',
                'coMaker.fullName',
                'applicantSignature.signedName',
                'coMakerSignature.signedName',
            ],
            POST_APPROVAL_TASK_FUND_RELEASE_EVIDENCE => [
                'fundReleaseEvidence.releaseDate',
                'fundReleaseEvidence.releaseAttachment.file_path',
            ],
            default => [],
        };

        if ($required === []) {
            return 0;
        }

        $completed = 0;
        foreach ($required as $path) {
            $value = $this->arrayGet($payload, $path);
            if (is_bool($value)) {
                $completed += $value ? 1 : 0;
                continue;
            }
            if (is_string($value) && trim($value) !== '') {
                $completed++;
            }
        }

        return (int) round(($completed / count($required)) * 100);
    }

    private function normalizeStatus(string $status): string
    {
        foreach (POST_APPROVAL_ALLOWED_STATUSES as $allowed) {
            if (strtolower($allowed) === strtolower(trim($status))) {
                return $allowed;
            }
        }
        if (strtolower(trim($status)) === 'pending') {
            return POST_APPROVAL_STATUS_UNLOCKED;
        }
        return $status === '' ? POST_APPROVAL_STATUS_UNLOCKED : $status;
    }

    private function decodePayload(mixed $value): ?array
    {
        if (is_array($value)) {
            return $value;
        }
        if (!is_string($value) || trim($value) === '') {
            return null;
        }

        $decoded = json_decode($value, true);
        return is_array($decoded) ? $decoded : null;
    }

    private function normalizeYesNo(string $value): string
    {
        $value = strtolower(trim($value));
        return match ($value) {
            'yes', 'y', 'true', '1' => 'Yes',
            'no', 'n', 'false', '0' => 'No',
            default => '',
        };
    }

    private function buildDefaultAddress(array $context): string
    {
        $address = trim((string) ($context['address_line'] ?? ''));
        $barangay = trim((string) ($context['barangay_name'] ?? ''));
        if ($address !== '' && $barangay !== '' && !str_contains(strtolower($address), strtolower($barangay))) {
            return $address . ', ' . $barangay;
        }

        return $address !== '' ? $address : $barangay;
    }

    private function splitName(string $fullName): array
    {
        $parts = preg_split('/\s+/', trim($fullName)) ?: [];
        if ($parts === []) {
            return ['firstName' => '', 'middleName' => '', 'lastName' => ''];
        }
        if (count($parts) === 1) {
            return ['firstName' => $parts[0], 'middleName' => '', 'lastName' => ''];
        }

        $lastName = array_pop($parts);
        $firstName = array_shift($parts);
        $middleName = implode(' ', $parts);

        return [
            'firstName' => $firstName,
            'middleName' => $middleName,
            'lastName' => (string) $lastName,
        ];
    }

    private function arrayGet(array $payload, string $path): mixed
    {
        $segments = explode('.', $path);
        $value = $payload;
        foreach ($segments as $segment) {
            if (!is_array($value) || !array_key_exists($segment, $value)) {
                return null;
            }
            $value = $value[$segment];
        }
        return $value;
    }

    private function mergePersistedPayload(array $task, array $newPayload): array
    {
        $existingPayload = $this->decodePayload($task['form_payload'] ?? null) ?? [];
        if ($existingPayload === []) {
            return $newPayload;
        }

        return array_replace_recursive($existingPayload, $newPayload);
    }

    private function normalizeUploadMetadata(mixed $value): ?array
    {
        if (!is_array($value)) {
            return null;
        }

        $filePath = trim((string) ($value['file_path'] ?? ''));
        if ($filePath === '') {
            return null;
        }

        return [
            'file_path' => $filePath,
            'original_name' => trim((string) ($value['original_name'] ?? basename($filePath))),
            'mime_type' => trim((string) ($value['mime_type'] ?? '')),
            'file_size' => (int) ($value['file_size'] ?? 0),
            'uploaded_at' => trim((string) ($value['uploaded_at'] ?? '')),
            'path' => $filePath,
            'name' => trim((string) ($value['original_name'] ?? basename($filePath))),
            'type' => trim((string) ($value['mime_type'] ?? '')),
            'size' => (int) ($value['file_size'] ?? 0),
            'uploadedAt' => trim((string) ($value['uploaded_at'] ?? '')),
            'url' => app_url($filePath),
        ];
    }

    private function payloadWithFieldValue(string $path, mixed $value): array
    {
        $payload = [];
        $segments = explode('.', $path);
        $cursor =& $payload;
        foreach ($segments as $index => $segment) {
            $isLast = $index === count($segments) - 1;
            if ($isLast) {
                $cursor[$segment] = $value;
                break;
            }

            if (!isset($cursor[$segment]) || !is_array($cursor[$segment])) {
                $cursor[$segment] = [];
            }
            $cursor =& $cursor[$segment];
        }

        return $payload;
    }

    private function fillBlankPayloadPath(array &$payload, string $path, mixed $value): void
    {
        if (is_array($value) || is_object($value)) {
            return;
        }

        $normalizedValue = trim((string) $value);
        if ($normalizedValue === '') {
            return;
        }

        $segments = array_values(array_filter(explode('.', $path), static fn (string $segment): bool => $segment !== ''));
        if ($segments === []) {
            return;
        }

        $cursor =& $payload;
        $lastIndex = count($segments) - 1;
        foreach ($segments as $index => $segment) {
            if ($index === $lastIndex) {
                if (!array_key_exists($segment, $cursor) || trim((string) ($cursor[$segment] ?? '')) === '') {
                    $cursor[$segment] = $normalizedValue;
                }
                return;
            }

            if (!isset($cursor[$segment]) || !is_array($cursor[$segment])) {
                $cursor[$segment] = [];
            }
            $cursor =& $cursor[$segment];
        }
    }

    private function unsetPayloadPath(array &$payload, string $path): void
    {
        $segments = array_values(array_filter(explode('.', $path), static fn (string $segment): bool => $segment !== ''));
        if ($segments === []) {
            return;
        }

        $cursor =& $payload;
        $lastIndex = count($segments) - 1;
        foreach ($segments as $index => $segment) {
            if (!is_array($cursor) || !array_key_exists($segment, $cursor)) {
                return;
            }

            if ($index === $lastIndex) {
                unset($cursor[$segment]);
                return;
            }

            $cursor =& $cursor[$segment];
        }
    }

    private function normalizeBooleanFlag(mixed $value): bool
    {
        if (is_bool($value)) {
            return $value;
        }

        $normalized = strtolower(trim((string) $value));
        return in_array($normalized, ['1', 'true', 'yes', 'on', 'checked'], true);
    }

    private function normalizeNonNegativeWholeCount(mixed $value): int
    {
        if (is_bool($value)) {
            return $value ? 1 : 0;
        }

        if (is_int($value)) {
            return max(0, $value);
        }

        if (is_float($value)) {
            if (!is_finite($value)) {
                return 0;
            }

            return max(0, (int) floor($value));
        }

        $normalized = trim((string) $value);
        if ($normalized === '') {
            return 0;
        }

        if ($this->normalizeBooleanFlag($normalized)) {
            return 1;
        }

        if (!preg_match('/^\d+$/', $normalized)) {
            return 0;
        }

        return (int) $normalized;
    }

    private function normalizeMungkahingMembershipType(mixed $value): string
    {
        $normalized = strtolower(trim((string) $value));
        return match ($normalized) {
            'pantawid' => 'pantawid',
            'non_pantawid', 'non-pantawid', 'non pantawid', 'nonpantawid' => 'non_pantawid',
            default => '',
        };
    }

    private function normalizeOptionalString(mixed $value): string
    {
        if (is_array($value) || is_object($value)) {
            return '';
        }

        return trim((string) $value);
    }

    private function normalizeMungkahingSex(mixed $value): string
    {
        $normalized = strtolower(trim((string) $value));
        return match ($normalized) {
            'female', 'babaye', 'babae' => 'female',
            'male', 'lalake', 'lalaki' => 'male',
            default => '',
        };
    }

    private function hasLegacyMungkahingSectoralValue(array $group, string $key): bool
    {
        return $this->normalizeNonNegativeWholeCount($group[$key] ?? 0) > 0;
    }

    private function normalizeMungkahingSectoralClassification(array $sectoral): array
    {
        $membershipType = $this->normalizeMungkahingMembershipType($sectoral['membershipType'] ?? '');
        $sex = $this->normalizeMungkahingSex($sectoral['sex'] ?? '');
        $pantawid = is_array($sectoral['pantawid'] ?? null) ? $sectoral['pantawid'] : [];
        $nonPantawid = is_array($sectoral['nonPantawid'] ?? null) ? $sectoral['nonPantawid'] : [];

        $pantawidSelected = array_reduce(['sexFemale', 'sexMale', 'seniorFemale', 'seniorMale', 'pwdFemale', 'pwdMale', 'ipFemale', 'ipMale', 'soloParentFemale', 'soloParentMale'], fn ($carry, $key) => $carry || $this->hasLegacyMungkahingSectoralValue($pantawid, $key), false);
        $nonPantawidSelected = array_reduce(['sexFemale', 'sexMale', 'seniorFemale', 'seniorMale', 'pwdFemale', 'pwdMale', 'ipFemale', 'ipMale', 'soloParentFemale', 'soloParentMale'], fn ($carry, $key) => $carry || $this->hasLegacyMungkahingSectoralValue($nonPantawid, $key), false);

        $femaleSelected = $this->hasLegacyMungkahingSectoralValue($pantawid, 'sexFemale')
            || $this->hasLegacyMungkahingSectoralValue($pantawid, 'seniorFemale')
            || $this->hasLegacyMungkahingSectoralValue($pantawid, 'pwdFemale')
            || $this->hasLegacyMungkahingSectoralValue($pantawid, 'ipFemale')
            || $this->hasLegacyMungkahingSectoralValue($pantawid, 'soloParentFemale')
            || $this->hasLegacyMungkahingSectoralValue($nonPantawid, 'sexFemale')
            || $this->hasLegacyMungkahingSectoralValue($nonPantawid, 'seniorFemale')
            || $this->hasLegacyMungkahingSectoralValue($nonPantawid, 'pwdFemale')
            || $this->hasLegacyMungkahingSectoralValue($nonPantawid, 'ipFemale')
            || $this->hasLegacyMungkahingSectoralValue($nonPantawid, 'soloParentFemale');

        $maleSelected = $this->hasLegacyMungkahingSectoralValue($pantawid, 'sexMale')
            || $this->hasLegacyMungkahingSectoralValue($pantawid, 'seniorMale')
            || $this->hasLegacyMungkahingSectoralValue($pantawid, 'pwdMale')
            || $this->hasLegacyMungkahingSectoralValue($pantawid, 'ipMale')
            || $this->hasLegacyMungkahingSectoralValue($pantawid, 'soloParentMale')
            || $this->hasLegacyMungkahingSectoralValue($nonPantawid, 'sexMale')
            || $this->hasLegacyMungkahingSectoralValue($nonPantawid, 'seniorMale')
            || $this->hasLegacyMungkahingSectoralValue($nonPantawid, 'pwdMale')
            || $this->hasLegacyMungkahingSectoralValue($nonPantawid, 'ipMale')
            || $this->hasLegacyMungkahingSectoralValue($nonPantawid, 'soloParentMale');

        $legacySeniorCitizen = $this->hasLegacyMungkahingSectoralValue($pantawid, 'seniorFemale')
            || $this->hasLegacyMungkahingSectoralValue($pantawid, 'seniorMale')
            || $this->hasLegacyMungkahingSectoralValue($nonPantawid, 'seniorFemale')
            || $this->hasLegacyMungkahingSectoralValue($nonPantawid, 'seniorMale');
        $legacyPwd = $this->hasLegacyMungkahingSectoralValue($pantawid, 'pwdFemale')
            || $this->hasLegacyMungkahingSectoralValue($pantawid, 'pwdMale')
            || $this->hasLegacyMungkahingSectoralValue($nonPantawid, 'pwdFemale')
            || $this->hasLegacyMungkahingSectoralValue($nonPantawid, 'pwdMale');
        $legacyIp = $this->hasLegacyMungkahingSectoralValue($pantawid, 'ipFemale')
            || $this->hasLegacyMungkahingSectoralValue($pantawid, 'ipMale')
            || $this->hasLegacyMungkahingSectoralValue($nonPantawid, 'ipFemale')
            || $this->hasLegacyMungkahingSectoralValue($nonPantawid, 'ipMale');
        $legacySoloParent = $this->hasLegacyMungkahingSectoralValue($pantawid, 'soloParentFemale')
            || $this->hasLegacyMungkahingSectoralValue($pantawid, 'soloParentMale')
            || $this->hasLegacyMungkahingSectoralValue($nonPantawid, 'soloParentFemale')
            || $this->hasLegacyMungkahingSectoralValue($nonPantawid, 'soloParentMale');

        return [
            'membershipType' => $membershipType !== '' ? $membershipType : ($pantawidSelected ? 'pantawid' : ($nonPantawidSelected ? 'non_pantawid' : '')),
            'sex' => $sex !== '' ? $sex : ($femaleSelected ? 'female' : ($maleSelected ? 'male' : '')),
            'seniorCitizen' => $this->normalizeBooleanFlag($sectoral['seniorCitizen'] ?? false) || $legacySeniorCitizen,
            'pwd' => $this->normalizeBooleanFlag($sectoral['pwd'] ?? false) || $legacyPwd,
            'ip' => $this->normalizeBooleanFlag($sectoral['ip'] ?? false) || $legacyIp,
            'soloParent' => $this->normalizeBooleanFlag($sectoral['soloParent'] ?? false) || $legacySoloParent,
        ];
    }

    private function defaultMungkahingExpenseRows(): array
    {
        return [
            ['expenseName' => 'Renta sa himuanan sa produkto/opisina', 'paymentFrequency' => '', 'projectedCost' => ''],
            ['expenseName' => 'Kuryente', 'paymentFrequency' => '', 'projectedCost' => ''],
            ['expenseName' => 'Tubig', 'paymentFrequency' => '', 'projectedCost' => ''],
            ['expenseName' => 'Pamilite', 'paymentFrequency' => '', 'projectedCost' => ''],
            ['expenseName' => 'Permit sa pag-operate', 'paymentFrequency' => '', 'projectedCost' => ''],
            ['expenseName' => 'Lain pang mga gastohanan', 'paymentFrequency' => '', 'projectedCost' => ''],
        ];
    }

    private function buhatProgramStatement(): string
    {
        return 'Sustainable Market and Technology Driven Livelihood and Employment Program';
    }

    private function buhatProgramShortName(): string
    {
        return 'SMART LEAP';
    }

    private function buhatAmountInWords(): string
    {
        return 'Fifteen Thousand Pesos';
    }

    private function buhatAmountNumeric(): string
    {
        return 'Php 15,000.00';
    }

    private function formatBuhatDateWords(?string $dateValue = null): string
    {
        if ($dateValue) {
            $timestamp = strtotime($dateValue);
            if ($timestamp !== false) {
                return date('F j', $timestamp);
            }
        }

        return date('F j');
    }

    private function resolveBuhatDateWords(array $agreement): string
    {
        $stored = trim((string) ($agreement['currentDateWords'] ?? ''));
        if ($stored !== '') {
            return $stored;
        }

        $legacyDate = trim((string) ($agreement['dateSigned'] ?? ''));
        return $this->formatBuhatDateWords($legacyDate !== '' ? $legacyDate : null);
    }

    private function allowedApplicantUploadFields(): array
    {
        return [
            POST_APPROVAL_TASK_AVAILMENT_FORM => [
                'applicantSignature.signatureUpload' => [
                    'bucket' => 'applicant-signature',
                    'persistPath' => 'applicantSignature.signatureUpload',
                ],
                'pageOneCertification.signatureUpload' => [
                    'bucket' => 'applicant-signature',
                    'persistPath' => 'staffReview.pageOneCertification.signatureUpload',
                ],
                'staffReview.pageOneCertification.signatureUpload' => [
                    'bucket' => 'applicant-signature',
                    'persistPath' => 'staffReview.pageOneCertification.signatureUpload',
                ],
                'physicalRequirements.foodRelatedCertification.signatureUpload' => [
                    'bucket' => 'applicant-signature',
                    'persistPath' => 'staffReview.physicalRequirements.foodRelatedCertification.signatureUpload',
                ],
                'staffReview.physicalRequirements.foodRelatedCertification.signatureUpload' => [
                    'bucket' => 'applicant-signature',
                    'persistPath' => 'staffReview.physicalRequirements.foodRelatedCertification.signatureUpload',
                ],
                'psychoSocialRequirements.residencyAndCharacter.signatureUpload' => [
                    'bucket' => 'applicant-signature',
                    'persistPath' => 'staffReview.psychoSocialRequirements.residencyAndCharacter.signatureUpload',
                ],
                'staffReview.psychoSocialRequirements.residencyAndCharacter.signatureUpload' => [
                    'bucket' => 'applicant-signature',
                    'persistPath' => 'staffReview.psychoSocialRequirements.residencyAndCharacter.signatureUpload',
                ],
                'psychoSocialRequirements.familyRelationshipsWorkHabitsAspiration.signatureUpload' => [
                    'bucket' => 'applicant-signature',
                    'persistPath' => 'staffReview.psychoSocialRequirements.familyRelationshipsWorkHabitsAspiration.signatureUpload',
                ],
                'staffReview.psychoSocialRequirements.familyRelationshipsWorkHabitsAspiration.signatureUpload' => [
                    'bucket' => 'applicant-signature',
                    'persistPath' => 'staffReview.psychoSocialRequirements.familyRelationshipsWorkHabitsAspiration.signatureUpload',
                ],
            ],
            POST_APPROVAL_TASK_VALIDATION_FORM => [
                'participantSignature.signatureUpload' => [
                    'bucket' => 'applicant-signature',
                    'persistPath' => 'participantSignature.signatureUpload',
                ],
            ],
            POST_APPROVAL_TASK_MUNGKAHING_PROYEKTO => [
                'applicantSignature.signatureUpload' => [
                    'bucket' => 'applicant-signature',
                    'persistPath' => 'applicantSignature.signatureUpload',
                ],
                'recommendation.signatureUpload' => [
                    'bucket' => 'applicant-signature',
                    'persistPath' => 'staffReview.recommendation.signatureUpload',
                ],
                'staffReview.recommendation.signatureUpload' => [
                    'bucket' => 'applicant-signature',
                    'persistPath' => 'staffReview.recommendation.signatureUpload',
                ],
            ],
            POST_APPROVAL_TASK_BUSINESS_PLAN => [
                'applicantSignature.signatureUpload' => [
                    'bucket' => 'applicant-signature',
                    'persistPath' => 'applicantSignature.signatureUpload',
                ],
            ],
            POST_APPROVAL_TASK_BUHAT_SA_PAGPANUMPA => [
                'applicantSignature.signatureUpload' => [
                    'bucket' => 'applicant-signature',
                    'persistPath' => 'applicantSignature.signatureUpload',
                ],
                'coMakerSignature.signatureUpload' => [
                    'bucket' => 'applicant-signature',
                    'persistPath' => 'coMakerSignature.signatureUpload',
                ],
            ],
            POST_APPROVAL_TASK_FUND_RELEASE_EVIDENCE => [
                'fundReleaseEvidence.releaseAttachment' => [
                    'bucket' => 'supporting-upload',
                    'persistPath' => 'fundReleaseEvidence.releaseAttachment',
                ],
            ],
        ];
    }

    private function decodeJsonArray(mixed $value): array
    {
        if (!is_string($value) || trim($value) === '') {
            return [];
        }

        $decoded = json_decode($value, true);
        return is_array($decoded) ? $decoded : [];
    }

    private function sanitizeSeminarFormCodes(array $codes): array
    {
        $normalized = [];
        foreach ($codes as $code) {
            $candidate = trim((string) $code);
            if ($candidate === '' || !in_array($candidate, TRAINING_SEMINAR_FORM_CODES, true)) {
                continue;
            }
            $normalized[] = $candidate;
        }

        return array_values(array_unique($normalized));
    }

    private function emptyState(): array
    {
        return [
            'isUnlocked' => false,
            'unlockedAt' => null,
            'beneficiaryProfileId' => null,
            'tasks' => [],
            'summary' => [
                'total' => 0,
                'unlocked' => 0,
                'inProgress' => 0,
                'submitted' => 0,
                'verified' => 0,
                'needsCorrection' => 0,
                'rejected' => 0,
            ],
        ];
    }

    private function taskDefinitions(): array
    {
        return [
            POST_APPROVAL_TASK_AVAILMENT_FORM => [
                'title' => 'SMART LEAP Availment Form',
                'summary' => 'Client identifying data, project type, income eligibility, and applicant commitment for SMART LEAP availment.',
                'helpText' => 'Complete the applicant-editable parts first. Certification sections remain reserved for CSWDD staff.',
                'interactive' => true,
                'applicantSections' => [
                    [
                        'id' => 'clientIdentifyingData',
                        'title' => 'Client Identifying Data',
                        'description' => 'Basic applicant information taken from the paper availment form.',
                    ],
                    [
                        'id' => 'familyEnterprise',
                        'title' => 'Type of Project: Family Enterprise',
                        'description' => 'List family members who will participate in the project and their activities.',
                    ],
                    [
                        'id' => 'individualAssistance',
                        'title' => 'Type of Project: Individual Assistance',
                        'description' => 'State the clientele category and describe the difficult circumstances relevant to this availment.',
                    ],
                    [
                        'id' => 'incomeEligibility',
                        'title' => 'Income Eligibility Requirement',
                        'description' => 'Provide the family income details required by the form.',
                    ],
                    [
                        'id' => 'clientCommitment',
                        'title' => 'Social Responsibility and Willingness to Save',
                        'description' => 'Acknowledge the exact policy, roll-back, and weekly savings commitments from the paper form.',
                    ],
                ],
                'staffSections' => [
                    [
                        'title' => 'Physical Requirements',
                        'description' => 'Health and age requirement rows plus food-related project medical certification are staff-only review fields from page 2.',
                    ],
                    [
                        'title' => 'Psycho-Social Requirements',
                        'description' => 'Residency/character, work habits/aspirations, and social responsibility assessments are staff-only review fields from page 2.',
                    ],
                    [
                        'title' => 'Signatures and Uploads',
                        'description' => 'Applicant e-signature upload is required. Direct worker and certifying officer sign-off uploads remain staff-only.',
                    ],
                ],
            ],
            POST_APPROVAL_TASK_VALIDATION_FORM => [
                'title' => 'SMART LEAP Validation Form',
                'summary' => 'Applicant profile details and checklist data required before validator assessment.',
                'helpText' => 'Enter your personal details and checklist answers. Recommendation and eligibility determination remain validator-only.',
                'interactive' => true,
                'applicantSections' => [
                    [
                        'id' => 'applicantDetails',
                        'title' => 'Applicant Details',
                        'description' => 'Fill the participant information block from the validation form.',
                    ],
                    [
                        'id' => 'membershipChecklist',
                        'title' => 'Checklist',
                        'description' => 'Answer the Pantawid and SLPA membership items and add specifics when applicable.',
                    ],
                ],
                'staffSections' => [
                    [
                        'title' => 'Validator Recommendation and Eligibility',
                        'description' => 'Validator recommendation, assistance-process assessment, ANGAYAN/DILI ANGAYAN decision, and validator identity remain staff-only.',
                    ],
                    [
                        'title' => 'Signatures and Uploads',
                        'description' => 'Participant e-signature upload is required. Validator signature upload remains staff-only.',
                    ],
                ],
            ],
            POST_APPROVAL_TASK_MUNGKAHING_PROYEKTO => [
                'title' => 'Mungkahing Proyekto',
                'summary' => 'Structured project proposal tables based on the paper SMART LEAP proposal form.',
                'helpText' => 'Complete the project proposal tables and rationale first. Recommendation and approval remain reserved for staff review.',
                'interactive' => true,
                'applicantSections' => [
                    [
                        'id' => 'projectInformation',
                        'title' => 'Kinatibuk-an Impormasyon Bahin sa Proyekto',
                        'description' => 'Participant details, project title, location, date, and funding amounts from page 1.',
                    ],
                    [
                        'id' => 'sectoralClassification',
                        'title' => 'Sectoral Classification',
                        'description' => 'Pantawid and Non-Pantawid sectoral counts exactly as shown in the proposal table.',
                    ],
                    [
                        'id' => 'rationale',
                        'title' => 'Rationale of the Proposed Project',
                        'description' => 'State the project rationale in the same section order as the paper form.',
                    ],
                    [
                        'id' => 'modalityApplications',
                        'title' => 'Detalye sa Modality Application/s',
                        'description' => 'List the participant and counterpart contributions under SEA-K modality.',
                    ],
                    [
                        'id' => 'businessOperation',
                        'title' => 'Pagdumala sa Negosyo',
                        'description' => 'Materials, labor, tools and equipment, operating expenses, sales, and income computation tables from pages 1 to 3.',
                    ],
                    [
                        'id' => 'spendingPlan',
                        'title' => 'Iskedyul o Plano sa Paggasto sa SEA-K Capital Fund',
                        'description' => 'List the planned expenses, amounts, and usage schedule.',
                    ],
                    [
                        'id' => 'applicantSignature',
                        'title' => 'Participant Sign-off',
                        'description' => 'Attach the participant signature for the proposal package.',
                    ],
                ],
                'staffSections' => [
                    [
                        'title' => 'Rekomendasyon',
                        'description' => 'CSWDD recommendation, recommended amount, and approval sign-off remain staff-only review fields from page 3.',
                    ],
                ],
            ],
            POST_APPROVAL_TASK_BUSINESS_PLAN => [
                'title' => 'Business Plan',
                'summary' => 'Paper-faithful business plan narrative sections based on the confirmed hardcopy headings.',
                'helpText' => 'Complete the hardcopy business plan headings exactly as written. Reviewed by and Noted by remain reserved for staff review.',
                'interactive' => true,
                'applicantSections' => [
                    [
                        'id' => 'executiveSummary',
                        'title' => 'EXECUTIVE SUMMARY (PAGLALARAWAN NG NEGOSYO)',
                        'description' => 'Complete the three opening narrative headings exactly as shown in the hardcopy.',
                    ],
                    [
                        'id' => 'marketStrategy',
                        'title' => 'Section 1: MARKETING PLAN',
                        'description' => 'Complete the numbered marketing plan headings exactly as shown in the hardcopy.',
                    ],
                    [
                        'id' => 'productionPlan',
                        'title' => 'Section 2: PRODUCTION PLAN',
                        'description' => 'Complete the numbered production plan headings exactly as shown in the hardcopy.',
                    ],
                    [
                        'id' => 'organizationAndManagementPlan',
                        'title' => 'Section 3: ORGANIZATION AND MANAGEMENT PLAN',
                        'description' => 'Complete the pre-operating activity and expense headings exactly as shown in the hardcopy.',
                    ],
                    [
                        'id' => 'financialPlan',
                        'title' => 'Section 4: FINANCIAL PLAN',
                        'description' => 'Complete the 4.1 Project Cost heading exactly as shown in the hardcopy.',
                    ],
                    [
                        'id' => 'applicantSignature',
                        'title' => 'Prepared by',
                        'description' => 'Type the applicant name, date signed, and upload the applicant signature.',
                    ],
                ],
                'staffSections' => [
                    [
                        'title' => 'Reviewed by / Noted by',
                        'description' => 'Reviewed by and Noted by sign-off blocks remain staff-only. The fixed Noted by text stays paper-faithful.',
                    ],
                ],
            ],
            POST_APPROVAL_TASK_BUHAT_SA_PAGPANUMPA => [
                'title' => 'Buhat sa Pagpanumpa',
                'summary' => 'Beneficiary oath and undertaking form for SMART LEAP.',
                'helpText' => 'Complete the oath undertaking and upload both the beneficiary and co-maker signatures before submitting. Staff verification remains reviewer-only.',
                'interactive' => true,
                'applicantSections' => [
                    [
                        'id' => 'beneficiary',
                        'title' => 'Impormasyon sa Benepisyaryo',
                        'description' => 'Beneficiary identity details shown in the introductory oath paragraph.',
                    ],
                    [
                        'id' => 'project',
                        'title' => 'Detalye sa Programa ug Proyekto',
                        'description' => 'Program name, project name, and amount received referenced in the oath clauses.',
                    ],
                    [
                        'id' => 'coMaker',
                        'title' => 'Detalye sa Co-maker',
                        'description' => 'Co-maker identity used in the joint undertaking and signature block.',
                    ],
                    [
                        'id' => 'agreement',
                        'title' => 'Petsa sa Kasabutan',
                        'description' => 'Date and year used in the sworn undertaking closing statement.',
                    ],
                    [
                        'id' => 'applicantSignature',
                        'title' => 'Pirma sa Benepisyaryo',
                        'description' => 'Type the beneficiary name and upload the beneficiary e-signature.',
                    ],
                    [
                        'id' => 'coMakerSignature',
                        'title' => 'Pirma sa Co-maker',
                        'description' => 'Type the co-maker name and upload the co-maker e-signature.',
                    ],
                ],
                'staffSections' => [
                    [
                        'title' => 'Verification',
                        'description' => 'Reviewer verification name, title, date, remarks, and signature remain staff-only in the review workflow.',
                    ],
                ],
            ],
        ];
    }
}
