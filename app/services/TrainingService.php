<?php
/**
 * SMART LEAP FILE GUIDE
 * Training session and invitee workflow service.
 * Builds training overviews, session detail payloads, invitee lists, notice state, attendance context, and training-related analytics.
 */

declare(strict_types=1);

namespace App\Services;

use PDO;

class TrainingService
{
    private ?string $cachedSchemaError = null;
    private ?TrainingEligibilityService $eligibilityService = null;
    private ?bool $structuredUserNameColumns = null;
    private ?array $applicantProfileColumnCache = null;
    private bool $roundColumnsEnsured = false;

    public function schemaError(): ?string
    {
        $this->ensureProgramRoundColumns();

        if ($this->cachedSchemaError !== null) {
            return $this->cachedSchemaError;
        }

        $required = [
            'training_programs' => ['speaker', 'what_to_bring', 'instructions', 'training_scope_mode', 'batch_group_count', 'batch_group_size', 'seminar_form_codes', 'training_round_number', 'target_group_number'],
            'training_invitees' => ['applicant_profile_id', 'remarks', 'notified_at', 'last_notice_sent_at', 'updated_by_user_id', 'post_approval_unlocked_at', 'batch_group_number'],
            'attendance_records' => ['training_invitee_id', 'applicant_profile_id', 'remarks', 'recorded_by_user_id', 'proof_file_path', 'proof_original_name', 'proof_mime_type', 'proof_file_size'],
        ];

        foreach ($required as $table => $columns) {
            try {
                $statement = db()->query('SHOW COLUMNS FROM ' . $table);
                $rows = $statement->fetchAll(PDO::FETCH_ASSOC) ?: [];
            } catch (\Throwable $exception) {
                log_database_query_failure('training.schema_check', $exception, ['table' => $table]);
                $this->cachedSchemaError = 'Unable to verify the training database schema right now.';
                return $this->cachedSchemaError;
            }

            $existing = array_map(static fn (array $row): string => (string) ($row['Field'] ?? ''), $rows);
            $missing = array_values(array_diff($columns, $existing));
            if ($missing !== []) {
                $this->cachedSchemaError = 'Training database update required. Import or run database/migrations/033_expand_training_batch_and_excused_workflow.sql and database/migrations/035_add_training_seminar_form_codes.sql before using the training module.';
                return $this->cachedSchemaError;
            }
        }

        return null;
    }

    private function ensureProgramRoundColumns(): void
    {
        if ($this->roundColumnsEnsured) {
            return;
        }

        $statement = db()->prepare(
            'SELECT column_name
             FROM information_schema.columns
             WHERE table_schema = DATABASE()
               AND table_name = :table_name
               AND column_name IN ("training_round_number", "target_group_number")'
        );
        $statement->execute(['table_name' => 'training_programs']);
        $existing = array_map(
            static fn (array $row): string => (string) ($row['column_name'] ?? ''),
            $statement->fetchAll(PDO::FETCH_ASSOC) ?: []
        );

        if (!in_array('training_round_number', $existing, true)) {
            db()->exec('ALTER TABLE training_programs ADD COLUMN training_round_number TINYINT UNSIGNED NULL AFTER batch_group_size');
        }

        if (!in_array('target_group_number', $existing, true)) {
            db()->exec('ALTER TABLE training_programs ADD COLUMN target_group_number TINYINT UNSIGNED NULL AFTER training_round_number');
        }

        $this->roundColumnsEnsured = true;
    }

    public function listPrograms(array $filters, array $actor): array
    {
        if ($this->schemaError() !== null) {
            return $this->emptyListing();
        }

        if ($this->isAdmin($actor)) {
            $this->ensureRoundCoverageForExistingPrograms((int) ($actor['id'] ?? 0));
        }

        $params = [];
        $conditions = ['1 = 1'];

        if ($this->isProjectOfficer($actor)) {
            $staffProfileId = $this->findStaffProfileIdForUser((int) ($actor['id'] ?? 0));
            if ($staffProfileId === null) {
                return $this->emptyListing();
            }

            $params['scope_staff_profile_id'] = $staffProfileId;
            $params['scope_user_id'] = (int) ($actor['id'] ?? 0);
            $conditions[] = '(
                training_programs.created_by_user_id = :scope_user_id
                OR EXISTS (
                    SELECT 1
                    FROM training_invitees
                    INNER JOIN applicant_profiles ON applicant_profiles.id = training_invitees.applicant_profile_id
                    INNER JOIN staff_barangay_assignments AS scope_assignments
                        ON scope_assignments.barangay_id = applicant_profiles.barangay_id
                       AND scope_assignments.staff_profile_id = :scope_staff_profile_id
                       AND scope_assignments.ended_at IS NULL
                    WHERE training_invitees.training_program_id = training_programs.id
                )
            )';
        }

        $status = trim((string) ($filters['status'] ?? ''));
        if ($status !== '') {
            $conditions[] = 'LOWER(training_programs.status) = :status';
            $params['status'] = strtolower($status);
        }

        $name = trim((string) ($filters['programName'] ?? ''));
        if ($name !== '') {
            $conditions[] = 'training_programs.title LIKE :program_name';
            $params['program_name'] = '%' . $name . '%';
        }

        $date = trim((string) ($filters['date'] ?? ''));
        if ($date !== '') {
            $conditions[] = 'DATE(training_programs.starts_at) = :program_date';
            $params['program_date'] = $date;
        }

        $sql = '
            SELECT DISTINCT
                training_programs.id,
                training_programs.title,
                training_programs.description,
                training_programs.venue,
                training_programs.speaker,
                training_programs.starts_at,
                training_programs.ends_at,
                training_programs.what_to_bring,
                training_programs.instructions,
                training_programs.training_scope_mode,
                training_programs.batch_group_count,
                training_programs.batch_group_size,
                training_programs.training_round_number,
                training_programs.target_group_number,
                training_programs.seminar_form_codes,
                training_programs.status,
                training_programs.created_by_user_id,
                training_programs.created_at,
                users.full_name AS created_by_name,
                (
                    SELECT COUNT(*) FROM training_invitees WHERE training_invitees.training_program_id = training_programs.id
                ) AS participant_count,
                (
                    SELECT COUNT(*)
                    FROM training_invitees
                    WHERE training_invitees.training_program_id = training_programs.id
                      AND training_invitees.invite_status IN ("Attended", "Completed")
                ) AS completed_count,
                (
                    SELECT COUNT(*)
                    FROM training_invitees
                    WHERE training_invitees.training_program_id = training_programs.id
                      AND training_invitees.invite_status = "Attended"
                ) AS attended_count,
                (
                    SELECT COUNT(*)
                    FROM training_invitees
                    WHERE training_invitees.training_program_id = training_programs.id
                      AND training_invitees.invite_status = "Excused"
                ) AS excused_count,
                (
                    SELECT COUNT(*)
                    FROM training_invitees
                    WHERE training_invitees.training_program_id = training_programs.id
                      AND training_invitees.invite_status = "Notified"
                ) AS notified_count
                ,
                (
                    SELECT COUNT(*)
                    FROM training_invitees
                    WHERE training_invitees.training_program_id = training_programs.id
                      AND (training_invitees.notified_at IS NOT NULL OR training_invitees.last_notice_sent_at IS NOT NULL)
                ) AS notice_sent_count
            FROM training_programs
            LEFT JOIN users ON users.id = training_programs.created_by_user_id
            WHERE ' . implode(' AND ', $conditions) . '
            ORDER BY training_programs.starts_at DESC, training_programs.id DESC
        ';

        try {
            $statement = db()->prepare($sql);
            foreach ($params as $key => $value) {
                $statement->bindValue(':' . $key, $value);
            }
            $statement->execute();
            $rows = $statement->fetchAll(PDO::FETCH_ASSOC) ?: [];
        } catch (\Throwable $exception) {
            log_database_query_failure('training.list_programs', $exception, ['filters' => $filters]);
            return $this->emptyListing();
        }

        $programs = array_map(fn (array $row): array => $this->mapProgramRow($row), $rows);
        $yearlyBatchSummaries = [];
        foreach ($programs as &$program) {
            $program = $this->applyLiveInviteeCounts($program, $this->programInvitees((int) $program['id'], $actor));
            $batchYear = $this->batchYearForProgram($program);
            if (!isset($yearlyBatchSummaries[$batchYear])) {
                $yearlyBatchSummaries[$batchYear] = $this->buildYearlyBatchSummary($batchYear);
            }
            $program['batchYear'] = $batchYear;
            $program['yearlyBatch'] = $yearlyBatchSummaries[$batchYear];
        }
        unset($program);

        $summary = $this->buildSummary($programs);
        $summary['yearlyBatch'] = $yearlyBatchSummaries !== []
            ? reset($yearlyBatchSummaries)
            : $this->buildYearlyBatchSummary((int) date('Y'));
        $roundBoardYear = (int) ($summary['yearlyBatch']['batchYear'] ?? date('Y'));

