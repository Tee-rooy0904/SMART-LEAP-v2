<?php
/**
 * SMART LEAP FILE GUIDE
 * Applicant dashboard state service.
 * Builds the private applicant workspace payload: profile progress, application review state, requirement summaries, training progress, post-approval summary, and next-step guidance.
 */

declare(strict_types=1);

namespace App\Services;

use PDO;

class ApplicantDashboardService
{
    public function stateForUser(int $userId): array
    {
        $entryState = (new ApplicationService())->getApplicantEntryState($userId);
        $user = $entryState['user'];
        $profile = $entryState['profile'];
        $application = $entryState['application'];
        $requirements = array_values($entryState['requirements']);

        $applicationDetail = $application ? $this->fetchApplicationDetail((int) $application['id']) : null;
        $training = $profile ? $this->fetchTrainingState((int) $profile['id'], (int) $user['id']) : $this->emptyTrainingState();
        $notifications = (new NotificationService())->listForUser($userId);
        $postApprovalState = (new PostApprovalComplianceService())->stateForApplicant($userId);
        $postApproval = $this->mapPostApprovalState($postApprovalState, $training);
        $certificate = (new CertificateService())->stateForDashboard($user, $profile, $training, $postApproval);

        return [
            'authUser' => $user,
            'profile' => $this->mapProfileState($user, $profile, $application),
            'application' => $this->mapApplicationState($application, $applicationDetail, $requirements),
            'requirements' => $requirements,
            'notifications' => $notifications,
            'training' => $training,
            'postApproval' => $postApproval,
            'certificate' => $certificate,
            'nextStep' => $this->resolveNextStep($profile, $application, $applicationDetail, $training, $postApproval),
        ];
    }

    private function mapProfileState(array $user, ?array $profile, ?array $application): ?array
    {
        if ($profile === null) {
            return null;
        }

        $completion = $this->calculateProfileCompletion($profile);

        return [
            'id' => (int) $profile['id'],
            'name' => $user['name'] ?? '',
            'email' => $user['email'] ?? '',
            'contactNumber' => $profile['contactNumber'],
            'barangay' => $profile['barangay'],
            'address' => $profile['address'],
            'businessName' => $profile['businessName'],
            'livelihood' => $profile['livelihood'],
            'sector' => $profile['sector'],
            'educationalAttainment' => $profile['educationalAttainment'],
            'birthdate' => $profile['birthdate'],
            'gender' => $profile['gender'],
            'is4ps' => $profile['is4ps'],
            'batchNo' => $this->formatBatchNo($profile['batchNo'] ?? ''),
            'status' => $profile['status'],
            'completionPercent' => $completion['percent'],
            'completionLabel' => $completion['label'],
            'completionSummary' => sprintf('%d/%d required fields complete', $completion['completed'], $completion['total']),
            'applicationReady' => $application !== null && in_array(
                (string) ($application['status'] ?? ''),
                APPLICATION_ALLOWED_STATUSES,
                true
            ),
        ];
    }

    private function calculateProfileCompletion(array $profile): array
    {
        $requiredFields = [
            'birthdate' => fn (mixed $value): bool => $this->isValidDateValue($value),
            'gender' => fn (mixed $value): bool => $this->hasTextValue($value),
            'contactNumber' => fn (mixed $value): bool => $this->isValidContactNumber($value),
            'address' => fn (mixed $value): bool => $this->hasTextValue($value),
            'barangay' => fn (mixed $value): bool => $this->hasTextValue($value),
            'is4ps' => fn (mixed $value): bool => $this->hasTextValue($value),
            'educationalAttainment' => fn (mixed $value): bool => $this->hasTextValue($value),
            'sector' => fn (mixed $value): bool => $this->hasTextValue($value),
            'livelihood' => fn (mixed $value): bool => $this->hasTextValue($value),
            'businessName' => fn (mixed $value): bool => $this->hasTextValue($value),
        ];

        if (strcasecmp(trim((string) ($profile['sector'] ?? '')), 'Other') === 0) {
            $requiredFields['sectorOtherSpecify'] = fn (mixed $value): bool => $this->hasTextValue($value);
        }

        $total = count($requiredFields);
        $completed = 0;

        foreach ($requiredFields as $field => $isComplete) {
            if ($isComplete($profile[$field] ?? null)) {
                $completed++;
            }
        }

        $percent = $total > 0 ? (int) round(($completed / $total) * 100) : 0;

        return [
            'completed' => $completed,
            'total' => $total,
            'percent' => $percent,
            'label' => $completed >= $total ? 'Complete' : 'In progress',
        ];
    }

