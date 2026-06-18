<?php
declare(strict_types=1);

namespace App\Services;

use PDO;

class PostApprovalTaskProvisioningService
{
    private const APPLICATION_STAGE_TASKS = [
        POST_APPROVAL_TASK_AVAILMENT_FORM => [
            'label' => 'Availment Form',
            'description' => 'Application-stage fill-up form requirement.',
        ],
        POST_APPROVAL_TASK_VALIDATION_FORM => [
            'label' => 'Validation Form',
            'description' => 'Application-stage fill-up form requirement.',
        ],
        POST_APPROVAL_TASK_MUNGKAHING_PROYEKTO => [
            'label' => 'Mungkahing Proyekto',
            'description' => 'Application-stage fill-up form requirement.',
        ],
        POST_APPROVAL_TASK_BUSINESS_PLAN => [
            'label' => 'Business Plan',
            'description' => 'Application-stage fill-up form requirement.',
        ],
        POST_APPROVAL_TASK_BUHAT_SA_PAGPANUMPA => [
            'label' => 'Buhat sa Pagpanumpa',
            'description' => 'Application-stage fill-up form requirement.',
        ],
    ];

    private const FULL_POST_APPROVAL_TASKS = [
        POST_APPROVAL_TASK_AVAILMENT_FORM => [
            'label' => 'SMART LEAP Availment Form',
            'description' => 'Client identifying data, project type, income eligibility, and applicant commitment for SMART LEAP availment.',
        ],
        POST_APPROVAL_TASK_VALIDATION_FORM => [
            'label' => 'SMART LEAP Validation Form',
            'description' => 'Applicant profile details and checklist data required before validator assessment.',
        ],
        POST_APPROVAL_TASK_MUNGKAHING_PROYEKTO => [
            'label' => 'Mungkahing Proyekto',
            'description' => 'Structured project proposal tables based on the paper SMART LEAP proposal form.',
        ],
        POST_APPROVAL_TASK_BUSINESS_PLAN => [
            'label' => 'Business Plan',
            'description' => 'Business planning requirement for post-approval compliance.',
        ],
        POST_APPROVAL_TASK_BUHAT_SA_PAGPANUMPA => [
            'label' => 'Buhat sa Pagpanumpa',
            'description' => 'Signed applicant oath and commitment form.',
        ],
        POST_APPROVAL_TASK_FUND_RELEASE_EVIDENCE => [
            'label' => 'Proof of Fund Release',
            'description' => 'Final proof that the approved livelihood assistance was released.',
        ],
        POST_APPROVAL_TASK_SEMINAR_ATTENDANCE => [
            'label' => 'Attendance to seminars/trainings conducted',
            'description' => 'Training attendance compliance record.',
        ],
    ];

    public function ensureApplicationStageTasks(int $beneficiaryProfileId, int $actorUserId): void
    {
        $this->ensureTasks(
            $beneficiaryProfileId,
            $actorUserId,
            self::APPLICATION_STAGE_TASKS,
            POST_APPROVAL_STATUS_UNLOCKED
        );
    }

    public function ensureTrainingPendingTasks(int $beneficiaryProfileId, int $actorUserId): void
    {
        $this->ensureTasks(
            $beneficiaryProfileId,
            $actorUserId,
            self::FULL_POST_APPROVAL_TASKS,
            'pending'
        );
    }

