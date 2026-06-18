<?php
declare(strict_types=1);

namespace App\Services;

class AttendanceService
{
    public function updateInviteeAttendance(
        int $trainingInviteeId,
        string $status,
        ?string $remarks,
        int $actorUserId,
        ?array $proofAttachment = null
    ): array
    {
        if (!in_array($status, [TRAINING_STATUS_ATTENDED, TRAINING_STATUS_MISSED, TRAINING_STATUS_EXCUSED], true)) {
            return ['ok' => false, 'errors' => ['status' => 'Attendance can only be marked as Present, Absent, or Excused.']];
        }

        $invitee = $this->findInvitee($trainingInviteeId);
        if ($invitee === null) {
            return ['ok' => false, 'errors' => ['invitee' => 'Training participant not found.']];
        }

        $existingProof = [
            'file_path' => $invitee['proof_file_path'] ?? null,
            'original_name' => $invitee['proof_original_name'] ?? null,
            'mime_type' => $invitee['proof_mime_type'] ?? null,
            'file_size' => $invitee['proof_file_size'] ?? null,
        ];
        $proofMeta = $existingProof;
        $hasUploadedProof = $proofAttachment !== null
            && ((string) ($proofAttachment['name'] ?? '')) !== ''
            && (int) ($proofAttachment['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE;

        if ($hasUploadedProof) {
            try {
                $proofMeta = (new UploadService())->storePostApprovalAsset('supporting-upload', $proofAttachment);
            } catch (\Throwable $exception) {
                return ['ok' => false, 'errors' => ['proofAttachment' => $exception->getMessage()]];
            }
        }

        if ($status === TRAINING_STATUS_EXCUSED && empty($proofMeta['file_path'])) {
            return ['ok' => false, 'errors' => ['proofAttachment' => 'Upload proof before marking this participant as excused.']];
        }

        if ($status !== TRAINING_STATUS_EXCUSED) {
            $proofMeta = [
                'file_path' => null,
                'original_name' => null,
                'mime_type' => null,
                'file_size' => null,
            ];
        }

        $pdo = db();
        $pdo->beginTransaction();

        try {
            $checkedInAt = $status === TRAINING_STATUS_ATTENDED ? date('Y-m-d H:i:s') : null;

            $statement = $pdo->prepare(
                'INSERT INTO attendance_records
                 (training_invitee_id, training_program_id, applicant_profile_id, beneficiary_profile_id, attendance_status, remarks, proof_file_path, proof_original_name, proof_mime_type, proof_file_size, recorded_by_user_id, checked_in_at)
                 VALUES (:training_invitee_id, :training_program_id, :applicant_profile_id, :beneficiary_profile_id, :attendance_status, :remarks, :proof_file_path, :proof_original_name, :proof_mime_type, :proof_file_size, :recorded_by_user_id, :checked_in_at)
                 ON DUPLICATE KEY UPDATE
                    attendance_status = VALUES(attendance_status),
                    remarks = VALUES(remarks),
                    proof_file_path = VALUES(proof_file_path),
                    proof_original_name = VALUES(proof_original_name),
                    proof_mime_type = VALUES(proof_mime_type),
                    proof_file_size = VALUES(proof_file_size),
                    recorded_by_user_id = VALUES(recorded_by_user_id),
                    checked_in_at = VALUES(checked_in_at),
                    updated_at = CURRENT_TIMESTAMP'
            );
            $statement->execute([
                'training_invitee_id' => $trainingInviteeId,
                'training_program_id' => (int) $invitee['training_program_id'],
                'applicant_profile_id' => (int) $invitee['applicant_profile_id'],
                'beneficiary_profile_id' => $invitee['beneficiary_profile_id'] !== null ? (int) $invitee['beneficiary_profile_id'] : null,
                'attendance_status' => $status,
                'remarks' => $remarks ?: null,
                'proof_file_path' => $proofMeta['file_path'] ?? null,
                'proof_original_name' => $proofMeta['original_name'] ?? null,
                'proof_mime_type' => $proofMeta['mime_type'] ?? null,
                'proof_file_size' => $proofMeta['file_size'] ?? null,
                'recorded_by_user_id' => $actorUserId,
                'checked_in_at' => $checkedInAt,
            ]);

            $pdo->prepare(
                'UPDATE training_invitees
                 SET invite_status = :invite_status, remarks = :remarks, updated_by_user_id = :updated_by_user_id, updated_at = NOW()
                 WHERE id = :id'
            )->execute([
                'invite_status' => $status,
                'remarks' => $remarks ?: null,
                'updated_by_user_id' => $actorUserId,
                'id' => $trainingInviteeId,
            ]);

            if ($status === TRAINING_STATUS_ATTENDED) {
                $this->unlockPostApproval($invitee, $actorUserId);
            } else {
                $this->revokePostApproval($invitee, $actorUserId);
            }

            $pdo->commit();
        } catch (\Throwable $exception) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            log_database_query_failure('training.update_attendance', $exception, [
                'training_invitee_id' => $trainingInviteeId,
                'status' => $status,
            ]);
            return ['ok' => false, 'errors' => ['general' => 'Unable to update attendance right now.']];
        }

        return ['ok' => true];
    }

    private function unlockPostApproval(array $invitee, int $actorUserId): void
    {
        $beneficiaryProfileId = $invitee['beneficiary_profile_id'] !== null
            ? (int) $invitee['beneficiary_profile_id']
            : (new BeneficiaryProfileService())->ensureWorkspaceProfileForApplicantProfile((int) $invitee['applicant_profile_id']);

        if ($beneficiaryProfileId !== null && $beneficiaryProfileId > 0 && (int) $invitee['beneficiary_profile_id'] !== $beneficiaryProfileId) {
            db()->prepare(
                'UPDATE training_invitees
                 SET beneficiary_profile_id = :beneficiary_profile_id, updated_by_user_id = :updated_by_user_id, updated_at = NOW()
                 WHERE id = :id'
            )->execute([
                'beneficiary_profile_id' => $beneficiaryProfileId,
                'updated_by_user_id' => $actorUserId,
                'id' => (int) $invitee['id'],
            ]);

            db()->prepare(
                'UPDATE attendance_records
                 SET beneficiary_profile_id = :beneficiary_profile_id, recorded_by_user_id = :recorded_by_user_id, updated_at = CURRENT_TIMESTAMP
                 WHERE training_invitee_id = :training_invitee_id'
            )->execute([
                'beneficiary_profile_id' => $beneficiaryProfileId,
                'recorded_by_user_id' => $actorUserId,
                'training_invitee_id' => (int) $invitee['id'],
            ]);
        }

        db()->prepare(
            'UPDATE training_invitees
             SET post_approval_unlocked_at = COALESCE(post_approval_unlocked_at, NOW()), updated_by_user_id = :updated_by_user_id, updated_at = NOW()
             WHERE id = :id'
        )->execute([
            'updated_by_user_id' => $actorUserId,
            'id' => (int) $invitee['id'],
        ]);

        if ($beneficiaryProfileId === null || $beneficiaryProfileId <= 0) {
            return;
        }

        (new PostApprovalTaskProvisioningService())->ensureTrainingPendingTasks(
            $beneficiaryProfileId,
            $actorUserId
        );
    }

    private function revokePostApproval(array $invitee, int $actorUserId): void
    {
        db()->prepare(
            'UPDATE training_invitees
             SET post_approval_unlocked_at = NULL, updated_by_user_id = :updated_by_user_id, updated_at = NOW()
             WHERE id = :id'
        )->execute([
            'updated_by_user_id' => $actorUserId,
            'id' => (int) $invitee['id'],
        ]);

        if ($invitee['beneficiary_profile_id'] === null) {
            return;
        }

        $definitions = [
            POST_APPROVAL_TASK_BUSINESS_PLAN,
            POST_APPROVAL_TASK_AVAILMENT_FORM,
            POST_APPROVAL_TASK_VALIDATION_FORM,
            POST_APPROVAL_TASK_MUNGKAHING_PROYEKTO,
            POST_APPROVAL_TASK_BUHAT_SA_PAGPANUMPA,
            POST_APPROVAL_TASK_FUND_RELEASE_EVIDENCE,
            POST_APPROVAL_TASK_SEMINAR_ATTENDANCE,
        ];
        $placeholders = implode(',', array_fill(0, count($definitions), '?'));

        $delete = db()->prepare(
            "DELETE post_approval_tasks
             FROM post_approval_tasks
             INNER JOIN post_approval_task_types ON post_approval_task_types.id = post_approval_tasks.task_type_id
             LEFT JOIN post_approval_submissions ON post_approval_submissions.post_approval_task_id = post_approval_tasks.id
             WHERE post_approval_tasks.beneficiary_profile_id = ?
               AND post_approval_task_types.code IN ($placeholders)
               AND post_approval_tasks.status = 'pending'
               AND post_approval_submissions.id IS NULL"
        );
        $delete->bindValue(1, (int) $invitee['beneficiary_profile_id'], \PDO::PARAM_INT);
        foreach ($definitions as $index => $code) {
            $delete->bindValue($index + 2, $code, \PDO::PARAM_STR);
        }
        $delete->execute();
    }

    private function findInvitee(int $trainingInviteeId): ?array
    {
        $statement = db()->prepare(
            'SELECT
                training_invitees.id,
                training_invitees.training_program_id,
                training_invitees.applicant_profile_id,
                training_invitees.beneficiary_profile_id,
                attendance_records.proof_file_path,
                attendance_records.proof_original_name,
                attendance_records.proof_mime_type,
                attendance_records.proof_file_size
             FROM training_invitees
             LEFT JOIN attendance_records ON attendance_records.training_invitee_id = training_invitees.id
             WHERE training_invitees.id = :id
             LIMIT 1'
        );
        $statement->execute(['id' => $trainingInviteeId]);
        $row = $statement->fetch(\PDO::FETCH_ASSOC);
        return is_array($row) ? $row : null;
    }
}