    private function hasTextValue(mixed $value): bool
    {
        return trim((string) $value) !== '';
    }

    private function isValidDateValue(mixed $value): bool
    {
        $date = trim((string) $value);
        return $date !== '' && strtotime($date) !== false;
    }

    private function isValidContactNumber(mixed $value): bool
    {
        $digits = preg_replace('/\D+/', '', (string) $value);
        $length = strlen($digits);

        return $length >= 10 && $length <= 13;
    }

    private function formatBatchNo(?string $batchNo): string
    {
        $value = trim((string) $batchNo);
        if ($value === '') {
            return 'Batch 1';
        }

        return preg_match('/^\d+$/', $value) === 1 ? 'Batch ' . $value : $value;
    }

    private function mapApplicationState(?array $application, ?array $detail, array $requirements): ?array
    {
        if ($application === null) {
            return null;
        }

        $status = $this->normalizeApplicationStatus((string) $application['status']);
        $reviewState = $this->summarizeRequirementReview($requirements);

        return [
            'id' => (int) $application['id'],
            'status' => $status,
            'submittedAt' => $application['submittedAt'],
            'reviewedAt' => $application['reviewedAt'],
            'updatedAt' => $application['updatedAt'],
            'assignedPdo' => $detail['assignedPdo'] ?? null,
            'remarks' => $detail['remarks'] ?? [],
            'history' => $detail['history'] ?? [],
            'notes' => $detail['notes'] ?? null,
            'reviewSummary' => $reviewState,
        ];
    }

    private function summarizeRequirementReview(array $requirements): array
    {
        $summary = [
            'total' => count($requirements),
            'uploaded' => 0,
            'verified' => 0,
            'pending' => 0,
            'issues' => 0,
        ];

        foreach ($requirements as $requirement) {
            $status = strtolower((string) ($requirement['status'] ?? 'missing'));
            if (($requirement['file']['path'] ?? null) !== null) {
                $summary['uploaded']++;
            }
            if ($status === 'verified') {
                $summary['verified']++;
            } elseif (in_array($status, ['rejected', 'flagged', 'needs correction', 'needs_correction'], true)) {
                $summary['issues']++;
            } elseif ($status !== 'missing') {
                $summary['pending']++;
            }
        }

        return $summary;
    }

    private function fetchApplicationDetail(int $applicationId): array
    {
        return [
            'assignedPdo' => $this->fetchAssignedPdo($applicationId),
            'remarks' => $this->fetchVisibleComments($applicationId),
            'history' => $this->fetchStatusHistory($applicationId),
            'notes' => $this->fetchApplicationNotes($applicationId),
        ];
    }

    private function fetchAssignedPdo(int $applicationId): ?array
    {
        $statement = db()->prepare(
            'SELECT users.full_name, users.email
             FROM applications
             INNER JOIN staff_profiles ON staff_profiles.id = applications.assigned_staff_profile_id
             INNER JOIN users ON users.id = staff_profiles.user_id
             WHERE applications.id = :application_id
             LIMIT 1'
        );
        $statement->execute(['application_id' => $applicationId]);
        $row = $statement->fetch(PDO::FETCH_ASSOC);

        if (!is_array($row)) {
            return null;
        }

        return [
            'name' => $row['full_name'],
            'email' => $row['email'],
        ];
    }

    private function fetchVisibleComments(int $applicationId): array
    {
        $statement = db()->prepare(
            'SELECT application_comments.id, application_comments.comment_text, application_comments.visibility, application_comments.created_at,
                    users.full_name AS actor_name
             FROM application_comments
             INNER JOIN users ON users.id = application_comments.user_id
             WHERE application_comments.application_id = :application_id
               AND LOWER(application_comments.visibility) <> "internal"
             ORDER BY application_comments.created_at DESC, application_comments.id DESC'
        );
        $statement->execute(['application_id' => $applicationId]);
        $rows = $statement->fetchAll(PDO::FETCH_ASSOC) ?: [];

        return array_map(static function (array $row): array {
            return [
                'id' => (int) $row['id'],
                'comment' => $row['comment_text'],
                'visibility' => $row['visibility'],
                'actorName' => $row['actor_name'],
                'createdAt' => $row['created_at'],
            ];
        }, $rows);
    }