    public function ensureUnlockedApplicantTasks(int $beneficiaryProfileId, int $actorUserId, ?string $unlockedAt, bool $forceForApplication = false): void
    {
        if ($beneficiaryProfileId <= 0) {
            return;
        }

        if ($unlockedAt === null && !$forceForApplication) {
            return;
        }

        $typeMap = $this->ensureTaskTypes(self::FULL_POST_APPROVAL_TASKS);
        if ($typeMap === []) {
            return;
        }

        $codes = array_keys(self::FULL_POST_APPROVAL_TASKS);
        $placeholders = implode(', ', array_fill(0, count($codes), '?'));

        $update = db()->prepare(
            "UPDATE post_approval_tasks
             INNER JOIN post_approval_task_types ON post_approval_task_types.id = post_approval_tasks.task_type_id
             SET post_approval_tasks.status = CASE
                    WHEN post_approval_task_types.code = ? THEN ?
                    ELSE ?
                 END,
                 post_approval_tasks.updated_at = CURRENT_TIMESTAMP
             WHERE post_approval_tasks.beneficiary_profile_id = ?
               AND LOWER(post_approval_tasks.status) = 'pending'
               AND post_approval_task_types.code IN ($placeholders)"
        );

        $parameterIndex = 1;
        $update->bindValue($parameterIndex++, POST_APPROVAL_TASK_FUND_RELEASE_EVIDENCE, PDO::PARAM_STR);
        $update->bindValue($parameterIndex++, POST_APPROVAL_STATUS_LOCKED, PDO::PARAM_STR);
        $update->bindValue($parameterIndex++, POST_APPROVAL_STATUS_UNLOCKED, PDO::PARAM_STR);
        $update->bindValue($parameterIndex++, $beneficiaryProfileId, PDO::PARAM_INT);
        foreach ($codes as $code) {
            $update->bindValue($parameterIndex++, $code, PDO::PARAM_STR);
        }
        $update->execute();

        $insert = db()->prepare(
            'INSERT INTO post_approval_tasks
             (beneficiary_profile_id, task_type_id, status, assigned_by_user_id)
             VALUES (:beneficiary_profile_id, :task_type_id, :status, :assigned_by_user_id)
             ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP'
        );

        foreach ($codes as $code) {
            if (!isset($typeMap[$code])) {
                continue;
            }

            $insert->execute([
                'beneficiary_profile_id' => $beneficiaryProfileId,
                'task_type_id' => $typeMap[$code],
                'status' => $code === POST_APPROVAL_TASK_FUND_RELEASE_EVIDENCE
                    ? POST_APPROVAL_STATUS_LOCKED
                    : POST_APPROVAL_STATUS_UNLOCKED,
                'assigned_by_user_id' => $actorUserId > 0 ? $actorUserId : null,
            ]);
        }
    }

    private function ensureTasks(int $beneficiaryProfileId, int $actorUserId, array $definitions, string $status): void
    {
        if ($beneficiaryProfileId <= 0) {
            return;
        }

        $typeMap = $this->ensureTaskTypes($definitions);
        if ($typeMap === []) {
            return;
        }

        $statement = db()->prepare(
            'INSERT INTO post_approval_tasks
             (beneficiary_profile_id, task_type_id, status, assigned_by_user_id)
             VALUES (:beneficiary_profile_id, :task_type_id, :status, :assigned_by_user_id)
             ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP'
        );

        foreach (array_keys($definitions) as $code) {
            if (!isset($typeMap[$code])) {
                continue;
            }

            $statement->execute([
                'beneficiary_profile_id' => $beneficiaryProfileId,
                'task_type_id' => $typeMap[$code],
                'status' => $status,
                'assigned_by_user_id' => $actorUserId > 0 ? $actorUserId : null,
            ]);
        }
    }

    private function ensureTaskTypes(array $definitions): array
    {
        $statement = db()->prepare(
            'INSERT INTO post_approval_task_types (code, label, description)
             VALUES (:code, :label, :description)
             ON DUPLICATE KEY UPDATE
                label = VALUES(label),
                description = VALUES(description),
                updated_at = CURRENT_TIMESTAMP'
        );

        foreach ($definitions as $code => $definition) {
            $statement->execute([
                'code' => $code,
                'label' => (string) ($definition['label'] ?? $code),
                'description' => (string) ($definition['description'] ?? ''),
            ]);
        }

        $rows = db()->query('SELECT id, code FROM post_approval_task_types')->fetchAll(PDO::FETCH_ASSOC) ?: [];
        $map = [];
        foreach ($rows as $row) {
            $map[(string) $row['code']] = (int) $row['id'];
        }

        return $map;
    }
}