        return [
            'programs' => $programs,
            'rounds' => $this->buildRoundBoard(array_values(array_filter(
                $programs,
                static fn (array $program): bool => (int) ($program['batchYear'] ?? 0) === $roundBoardYear
            ))),
            'eligibleInvitees' => $this->eligibleInvitees($actor),
            'eligibilitySnapshots' => $this->eligibilityService()->listApplicantSnapshots($actor),
            'summary' => $summary,
            'statuses' => TRAINING_ALLOWED_STATUSES,
            'seminarForms' => $this->seminarFormOptions(),
        ];
    }

    public function saveProgram(array $payload, array $actor, ?int $programId = null): array
    {
        if ($this->schemaError() !== null) {
            return ['ok' => false, 'errors' => ['general' => $this->schemaError()]];
        }

        if (!$this->isAdmin($actor)) {
            return ['ok' => false, 'errors' => ['general' => 'Only Admin can create or update training schedules.']];
        }

        $input = $this->validateProgramPayload($payload);
        if ($input['errors'] !== []) {
            return ['ok' => false, 'errors' => $input['errors']];
        }

        $startsAt = $input['data']['date'] . ' ' . $input['data']['startTime'] . ':00';
        $endsAt = $input['data']['date'] . ' ' . $input['data']['endTime'] . ':00';
        $targetYear = $this->batchYearFromDate($input['data']['date']);
        $existingProgram = $programId !== null && $programId > 0 ? $this->findProgram($programId, $actor) : null;
        $previousYear = $existingProgram !== null ? $this->batchYearForProgram($existingProgram) : null;
        $slotValidation = $this->validateRoundGroupSlot(
            $targetYear,
            (int) ($input['data']['roundNumber'] ?? 0),
            (int) ($input['data']['targetGroupNumber'] ?? 0),
            $programId
        );
        if (($slotValidation['errors'] ?? []) !== []) {
            return ['ok' => false, 'errors' => $slotValidation['errors']];
        }

        try {
            if ($programId !== null && $programId > 0) {
                $statement = db()->prepare(
                    'UPDATE training_programs
                     SET title = :title, description = :description, venue = :venue, speaker = :speaker, starts_at = :starts_at, ends_at = :ends_at,
                         what_to_bring = :what_to_bring, instructions = :instructions, training_scope_mode = :training_scope_mode,
                         batch_group_count = :batch_group_count, batch_group_size = :batch_group_size, training_round_number = :training_round_number,
                         target_group_number = :target_group_number, seminar_form_codes = :seminar_form_codes, status = :status, updated_at = NOW()
                     WHERE id = :id'
                );
                $statement->execute([
                    'title' => $input['data']['programName'],
                    'description' => $input['data']['description'] ?: null,
                    'venue' => $input['data']['venue'] ?: null,
                    'speaker' => $input['data']['speaker'] ?: null,
                    'starts_at' => $startsAt,
                    'ends_at' => $endsAt,
                    'what_to_bring' => $input['data']['whatToBring'] ?: null,
                    'instructions' => $input['data']['instructions'] ?: null,
                    'training_scope_mode' => $input['data']['trainingMode'],
                    'batch_group_count' => $input['data']['batchGroupCount'],
                    'batch_group_size' => $input['data']['batchGroupSize'],
                    'training_round_number' => $input['data']['roundNumber'],
                    'target_group_number' => $input['data']['targetGroupNumber'],
                    'seminar_form_codes' => $this->encodeSeminarFormCodes($input['data']['seminarFormCodes']),
                    'status' => $input['data']['status'],
                    'id' => $programId,
                ]);
            } else {
                $statement = db()->prepare(
                    'INSERT INTO training_programs
                     (title, description, venue, speaker, starts_at, ends_at, what_to_bring, instructions, training_scope_mode, batch_group_count, batch_group_size, training_round_number, target_group_number, seminar_form_codes, status, created_by_user_id)
                     VALUES (:title, :description, :venue, :speaker, :starts_at, :ends_at, :what_to_bring, :instructions, :training_scope_mode, :batch_group_count, :batch_group_size, :training_round_number, :target_group_number, :seminar_form_codes, :status, :created_by_user_id)'
                );
                $statement->execute([
                    'title' => $input['data']['programName'],
                    'description' => $input['data']['description'] ?: null,
                    'venue' => $input['data']['venue'] ?: null,
                    'speaker' => $input['data']['speaker'] ?: null,
                    'starts_at' => $startsAt,
                    'ends_at' => $endsAt,
                    'what_to_bring' => $input['data']['whatToBring'] ?: null,
                    'instructions' => $input['data']['instructions'] ?: null,
                    'training_scope_mode' => $input['data']['trainingMode'],
                    'batch_group_count' => $input['data']['batchGroupCount'],
                    'batch_group_size' => $input['data']['batchGroupSize'],
                    'training_round_number' => $input['data']['roundNumber'],
                    'target_group_number' => $input['data']['targetGroupNumber'],
                    'seminar_form_codes' => $this->encodeSeminarFormCodes($input['data']['seminarFormCodes']),
                    'status' => $input['data']['status'],
                    'created_by_user_id' => (int) $actor['id'],
                ]);
                $programId = (int) db()->lastInsertId();
            }

            $this->seedMissingGroupSlotsForRound(
                $targetYear,
                (int) ($input['data']['roundNumber'] ?? 0),
                $input['data'],
                (int) ($actor['id'] ?? 0),
                $programId
            );

            $this->syncSeminarFormsForRound(
                $targetYear,
                (int) $input['data']['roundNumber'],
                $input['data']['seminarFormCodes'],
                $programId
            );
            $this->syncYearlyAssignmentsAfterProgramSave($programId, $targetYear, $previousYear, (int) $actor['id']);
        } catch (\Throwable $exception) {
            log_database_query_failure('training.save_program', $exception, ['program_id' => $programId]);
            return ['ok' => false, 'errors' => ['general' => 'Unable to save training program right now.']];
        }

        (new AuditLogService())->record((int) $actor['id'], 'training.program_saved', 'training_programs', $programId, [
            'status' => $input['data']['status'],
        ]);

        return ['ok' => true, 'programId' => $programId];
    }

    private function seedMissingGroupSlotsForRound(int $year, int $roundNumber, array $data, int $actorUserId, int $sourceProgramId): void
    {
        if ($year <= 0 || $roundNumber <= 0 || $sourceProgramId <= 0) {
            return;
        }

        $existingSlots = [];
        foreach ($this->roundSlotsForYear($year) as $slot) {
            if ((int) ($slot['roundNumber'] ?? 0) !== $roundNumber) {
                continue;
            }
            $existingSlots[(int) ($slot['targetGroupNumber'] ?? 0)] = true;
        }

        $statement = db()->prepare(
            'INSERT INTO training_programs
             (title, description, venue, speaker, starts_at, ends_at, what_to_bring, instructions, training_scope_mode, batch_group_count, batch_group_size, training_round_number, target_group_number, seminar_form_codes, status, created_by_user_id)
             VALUES (:title, :description, :venue, :speaker, :starts_at, :ends_at, :what_to_bring, :instructions, :training_scope_mode, :batch_group_count, :batch_group_size, :training_round_number, :target_group_number, :seminar_form_codes, :status, :created_by_user_id)'
        );

        $startsAt = (string) ($data['date'] ?? '') . ' ' . (string) ($data['startTime'] ?? '') . ':00';
        $endsAt = (string) ($data['date'] ?? '') . ' ' . (string) ($data['endTime'] ?? '') . ':00';

        foreach (range(1, TRAINING_BATCH_GROUP_COUNT) as $groupNumber) {
            if (isset($existingSlots[$groupNumber])) {
                continue;
            }

            $statement->execute([
                'title' => $data['programName'],
                'description' => $data['description'] ?: null,
                'venue' => $data['venue'] ?: null,
                'speaker' => $data['speaker'] ?: null,
                'starts_at' => $startsAt,
                'ends_at' => $endsAt,
                'what_to_bring' => $data['whatToBring'] ?: null,
                'instructions' => $data['instructions'] ?: null,
                'training_scope_mode' => $data['trainingMode'],
                'batch_group_count' => $data['batchGroupCount'],
                'batch_group_size' => $data['batchGroupSize'],
                'training_round_number' => $roundNumber,
                'target_group_number' => $groupNumber,
                'seminar_form_codes' => $this->encodeSeminarFormCodes($data['seminarFormCodes'] ?? []),
                'status' => $data['status'],
                'created_by_user_id' => $actorUserId,
            ]);
        }
    }

    private function ensureRoundCoverageForExistingPrograms(int $actorUserId): void
    {
        if ($actorUserId <= 0) {
            return;
        }

        try {
            $rows = db()->query(
                'SELECT
                    id,
                    title,
                    description,
                    venue,
                    speaker,
                    starts_at,
                    ends_at,
                    what_to_bring,
                    instructions,
                    training_scope_mode,
                    batch_group_count,
                    batch_group_size,
                    training_round_number,
                    seminar_form_codes,
                    YEAR(starts_at) AS batch_year
                 FROM training_programs
                 ORDER BY YEAR(starts_at) ASC, training_round_number ASC, id ASC'
            )->fetchAll(PDO::FETCH_ASSOC) ?: [];
        } catch (\Throwable $exception) {
            log_database_query_failure('training.ensure_round_coverage', $exception);
            return;
        }

        $sourceByRound = [];
        foreach ($rows as $row) {
            $year = (int) ($row['batch_year'] ?? 0);
            $roundNumber = (int) ($row['training_round_number'] ?? 0);
            if ($year <= 0 || $roundNumber <= 0) {
                continue;
            }
            $key = $year . ':' . $roundNumber;
            if (!isset($sourceByRound[$key])) {
                $sourceByRound[$key] = $row;
            }
        }

        foreach ($sourceByRound as $row) {
            $startsAt = (string) ($row['starts_at'] ?? '');
            $endsAt = (string) ($row['ends_at'] ?? '');
            $this->seedMissingGroupSlotsForRound(
                (int) ($row['batch_year'] ?? 0),
                (int) ($row['training_round_number'] ?? 0),
                [
                    'programName' => (string) ($row['title'] ?? ''),
                    'description' => (string) ($row['description'] ?? ''),
                    'venue' => (string) ($row['venue'] ?? ''),
                    'speaker' => (string) ($row['speaker'] ?? ''),
                    'date' => substr($startsAt, 0, 10),
                    'startTime' => substr($startsAt, 11, 5),
                    'endTime' => substr($endsAt, 11, 5),
                    'whatToBring' => (string) ($row['what_to_bring'] ?? ''),
                    'instructions' => (string) ($row['instructions'] ?? ''),
                    'trainingMode' => (string) ($row['training_scope_mode'] ?? TRAINING_SCOPE_BATCH),
                    'batchGroupCount' => (int) ($row['batch_group_count'] ?? TRAINING_BATCH_GROUP_COUNT),
                    'batchGroupSize' => (int) ($row['batch_group_size'] ?? TRAINING_BATCH_GROUP_SIZE),
                    'seminarFormCodes' => $this->decodeSeminarFormCodes($row['seminar_form_codes'] ?? '[]'),
                    'status' => TRAINING_STATUS_SCHEDULED,
                ],
                $actorUserId,
                (int) ($row['id'] ?? 0)
            );
        }
    }

    public function getProgramDetail(int $programId, array $actor): ?array
    {
        if ($this->schemaError() !== null) {
            return null;
        }

        $program = $this->findProgram($programId, $actor);
        if ($program === null) {
            return null;
        }

        $batchYear = $this->batchYearForProgram($program);
        $this->syncProgramInviteesToEligibleRoster($programId, $batchYear, (int) ($actor['id'] ?? 0));
        $program = $this->findProgram($programId, $actor) ?? $program;

        $invitees = $this->programInvitees($programId, $actor);
        $program = $this->applyLiveInviteeCounts($program, $invitees);

        return $program + [
            'batchYear' => $batchYear,
            'yearlyBatch' => $this->buildYearlyBatchSummary($batchYear),
            'invitees' => $invitees,
        ];
    }

    public function syncInvitees(int $programId, array $applicantProfileIds, array $actor, array $pdoGroupAssignments = []): array
    {
        if ($this->schemaError() !== null) {
            return ['ok' => false, 'errors' => ['general' => $this->schemaError()]];
        }

        if (!$this->isAdmin($actor)) {
            return ['ok' => false, 'errors' => ['general' => 'Only Admin can assign training participants.']];
        }

        $program = $this->findProgram($programId, $actor);
        if ($program === null) {
            return ['ok' => false, 'errors' => ['program' => 'Training program not found.']];
        }

        $eligible = $this->eligibleInvitees($actor);
        $eligibleMap = [];
        foreach ($eligible as $invitee) {
            $eligibleMap[(int) $invitee['applicantProfileId']] = $invitee;
        }

        $targetIds = array_values(array_unique(array_filter(array_map('intval', $applicantProfileIds))));
        foreach ($targetIds as $applicantProfileId) {
            if (!isset($eligibleMap[$applicantProfileId])) {
                return ['ok' => false, 'errors' => ['invitees' => 'One or more selected applicants are not eligible for training.']];
            }
        }

        $assignmentPlan = $this->resolveYearlyBatchAssignmentPlan(
            $this->batchYearForProgram($program),
            $targetIds,
            $eligibleMap,
            $programId,
            $pdoGroupAssignments
        );
        if (($assignmentPlan['errors'] ?? []) !== []) {
            return ['ok' => false, 'errors' => $assignmentPlan['errors']];
        }

        $pdo = db();
        $pdo->beginTransaction();

        try {
            $existingStatement = $pdo->prepare('SELECT id, applicant_profile_id FROM training_invitees WHERE training_program_id = :training_program_id');
            $existingStatement->execute(['training_program_id' => $programId]);
            $existingRows = $existingStatement->fetchAll(PDO::FETCH_ASSOC) ?: [];
            $existingMap = [];
            foreach ($existingRows as $row) {
                $existingMap[(int) $row['applicant_profile_id']] = (int) $row['id'];
            }

            $insert = $pdo->prepare(
                'INSERT INTO training_invitees
                 (training_program_id, applicant_profile_id, beneficiary_profile_id, invite_status, updated_by_user_id, batch_group_number)
                 VALUES (:training_program_id, :applicant_profile_id, :beneficiary_profile_id, :invite_status, :updated_by_user_id, :batch_group_number)'
            );

            $updateAssignment = $pdo->prepare(
                'UPDATE training_invitees
                 SET beneficiary_profile_id = :beneficiary_profile_id,
                     batch_group_number = :batch_group_number,
                     updated_by_user_id = :updated_by_user_id,
                     updated_at = NOW()
                 WHERE training_program_id = :training_program_id
                   AND applicant_profile_id = :applicant_profile_id'
            );

            foreach ($targetIds as $applicantProfileId) {
                $beneficiaryProfileId = $eligibleMap[$applicantProfileId]['beneficiaryProfileId']
                    ?: (new BeneficiaryProfileService())->ensureWorkspaceProfileForApplicantProfile($applicantProfileId);

                if (isset($existingMap[$applicantProfileId])) {
                    $updateAssignment->execute([
                        'beneficiary_profile_id' => $beneficiaryProfileId,
                        'batch_group_number' => null,
                        'updated_by_user_id' => (int) $actor['id'],
                        'training_program_id' => $programId,
                        'applicant_profile_id' => $applicantProfileId,
                    ]);
                    continue;
                }

                $insert->execute([
                    'training_program_id' => $programId,
                    'applicant_profile_id' => $applicantProfileId,
                    'beneficiary_profile_id' => $beneficiaryProfileId,
                    'invite_status' => TRAINING_STATUS_SCHEDULED,
                    'updated_by_user_id' => (int) $actor['id'],
                    'batch_group_number' => null,
                ]);
            }

            if ($existingMap !== []) {
                if ($targetIds !== []) {
                    $placeholders = implode(',', array_fill(0, count($targetIds), '?'));

                    $deleteAttendance = $pdo->prepare(
                        "DELETE attendance_records FROM attendance_records
                         INNER JOIN training_invitees ON training_invitees.id = attendance_records.training_invitee_id
                         WHERE training_invitees.training_program_id = ?
                           AND training_invitees.applicant_profile_id NOT IN ($placeholders)"
                    );
                    $deleteAttendance->bindValue(1, $programId, PDO::PARAM_INT);
                    foreach ($targetIds as $index => $id) {
                        $deleteAttendance->bindValue($index + 2, $id, PDO::PARAM_INT);
                    }
                    $deleteAttendance->execute();

                    $deleteInvitees = $pdo->prepare(
                        "DELETE FROM training_invitees
                         WHERE training_program_id = ?
                           AND applicant_profile_id NOT IN ($placeholders)"
                    );
                    $deleteInvitees->bindValue(1, $programId, PDO::PARAM_INT);
                    foreach ($targetIds as $index => $id) {
                        $deleteInvitees->bindValue($index + 2, $id, PDO::PARAM_INT);
                    }
                    $deleteInvitees->execute();
                } else {
                    $pdo->prepare(
                        'DELETE attendance_records FROM attendance_records
                         INNER JOIN training_invitees ON training_invitees.id = attendance_records.training_invitee_id
                         WHERE training_invitees.training_program_id = :training_program_id'
                    )->execute(['training_program_id' => $programId]);

                    $pdo->prepare('DELETE FROM training_invitees WHERE training_program_id = :training_program_id')
                        ->execute(['training_program_id' => $programId]);
                }
            }

            $this->syncYearlyBatchAssignmentsForYear($this->batchYearForProgram($program), (int) $actor['id'], $pdo, $pdoGroupAssignments);
            $pdo->commit();
        } catch (\Throwable $exception) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            log_database_query_failure('training.sync_invitees', $exception, ['program_id' => $programId]);
            return ['ok' => false, 'errors' => ['general' => 'Unable to sync training invitees right now.']];
        }

        (new AuditLogService())->record((int) $actor['id'], 'training.invitees_synced', 'training_programs', $programId, [
            'invitee_count' => count($targetIds),
        ]);

        return ['ok' => true];
    }

    public function sendNotices(int $programId, array $inviteeIds, array $actor, array $options = []): array
    {
        if ($this->schemaError() !== null) {
            return ['ok' => false, 'errors' => ['general' => $this->schemaError()]];
        }

        if (!$this->isAdmin($actor)) {
            return ['ok' => false, 'errors' => ['general' => 'Only Admin can send or resend training notices.']];
        }

        $program = $this->findProgram($programId, $actor);
        if ($program === null) {
            return ['ok' => false, 'errors' => ['program' => 'Training program not found.']];
        }
        $invitees = $this->programInvitees($programId, $actor);
        $ids = array_values(array_unique(array_filter(array_map('intval', $inviteeIds))));
        $selected = $ids === []
            ? $invitees
            : array_values(array_filter($invitees, static fn (array $invitee): bool => in_array((int) $invitee['id'], $ids, true)));

        $groupNumber = (int) ($options['groupNumber'] ?? ($program['targetGroupNumber'] ?? 0));
        if ($groupNumber > 0) {
            $selected = array_values(array_filter($selected, static fn (array $invitee): bool => (int) ($invitee['batchGroupNumber'] ?? 0) === $groupNumber));
        }

        if ($selected === []) {
            return ['ok' => false, 'errors' => ['invitees' => 'No eligible training participants were found for notice sending.']];
        }

        $requiredGroupSize = $this->currentTrainingGroupSize();
        if (count($selected) !== $requiredGroupSize) {
            return [
                'ok' => false,
                'errors' => [
                    'invitees' => sprintf(
                        'Group %d must have exactly %d assigned participants before notices can be sent.',
                        max(1, $groupNumber),
                        $requiredGroupSize
                    ),
                ],
            ];
        }

        $notificationService = new NotificationService();
        $sentCount = 0;

        try {
            $statement = db()->prepare(
                'UPDATE training_invitees
                 SET invite_status = :invite_status,
                     notified_at = COALESCE(notified_at, NOW()),
                     last_notice_sent_at = NOW(),
                     updated_by_user_id = :updated_by_user_id,
                     updated_at = NOW()
                 WHERE id = :id'
            );

            foreach ($selected as $invitee) {
                $sent = $notificationService->sendTrainingNotice(
                    $invitee['user'],
                    $program,
                    $invitee + ['updatedByUserId' => (int) $actor['id']]
                );

                $statement->execute([
                    'invite_status' => TRAINING_STATUS_NOTIFIED,
                    'updated_by_user_id' => (int) $actor['id'],
                    'id' => (int) $invitee['id'],
                ]);

                if ($sent) {
                    $sentCount++;
                }
            }
        } catch (\Throwable $exception) {
            log_database_query_failure('training.send_notices', $exception, ['program_id' => $programId]);
            return ['ok' => false, 'errors' => ['general' => 'Unable to send training notices right now.']];
        }

        return ['ok' => true, 'sentCount' => $sentCount];
    }

    public function updateAttendance(int $trainingInviteeId, string $status, ?string $remarks, array $actor, ?array $proofAttachment = null): array
    {
        if ($this->schemaError() !== null) {
            return ['ok' => false, 'errors' => ['general' => $this->schemaError()]];
        }

        if (!$this->isAdmin($actor) && !$this->isProjectOfficer($actor)) {
            return ['ok' => false, 'errors' => ['general' => 'You are not allowed to update training attendance.']];
        }

        $invitee = $this->findScopedInvitee($trainingInviteeId, $actor);
        if ($invitee === null) {
            return ['ok' => false, 'errors' => ['invitee' => 'Training participant not found in your scope.']];
        }

        $status = $this->normalizeStatus($status);
        if (!in_array($status, [TRAINING_STATUS_ATTENDED, TRAINING_STATUS_MISSED, TRAINING_STATUS_EXCUSED], true)) {
            return ['ok' => false, 'errors' => ['status' => 'Attendance can only be marked as Present, Absent, or Excused.']];
        }

        $dateGate = $this->trainingAttendanceDateGate($invitee, $status);
        if (($dateGate['ok'] ?? false) !== true) {
            return ['ok' => false, 'errors' => ['status' => $dateGate['message'] ?? 'Attendance can only be marked on or after the training date.']];
        }

        $attendanceService = new AttendanceService();
        $result = $attendanceService->updateInviteeAttendance(
            (int) $invitee['id'],
            $status,
            $remarks,
            (int) ($actor['id'] ?? 0),
            $proofAttachment
        );
        if ($result['ok'] ?? false) {
            (new AuditLogService())->record((int) ($actor['id'] ?? 0), 'training.attendance_updated', 'training_invitees', (int) $invitee['id'], [
                'status' => $status,
            ]);
        }

        return $result;
    }

    public function uploadApplicantAttendanceProof(int $trainingInviteeId, int $actorUserId, ?array $proofAttachment, ?string $remarks = null): array
    {
        if ($this->schemaError() !== null) {
            return ['ok' => false, 'errors' => ['general' => $this->schemaError()]];
        }

        if ($trainingInviteeId <= 0 || $actorUserId <= 0) {
            return ['ok' => false, 'errors' => ['invitee' => 'Training attendance record not found.']];
        }

        $statement = db()->prepare(
            'SELECT
                training_invitees.id,
                training_invitees.training_program_id,
                training_invitees.applicant_profile_id,
                training_invitees.beneficiary_profile_id,
                COALESCE(attendance_records.attendance_status, training_invitees.invite_status) AS attendance_status
             FROM training_invitees
             INNER JOIN applicant_profiles ON applicant_profiles.id = training_invitees.applicant_profile_id
             LEFT JOIN attendance_records ON attendance_records.training_invitee_id = training_invitees.id
             WHERE training_invitees.id = :id
               AND applicant_profiles.user_id = :user_id
             LIMIT 1'
        );
        $statement->execute([
            'id' => $trainingInviteeId,
            'user_id' => $actorUserId,
        ]);
        $invitee = $statement->fetch(PDO::FETCH_ASSOC);
        if (!is_array($invitee)) {
            return ['ok' => false, 'errors' => ['invitee' => 'Training participant not found in your account.']];
        }

        $status = $this->normalizeStatus((string) ($invitee['attendance_status'] ?? ''));
        if (!in_array($status, [TRAINING_STATUS_MISSED, TRAINING_STATUS_EXCUSED], true)) {
            return ['ok' => false, 'errors' => ['status' => 'Proof upload is only available when attendance is Absent or Excused.']];
        }

        $hasUploadedProof = $proofAttachment !== null
            && ((string) ($proofAttachment['name'] ?? '')) !== ''
            && (int) ($proofAttachment['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE;
        if (!$hasUploadedProof) {
            return ['ok' => false, 'errors' => ['proofAttachment' => 'Choose a proof file before submitting.']];
        }

        try {
            $proofMeta = (new UploadService())->storePostApprovalAsset('supporting-upload', $proofAttachment);
        } catch (\Throwable $exception) {
            return ['ok' => false, 'errors' => ['proofAttachment' => $exception->getMessage()]];
        }

        try {
            db()->prepare(
                'INSERT INTO attendance_records
                 (training_invitee_id, training_program_id, applicant_profile_id, beneficiary_profile_id, attendance_status, remarks, proof_file_path, proof_original_name, proof_mime_type, proof_file_size, recorded_by_user_id, checked_in_at)
                 VALUES (:training_invitee_id, :training_program_id, :applicant_profile_id, :beneficiary_profile_id, :attendance_status, :remarks, :proof_file_path, :proof_original_name, :proof_mime_type, :proof_file_size, :recorded_by_user_id, NULL)
                 ON DUPLICATE KEY UPDATE
                    remarks = COALESCE(VALUES(remarks), remarks),
                    proof_file_path = VALUES(proof_file_path),
                    proof_original_name = VALUES(proof_original_name),
                    proof_mime_type = VALUES(proof_mime_type),
                    proof_file_size = VALUES(proof_file_size),
                    updated_at = CURRENT_TIMESTAMP'
            )->execute([
                'training_invitee_id' => (int) $invitee['id'],
                'training_program_id' => (int) $invitee['training_program_id'],
                'applicant_profile_id' => (int) $invitee['applicant_profile_id'],
                'beneficiary_profile_id' => $invitee['beneficiary_profile_id'] !== null ? (int) $invitee['beneficiary_profile_id'] : null,
                'attendance_status' => $status,
                'remarks' => trim((string) $remarks) !== '' ? trim((string) $remarks) : null,
                'proof_file_path' => $proofMeta['file_path'] ?? null,
                'proof_original_name' => $proofMeta['original_name'] ?? null,
                'proof_mime_type' => $proofMeta['mime_type'] ?? null,
                'proof_file_size' => $proofMeta['file_size'] ?? null,
                'recorded_by_user_id' => $actorUserId,
            ]);
        } catch (\Throwable $exception) {
            log_database_query_failure('training.applicant_attendance_proof', $exception, [
                'training_invitee_id' => $trainingInviteeId,
                'user_id' => $actorUserId,
            ]);
            return ['ok' => false, 'errors' => ['general' => 'Unable to upload attendance proof right now.']];
        }

        return ['ok' => true];
    }

    public function removeProgram(int $programId, array $actor): array
    {
        if ($this->schemaError() !== null) {
            return ['ok' => false, 'errors' => ['general' => $this->schemaError()]];
        }

        if (!$this->isAdmin($actor)) {
            return ['ok' => false, 'errors' => ['general' => 'Only Admin can remove training programs.']];
        }

        $program = $this->findProgram($programId, $actor);
        if ($program === null) {
            return ['ok' => false, 'errors' => ['program' => 'Training program not found.']];
        }
        if (($program['isLocked'] ?? false) === true) {
            return ['ok' => false, 'errors' => ['program' => 'A notified training group slot cannot be removed.']];
        }

        $year = $this->batchYearForProgram($program);
        foreach ($this->roundSlotsForYear($year, $programId) as $slot) {
            if ((int) ($slot['roundNumber'] ?? 0) > (int) ($program['roundNumber'] ?? 0)) {
                return ['ok' => false, 'errors' => ['program' => 'Remove later training rounds first before removing an earlier group slot.']];
            }
        }

        $pdo = db();
        $pdo->beginTransaction();

        try {
            $pdo->prepare(
                'DELETE attendance_records
                 FROM attendance_records
                 INNER JOIN training_invitees ON training_invitees.id = attendance_records.training_invitee_id
                 WHERE training_invitees.training_program_id = :training_program_id'
            )->execute(['training_program_id' => $programId]);

            $pdo->prepare('DELETE FROM training_invitees WHERE training_program_id = :training_program_id')
                ->execute(['training_program_id' => $programId]);

            $pdo->prepare('DELETE FROM training_programs WHERE id = :id')
                ->execute(['id' => $programId]);

            $pdo->commit();
        } catch (\Throwable $exception) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            log_database_query_failure('training.remove_program', $exception, ['program_id' => $programId]);
            return ['ok' => false, 'errors' => ['general' => 'Unable to remove training session right now.']];
        }

        (new AuditLogService())->record((int) ($actor['id'] ?? 0), 'training.program_removed', 'training_programs', $programId, [
            'program_name' => $program['programName'] ?? null,
        ]);

        return ['ok' => true];
    }

    public function eligibleInvitees(array $actor): array
    {
        return $this->eligibilityService()->listEligibleApplicants($actor);
    }

    public function programInvitees(int $programId, array $actor): array
    {
        $program = $this->findProgram($programId, $actor);
        if ($program === null) {
            return [];
        }

        $params = ['training_program_id' => $programId];
        $scopeWhere = '';
        if ($this->isProjectOfficer($actor)) {
            $staffProfileId = $this->findStaffProfileIdForUser((int) ($actor['id'] ?? 0));
            if ($staffProfileId === null) {
                return [];
            }

            $params['scope_staff_profile_id'] = $staffProfileId;
            $scopeWhere = '
                AND EXISTS (
                    SELECT 1
                    FROM staff_barangay_assignments AS scope_assignments
                    WHERE scope_assignments.barangay_id = applicant_profiles.barangay_id
                      AND scope_assignments.staff_profile_id = :scope_staff_profile_id
                      AND scope_assignments.ended_at IS NULL
                )';
        }

        $sql = '
            SELECT
                training_invitees.id,
                training_invitees.invite_status,
                training_invitees.remarks,
                training_invitees.notified_at,
                training_invitees.last_notice_sent_at,
                training_invitees.post_approval_unlocked_at,
                training_invitees.applicant_profile_id,
                training_invitees.beneficiary_profile_id,
                training_invitees.batch_group_number,
                users.id AS user_id,
                users.full_name,
                users.email,
                applicant_profiles.contact_number,
                applicant_profiles.business_name,
                applicant_profiles.sector,
                ' . $this->selectApplicantSectorOtherSpecifySql() . ',
                ' . $this->selectApplicantLivelihoodCategorySql() . ',
                ' . $this->selectApplicantLivelihoodTypeSql() . ',
                ' . $this->selectApplicantBatchNoSql() . ',
                barangays.name AS barangay_name,
                assigned_pdo_users.id AS assigned_pdo_user_id,
                assigned_pdo_users.full_name AS assigned_pdo_name,
                attendance_records.attendance_status,
                attendance_records.remarks AS attendance_remarks,
                attendance_records.checked_in_at,
                attendance_records.proof_file_path,
                attendance_records.proof_original_name,
                attendance_records.proof_mime_type,
                attendance_records.proof_file_size,
                updated_by.full_name AS updated_by_name
            FROM training_invitees
            INNER JOIN applicant_profiles ON applicant_profiles.id = training_invitees.applicant_profile_id
            INNER JOIN users ON users.id = applicant_profiles.user_id
            LEFT JOIN beneficiary_profiles ON beneficiary_profiles.id = training_invitees.beneficiary_profile_id
            LEFT JOIN barangays ON barangays.id = applicant_profiles.barangay_id
            LEFT JOIN (
                SELECT applications.applicant_profile_id, MAX(applications.id) AS latest_application_id
                FROM applications
                GROUP BY applications.applicant_profile_id
            ) AS latest_applications ON latest_applications.applicant_profile_id = applicant_profiles.id
            LEFT JOIN applications AS latest_application ON latest_application.id = latest_applications.latest_application_id
            LEFT JOIN staff_profiles AS assigned_staff ON assigned_staff.id = latest_application.assigned_staff_profile_id
            LEFT JOIN users AS assigned_pdo_users ON assigned_pdo_users.id = assigned_staff.user_id
            LEFT JOIN attendance_records ON attendance_records.training_invitee_id = training_invitees.id
            LEFT JOIN users AS updated_by ON updated_by.id = training_invitees.updated_by_user_id
            WHERE training_invitees.training_program_id = :training_program_id
            ' . $scopeWhere . '
            ORDER BY users.full_name ASC
        ';

        try {
            $statement = db()->prepare($sql);
            $statement->execute($params);
            $rows = $statement->fetchAll(PDO::FETCH_ASSOC) ?: [];
        } catch (\Throwable $exception) {
            log_database_query_failure('training.program_invitees', $exception, ['program_id' => $programId]);
            return [];
        }

        $invitees = array_map(static function (array $row): array {
            return [
                'id' => (int) $row['id'],
                'applicantProfileId' => (int) $row['applicant_profile_id'],
                'beneficiaryProfileId' => $row['beneficiary_profile_id'] !== null ? (int) $row['beneficiary_profile_id'] : null,
                'status' => $row['attendance_status'] ?: $row['invite_status'],
                'inviteStatus' => $row['invite_status'],
                'remarks' => $row['attendance_remarks'] ?: $row['remarks'],
                'notifiedAt' => $row['notified_at'],
                'lastNoticeSentAt' => $row['last_notice_sent_at'],
                'postApprovalUnlockedAt' => $row['post_approval_unlocked_at'],
                'checkedInAt' => $row['checked_in_at'],
                  'batchGroupNumber' => $row['batch_group_number'] !== null ? (int) $row['batch_group_number'] : null,
                  'assignedPdoUserId' => $row['assigned_pdo_user_id'] !== null ? (int) $row['assigned_pdo_user_id'] : null,
                  'assignedPdoName' => $row['assigned_pdo_name'],
                  'barangay' => $row['barangay_name'],
                  'businessName' => $row['business_name'],
                  'sector' => $row['sector'],
                  'sectorOtherSpecify' => $row['sector_other_specify'] ?? null,
                  'livelihoodCategory' => $row['livelihood_category'] ?? null,
                  'livelihood' => $row['livelihood_type'],
                  'batchNo' => $row['batch_no'] ?? null,
                  'contactNumber' => $row['contact_number'],
                  'updatedByName' => $row['updated_by_name'],
                'proofAttachment' => ($row['proof_file_path'] ?? null)
                    ? [
                        'file_path' => $row['proof_file_path'],
                        'original_name' => $row['proof_original_name'],
                        'mime_type' => $row['proof_mime_type'],
                        'file_size' => $row['proof_file_size'] !== null ? (int) $row['proof_file_size'] : null,
                    ]
                    : null,
                'user' => [
                    'id' => (int) $row['user_id'],
                    'name' => $row['full_name'],
                    'email' => $row['email'],
                ],
            ];
        }, $rows);

        $eligibilityMap = $this->eligibilityService()->evaluateApplicantProfileIds(
            array_map(static fn (array $invitee): int => (int) $invitee['applicantProfileId'], $invitees),
            $actor
        );

        $invitees = array_map(static function (array $invitee) use ($eligibilityMap): array {
            $applicantProfileId = (int) ($invitee['applicantProfileId'] ?? 0);
            $snapshot = $eligibilityMap[$applicantProfileId] ?? null;
            $invitee['currentEligibility'] = [
                'eligible' => (bool) ($snapshot['eligible'] ?? false),
                'reasons' => is_array($snapshot['reasons'] ?? null) ? array_values($snapshot['reasons']) : [],
            ];
            return $invitee;
        }, $invitees);

        return $this->appendCompletionHistory($invitees, $program);
    }

    private function appendCompletionHistory(array $invitees, array $program): array
    {
        $applicantProfileIds = array_values(array_unique(array_filter(array_map(
            static fn (array $invitee): int => (int) ($invitee['applicantProfileId'] ?? 0),
            $invitees
        ))));
        if ($applicantProfileIds === []) {
            return $invitees;
        }

        $sessionYear = substr((string) ($program['startsAt'] ?? $program['date'] ?? ''), 0, 4);
        if (!preg_match('/^\d{4}$/', $sessionYear)) {
            $sessionYear = date('Y');
        }

        $placeholders = implode(',', array_fill(0, count($applicantProfileIds), '?'));
        try {
            $statement = db()->prepare(
                'SELECT training_invitees.applicant_profile_id,
                        training_programs.training_round_number,
                        COALESCE(attendance_records.attendance_status, training_invitees.invite_status) AS attendance_status
                 FROM training_invitees
                 INNER JOIN training_programs ON training_programs.id = training_invitees.training_program_id
                 LEFT JOIN attendance_records ON attendance_records.training_invitee_id = training_invitees.id
                 WHERE training_invitees.applicant_profile_id IN (' . $placeholders . ')
                   AND YEAR(training_programs.starts_at) = ?
                   AND training_programs.training_round_number BETWEEN 1 AND 3'
            );
            $params = array_merge($applicantProfileIds, [(int) $sessionYear]);
            $statement->execute($params);
            $rows = $statement->fetchAll(PDO::FETCH_ASSOC) ?: [];
        } catch (\Throwable $exception) {
            log_database_query_failure('training.completion_history', $exception, ['program_id' => $program['id'] ?? null]);
            return $invitees;
        }

        $presentRoundsByApplicant = [];
        foreach ($rows as $row) {
            $status = $this->normalizeStatus((string) ($row['attendance_status'] ?? ''));
            if (!in_array($status, [TRAINING_STATUS_ATTENDED, TRAINING_STATUS_COMPLETED], true)) {
                continue;
            }
            $applicantProfileId = (int) ($row['applicant_profile_id'] ?? 0);
            $round = (int) ($row['training_round_number'] ?? 0);
            if ($applicantProfileId <= 0 || $round < 1 || $round > 3) {
                continue;
            }
            $presentRoundsByApplicant[$applicantProfileId][$round] = true;
        }

        $currentRound = (int) ($program['roundNumber'] ?? $program['training_round_number'] ?? 0);
        return array_map(static function (array $invitee) use ($presentRoundsByApplicant, $currentRound): array {
            $applicantProfileId = (int) ($invitee['applicantProfileId'] ?? 0);
            $presentRounds = $presentRoundsByApplicant[$applicantProfileId] ?? [];
            $presentSessionCount = count($presentRounds);
            $isCompleted = $currentRound === 3 && isset($presentRounds[1], $presentRounds[2], $presentRounds[3]);
            $invitee['presentSessionCount'] = $presentSessionCount;
            $invitee['completedByAttendance'] = $isCompleted;
            $invitee['completionStatus'] = $isCompleted ? TRAINING_STATUS_COMPLETED : 'Incomplete';
            return $invitee;
        }, $invitees);
    }

    private function emptyListing(): array
    {
        return [
            'programs' => [],
            'rounds' => $this->buildRoundBoard([]),
            'eligibleInvitees' => [],
            'eligibilitySnapshots' => [],
            'summary' => $this->buildSummary([]) + ['yearlyBatch' => $this->buildYearlyBatchSummary((int) date('Y'))],
            'statuses' => TRAINING_ALLOWED_STATUSES,
            'seminarForms' => $this->seminarFormOptions(),
            'schemaError' => $this->cachedSchemaError,
        ];
    }

    private function applicantProfileColumns(): array
    {
        if ($this->applicantProfileColumnCache !== null) {
            return $this->applicantProfileColumnCache;
        }

        try {
            $statement = db()->query('SHOW COLUMNS FROM applicant_profiles');
            $rows = $statement->fetchAll(PDO::FETCH_ASSOC) ?: [];
            $this->applicantProfileColumnCache = array_map(
                static fn (array $row): string => (string) ($row['Field'] ?? ''),
                $rows
            );
        } catch (\Throwable $exception) {
            log_database_query_failure('training.applicant_profile_columns', $exception);
            $this->applicantProfileColumnCache = [];
        }

        return $this->applicantProfileColumnCache;
    }

    private function selectApplicantBatchNoSql(): string
    {
        return in_array('batch_no', $this->applicantProfileColumns(), true)
            ? 'applicant_profiles.batch_no AS batch_no'
            : 'NULL AS batch_no';
    }

    private function selectApplicantLivelihoodCategorySql(): string
    {
        return in_array('livelihood_category', $this->applicantProfileColumns(), true)
            ? 'applicant_profiles.livelihood_category AS livelihood_category'
            : 'NULL AS livelihood_category';
    }

    private function selectApplicantLivelihoodTypeSql(): string
    {
        return in_array('livelihood_type', $this->applicantProfileColumns(), true)
            ? 'applicant_profiles.livelihood_type AS livelihood_type'
            : 'NULL AS livelihood_type';
    }

    private function selectApplicantSectorOtherSpecifySql(): string
    {
        return in_array('sector_other_specify', $this->applicantProfileColumns(), true)
            ? 'applicant_profiles.sector_other_specify AS sector_other_specify'
            : 'NULL AS sector_other_specify';
    }

    private function validateProgramPayload(array $payload): array
    {
        $normalizedDate = $this->normalizeDate((string) ($payload['date'] ?? ''));
        $normalizedStartTime = $this->normalizeTime((string) ($payload['startTime'] ?? ''));
        $normalizedEndTime = $this->normalizeTime((string) ($payload['endTime'] ?? ''));

        $data = [
            'programName' => trim((string) ($payload['programName'] ?? '')),
            'description' => trim((string) ($payload['description'] ?? '')),
            'venue' => trim((string) ($payload['venue'] ?? '')),
            'speaker' => trim((string) ($payload['speaker'] ?? '')),
            'date' => $normalizedDate,
            'startTime' => $normalizedStartTime,
            'endTime' => $normalizedEndTime,
            'whatToBring' => trim((string) ($payload['whatToBring'] ?? '')),
            'instructions' => trim((string) ($payload['instructions'] ?? '')),
            'trainingMode' => TRAINING_SCOPE_BATCH,
            'batchGroupCount' => TRAINING_BATCH_GROUP_COUNT,
            'batchGroupSize' => TRAINING_BATCH_GROUP_SIZE,
            'roundNumber' => (int) ($payload['roundNumber'] ?? 0),
            'targetGroupNumber' => (int) ($payload['targetGroupNumber'] ?? 0),
            'seminarFormCodes' => $this->sanitizeSeminarFormCodes($payload['seminarFormCodes'] ?? []),
            'status' => trim((string) ($payload['status'] ?? TRAINING_STATUS_SCHEDULED)),
        ];

        $errors = [];
        if ($data['programName'] === '') {
            $errors['programName'] = 'Program name is required.';
        }
        if ($data['roundNumber'] < 1 || $data['roundNumber'] > TRAINING_SESSIONS_PER_YEAR) {
            $errors['roundNumber'] = sprintf('Training round must be between 1 and %d.', TRAINING_SESSIONS_PER_YEAR);
        }
        if ($data['targetGroupNumber'] < 1 || $data['targetGroupNumber'] > TRAINING_BATCH_GROUP_COUNT) {
            $errors['targetGroupNumber'] = sprintf('Training group must be between 1 and %d.', TRAINING_BATCH_GROUP_COUNT);
        }
        if ($data['batchGroupCount'] !== TRAINING_BATCH_GROUP_COUNT) {
            $errors['batchGroupCount'] = 'SMART LEAP uses exactly 3 groups per yearly batch.';
        }
        if ($data['batchGroupSize'] !== TRAINING_BATCH_GROUP_SIZE) {
            $errors['batchGroupSize'] = sprintf('Each SMART LEAP group holds exactly %d participants.', TRAINING_BATCH_GROUP_SIZE);
        }
        if ($data['date'] === '') {
            $errors['date'] = 'Training date is required.';
        } elseif ($normalizedDate === '') {
            $errors['date'] = 'Training date format is invalid.';
        }
        if ($data['startTime'] === '' || $data['endTime'] === '') {
            $errors['time'] = 'Start and end time are required.';
        }
        if (($payload['startTime'] ?? '') !== '' && $normalizedStartTime === '') {
            $errors['time'] = 'Start time format is invalid.';
        }
        if (($payload['endTime'] ?? '') !== '' && $normalizedEndTime === '') {
            $errors['time'] = 'End time format is invalid.';
        }
        if ($data['date'] !== '' && $data['startTime'] !== '' && $data['endTime'] !== '') {
            $startStamp = strtotime($data['date'] . ' ' . $data['startTime']);
            $endStamp = strtotime($data['date'] . ' ' . $data['endTime']);
            if ($startStamp === false || $endStamp === false) {
                $errors['time'] = 'Training schedule could not be interpreted.';
            } elseif ($startStamp >= $endStamp) {
                $errors['time'] = 'End time must be after start time.';
            }
        }
        if (!in_array($data['status'], TRAINING_ALLOWED_STATUSES, true)) {
            $errors['status'] = 'Invalid training status.';
        }

        return ['data' => $data, 'errors' => $errors];
    }

    private function normalizeDate(string $value): string
    {
        $value = trim($value);
        if ($value === '') {
            return '';
        }

        $formats = ['Y-m-d', 'm/d/Y', 'n/j/Y'];
        foreach ($formats as $format) {
            $date = \DateTimeImmutable::createFromFormat('!' . $format, $value);
            if ($date instanceof \DateTimeImmutable) {
                return $date->format('Y-m-d');
            }
        }

        $timestamp = strtotime($value);
        return $timestamp === false ? '' : date('Y-m-d', $timestamp);
    }

    private function sanitizeSeminarFormCodes(mixed $raw): array
    {
        $values = is_array($raw) ? $raw : [$raw];
        $codes = [];
        foreach ($values as $value) {
            $code = trim((string) $value);
            if ($code === '' || !in_array($code, TRAINING_SEMINAR_FORM_CODES, true)) {
                continue;
            }
            $codes[] = $code;
        }

        return array_values(array_unique($codes));
    }

    private function encodeSeminarFormCodes(array $codes): string
    {
        return json_encode($this->sanitizeSeminarFormCodes($codes), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) ?: '[]';
    }

    private function syncSeminarFormsForRound(int $year, int $roundNumber, array $codes, int $sourceProgramId): void
    {
        if ($year <= 0 || $roundNumber <= 0 || $sourceProgramId <= 0) {
            return;
        }

        $statement = db()->prepare(
            'UPDATE training_programs
             SET seminar_form_codes = :seminar_form_codes,
                 updated_at = NOW()
             WHERE id <> :source_program_id
               AND YEAR(starts_at) = :year
               AND training_round_number = :round_number'
        );
        $statement->execute([
            'seminar_form_codes' => $this->encodeSeminarFormCodes($codes),
            'source_program_id' => $sourceProgramId,
            'year' => $year,
            'round_number' => $roundNumber,
        ]);
    }

    private function decodeSeminarFormCodes(mixed $raw): array
    {
        if (!is_string($raw) || trim($raw) === '') {
            return [];
        }

        $decoded = json_decode($raw, true);
        return is_array($decoded) ? $this->sanitizeSeminarFormCodes($decoded) : [];
    }

    private function seminarFormOptions(): array
    {
        $options = [];
        foreach (TRAINING_SEMINAR_FORM_CODES as $code) {
            $options[] = [
                'code' => $code,
                'label' => TRAINING_SEMINAR_FORM_LABELS[$code] ?? ucwords(str_replace('_', ' ', $code)),
            ];
        }

        return $options;
    }

    private function countYearPrograms(string $date, ?int $programId = null): int
    {
        if ($date === '') {
            return 0;
        }

        $year = (int) substr($date, 0, 4);
        if ($year <= 0) {
            return 0;
        }

        $sql = 'SELECT COUNT(DISTINCT COALESCE(training_round_number, 1))
                FROM training_programs
                WHERE YEAR(starts_at) = :year';
        $params = ['year' => $year];

        if ($programId !== null && $programId > 0) {
            $sql .= ' AND id <> :program_id';
            $params['program_id'] = $programId;
        }

        $statement = db()->prepare($sql);
        $statement->execute($params);
        $value = $statement->fetchColumn();

        return $value !== false ? (int) $value : 0;
    }

    private function roundSlotsForYear(int $year, ?int $excludeProgramId = null): array
    {
        if ($year <= 0) {
            return [];
        }

        $sql = '
            SELECT
                training_programs.id,
                training_programs.training_round_number,
                training_programs.target_group_number,
                (
                    SELECT COUNT(*)
                    FROM training_invitees
                    WHERE training_invitees.training_program_id = training_programs.id
                      AND (training_invitees.notified_at IS NOT NULL OR training_invitees.last_notice_sent_at IS NOT NULL)
                ) AS notice_sent_count
            FROM training_programs
            WHERE YEAR(training_programs.starts_at) = :year
        ';
        $params = ['year' => $year];
        if ($excludeProgramId !== null && $excludeProgramId > 0) {
            $sql .= ' AND training_programs.id <> :exclude_program_id';
            $params['exclude_program_id'] = $excludeProgramId;
        }
        $sql .= ' ORDER BY training_programs.training_round_number ASC, training_programs.target_group_number ASC, training_programs.id ASC';

        $statement = db()->prepare($sql);
        $statement->execute($params);
        $rows = $statement->fetchAll(PDO::FETCH_ASSOC) ?: [];

        return array_map(function (array $row): array {
            return [
                'id' => (int) ($row['id'] ?? 0),
                'roundNumber' => $this->normalizeRoundNumber((int) ($row['training_round_number'] ?? 0)),
                'targetGroupNumber' => $this->normalizeGroupNumber((int) ($row['target_group_number'] ?? 0)),
                'isLocked' => (int) ($row['notice_sent_count'] ?? 0) > 0,
            ];
        }, $rows);
    }

    private function validateRoundGroupSlot(int $year, int $roundNumber, int $groupNumber, ?int $programId = null): array
    {
        $roundNumber = $this->normalizeRoundNumber($roundNumber);
        $groupNumber = $this->normalizeGroupNumber($groupNumber);
        $slots = $this->roundSlotsForYear($year, $programId);
        $grouped = [];
        foreach ($slots as $slot) {
            $grouped[(int) $slot['roundNumber']][(int) $slot['targetGroupNumber']] = $slot;
        }

        if (isset($grouped[$roundNumber][$groupNumber])) {
            return ['errors' => ['targetGroupNumber' => sprintf('Group %d is already scheduled for Session %d.', $groupNumber, $roundNumber)]];
        }

        return ['errors' => []];
    }

    private function normalizeTime(string $value): string
    {
        $value = trim($value);
        if ($value === '') {
            return '';
        }

        $formats = ['H:i', 'H:i:s', 'g:i A', 'g:i a', 'h:i A', 'h:i a'];
        foreach ($formats as $format) {
            $time = \DateTimeImmutable::createFromFormat('!' . $format, $value);
            if ($time instanceof \DateTimeImmutable) {
                return $time->format('H:i');
            }
        }

        $timestamp = strtotime($value);
        return $timestamp === false ? '' : date('H:i', $timestamp);
    }

    private function buildSummary(array $programs): array
    {
        $summary = [
            'total' => count($programs),
            'scheduled' => 0,
            'notified' => 0,
            'completed' => 0,
            'participants' => 0,
            'attended' => 0,
            'excused' => 0,
        ];

        foreach ($programs as $program) {
            $status = strtolower((string) ($program['status'] ?? ''));
            if ($status === strtolower(TRAINING_STATUS_SCHEDULED)) {
                $summary['scheduled']++;
            }
            if ($status === strtolower(TRAINING_STATUS_NOTIFIED)) {
                $summary['notified']++;
            }
            if ($status === strtolower(TRAINING_STATUS_COMPLETED)) {
                $summary['completed']++;
            }
            $summary['participants'] += (int) ($program['participantCount'] ?? 0);
            $summary['attended'] += (int) ($program['completedCount'] ?? 0);
            $summary['excused'] += (int) ($program['excusedCount'] ?? 0);
        }

        return $summary;
    }

    private function mapProgramRow(array $row): array
    {
        $startsAt = (string) ($row['starts_at'] ?? '');
        $endsAt = (string) ($row['ends_at'] ?? '');

        return [
            'id' => (int) $row['id'],
            'programName' => $row['title'],
            'title' => $row['title'],
            'description' => $row['description'],
            'venue' => $row['venue'],
            'speaker' => $row['speaker'] ?? null,
            'date' => $startsAt !== '' ? substr($startsAt, 0, 10) : null,
            'startTime' => $startsAt !== '' ? substr($startsAt, 11, 5) : null,
            'endTime' => $endsAt !== '' ? substr($endsAt, 11, 5) : null,
            'startsAt' => $startsAt,
            'endsAt' => $endsAt,
            'whatToBring' => $row['what_to_bring'],
            'instructions' => $row['instructions'],
            'trainingMode' => TRAINING_SCOPE_BATCH,
            'batchGroupCount' => TRAINING_BATCH_GROUP_COUNT,
            'batchGroupSize' => TRAINING_BATCH_GROUP_SIZE,
            'roundNumber' => $this->normalizeRoundNumber((int) ($row['training_round_number'] ?? 0)),
            'targetGroupNumber' => $this->normalizeGroupNumber((int) ($row['target_group_number'] ?? 0)),
            'seminarFormCodes' => $this->decodeSeminarFormCodes($row['seminar_form_codes'] ?? null),
            'status' => $this->deriveProgramStatus($row),
            'storedStatus' => $this->normalizeStatus((string) $row['status']),
            'createdBy' => $row['created_by_name'],
            'participantCount' => (int) $row['participant_count'],
            'completedCount' => (int) $row['completed_count'],
            'attendedCount' => (int) ($row['attended_count'] ?? 0),
            'excusedCount' => (int) ($row['excused_count'] ?? 0),
            'notifiedCount' => (int) ($row['notified_count'] ?? 0),
            'noticeSentCount' => (int) ($row['notice_sent_count'] ?? 0),
            'isLocked' => (int) ($row['notice_sent_count'] ?? 0) > 0,
            'createdAt' => $row['created_at'],
        ];
    }

    private function deriveProgramStatus(array $row): string
    {
        $participants = (int) ($row['participant_count'] ?? 0);
        $completed = (int) ($row['completed_count'] ?? 0);
        $attended = (int) ($row['attended_count'] ?? 0);
        $notified = (int) ($row['notified_count'] ?? 0);

        if ($participants === 0) {
            return $this->normalizeStatus((string) $row['status']);
        }
        if ($completed > 0 && $completed === $participants) {
            return TRAINING_STATUS_COMPLETED;
        }
        if (($completed + $attended) > 0) {
            return TRAINING_STATUS_ATTENDED;
        }
        if ($notified > 0) {
            return TRAINING_STATUS_NOTIFIED;
        }

        return TRAINING_STATUS_SCHEDULED;
    }

    private function applyLiveInviteeCounts(array $program, array $invitees): array
    {
        $participantCount = count($invitees);
        $attendedCount = 0;
        $completedCount = 0;
        $excusedCount = 0;
        $notifiedCount = 0;
        $noticeSentCount = 0;

        foreach ($invitees as $invitee) {
            $status = $this->normalizeStatus((string) ($invitee['status'] ?? $invitee['inviteStatus'] ?? ''));
            if ($status === TRAINING_STATUS_ATTENDED) {
                $attendedCount++;
                $completedCount++;
            }
            if ($status === TRAINING_STATUS_COMPLETED) {
                $completedCount++;
            }
            if ($status === TRAINING_STATUS_EXCUSED) {
                $excusedCount++;
            }
            if ($status === TRAINING_STATUS_NOTIFIED) {
                $notifiedCount++;
            }
            if (!empty($invitee['lastNoticeSentAt']) || !empty($invitee['notifiedAt'])) {
                $noticeSentCount++;
            }
        }

        $program['participantCount'] = $participantCount;
        $program['attendedCount'] = $attendedCount;
        $program['completedCount'] = $completedCount;
        $program['excusedCount'] = $excusedCount;
        $program['notifiedCount'] = $notifiedCount;
        $program['noticeSentCount'] = $noticeSentCount;
        $program['isLocked'] = $noticeSentCount > 0;
        $program['status'] = $this->deriveProgramStatus([
            'participant_count' => $participantCount,
            'completed_count' => $completedCount,
            'attended_count' => $attendedCount,
            'notified_count' => $notifiedCount,
            'status' => $program['storedStatus'] ?? $program['status'] ?? TRAINING_STATUS_SCHEDULED,
        ]);

        return $program;
    }

    private function syncProgramInviteesToEligibleRoster(int $programId, int $year, int $actorUserId): void
    {
        if ($programId <= 0 || $year <= 0) {
            return;
        }

        $program = $this->findProgram($programId, ['role' => ROLE_ADMIN, 'id' => $actorUserId]);
        if ($program === null) {
            return;
        }

        $targetGroupNumber = $this->normalizeGroupNumber((int) ($program['targetGroupNumber'] ?? 0));
        $groupAssignments = $this->currentEligibleGroupAssignments();
        $groupRosters = $groupAssignments['groupRosters'] ?? [];
        $targetRoster = array_values($groupRosters['group' . $targetGroupNumber] ?? []);
        $eligibleMap = [];
        foreach ($targetRoster as $entry) {
            $applicantProfileId = (int) ($entry['applicantProfileId'] ?? 0);
            if ($applicantProfileId <= 0) {
                continue;
            }
            $eligibleMap[$applicantProfileId] = $entry;
        }

        $targetIds = array_keys($eligibleMap);

        $pdo = db();
        $pdo->beginTransaction();

        try {
            $existingStatement = $pdo->prepare('SELECT id, applicant_profile_id FROM training_invitees WHERE training_program_id = :training_program_id');
            $existingStatement->execute(['training_program_id' => $programId]);
            $existingRows = $existingStatement->fetchAll(PDO::FETCH_ASSOC) ?: [];
            $existingMap = [];
            foreach ($existingRows as $row) {
                $existingMap[(int) $row['applicant_profile_id']] = (int) $row['id'];
            }

            $insert = $pdo->prepare(
                'INSERT INTO training_invitees
                 (training_program_id, applicant_profile_id, beneficiary_profile_id, invite_status, updated_by_user_id, batch_group_number)
                 VALUES (:training_program_id, :applicant_profile_id, :beneficiary_profile_id, :invite_status, :updated_by_user_id, :batch_group_number)'
            );

            $updateAssignment = $pdo->prepare(
                'UPDATE training_invitees
                 SET beneficiary_profile_id = :beneficiary_profile_id,
                     updated_by_user_id = :updated_by_user_id,
                     updated_at = NOW()
                 WHERE training_program_id = :training_program_id
                   AND applicant_profile_id = :applicant_profile_id'
            );

            foreach ($targetIds as $applicantProfileId) {
                $beneficiaryProfileId = $eligibleMap[$applicantProfileId]['beneficiaryProfileId']
                    ?: (new BeneficiaryProfileService())->ensureWorkspaceProfileForApplicantProfile($applicantProfileId);

                if (isset($existingMap[$applicantProfileId])) {
                    $updateAssignment->execute([
                        'beneficiary_profile_id' => $beneficiaryProfileId,
                        'updated_by_user_id' => $actorUserId,
                        'training_program_id' => $programId,
                        'applicant_profile_id' => $applicantProfileId,
                    ]);
                    $pdo->prepare(
                        'UPDATE training_invitees
                         SET batch_group_number = :batch_group_number
                         WHERE training_program_id = :training_program_id
                           AND applicant_profile_id = :applicant_profile_id'
                    )->execute([
                        'batch_group_number' => $targetGroupNumber,
                        'training_program_id' => $programId,
                        'applicant_profile_id' => $applicantProfileId,
                    ]);
                    continue;
                }

                $insert->execute([
                    'training_program_id' => $programId,
                    'applicant_profile_id' => $applicantProfileId,
                    'beneficiary_profile_id' => $beneficiaryProfileId,
                    'invite_status' => TRAINING_STATUS_SCHEDULED,
                    'updated_by_user_id' => $actorUserId,
                    'batch_group_number' => $targetGroupNumber,
                ]);
            }

            $pdo->commit();
        } catch (\Throwable $exception) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            log_database_query_failure('training.sync_program_invitees_to_eligible_roster', $exception, ['program_id' => $programId, 'year' => $year]);
        }
    }

    private function resolveYearlyBatchAssignmentPlan(int $year, array $targetIds, array $eligibleMap, ?int $excludeProgramId = null, array $preferredPdoGroups = []): array
    {
        $groupCount = TRAINING_BATCH_GROUP_COUNT;
        $groupSize = $this->currentTrainingGroupSize();
        $capacity = $this->currentTrainingCapacity();
        $roster = $this->fetchYearlyRosterForAssignments($year, $excludeProgramId);
        foreach ($targetIds as $applicantProfileId) {
            if (isset($eligibleMap[$applicantProfileId])) {
                $roster[$applicantProfileId] = [
                    'applicantProfileId' => $applicantProfileId,
                    'fullName' => (string) ($eligibleMap[$applicantProfileId]['name'] ?? ''),
                    'businessName' => (string) ($eligibleMap[$applicantProfileId]['businessName'] ?? ''),
                    'assignedPdoUserId' => $eligibleMap[$applicantProfileId]['assignedPdoUserId'] ?? null,
                    'assignedPdoName' => (string) ($eligibleMap[$applicantProfileId]['assignedPdoName'] ?? ''),
                    'applicationReviewedAt' => $eligibleMap[$applicantProfileId]['applicationReviewedAt'] ?? null,
                    'applicationSubmittedAt' => $eligibleMap[$applicantProfileId]['applicationSubmittedAt'] ?? null,
                    'applicationCreatedAt' => $eligibleMap[$applicantProfileId]['applicationCreatedAt'] ?? null,
                ];
            }
        }

        if (count($roster) > $capacity) {
            return [
                'errors' => [
                    'invitees' => sprintf(
                        'The yearly SMART LEAP batch supports up to %d participants only (%d groups x %d participants).',
                        $capacity,
                        $groupCount,
                        $groupSize
                    ),
                ],
                'groups' => [],
            ];
        }

        $capacityGrouping = $this->buildCapacityGroupAssignments(array_values($roster), $groupSize);
        if (($capacityGrouping['errors'] ?? []) !== []) {
            return [
                'errors' => $capacityGrouping['errors'],
                'groups' => [],
            ];
        }

        return ['errors' => [], 'groups' => $capacityGrouping['groups'] ?? []];
    }

    private function syncYearlyAssignmentsAfterProgramSave(int $programId, int $targetYear, ?int $previousYear, int $actorUserId): void
    {
        $this->syncProgramInviteesToEligibleRoster($programId, $targetYear, $actorUserId);
        if ($previousYear !== null && $previousYear !== $targetYear) {
            $this->syncProgramsForYear($previousYear, $actorUserId);
        }
        $this->syncProgramsForYear($targetYear, $actorUserId);
    }

    private function syncProgramsForYear(int $year, int $actorUserId): void
    {
        if ($year <= 0) {
            return;
        }

        foreach ($this->roundSlotsForYear($year) as $slot) {
            $programId = (int) ($slot['id'] ?? 0);
            if ($programId <= 0) {
                continue;
            }
            $this->syncProgramInviteesToEligibleRoster($programId, $year, $actorUserId);
        }
    }

    private function countInvitees(int $programId): int
    {
        $statement = db()->prepare('SELECT COUNT(*) FROM training_invitees WHERE training_program_id = :training_program_id');
        $statement->execute(['training_program_id' => $programId]);
        return (int) ($statement->fetchColumn() ?: 0);
    }

    private function countYearlyAssignedApplicants(int $year, ?int $excludeProgramId = null): int
    {
        $sql = '
            SELECT COUNT(DISTINCT training_invitees.applicant_profile_id)
            FROM training_invitees
            INNER JOIN training_programs ON training_programs.id = training_invitees.training_program_id
            WHERE YEAR(training_programs.starts_at) = :year
        ';
        $params = ['year' => $year];
        if ($excludeProgramId !== null && $excludeProgramId > 0) {
            $sql .= ' AND training_programs.id <> :exclude_program_id';
            $params['exclude_program_id'] = $excludeProgramId;
        }

        $statement = db()->prepare($sql);
        $statement->execute($params);
        return (int) ($statement->fetchColumn() ?: 0);
    }

    public function yearlyBatchSummary(int $year): array
    {
        return $this->buildYearlyBatchSummary($year);
    }

    public function yearlyGroupRoster(int $year, int $groupNumber): array
    {
        $summary = $this->buildYearlyBatchSummary($year);
        if ($groupNumber === 1) {
            return $summary['groupRosters']['group1'] ?? [];
        }
        if ($groupNumber === 2) {
            return $summary['groupRosters']['group2'] ?? [];
        }
        if ($groupNumber === 3) {
            return $summary['groupRosters']['group3'] ?? [];
        }

        return [];
    }

    private function findProgram(int $programId, array $actor): ?array
    {
        if ($programId <= 0) {
            return null;
        }

        $params = ['program_id' => $programId];
        $conditions = ['training_programs.id = :program_id'];

        if ($this->isProjectOfficer($actor)) {
            $staffProfileId = $this->findStaffProfileIdForUser((int) ($actor['id'] ?? 0));
            if ($staffProfileId === null) {
                return null;
            }

            $params['scope_staff_profile_id'] = $staffProfileId;
            $params['scope_user_id'] = (int) ($actor['id'] ?? 0);
            $conditions[] = '(
                training_programs.created_by_user_id = :scope_user_id
                OR EXISTS (
                    SELECT 1
                    FROM training_invitees
                    INNER JOIN applicant_profiles ON applicant_profiles.id = training_invitees.applicant_profile_id
                    INNER JOIN staff_barangay_assignments AS scope_assignments
                        ON scope_assignments.barangay_id = applicant_profiles.barangay_id
                       AND scope_assignments.staff_profile_id = :scope_staff_profile_id
                       AND scope_assignments.ended_at IS NULL
                    WHERE training_invitees.training_program_id = training_programs.id
                )
            )';
        }

        $sql = '
            SELECT
                training_programs.id,
                training_programs.title,
                training_programs.description,
                training_programs.venue,
                training_programs.speaker,
                training_programs.starts_at,
                training_programs.ends_at,
                training_programs.what_to_bring,
                training_programs.instructions,
                training_programs.training_scope_mode,
                training_programs.batch_group_count,
                training_programs.batch_group_size,
                training_programs.training_round_number,
                training_programs.target_group_number,
                training_programs.seminar_form_codes,
                training_programs.status,
                training_programs.created_by_user_id,
                training_programs.created_at,
                users.full_name AS created_by_name,
                (
                    SELECT COUNT(*) FROM training_invitees WHERE training_invitees.training_program_id = training_programs.id
                ) AS participant_count,
                (
                    SELECT COUNT(*)
                    FROM training_invitees
                    WHERE training_invitees.training_program_id = training_programs.id
                      AND training_invitees.invite_status IN ("Attended", "Completed")
                ) AS completed_count,
                (
                    SELECT COUNT(*)
                    FROM training_invitees
                    WHERE training_invitees.training_program_id = training_programs.id
                      AND training_invitees.invite_status = "Attended"
                ) AS attended_count,
                (
                    SELECT COUNT(*)
                    FROM training_invitees
                    WHERE training_invitees.training_program_id = training_programs.id
                      AND training_invitees.invite_status = "Excused"
                ) AS excused_count,
                (
                    SELECT COUNT(*)
                    FROM training_invitees
                    WHERE training_invitees.training_program_id = training_programs.id
                      AND training_invitees.invite_status = "Notified"
                ) AS notified_count
                ,
                (
                    SELECT COUNT(*)
                    FROM training_invitees
                    WHERE training_invitees.training_program_id = training_programs.id
                      AND (training_invitees.notified_at IS NOT NULL OR training_invitees.last_notice_sent_at IS NOT NULL)
                ) AS notice_sent_count
            FROM training_programs
            LEFT JOIN users ON users.id = training_programs.created_by_user_id
            WHERE ' . implode(' AND ', $conditions) . '
            LIMIT 1
        ';

        try {
            $statement = db()->prepare($sql);
            foreach ($params as $key => $value) {
                $statement->bindValue(':' . $key, $value);
            }
            $statement->execute();
            $row = $statement->fetch(PDO::FETCH_ASSOC);
        } catch (\Throwable $exception) {
            log_database_query_failure('training.find_program', $exception, ['program_id' => $programId]);
            return null;
        }

        if (!is_array($row)) {
            return null;
        }

        $program = $this->mapProgramRow($row);
        $program['batchYear'] = $this->batchYearForProgram($program);
        return $program;
    }

    private function batchYearFromDate(string $date): int
    {
        $normalized = $this->normalizeDate($date);
        if ($normalized === '') {
            return (int) date('Y');
        }

        return (int) substr($normalized, 0, 4);
    }

    private function batchYearForProgram(array $program): int
    {
        return $this->batchYearFromDate((string) ($program['date'] ?? $program['startsAt'] ?? ''));
    }

    private function normalizeRoundNumber(int $value): int
    {
        return $value >= 1 && $value <= TRAINING_SESSIONS_PER_YEAR ? $value : 1;
    }

    private function normalizeGroupNumber(int $value): int
    {
        return $value >= 1 && $value <= TRAINING_BATCH_GROUP_COUNT ? $value : 1;
    }

    private function currentEligibleAssignmentRoster(): array
    {
        $eligible = $this->eligibleInvitees([]);
        $roster = [];
        foreach ($eligible as $invitee) {
            $applicantProfileId = (int) ($invitee['applicantProfileId'] ?? 0);
            if ($applicantProfileId <= 0) {
                continue;
            }

            $roster[] = [
                'applicantProfileId' => $applicantProfileId,
                'beneficiaryProfileId' => $invitee['beneficiaryProfileId'] ?? null,
                'fullName' => (string) ($invitee['name'] ?? ''),
                'businessName' => (string) ($invitee['businessName'] ?? ''),
                'assignedPdoUserId' => $invitee['assignedPdoUserId'] ?? null,
                'assignedPdoName' => (string) ($invitee['assignedPdoName'] ?? ''),
                'applicationReviewedAt' => $invitee['applicationReviewedAt'] ?? null,
                'applicationSubmittedAt' => $invitee['applicationSubmittedAt'] ?? null,
                'applicationCreatedAt' => $invitee['applicationCreatedAt'] ?? null,
                'barangay' => $invitee['barangay'] ?? null,
            ];
        }

        return $roster;
    }

    private function currentEligibleGroupAssignments(): array
    {
        $roster = $this->currentEligibleAssignmentRoster();
        if ($roster === []) {
            return [
                'groups' => [],
                'groupRosters' => [
                    'group1' => [],
                    'group2' => [],
                    'group3' => [],
                ],
            ];
        }

        return $this->buildCapacityGroupAssignments($roster, $this->currentTrainingGroupSize());
    }

    private function buildRoundBoard(array $programs): array
    {
        $grouped = [];
        foreach ($programs as $program) {
            $roundNumber = $this->normalizeRoundNumber((int) ($program['roundNumber'] ?? 0));
            $groupNumber = $this->normalizeGroupNumber((int) ($program['targetGroupNumber'] ?? 0));
            $grouped[$roundNumber][$groupNumber] = $program;
        }

        $rounds = [];
        for ($roundNumber = 1; $roundNumber <= TRAINING_SESSIONS_PER_YEAR; $roundNumber++) {
            $roundPrograms = $grouped[$roundNumber] ?? [];
            $slots = [];
            $notifiedGroups = [];
            $draftGroups = [];

            for ($groupNumber = 1; $groupNumber <= TRAINING_BATCH_GROUP_COUNT; $groupNumber++) {
                $slotProgram = $roundPrograms[$groupNumber] ?? null;
                if ($slotProgram !== null) {
                    if (($slotProgram['isLocked'] ?? false) === true) {
                        $notifiedGroups[] = $groupNumber;
                    } else {
                        $draftGroups[] = $groupNumber;
                    }
                }

                $slots[] = [
                    'groupNumber' => $groupNumber,
                    'label' => 'Group ' . $groupNumber,
                    'program' => $slotProgram,
                    'state' => $slotProgram === null
                        ? 'available'
                        : (($slotProgram['isLocked'] ?? false) ? 'locked' : 'draft'),
                    'disabled' => true,
                ];
            }

            $isUnlocked = true;
            $availableGroups = [];
            if ($isUnlocked) {
                foreach ([1, 2, 3] as $groupNumber) {
                    if (!in_array($groupNumber, $notifiedGroups, true)) {
                        $availableGroups[] = $groupNumber;
                    }
                }
            }

            foreach ($slots as &$slot) {
                $slot['disabled'] = !in_array((int) $slot['groupNumber'], $availableGroups, true)
                    && !($slot['program'] && !($slot['program']['isLocked'] ?? false));
            }
            unset($slot);

            $isComplete = count($notifiedGroups) === TRAINING_BATCH_GROUP_COUNT;
            $rounds[] = [
                'roundNumber' => $roundNumber,
                'label' => 'Session ' . $roundNumber,
                'isUnlocked' => $isUnlocked,
                'isComplete' => $isComplete,
                'notifiedGroups' => $notifiedGroups,
                'availableGroups' => $availableGroups,
                'slots' => $slots,
            ];
        }

        return $rounds;
    }

    private function buildYearlyBatchSummary(int $year): array
    {
        $groupRosters = [
            'group1' => [],
            'group2' => [],
            'group3' => [],
        ];
        $capacity = $this->currentTrainingCapacity();
        $groupSize = $this->currentTrainingGroupSize();
        $createdSessionRoster = array_values($this->fetchYearlyRosterForAssignments($year));
        if ($createdSessionRoster !== []) {
            $capacityGrouping = $this->buildCapacityGroupAssignments($createdSessionRoster, $groupSize);
            if (($capacityGrouping['groupRosters'] ?? null) !== null) {
                $groupRosters = $capacityGrouping['groupRosters'];
            }
        } else {
            $capacityGrouping = $this->currentEligibleGroupAssignments();
            if (($capacityGrouping['groupRosters'] ?? null) !== null) {
                $groupRosters = $capacityGrouping['groupRosters'];
            }
        }

        $yearlyAssignedCount = count($groupRosters['group1']) + count($groupRosters['group2']) + count($groupRosters['group3']);

        return [
            'batchYear' => $year,
            'yearlyBatchCapacity' => $capacity,
            'yearlyGroupSize' => $groupSize,
            'yearlyAssignedCount' => $yearlyAssignedCount,
            'yearlyRemainingCapacity' => max(0, $capacity - $yearlyAssignedCount),
            'yearlyGroup1Count' => count($groupRosters['group1']),
            'yearlyGroup2Count' => count($groupRosters['group2']),
            'yearlyGroup3Count' => count($groupRosters['group3']),
            'yearlySessionCountUsed' => $this->countYearPrograms((string) $year . '-01-01'),
            'yearlySessionCountRemaining' => max(0, TRAINING_SESSIONS_PER_YEAR - $this->countYearPrograms((string) $year . '-01-01')),
            'groupRosters' => $groupRosters,
        ];
    }

    private function fetchYearlyRosterForAssignments(int $year, ?int $excludeProgramId = null, ?PDO $pdo = null): array
    {
        $connection = $pdo ?? db();
        $selectNameColumns = $this->hasStructuredUserNameColumns()
            ? ',
                users.first_name,
                users.middle_name,
                users.last_name
            '
            : '';
        $orderBy = $this->hasStructuredUserNameColumns()
            ? ' ORDER BY users.last_name ASC, users.first_name ASC, users.middle_name ASC, users.full_name ASC'
            : ' ORDER BY users.full_name ASC';
          $sql = '
              SELECT
                  training_invitees.applicant_profile_id,
                  training_invitees.batch_group_number,
                  latest_application.id AS application_id,
                  latest_application.reviewed_at AS application_reviewed_at,
                  latest_application.submitted_at AS application_submitted_at,
                  latest_application.created_at AS application_created_at,
                  users.full_name,
                  applicant_profiles.business_name,
                  assigned_pdo_users.id AS assigned_pdo_user_id,
                assigned_pdo_users.full_name AS assigned_pdo_name
                ' . $selectNameColumns . '
            FROM training_invitees
            INNER JOIN training_programs ON training_programs.id = training_invitees.training_program_id
            INNER JOIN applicant_profiles ON applicant_profiles.id = training_invitees.applicant_profile_id
            INNER JOIN users ON users.id = applicant_profiles.user_id
            LEFT JOIN (
                SELECT applications.applicant_profile_id, MAX(applications.id) AS latest_application_id
                FROM applications
                GROUP BY applications.applicant_profile_id
            ) AS latest_applications ON latest_applications.applicant_profile_id = applicant_profiles.id
            LEFT JOIN applications AS latest_application ON latest_application.id = latest_applications.latest_application_id
            LEFT JOIN staff_profiles AS assigned_staff ON assigned_staff.id = latest_application.assigned_staff_profile_id
            LEFT JOIN users AS assigned_pdo_users ON assigned_pdo_users.id = assigned_staff.user_id
            WHERE YEAR(training_programs.starts_at) = :year
        ';
        $params = ['year' => $year];
        if ($excludeProgramId !== null && $excludeProgramId > 0) {
            $sql .= ' AND training_programs.id <> :exclude_program_id';
            $params['exclude_program_id'] = $excludeProgramId;
        }
        $sql .= $orderBy;

        $statement = $connection->prepare($sql);
        $statement->execute($params);
        $rows = $statement->fetchAll(PDO::FETCH_ASSOC) ?: [];

        $roster = [];
        foreach ($rows as $row) {
            $applicantProfileId = (int) ($row['applicant_profile_id'] ?? 0);
            if ($applicantProfileId <= 0 || isset($roster[$applicantProfileId])) {
                continue;
            }
              $roster[$applicantProfileId] = [
                'applicantProfileId' => $applicantProfileId,
                'batchGroupNumber' => $row['batch_group_number'] !== null ? (int) $row['batch_group_number'] : null,
                'applicationId' => $row['application_id'] !== null ? (int) $row['application_id'] : null,
                'applicationReviewedAt' => $row['application_reviewed_at'] ?? null,
                'applicationSubmittedAt' => $row['application_submitted_at'] ?? null,
                'applicationCreatedAt' => $row['application_created_at'] ?? null,
                'fullName' => (string) ($row['full_name'] ?? ''),
                'firstName' => (string) ($row['first_name'] ?? ''),
                'middleName' => (string) ($row['middle_name'] ?? ''),
                'lastName' => (string) ($row['last_name'] ?? ''),
                'businessName' => (string) ($row['business_name'] ?? ''),
                'assignedPdoUserId' => $row['assigned_pdo_user_id'] !== null ? (int) $row['assigned_pdo_user_id'] : null,
                'assignedPdoName' => (string) ($row['assigned_pdo_name'] ?? ''),
            ];
        }

        return $roster;
    }

    private function syncYearlyBatchAssignmentsForYear(int $year, int $actorUserId, ?PDO $pdo = null, array $preferredPdoGroups = []): void
    {
        $connection = $pdo ?? db();
        $roster = array_values($this->fetchYearlyRosterForAssignments($year, null, $connection));

        if (count($roster) > $this->currentTrainingCapacity()) {
            throw new \RuntimeException(sprintf('Assignment exceeds the yearly batch limit of %d participants.', $this->currentTrainingCapacity()));
        }

        $capacityGrouping = $this->buildCapacityGroupAssignments($roster, $this->currentTrainingGroupSize());
        if (($capacityGrouping['errors'] ?? []) !== []) {
            $firstError = $capacityGrouping['errors']['invitees'] ?? 'Unable to build capacity-based training groups.';
            throw new \RuntimeException($firstError);
        }
        $groupMap = $capacityGrouping['groups'] ?? [];

        $update = $connection->prepare(
            'UPDATE training_invitees
             INNER JOIN training_programs ON training_programs.id = training_invitees.training_program_id
             SET training_invitees.batch_group_number = :batch_group_number,
                 training_invitees.updated_by_user_id = :updated_by_user_id,
                 training_invitees.updated_at = NOW()
             WHERE YEAR(training_programs.starts_at) = :year
               AND training_invitees.applicant_profile_id = :applicant_profile_id'
        );

        foreach ($roster as $entry) {
            $update->execute([
                'batch_group_number' => (int) ($groupMap[(int) $entry['applicantProfileId']] ?? 0),
                'updated_by_user_id' => $actorUserId,
                'year' => $year,
                'applicant_profile_id' => (int) $entry['applicantProfileId'],
            ]);
        }
    }

    private function buildCapacityGroupAssignments(array $roster, int $groupSize): array
    {
        $groupMap = [];
        $groupRosters = [
            'group1' => [],
            'group2' => [],
            'group3' => [],
        ];

        $items = array_values(array_filter($roster, static fn (array $entry): bool => (int) ($entry['applicantProfileId'] ?? 0) > 0));
        usort($items, fn (array $left, array $right): int => $this->compareApplicantRosterRows($left, $right));

        $capacity = TRAINING_BATCH_GROUP_COUNT * $groupSize;
        if (count($items) > $capacity) {
            return [
                'errors' => [
                    'invitees' => sprintf(
                        'The yearly SMART LEAP training batch supports up to %d participants only (%d groups x %d participants).',
                        $capacity,
                        TRAINING_BATCH_GROUP_COUNT,
                        $groupSize
                    ),
                ],
                'groups' => [],
                'groupRosters' => $groupRosters,
            ];
        }

        foreach ($items as $index => $item) {
            $groupNumber = intdiv($index, $groupSize) + 1;
            if ($groupNumber < 1 || $groupNumber > TRAINING_BATCH_GROUP_COUNT) {
                continue;
            }

            $applicantProfileId = (int) ($item['applicantProfileId'] ?? 0);
            $groupMap[$applicantProfileId] = $groupNumber;
            $item['batchGroupNumber'] = $groupNumber;
            $item['capacitySequence'] = ($index % $groupSize) + 1;
            $groupRosters['group' . $groupNumber][] = $item;
        }

        return [
            'errors' => [],
            'groups' => $groupMap,
            'groupRosters' => $groupRosters,
        ];
    }

    private function currentTrainingCapacity(): int
    {
        return TRAINING_BATCH_GROUP_COUNT * $this->currentTrainingGroupSize();
    }

    private function currentTrainingGroupSize(): int
    {
        return TRAINING_BATCH_GROUP_SIZE;
    }

    private function compareApplicantRosterRows(array $left, array $right): int
    {
        $approvalCompare = $this->compareApplicantApprovalOrder($left, $right);
        if ($approvalCompare !== 0) {
            return $approvalCompare;
        }

        $leftParts = $this->extractSortableNameParts($left);
        $rightParts = $this->extractSortableNameParts($right);

        foreach (['last', 'first', 'middle'] as $part) {
            $compare = strcasecmp($leftParts[$part], $rightParts[$part]);
            if ($compare !== 0) {
                return $compare;
            }
        }

        return strcasecmp((string) ($left['fullName'] ?? ''), (string) ($right['fullName'] ?? ''));
    }

    private function compareApplicantApprovalOrder(array $left, array $right): int
    {
        $leftDate = $this->approvalOrderDate($left);
        $rightDate = $this->approvalOrderDate($right);
        if ($leftDate !== $rightDate) {
            if ($leftDate === '') {
                return 1;
            }
            if ($rightDate === '') {
                return -1;
            }
            return strcmp($leftDate, $rightDate);
        }

        return ((int) ($left['applicationId'] ?? 0)) <=> ((int) ($right['applicationId'] ?? 0));
    }

    private function approvalOrderDate(array $entry): string
    {
        foreach (['applicationReviewedAt', 'applicationSubmittedAt', 'applicationCreatedAt'] as $key) {
            $value = trim((string) ($entry[$key] ?? ''));
            if ($value !== '') {
                return $value;
            }
        }

        return '';
    }

    private function splitSortableName(string $fullName): array
    {
        $normalized = preg_replace('/\s+/', ' ', trim($fullName)) ?? '';
        if ($normalized === '') {
            return ['last' => '', 'first' => '', 'middle' => ''];
        }

        if (str_contains($normalized, ',')) {
            [$last, $rest] = array_map('trim', explode(',', $normalized, 2) + ['', '']);
            $parts = preg_split('/\s+/', trim($rest)) ?: [];
            return [
                'last' => $last,
                'first' => strtolower((string) ($parts[0] ?? '')),
                'middle' => strtolower(implode(' ', array_slice($parts, 1))),
            ];
        }

        $parts = preg_split('/\s+/', $normalized) ?: [];
        $last = strtolower((string) array_pop($parts));
        $first = strtolower((string) ($parts[0] ?? ''));
        $middle = strtolower(implode(' ', array_slice($parts, 1)));

        return ['last' => $last, 'first' => $first, 'middle' => $middle];
    }

    private function extractSortableNameParts(array $row): array
    {
        $first = strtolower(trim((string) ($row['firstName'] ?? '')));
        $middle = strtolower(trim((string) ($row['middleName'] ?? '')));
        $last = strtolower(trim((string) ($row['lastName'] ?? '')));

        if ($first !== '' || $middle !== '' || $last !== '') {
            return [
                'last' => $last,
                'first' => $first,
                'middle' => $middle,
            ];
        }

        return $this->splitSortableName((string) ($row['fullName'] ?? ''));
    }

    private function hasStructuredUserNameColumns(): bool
    {
        if ($this->structuredUserNameColumns !== null) {
            return $this->structuredUserNameColumns;
        }

        $statement = db()->prepare(
            'SELECT COUNT(*) FROM information_schema.columns
             WHERE table_schema = DATABASE()
               AND table_name = :table_name
               AND column_name IN ("first_name", "middle_name", "last_name")'
        );
        $statement->execute(['table_name' => 'users']);
        $this->structuredUserNameColumns = (int) $statement->fetchColumn() === 3;

        return $this->structuredUserNameColumns;
    }

    private function findScopedInvitee(int $trainingInviteeId, array $actor): ?array
    {
        $sql = '
            SELECT
                training_invitees.id,
                training_programs.starts_at,
                users.full_name AS applicant_name
            FROM training_invitees
            INNER JOIN training_programs ON training_programs.id = training_invitees.training_program_id
            INNER JOIN applicant_profiles ON applicant_profiles.id = training_invitees.applicant_profile_id
            INNER JOIN users ON users.id = applicant_profiles.user_id
            WHERE training_invitees.id = :id
              AND (
                :is_admin = 1
                OR training_programs.created_by_user_id = :actor_user_id
                OR EXISTS (
                    SELECT 1
                    FROM training_invitees AS scope_invitees
                    INNER JOIN applicant_profiles AS scope_applicants ON scope_applicants.id = scope_invitees.applicant_profile_id
                    INNER JOIN staff_barangay_assignments AS scope_assignments
                        ON scope_assignments.barangay_id = scope_applicants.barangay_id
                       AND scope_assignments.staff_profile_id = :scope_staff_profile_id
                       AND scope_assignments.ended_at IS NULL
                    WHERE scope_invitees.id = training_invitees.id
                )
              )
            LIMIT 1
        ';

        $statement = db()->prepare($sql);
        $statement->execute([
            'id' => $trainingInviteeId,
            'is_admin' => $this->isAdmin($actor) ? 1 : 0,
            'actor_user_id' => (int) ($actor['id'] ?? 0),
            'scope_staff_profile_id' => $this->isProjectOfficer($actor)
                ? ($this->findStaffProfileIdForUser((int) ($actor['id'] ?? 0)) ?? 0)
                : 0,
        ]);

        $row = $statement->fetch(PDO::FETCH_ASSOC);
        return is_array($row) ? $row : null;
    }

    private function trainingAttendanceDateGate(array $invitee, string $status): array
    {
        if (!in_array($status, [
            TRAINING_STATUS_ATTENDED,
            TRAINING_STATUS_EXCUSED,
            TRAINING_STATUS_MISSED,
        ], true)) {
            return ['ok' => true];
        }

        $startsAt = trim((string) ($invitee['starts_at'] ?? ''));
        if ($startsAt === '') {
            return ['ok' => true];
        }

        $sessionDate = substr($startsAt, 0, 10);
        if ($sessionDate === '' || date('Y-m-d') >= $sessionDate) {
            return ['ok' => true];
        }

        return [
            'ok' => false,
            'message' => 'Attendance can only be marked on or after the seminar date (' . date('M j, Y', strtotime($sessionDate)) . ').',
        ];
    }

    private function normalizeStatus(string $status): string
    {
        foreach (TRAINING_ALLOWED_STATUSES as $allowed) {
            if (strtolower($allowed) === strtolower($status)) {
                return $allowed;
            }
        }

        return $status;
    }

    private function findStaffProfileIdForUser(int $userId): ?int
    {
        $statement = db()->prepare('SELECT id FROM staff_profiles WHERE user_id = :user_id LIMIT 1');
        $statement->execute(['user_id' => $userId]);
        $value = $statement->fetchColumn();
        return $value !== false ? (int) $value : null;
    }

    private function isAdmin(array $actor): bool
    {
        return str_contains(strtolower((string) ($actor['role'] ?? '')), 'admin');
    }

    private function isProjectOfficer(array $actor): bool
    {
        return str_contains(strtolower((string) ($actor['role'] ?? '')), 'project');
    }

    private function eligibilityService(): TrainingEligibilityService
    {
        if (!$this->eligibilityService instanceof TrainingEligibilityService) {
            $this->eligibilityService = new TrainingEligibilityService();
        }

        return $this->eligibilityService;
    }
}