    private function fetchStatusHistory(int $applicationId): array
    {
        $statement = db()->prepare(
            'SELECT application_status_history.id, application_status_history.from_status, application_status_history.to_status,
                    application_status_history.remarks, application_status_history.created_at, users.full_name AS actor_name
             FROM application_status_history
             INNER JOIN users ON users.id = application_status_history.changed_by_user_id
             WHERE application_status_history.application_id = :application_id
             ORDER BY application_status_history.created_at DESC, application_status_history.id DESC'
        );
        $statement->execute(['application_id' => $applicationId]);
        $rows = $statement->fetchAll(PDO::FETCH_ASSOC) ?: [];

        return array_map(function (array $row): array {
            return [
                'id' => (int) $row['id'],
                'fromStatus' => $row['from_status'] ? $this->normalizeApplicationStatus((string) $row['from_status']) : null,
                'toStatus' => $this->normalizeApplicationStatus((string) $row['to_status']),
                'remarks' => $row['remarks'],
                'actorName' => $row['actor_name'],
                'createdAt' => $row['created_at'],
            ];
        }, $rows);
    }

    private function fetchApplicationNotes(int $applicationId): ?string
    {
        $statement = db()->prepare('SELECT notes FROM applications WHERE id = :application_id LIMIT 1');
        $statement->execute(['application_id' => $applicationId]);
        $value = $statement->fetchColumn();
        return is_string($value) && trim($value) !== '' ? $value : null;
    }

    private function fetchTrainingState(int $applicantProfileId, int $userId): array
    {
        $isEligible = (new TrainingEligibilityService())->isApplicantEligible($applicantProfileId);
        if (!$isEligible) {
            return $this->emptyTrainingState();
        }

        $statement = db()->prepare(
            'SELECT
                training_invitees.id,
                training_invitees.invite_status,
                training_invitees.remarks,
                training_invitees.notified_at,
                training_invitees.last_notice_sent_at,
                training_invitees.post_approval_unlocked_at,
                training_programs.id AS training_program_id,
                training_programs.title,
                training_programs.description,
                training_programs.venue,
                training_programs.speaker,
                training_programs.starts_at,
                training_programs.ends_at,
                training_programs.what_to_bring,
                training_programs.instructions,
                training_programs.seminar_form_codes,
                training_programs.updated_at AS program_updated_at,
                training_programs.status AS program_status,
                attendance_records.attendance_status,
                attendance_records.remarks AS attendance_remarks,
                attendance_records.checked_in_at
             FROM training_invitees
             INNER JOIN training_programs ON training_programs.id = training_invitees.training_program_id
             LEFT JOIN attendance_records ON attendance_records.training_invitee_id = training_invitees.id
             WHERE training_invitees.applicant_profile_id = :applicant_profile_id
             ORDER BY training_programs.starts_at ASC, training_invitees.id ASC'
        );
        $statement->execute(['applicant_profile_id' => $applicantProfileId]);
        $rows = $statement->fetchAll(PDO::FETCH_ASSOC) ?: [];

        if ($rows === []) {
            return $this->emptyTrainingState(true);
        }

        $invitees = array_map(function (array $row): array {
            $status = $this->normalizeTrainingStatus((string) ($row['attendance_status'] ?: $row['invite_status']));

            return [
                'id' => (int) $row['id'],
                'status' => $status,
                'inviteStatus' => $this->normalizeTrainingStatus((string) $row['invite_status']),
                'remarks' => $row['attendance_remarks'] ?: $row['remarks'],
                'notifiedAt' => $row['notified_at'],
                'lastNoticeSentAt' => $row['last_notice_sent_at'],
                'postApprovalUnlockedAt' => $row['post_approval_unlocked_at'],
                'checkedInAt' => $row['checked_in_at'],
                'program' => [
                    'id' => (int) $row['training_program_id'],
                    'programName' => $row['title'],
                    'description' => $row['description'],
                    'venue' => $row['venue'],
                    'speaker' => $row['speaker'],
                    'startsAt' => $row['starts_at'],
                    'endsAt' => $row['ends_at'],
                    'whatToBring' => $row['what_to_bring'],
                    'instructions' => $row['instructions'],
                    'seminarFormCodes' => $this->decodeSeminarFormCodes($row['seminar_form_codes'] ?? null),
                    'seminarFormsOpenedAt' => $row['program_updated_at'] ?? null,
                    'status' => $this->normalizeTrainingStatus((string) $row['program_status']),
                ],
            ];
        }, $rows);

        $summary = [
            'totalPrograms' => count($invitees),
            'scheduled' => 0,
            'notified' => 0,
            'attended' => 0,
            'excused' => 0,
            'missed' => 0,
            'completed' => 0,
        ];

        foreach ($invitees as $invitee) {
            $status = $invitee['status'];
            if ($status === TRAINING_STATUS_SCHEDULED) {
                $summary['scheduled']++;
            }
            if ($status === TRAINING_STATUS_NOTIFIED) {
                $summary['notified']++;
            }
            if ($status === TRAINING_STATUS_ATTENDED) {
                $summary['attended']++;
            }
            if ($status === TRAINING_STATUS_EXCUSED) {
                $summary['excused']++;
            }
            if ($status === TRAINING_STATUS_MISSED) {
                $summary['missed']++;
            }
            if ($status === TRAINING_STATUS_COMPLETED) {
                $summary['completed']++;
            }
        }

        $nextSession = null;
        $now = time();
        foreach ($invitees as $invitee) {
            $startsAt = strtotime((string) ($invitee['program']['startsAt'] ?? ''));
            if ($startsAt !== false && $startsAt >= $now) {
                $nextSession = $invitee;
                break;
            }
        }

        if ($nextSession === null) {
            $nextSession = $invitees[0] ?? null;
        }

        $latestUnlock = null;
        $openedFormCodes = [];
        foreach ($invitees as $invitee) {
            foreach (($invitee['program']['seminarFormCodes'] ?? []) as $code) {
                $openedFormCodes[$code] = true;
            }
            if (($invitee['program']['seminarFormsOpenedAt'] ?? null) !== null) {
                $latestUnlock = $invitee['program']['seminarFormsOpenedAt'];
            }
        }

        return [
            'eligible' => true,
            'summary' => $summary,
            'currentStatus' => $nextSession['status'] ?? TRAINING_STATUS_NOT_SCHEDULED,
            'nextSession' => $nextSession,
            'invitees' => $invitees,
            'openedFormCodes' => array_keys($openedFormCodes),
            'latestUnlockedAt' => $latestUnlock,
        ];
    }

    private function fetchPostApprovalSummary(int $applicantProfileId): array
    {
        $statement = db()->prepare(
            'SELECT
                beneficiary_profiles.id AS beneficiary_profile_id,
                COUNT(post_approval_tasks.id) AS total_tasks,
                SUM(CASE WHEN LOWER(post_approval_tasks.status) = "completed" THEN 1 ELSE 0 END) AS completed_tasks,
                SUM(CASE WHEN LOWER(post_approval_tasks.status) = "pending" THEN 1 ELSE 0 END) AS pending_tasks
             FROM beneficiary_profiles
             LEFT JOIN post_approval_tasks ON post_approval_tasks.beneficiary_profile_id = beneficiary_profiles.id
             WHERE beneficiary_profiles.applicant_profile_id = :applicant_profile_id
             GROUP BY beneficiary_profiles.id
             LIMIT 1'
        );
        $statement->execute(['applicant_profile_id' => $applicantProfileId]);
        $row = $statement->fetch(PDO::FETCH_ASSOC);

        if (!is_array($row)) {
            return $this->emptyPostApprovalSummary();
        }

        return [
            'beneficiaryProfileId' => (int) $row['beneficiary_profile_id'],
            'totalTasks' => (int) $row['total_tasks'],
            'completedTasks' => (int) $row['completed_tasks'],
            'pendingTasks' => (int) $row['pending_tasks'],
            'isUnlocked' => ((int) $row['total_tasks']) > 0,
        ];
    }

    private function mapPostApprovalState(array $state, array $training): array
    {
        $summary = $state['summary'] ?? [];
        $tasks = $state['tasks'] ?? [];
        $unlockedAt = $state['unlockedAt'] ?? ($training['latestUnlockedAt'] ?? null);

        return [
            'beneficiaryProfileId' => $state['beneficiaryProfileId'] ?? null,
            'totalTasks' => (int) ($summary['total'] ?? count($tasks)),
            'completedTasks' => (int) ($summary['verified'] ?? 0),
            'pendingTasks' => (int) (($summary['unlocked'] ?? 0) + ($summary['inProgress'] ?? 0) + ($summary['submitted'] ?? 0) + ($summary['needsCorrection'] ?? 0)),
            'isUnlocked' => (bool) ($state['isUnlocked'] ?? false),
            'unlockedAt' => $unlockedAt,
            'summary' => $summary,
            'tasks' => $tasks,
        ];
    }

    private function resolveNextStep(
        ?array $profile,
        ?array $application,
        ?array $applicationDetail,
        array $training,
        array $postApproval
    ): array {
        if ($profile === null || $application === null) {
            return [
                'title' => 'Complete your applicant profile',
                'description' => 'Finish your SMART LEAP profile and submit the required documents for review.',
                'actionLabel' => 'Edit Profile',
                'actionPath' => 'applicant-dashboard#profile-page',
            ];
        }

        $status = $this->normalizeApplicationStatus((string) $application['status']);

        if ($status === APPLICATION_STATUS_DRAFT) {
            return [
                'title' => 'Submit your application',
                'description' => 'Your profile is still saved as a draft. Submit it to start CSWDD review.',
                'actionLabel' => 'Edit Profile',
                'actionPath' => 'applicant-dashboard#profile-page',
            ];
        }

        if (($training['eligible'] ?? false) && (($training['summary']['totalPrograms'] ?? 0) === 0)) {
            return [
                'title' => 'Wait for your yearly training schedule',
                'description' => 'Your required uploads were fully verified by your assigned PDO. CSWDD can now include you in the current SMART LEAP batch and schedule your 3 yearly training sessions.',
                'actionLabel' => 'View training status',
                'actionPath' => 'applicant-dashboard#training-progress',
            ];
        }

        if (($training['eligible'] ?? false) && in_array($training['currentStatus'] ?? TRAINING_STATUS_NOT_SCHEDULED, [TRAINING_STATUS_SCHEDULED, TRAINING_STATUS_NOTIFIED, TRAINING_STATUS_NOT_SCHEDULED], true)) {
            return [
                'title' => 'Prepare for your seminar schedule',
                'description' => 'You already have a SMART LEAP training record. Review the seminar schedule, reminders, and notice updates on your dashboard.',
                'actionLabel' => 'View training progress',
                'actionPath' => 'applicant-dashboard#training-progress',
            ];
        }

        if (in_array($status, [APPLICATION_STATUS_SUBMITTED, APPLICATION_STATUS_UNDER_REVIEW, APPLICATION_STATUS_CHECKED_BY_PDO, APPLICATION_STATUS_REQUIREMENTS_VERIFIED, APPLICATION_STATUS_FOR_ASSESSMENT], true)) {
            return [
                'title' => 'Wait for review and assessment updates',
                'description' => 'Your application is already in the review workflow. Watch this dashboard for requirement remarks, assessment movement, and status changes.',
                'actionLabel' => 'View application status',
                'actionPath' => 'applicant-dashboard#application-status',
            ];
        }

        if (in_array($status, [APPLICATION_STATUS_FLAGGED, APPLICATION_STATUS_NEEDS_DOCUMENTS, APPLICATION_STATUS_NEEDS_CORRECTION], true)) {
            return [
                'title' => $status === APPLICATION_STATUS_NEEDS_DOCUMENTS ? 'Upload the missing application document' : 'Review remarks and update your submission',
                'description' => $status === APPLICATION_STATUS_NEEDS_DOCUMENTS
                    ? 'Your assigned PDO is waiting for one or more required uploaded documents before your application can proceed.'
                    : 'CSWDD needs corrections or additional clarification before your application can proceed.',
                'actionLabel' => 'Open Application',
                'actionPath' => 'applicant-dashboard#application-page',
            ];
        }

        if ($status === APPLICATION_STATUS_REJECTED) {
            return [
                'title' => 'Contact CSWDD for guidance',
                'description' => 'Your application was rejected. Review the remarks below and coordinate with your assigned office for next steps.',
                'actionLabel' => null,
                'actionPath' => null,
            ];
        }

        if (($training['eligible'] ?? false) && in_array($training['currentStatus'] ?? TRAINING_STATUS_NOT_SCHEDULED, [TRAINING_STATUS_EXCUSED, TRAINING_STATUS_MISSED], true)) {
            return [
                'title' => 'Review your training attendance record',
                'description' => 'Your latest training attendance record was marked as missed or excused. Coordinate with CSWDD if you need follow-up guidance on the next seminar.',
                'actionLabel' => 'View training progress',
                'actionPath' => 'applicant-dashboard#training-progress',
            ];
        }

        return [
            'title' => 'Monitor your SMART LEAP dashboard',
            'description' => 'Your real application, training, and notice updates will appear here as they are processed.',
            'actionLabel' => 'Refresh dashboard',
            'actionPath' => 'applicant-dashboard',
        ];
    }

    private function emptyTrainingState(bool $eligible = false): array
    {
        return [
            'eligible' => $eligible,
            'summary' => [
                'totalPrograms' => 0,
                'scheduled' => 0,
                'notified' => 0,
                'attended' => 0,
                'excused' => 0,
                'missed' => 0,
                'completed' => 0,
            ],
            'currentStatus' => TRAINING_STATUS_NOT_SCHEDULED,
            'nextSession' => null,
            'invitees' => [],
            'openedFormCodes' => [],
            'latestUnlockedAt' => null,
        ];
    }

    private function decodeSeminarFormCodes(mixed $raw): array
    {
        if (!is_string($raw) || trim($raw) === '') {
            return [];
        }

        $decoded = json_decode($raw, true);
        if (!is_array($decoded)) {
            return [];
        }

        $codes = [];
        foreach ($decoded as $value) {
            $code = trim((string) $value);
            if ($code === '' || !in_array($code, TRAINING_SEMINAR_FORM_CODES, true)) {
                continue;
            }
            $codes[] = $code;
        }

        return array_values(array_unique($codes));
    }

    private function emptyPostApprovalSummary(): array
    {
        return [
            'beneficiaryProfileId' => null,
            'totalTasks' => 0,
            'completedTasks' => 0,
            'pendingTasks' => 0,
            'isUnlocked' => false,
        ];
    }

    private function normalizeApplicationStatus(string $status): string
    {
        return match (strtolower(trim($status))) {
            'draft' => APPLICATION_STATUS_DRAFT,
            'submitted' => APPLICATION_STATUS_SUBMITTED,
            'under review', 'under_review', 'underreview' => APPLICATION_STATUS_UNDER_REVIEW,
            'checked by pdo', 'checked_by_pdo', 'checkedbypdo' => APPLICATION_STATUS_CHECKED_BY_PDO,
            'approved' => APPLICATION_STATUS_APPROVED,
            'requirements verified', 'requirements_verified', 'requirementsverified' => APPLICATION_STATUS_REQUIREMENTS_VERIFIED,
            'for assessment', 'for_assessment', 'forassessment' => APPLICATION_STATUS_FOR_ASSESSMENT,
            'approved for training', 'approved_for_training', 'approvedfortraining' => APPLICATION_STATUS_APPROVED_FOR_TRAINING,
            'rejected' => APPLICATION_STATUS_REJECTED,
            'flagged' => APPLICATION_STATUS_FLAGGED,
            'needs documents', 'needs_documents', 'needsdocuments' => APPLICATION_STATUS_NEEDS_DOCUMENTS,
            'needs correction', 'needs_correction', 'needscorrection' => APPLICATION_STATUS_NEEDS_CORRECTION,
            'training ongoing', 'training_ongoing', 'trainingongoing' => APPLICATION_STATUS_TRAINING_ONGOING,
            'completed' => APPLICATION_STATUS_COMPLETED,
            default => $status,
        };
    }

    private function normalizeTrainingStatus(string $status): string
    {
        foreach (TRAINING_ALLOWED_STATUSES as $allowed) {
            if (strtolower($allowed) === strtolower(trim($status))) {
                return $allowed;
            }
        }

        return $status === '' ? TRAINING_STATUS_NOT_SCHEDULED : $status;
    }
}
