<?php
/**
 * SMART LEAP FILE GUIDE
 * Core application workflow service.
 * Owns applicant/application retrieval, reviewer detail payloads, requirement review logic, assessment persistence, dashboard summaries, and workflow readiness calculations.
 */

declare(strict_types=1);

namespace App\Services;

use PDO;

class ApplicationService
{
    private const DEFAULT_REQUIRED_TRAINING_SEMINARS = 3;

    private const REQUIREMENT_LABELS = [
        'validId' => 'Valid ID',
        'healthCertificate' => 'Health Certificate',
        'cedula' => 'Cedula',
        'barangayEndorsementLetter' => 'Barangay Clearance',
    ];

    private const APPLICATION_FORM_DEFINITIONS = [
        POST_APPROVAL_TASK_AVAILMENT_FORM => 'Availment Form',
        POST_APPROVAL_TASK_VALIDATION_FORM => 'Validation Form',
        POST_APPROVAL_TASK_MUNGKAHING_PROYEKTO => 'Mungkahing Proyekto',
        POST_APPROVAL_TASK_BUSINESS_PLAN => 'Business Plan',
        POST_APPROVAL_TASK_BUHAT_SA_PAGPANUMPA => 'Buhat sa Pagpanumpa',
    ];

    private ?array $initialRequirementFileColumns = null;
    private ?array $applicantProfileColumns = null;

    public function getApplicantEntryState(int $userId): array
    {
        $user = $this->fetchUser($userId);
        $profile = $this->fetchApplicantProfile($userId);
        $application = $profile ? $this->fetchLatestApplication((int) $profile['id']) : null;
        if ($application !== null && (($application['assignedPdo']['name'] ?? null) === null) && isset($profile['assignedPdo'])) {
            $application['assignedPdo'] = $profile['assignedPdo'];
        }
        $requirements = $application ? $this->fetchRequirementFiles((int) $application['id']) : [];
        if ($application !== null) {
            $application['status'] = $this->deriveApplicantVisibleStatus((string) ($application['status'] ?? ''), $requirements);
            $application['isCheckedByStaff'] = $this->hasApplicantReviewStarted($application, $requirements);
            $application['canEditSubmission'] = $this->canApplicantEditApplication($application, $requirements);
        }

        return [
            'user' => [
                'id' => (int) $user['id'],
                'name' => $user['full_name'],
                'email' => $user['email'],
                'role' => $user['role'],
                'photo' => $user['photo'] ?? null,
            ],
            'profile' => $profile,
            'application' => $application,
            'requirements' => $requirements,
            'requirementDefinitions' => self::REQUIREMENT_LABELS,
        ];
    }

    public function saveApplicantProfile(int $userId, array $input, array $documentBag, bool $submit): array
    {
        $origin = strtolower(trim((string) ($input['origin'] ?? 'application')));
        $requireCompleteProfile = $submit || $origin === 'profile';
        $errors = $this->validateProfileInput($input, $requireCompleteProfile);
        $uploadService = new UploadService();
        $documents = $uploadService->normalizeDocumentFiles($documentBag);
        $existingProfile = $this->fetchApplicantProfile($userId);
        $existingApplication = $existingProfile ? $this->fetchLatestApplication((int) $existingProfile['id']) : null;
        $existingRequirements = $existingApplication ? $this->fetchRequirementFiles((int) $existingApplication['id']) : [];
        if ($existingApplication !== null) {
            $existingApplication['status'] = $this->deriveApplicantVisibleStatus((string) ($existingApplication['status'] ?? ''), $existingRequirements);
        }

        if ($existingApplication !== null && !$this->canApplicantEditApplication($existingApplication, $existingRequirements)) {
            return ['ok' => false, 'errors' => ['general' => 'Your application is already under review. Wait for PDO or admin feedback before editing again.']];
        }

        $errors = array_merge($errors, $this->validateRequirementReplacementRules($documents, $existingRequirements));

        if ($submit) {
            $errors = array_merge($errors, $this->validateRequirementSubmission($documents, $existingRequirements));
        }

        if ($errors !== []) {
            return ['ok' => false, 'errors' => $errors];
        }

        $pdo = db();
        $pdo->beginTransaction();

        try {
            $barangayId = $this->resolveBarangayId((string) $input['barangay']);
            $assignedStaffProfileId = $this->resolveAssignedProjectOfficerProfileId($barangayId);
            $profileId = $this->upsertApplicantProfile($userId, $barangayId, $input, $submit);
            $applicationId = $this->upsertApplication($profileId, $barangayId, $submit, $existingApplication, $existingRequirements);

            $this->ensureRequirementTypes();
            foreach ($documents as $key => $file) {
                $meta = $uploadService->storeRequirementDocument($key, $file);
                $this->replaceRequirementFile($applicationId, $key, $meta);
            }

            $pdo->commit();
        } catch (\Throwable $exception) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }

            log_database_query_failure('application.save_applicant_profile', $exception, ['user_id' => $userId]);

            return [
                'ok' => false,
                'errors' => ['general' => $exception->getMessage()],
            ];
        }

        if ($submit) {
            $this->notifyApplicationSubmission(
                $userId,
                trim((string) ($input['businessName'] ?? '')),
                trim((string) ($input['barangay'] ?? '')),
                $assignedStaffProfileId ?? null
            );
        }

        return [
            'ok' => true,
            'message' => $submit ? 'Profile submitted for verification.' : 'Draft saved.',
            'data' => $this->getApplicantEntryState($userId),
        ];
    }

    public function applicationFormsGateForUser(int $userId): array
    {
        $entryState = $this->getApplicantEntryState($userId);
        $profile = $entryState['profile'] ?? null;
        $application = $entryState['application'] ?? null;
        $requirements = is_array($entryState['requirements'] ?? null) ? $entryState['requirements'] : [];

        return $this->buildApplicationFormsGate(
            $application !== null ? (int) ($application['id'] ?? 0) : 0,
            $profile !== null ? (int) ($profile['id'] ?? 0) : 0,
            $requirements
        );
    }

    public function ensureApplicationFormsForUser(int $userId, int $actorUserId = 0): ?int
    {
        $gate = $this->applicationFormsGateForUser($userId);
        if (!($gate['unlocked'] ?? false)) {
            return null;
        }

        $applicantProfileId = (int) ($gate['applicantProfileId'] ?? 0);
        if ($applicantProfileId <= 0) {
            return null;
        }

        return $this->ensureApplicationFormTasks($applicantProfileId, $actorUserId > 0 ? $actorUserId : $userId);
    }

    public function getBeneficiaryProfileState(int $userId): array
    {
        (new BeneficiaryProfileService())->synchronizeSystemInactivityStatuses();
        $user = $this->fetchUser($userId);
        $coMakerRegistration = (new CoMakerRegistrationService())->registrationForUser($userId);
        if ($coMakerRegistration !== null && in_array(strtolower((string) ($coMakerRegistration['registrationStatus'] ?? 'inactive')), ['approved', 'active'], true)) {
            $beneficiary = $this->fetchBeneficiaryProfileState($userId);

            return [
                'user' => [
                    'id' => (int) $user['id'],
                    'name' => $user['full_name'],
                    'email' => $user['email'],
                    'role' => $user['role'],
                    'photo' => $user['photo'] ?? null,
                ],
                'profile' => [
                    'fullName' => $coMakerRegistration['name'] ?: $user['full_name'],
                    'email' => $coMakerRegistration['email'] ?: $user['email'],
                    'contactNumber' => $coMakerRegistration['contactNumber'] ?? '',
                    'age' => $coMakerRegistration['age'] ?? null,
                    'gender' => $coMakerRegistration['gender'] ?? '',
                    'relationshipToPrimaryBeneficiary' => $coMakerRegistration['relationshipToPrimaryBeneficiary'] ?? '',
                    'validId' => $coMakerRegistration['validId'] ?? null,
                    'relationshipDocument' => $coMakerRegistration['relationshipDocument'] ?? null,
                ],
                'application' => null,
                'beneficiary' => array_merge($beneficiary ?? [], [
                    'isCoMaker' => true,
                    'primaryBeneficiaryName' => $coMakerRegistration['primaryBeneficiaryName'] ?? '',
                    'primaryBusinessName' => $coMakerRegistration['primaryBusinessName'] ?? '',
                    'primaryAddress' => $coMakerRegistration['primaryAddress'] ?? '',
                    'primaryBarangay' => $coMakerRegistration['primaryBarangay'] ?? '',
                    'relationshipToPrimaryBeneficiary' => $coMakerRegistration['relationshipToPrimaryBeneficiary'] ?? '',
                    'coMakerRegistration' => $coMakerRegistration,
                ]),
                'feedback' => $beneficiary ? $this->fetchBeneficiaryFeedback((int) $beneficiary['id']) : [],
            ];
        }

        $profile = $this->fetchApplicantProfile($userId);
        $application = $profile ? $this->fetchLatestApplicationForBeneficiary((int) $profile['id']) : null;
        $beneficiary = $this->fetchBeneficiaryProfileState($userId);

        return [
            'user' => [
                'id' => (int) $user['id'],
                'name' => $user['full_name'],
                'email' => $user['email'],
                'role' => $user['role'],
                'photo' => $user['photo'] ?? null,
            ],
            'profile' => $profile,
            'application' => $application,
            'beneficiary' => $beneficiary,
            'feedback' => $beneficiary ? $this->fetchBeneficiaryFeedback((int) $beneficiary['id']) : [],
        ];
    }

    public function saveUserProfilePhoto(int $userId, array $input): array
    {
        $photo = trim((string) ($input['photoDataUrl'] ?? ''));
        $photoError = $this->validateProfilePhotoDataUrl($photo, true);
        if ($photoError !== null) {
            return ['ok' => false, 'message' => $photoError];
        }

        try {
            $this->upsertUserProfilePhotoDataUrl($userId, $photo);
            $user = $this->fetchUser($userId);
        } catch (\Throwable $exception) {
            log_database_query_failure('application.save_user_profile_photo', $exception, ['user_id' => $userId]);
            return ['ok' => false, 'message' => 'Unable to save profile photo right now.'];
        }

        return [
            'ok' => true,
            'message' => 'Profile photo updated.',
            'data' => [
                'user' => [
                    'id' => (int) $user['id'],
                    'name' => $user['full_name'],
                    'email' => $user['email'],
                    'role' => $user['role'],
                    'photo' => $user['photo'] ?? null,
                ],
            ],
        ];
    }

    public function validateInitialApplicantProfileInput(array $input): array
    {
        $errors = $this->validateProfileInput($input, true);
        $photoError = $this->validateProfilePhotoDataUrl(trim((string) ($input['photoDataUrl'] ?? '')), true);
        if ($photoError !== null) {
            $errors['photoDataUrl'] = $photoError;
        }

        return $errors;
    }

    public function createInitialApplicantProfile(int $userId, array $input): void
    {
        $validationErrors = $this->validateInitialApplicantProfileInput($input);
        if ($validationErrors !== []) {
            throw new \RuntimeException($validationErrors['general'] ?? reset($validationErrors) ?: 'Applicant profile input is invalid.');
        }

        $barangayId = $this->resolveBarangayId(trim((string) ($input['barangay'] ?? '')));
        $profileId = $this->upsertApplicantProfile($userId, $barangayId, $input, false);
        $this->upsertApplication($profileId, $barangayId, false, null, []);
        $this->upsertUserProfilePhotoDataUrl($userId, trim((string) ($input['photoDataUrl'] ?? '')));
    }

    public function prepareInitialApplicantProfileStorage(): void
    {
        $this->ensureUserProfilePhotosTable();
    }

    public function saveBeneficiaryFeedback(int $userId, array $input): array
    {
        $beneficiary = $this->fetchBeneficiaryProfileState($userId);
        if ($beneficiary === null) {
            return ['ok' => false, 'message' => 'Beneficiary profile record is missing for this account.'];
        }

        $message = trim((string) ($input['message'] ?? ''));
        if ($message === '') {
            return ['ok' => false, 'message' => 'Feedback message is required.'];
        }
        if (mb_strlen($message) > 2000) {
            return ['ok' => false, 'message' => 'Feedback message must be 2000 characters or fewer.'];
        }

        try {
            $this->ensureBeneficiaryFeedbackTable();
            $statement = db()->prepare(
                'INSERT INTO beneficiary_feedback (beneficiary_profile_id, submitted_by_user_id, message)
                 VALUES (:beneficiary_profile_id, :submitted_by_user_id, :message)'
            );
            $statement->execute([
                'beneficiary_profile_id' => (int) $beneficiary['id'],
                'submitted_by_user_id' => $userId,
                'message' => $message,
            ]);
        } catch (\Throwable $exception) {
            log_database_query_failure('application.save_beneficiary_feedback', $exception, ['user_id' => $userId]);
            return ['ok' => false, 'message' => 'Unable to send feedback right now.'];
        }

        return [
            'ok' => true,
            'message' => 'Thanks! Feedback received.',
            'data' => [
                'feedback' => $this->fetchBeneficiaryFeedback((int) $beneficiary['id']),
            ],
        ];
    }

    public function saveBeneficiaryProfile(int $userId, array $input): array
    {
        $coMakerRegistration = (new CoMakerRegistrationService())->registrationForUser($userId);
        if ($coMakerRegistration !== null && in_array(strtolower((string) ($coMakerRegistration['registrationStatus'] ?? 'inactive')), ['approved', 'active'], true)) {
            $result = (new CoMakerRegistrationService())->updateProfileForUser($userId, $input);
            if (!$result['ok']) {
                return $result;
            }

            return [
                'ok' => true,
                'message' => 'Profile updated.',
                'data' => $this->getBeneficiaryProfileState($userId),
            ];
        }

        $profile = $this->fetchApplicantProfile($userId);
        if ($profile === null) {
            return ['ok' => false, 'errors' => ['general' => 'Applicant profile record is missing for this beneficiary.']];
        }

        $errors = $this->validateBeneficiaryProfileInput($input);
        if ($errors !== []) {
            return ['ok' => false, 'errors' => $errors];
        }

        $email = trim(strtolower((string) ($input['email'] ?? '')));
        if ($this->emailExistsForOtherUser($email, $userId)) {
            return ['ok' => false, 'errors' => ['email' => 'That email is already in use by another account.']];
        }

        $pdo = db();
        $pdo->beginTransaction();

        try {
            $barangayId = $this->resolveBarangayId(trim((string) ($input['barangay'] ?? '')));
            $this->updateUserIdentity($userId, [
                'fullName' => trim((string) ($input['fullName'] ?? '')),
                'email' => $email,
            ]);
            $this->updateApplicantProfileRecord($userId, $barangayId, $input);
            $pdo->commit();
        } catch (\Throwable $exception) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }

            log_database_query_failure('application.save_beneficiary_profile', $exception, ['user_id' => $userId]);

            return ['ok' => false, 'errors' => ['general' => 'Unable to save beneficiary profile right now.']];
        }

        return [
            'ok' => true,
            'message' => 'Profile updated.',
            'data' => $this->getBeneficiaryProfileState($userId),
        ];
    }

    public function listApplications(array $filters, array $actor): array
    {
        $actorRole = strtolower((string) ($actor['role'] ?? ''));
        $isProjectOfficer = str_contains($actorRole, 'project');
        $params = [];
        $joins = [
            'INNER JOIN applicant_profiles ON applicant_profiles.id = applications.applicant_profile_id',
            'INNER JOIN users AS applicant_users ON applicant_users.id = applicant_profiles.user_id',
            'LEFT JOIN roles AS applicant_roles ON applicant_roles.id = applicant_users.role_id',
            'LEFT JOIN barangays ON barangays.id = applicant_profiles.barangay_id',
            'LEFT JOIN staff_profiles AS assigned_staff ON assigned_staff.id = applications.assigned_staff_profile_id',
            'LEFT JOIN users AS assigned_users ON assigned_users.id = assigned_staff.user_id',
            'LEFT JOIN beneficiary_profiles ON beneficiary_profiles.applicant_profile_id = applicant_profiles.id',
        ];
        $conditions = [
            '1 = 1',
            'LOWER(REPLACE(applications.status, "_", " ")) NOT IN ("training ongoing", "completed")',
            'LOWER(COALESCE(applicant_roles.name, "")) <> "beneficiary"',
            'NOT (beneficiary_profiles.id IS NOT NULL AND (beneficiary_profiles.approval_date IS NOT NULL OR LOWER(COALESCE(beneficiary_profiles.beneficiary_status, "")) = "active"))',
        ];

        if ($isProjectOfficer) {
            $staffProfileId = $this->findStaffProfileIdForUser((int) ($actor['id'] ?? 0));
            if ($staffProfileId === null) {
                return [
                    'applications' => [],
                    'summary' => $this->emptyApplicationSummary(),
                    'barangays' => [],
                    'assignedPdos' => [],
                    'scopeBarangays' => [],
                ];
            }

            $scopeBarangayIds = (new BarangayAssignmentService())->activeBarangayIdsForStaffProfileId($staffProfileId);
            if ($scopeBarangayIds === []) {
                return [
                    'applications' => [],
                    'summary' => $this->emptyApplicationSummary(),
                    'barangays' => [],
                    'assignedPdos' => [],
                    'scopeBarangays' => [],
                ];
            }

            $joins[] = 'INNER JOIN staff_barangay_assignments AS scope_assignments
                        ON scope_assignments.barangay_id = applicant_profiles.barangay_id
                       AND scope_assignments.staff_profile_id = :scope_staff_profile_id
                       AND scope_assignments.ended_at IS NULL';
            $params['scope_staff_profile_id'] = $staffProfileId;
        }

        $status = trim((string) ($filters['status'] ?? ''));
        if ($status !== '') {
            $conditions[] = 'LOWER(REPLACE(applications.status, "_", " ")) = :status';
            $params['status'] = strtolower($status);
        }

        $barangayId = (int) ($filters['barangayId'] ?? 0);
        if ($barangayId > 0) {
            $conditions[] = 'barangays.id = :barangay_id';
            $params['barangay_id'] = $barangayId;
        }

        $assignedPdoId = (int) ($filters['assignedPdoId'] ?? 0);
        if ($assignedPdoId > 0) {
            $conditions[] = 'assigned_staff.id = :assigned_staff_profile_id';
            $params['assigned_staff_profile_id'] = $assignedPdoId;
        }

        $livelihoodCategory = trim((string) ($filters['livelihoodCategory'] ?? ''));
        if ($livelihoodCategory !== '') {
            if (in_array('livelihood_category', $this->applicantProfileColumns(), true)) {
                $conditions[] = 'applicant_profiles.livelihood_category = :livelihood_category';
                $params['livelihood_category'] = $livelihoodCategory;
            } else {
                $conditions[] = '1 = 0';
            }
        }

        $search = trim((string) ($filters['search'] ?? ''));
        if ($search !== '') {
            $conditions[] = '(applicant_users.full_name LIKE :search OR applicant_users.email LIKE :search)';
            $params['search'] = '%' . $search . '%';
        }

        $sql = '
            SELECT
                applications.id,
                applications.status,
                applications.submitted_at,
                applications.reviewed_at,
                applications.assigned_staff_profile_id,
                applications.created_at AS application_created_at,
                applications.updated_at,
                applicant_profiles.id AS applicant_profile_id,
                applicant_profiles.created_at AS profile_created_at,
                applicant_users.id AS applicant_user_id,
                applicant_users.full_name AS applicant_name,
                applicant_users.email AS applicant_email,
                  applicant_profiles.business_name,
                  applicant_profiles.contact_number,
                  applicant_profiles.household_size,
                  ' . $this->selectApplicantEducationalAttainmentSql() . ',
                  applicant_profiles.sector,
                  ' . $this->selectApplicantSectorOtherSpecifySql() . ',
                  ' . $this->selectApplicantLivelihoodCategorySql() . ',
                  applicant_profiles.livelihood_type,
                  ' . $this->selectApplicantBatchNoSql() . ',
                  applicant_profiles.address_line,
                  applicant_profiles.birthdate,
                  applicant_profiles.age,
                  applicant_profiles.gender,
                applicant_profiles.is_4ps,
                barangays.id AS barangay_id,
                barangays.name AS barangay_name,
                assigned_users.full_name AS assigned_pdo_name,
                (
                    SELECT COUNT(*)
                    FROM initial_requirement_files AS files
                    WHERE files.application_id = applications.id
                ) AS uploaded_requirement_count,
                (
                    SELECT COUNT(*)
                    FROM initial_requirement_files AS files
                    WHERE files.application_id = applications.id
                      AND LOWER(files.review_status) = "verified"
                ) AS verified_requirement_count,
                (
                    SELECT COUNT(*)
                    FROM initial_requirement_types AS requirement_types
                    WHERE requirement_types.is_required = 1
                ) AS total_required_documents
            FROM applications
            ' . implode("\n", $joins) . '
            WHERE ' . implode(' AND ', $conditions) . '
            ORDER BY applications.updated_at DESC, applications.id DESC
        ';

        $statement = db()->prepare($sql);
        foreach ($params as $key => $value) {
            $statement->bindValue(':' . $key, $value);
        }
        $statement->execute();
        $rows = $statement->fetchAll(PDO::FETCH_ASSOC) ?: [];

        $applications = array_map(fn (array $row): array => $this->mapApplicationRow($row), $rows);

        return [
            'applications' => $applications,
            'summary' => $this->buildApplicationSummary($applications),
            'barangays' => $this->availableBarangays($actor),
            'assignedPdos' => $isProjectOfficer ? [] : $this->availableAssignedPdos(),
            'scopeBarangays' => $isProjectOfficer ? $this->assignedBarangaysForUser((int) $actor['id']) : [],
        ];
    }

    public function getApplicationDetail(int $applicationId, array $actor): ?array
    {
        $row = $this->findApplicationRow($applicationId, $actor);
        if ($row === null) {
            return null;
        }

        $detail = $this->mapApplicationRow($row);
        $applicantProfileId = $this->findApplicantProfileIdForApplication($applicationId);
        $detail['requirements'] = array_values($this->fetchRequirementFiles($applicationId));
        $detail['formRequirements'] = $this->fetchFormRequirementsForApplication($applicationId, $actor);
        $detail['comments'] = $this->fetchApplicationComments($applicationId);
        $detail['history'] = $this->fetchApplicationHistory($applicationId);
        $detail['assessment'] = $this->fetchLatestAssessment($applicationId);
        $detail['trainingReadiness'] = $this->fetchTrainingReadiness($applicantProfileId);
        $detail['approvalReadiness'] = $this->buildApprovalReadiness(
            $detail['requirements'],
            $detail['formRequirements'],
            $detail['trainingReadiness']
        );
        $detail['trainingApprovalReadiness'] = $this->buildTrainingApprovalReadiness(
            $detail['requirements'],
            $detail['assignedStaffProfileId'] ?? null,
            (string) ($detail['status'] ?? '')
        );
        $detail['computedStatus'] = $detail['approvalReadiness']['overallStatus'] ?? $detail['status'];

        return $detail;
    }

    public function reviewRequirement(int $applicationId, array $payload, array $actor): array
    {
        $application = $this->findApplicationRow($applicationId, $actor);
        if ($application === null) {
            return ['ok' => false, 'errors' => ['applicationId' => 'Application not found or not accessible.']];
        }

        $requirementKey = trim((string) ($payload['requirementKey'] ?? ''));
        $decision = trim((string) ($payload['decision'] ?? ''));
        $remarks = trim((string) ($payload['staffRemarks'] ?? $payload['remarks'] ?? ''));
        $applicantRemark = trim((string) ($payload['applicantRemark'] ?? ''));
        $normalizedStatus = match (strtolower($decision)) {
            'approve', 'approved', 'verified' => 'verified',
            'needs_correction', 'needs correction', 'correct', 'correction' => 'needs correction',
            'reject', 'rejected' => 'rejected',
            default => null,
        };

        if ($requirementKey === '' || !array_key_exists($requirementKey, self::REQUIREMENT_LABELS)) {
            return ['ok' => false, 'errors' => ['requirementKey' => 'Requirement not found.']];
        }
        if ($normalizedStatus === null) {
            return ['ok' => false, 'errors' => ['decision' => 'Select Approved or Needs Correction.']];
        }
        if ($normalizedStatus === 'rejected' && $applicantRemark === '') {
            return ['ok' => false, 'errors' => ['applicantRemark' => 'Applicant-visible remark is required when rejecting a requirement.']];
        }

        $typeCode = $this->frontendKeyToCode($requirementKey);
        $statement = db()->prepare(
            'SELECT initial_requirement_files.id
             FROM initial_requirement_files
             INNER JOIN initial_requirement_types ON initial_requirement_types.id = initial_requirement_files.requirement_type_id
             WHERE initial_requirement_files.application_id = :application_id
               AND initial_requirement_types.code = :code
             LIMIT 1'
        );
        $statement->execute([
            'application_id' => $applicationId,
            'code' => $typeCode,
        ]);
        $fileId = $statement->fetchColumn();
        if ($fileId === false) {
            return ['ok' => false, 'errors' => ['requirementKey' => 'This requirement has not been submitted yet.']];
        }

        try {
            $supportsReviewColumns = $this->hasInitialRequirementReviewColumns();
            $sql = 'UPDATE initial_requirement_files
                    SET review_status = :review_status, updated_at = NOW()';
            $params = [
                'review_status' => $normalizedStatus,
                'id' => (int) $fileId,
            ];

            if ($supportsReviewColumns) {
                $sql .= ',
                    reviewer_remarks = :reviewer_remarks,
                    reviewed_by_user_id = :reviewed_by_user_id,
                    reviewed_at = NOW()';
                $params['reviewer_remarks'] = $remarks !== '' ? $remarks : null;
                $params['reviewed_by_user_id'] = (int) $actor['id'];
            }

            $sql .= ' WHERE id = :id';
            db()->prepare($sql)->execute($params);
        } catch (\Throwable $exception) {
            log_database_query_failure('application.review_requirement', $exception, [
                'application_id' => $applicationId,
                'requirement_key' => $requirementKey,
                'actor_user_id' => (int) ($actor['id'] ?? 0),
            ]);
            return ['ok' => false, 'errors' => ['general' => 'Unable to save this requirement review right now.']];
        }

        if ($applicantRemark !== '') {
            $this->createApplicationComment(
                $applicationId,
                (int) $actor['id'],
                self::REQUIREMENT_LABELS[$requirementKey] . ' (' . ucfirst($normalizedStatus) . '): ' . $applicantRemark,
                'applicant'
            );
        }

        $this->notifyApplicantRequirementReviewed(
            $applicationId,
            self::REQUIREMENT_LABELS[$requirementKey],
            $normalizedStatus,
            $applicantRemark !== '' ? $applicantRemark : $remarks
        );
        $this->notifyAssignedStaffRequirementReviewed(
            $application,
            self::REQUIREMENT_LABELS[$requirementKey],
            $normalizedStatus,
            $remarks,
            (int) $actor['id']
        );

        return ['ok' => true, 'application' => $this->getApplicationDetail($applicationId, $actor)];
    }

    public function uploadFormRequirement(int $applicationId, string $requirementKey, array $file, array $actor): array
    {
        $application = $this->findApplicationRow($applicationId, $actor);
        if ($application === null) {
            return ['ok' => false, 'errors' => ['applicationId' => 'Application not found or not accessible.']];
        }

        $requirementKey = trim($requirementKey);
        if ($requirementKey === '' || !isset(self::APPLICATION_FORM_DEFINITIONS[$requirementKey])) {
            return ['ok' => false, 'errors' => ['requirementKey' => 'Form requirement not found.']];
        }

        $applicantProfileId = $this->findApplicantProfileIdForApplication($applicationId);
        if ($applicantProfileId <= 0) {
            return ['ok' => false, 'errors' => ['applicationId' => 'Applicant profile not found.']];
        }

        $gate = $this->buildApplicationFormsGate($applicationId, $applicantProfileId, $this->fetchRequirementFiles($applicationId));
        if (!($gate['unlocked'] ?? false)) {
            return ['ok' => false, 'errors' => ['general' => 'Form requirements are not yet available for upload.']];
        }

        $beneficiaryProfileId = $this->ensureApplicationFormTasks($applicantProfileId, (int) ($actor['id'] ?? 0));
        if ($beneficiaryProfileId === null) {
            return ['ok' => false, 'errors' => ['general' => 'Unable to prepare the form requirement workspace.']];
        }

        $task = $this->findScopedApplicationFormTask($beneficiaryProfileId, $requirementKey, $actor);
        if ($task === null) {
            return ['ok' => false, 'errors' => ['general' => 'Form requirement task not found.']];
        }

        try {
            $metadata = (new UploadService())->storePostApprovalAsset('supporting-upload', $file);
        } catch (\Throwable $exception) {
            log_database_query_failure('application.upload_form_requirement_file', $exception, [
                'application_id' => $applicationId,
                'requirement_key' => $requirementKey,
                'actor_user_id' => (int) ($actor['id'] ?? 0),
            ]);
            return ['ok' => false, 'errors' => ['general' => $exception->getMessage() ?: 'Unable to upload the form file.']];
        }

        $payload = $this->decodeFormRequirementPayload($task['form_payload'] ?? null);
        $payload['staffReview'] = array_replace_recursive($payload['staffReview'] ?? [], [
            'reviewAttachment' => $metadata,
        ]);

        try {
            db()->prepare(
                'UPDATE post_approval_tasks
                 SET form_payload = :form_payload,
                     status = :status,
                     applicant_started_at = COALESCE(applicant_started_at, NOW()),
                     applicant_submitted_at = NOW(),
                     reviewed_at = NULL,
                     reviewer_remarks = NULL,
                     reviewed_by_user_id = NULL,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = :id'
            )->execute([
                'form_payload' => json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
                'status' => POST_APPROVAL_STATUS_SUBMITTED,
                'id' => (int) $task['id'],
            ]);

            db()->prepare(
                'INSERT INTO post_approval_submissions
                 (post_approval_task_id, submission_kind, file_path, original_name, payload_json, submitted_by_user_id, review_status, submitted_at)
                 VALUES (:post_approval_task_id, :submission_kind, :file_path, :original_name, :payload_json, :submitted_by_user_id, :review_status, :submitted_at)'
            )->execute([
                'post_approval_task_id' => (int) $task['id'],
                'submission_kind' => 'file',
                'file_path' => $metadata['file_path'],
                'original_name' => $metadata['original_name'],
                'payload_json' => json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
                'submitted_by_user_id' => (int) ($actor['id'] ?? 0) > 0 ? (int) $actor['id'] : null,
                'review_status' => POST_APPROVAL_STATUS_SUBMITTED,
                'submitted_at' => date('Y-m-d H:i:s'),
            ]);
        } catch (\Throwable $exception) {
            log_database_query_failure('application.upload_form_requirement_persist', $exception, [
                'application_id' => $applicationId,
                'requirement_key' => $requirementKey,
                'task_id' => (int) ($task['id'] ?? 0),
            ]);
            return ['ok' => false, 'errors' => ['general' => 'Unable to save the form upload right now.']];
        }

        return ['ok' => true, 'application' => $this->getApplicationDetail($applicationId, $actor), 'upload' => $metadata];
    }

    public function reviewApplication(int $applicationId, array $payload, array $actor): array
    {
        $application = $this->findApplicationRow($applicationId, $actor);
        if ($application === null) {
            return ['ok' => false, 'errors' => ['applicationId' => 'Application not found or not accessible.']];
        }

        $decision = trim((string) ($payload['decision'] ?? ''));
        $remarks = trim((string) ($payload['remarks'] ?? ''));
        $actorRole = strtolower((string) ($actor['role'] ?? ''));
        $nextStatus = $this->resolveNextStatus($decision, $actorRole);
        $receivedAssistance = in_array(strtolower(trim((string) ($payload['receivedAssistance'] ?? ''))), ['1', 'true', 'yes', 'on'], true);
        $detail = $this->getApplicationDetail($applicationId, $actor);

        if ($decision === 'approve') {
            $nextStatus = APPLICATION_STATUS_APPROVED;
        }
        if ($decision === 'approve_for_training' && str_contains($actorRole, 'project')) {
            $nextStatus = APPLICATION_STATUS_APPROVED_FOR_TRAINING;
        }

        if ($nextStatus === null) {
            return ['ok' => false, 'errors' => ['decision' => 'Invalid application decision.']];
        }
        if ($decision === 'approve' && is_array($detail) && !($detail['approvalReadiness']['canApprove'] ?? false)) {
            return ['ok' => false, 'errors' => ['decision' => 'This applicant is not yet ready for approval.']];
        }
        if ($decision === 'approve' && !$receivedAssistance) {
            return ['ok' => false, 'errors' => ['receivedAssistance' => 'Confirm that the applicant has already received assistance before final approval.']];
        }
        if ($decision === 'approve_for_training' && is_array($detail) && !($detail['trainingApprovalReadiness']['canApproveForTraining'] ?? false)) {
            return ['ok' => false, 'errors' => ['decision' => 'This applicant is not yet ready for training approval.']];
        }
        if ($nextStatus === APPLICATION_STATUS_APPROVED_FOR_TRAINING
            && !($decision === 'approve_for_training' && str_contains($actorRole, 'project'))) {
            $assessment = $detail['assessment'] ?? null;
            if (!is_array($assessment) || strtolower((string) ($assessment['recommendation'] ?? '')) !== 'approved') {
                return ['ok' => false, 'errors' => ['decision' => 'A completed approved assessment is required before training approval.']];
            }
        }

        if (in_array($nextStatus, [APPLICATION_STATUS_REJECTED, APPLICATION_STATUS_FLAGGED, APPLICATION_STATUS_NEEDS_CORRECTION], true)
            && $remarks === '') {
            return ['ok' => false, 'errors' => ['remarks' => 'Remarks are required for this decision.']];
        }

        $pdo = db();
        $pdo->beginTransaction();
        try {
            $statusService = new ApplicationStatusService();
            $statusService->transition($applicationId, $nextStatus, (int) $actor['id'], $remarks !== '' ? $remarks : null, $remarks !== '');

            if ($decision === 'approve') {
                $applicantProfileId = $this->findApplicantProfileIdForApplication($applicationId);
                $beneficiaryService = new BeneficiaryProfileService();
                $beneficiaryProfileId = $beneficiaryService->activateForApplicantProfile($applicantProfileId);
                if ($beneficiaryProfileId === null || $beneficiaryProfileId <= 0) {
                    throw new \RuntimeException('Unable to activate the beneficiary profile for this applicant.');
                }

                if ($nextStatus !== APPLICATION_STATUS_COMPLETED) {
                    $statusService->transition(
                        $applicationId,
                        APPLICATION_STATUS_COMPLETED,
                        (int) $actor['id'],
                        $remarks !== '' ? $remarks : 'Applicant tagged as already assisted.',
                        $remarks !== ''
                    );
                    $nextStatus = APPLICATION_STATUS_COMPLETED;
                }
            } elseif ($decision === 'approve_for_training' && str_contains($actorRole, 'project')) {
                $applicantProfileId = $this->findApplicantProfileIdForApplication($applicationId);
                $beneficiaryService = new BeneficiaryProfileService();
                $beneficiaryProfileId = $beneficiaryService->ensureWorkspaceProfileForApplicantProfile($applicantProfileId);
                if ($beneficiaryProfileId === null || $beneficiaryProfileId <= 0) {
                    throw new \RuntimeException('Unable to prepare the beneficiary profile for this applicant.');
                }
            }

            if (str_contains($actorRole, 'project')) {
                $staffProfileId = $this->findStaffProfileIdForUser((int) $actor['id']);
                if ($staffProfileId !== null) {
                    $pdo->prepare(
                        'UPDATE applications SET assigned_staff_profile_id = :assigned_staff_profile_id WHERE id = :id'
                    )->execute([
                        'assigned_staff_profile_id' => $staffProfileId,
                        'id' => $applicationId,
                    ]);
                }
            }

            (new AuditLogService())->record(
                (int) $actor['id'],
                'application.reviewed',
                'applications',
                $applicationId,
                ['decision' => $decision, 'status' => $nextStatus, 'received_assistance' => $receivedAssistance]
            );
            $pdo->commit();
        } catch (\Throwable $exception) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }

            log_database_query_failure('application.review', $exception, [
                'application_id' => $applicationId,
                'actor_user_id' => (int) ($actor['id'] ?? 0),
                'decision' => $decision,
            ]);

            return ['ok' => false, 'errors' => ['general' => 'Unable to update application status right now.']];
        }

        $this->notifyApplicantApplicationReviewed($applicationId, $nextStatus, $remarks, $actor);
        $this->notifyAssignedStaffApplicationReviewed(
            $application,
            $nextStatus,
            $remarks,
            (int) $actor['id']
        );

        return ['ok' => true, 'application' => $this->getApplicationDetail($applicationId, $actor)];
    }

    public function recordAssistanceReceived(int $applicationId, array $actor): array
    {
        $application = $this->findApplicationRow($applicationId, $actor);
        if ($application === null) {
            return ['ok' => false, 'errors' => ['applicationId' => 'Application not found or not accessible.']];
        }

        $actorRole = strtolower((string) ($actor['role'] ?? ''));
        if (!str_contains($actorRole, 'admin') && !str_contains($actorRole, 'project')) {
            return ['ok' => false, 'errors' => ['general' => 'Only Admin or PDO can record assistance release details.']];
        }

        $applicantProfileId = $this->findApplicantProfileIdForApplication($applicationId);
        if ($applicantProfileId <= 0) {
            return ['ok' => false, 'errors' => ['applicationId' => 'Applicant profile was not found.']];
        }

        $pdo = db();
        $pdo->beginTransaction();
        try {
            $beneficiaryProfileId = (new BeneficiaryProfileService())->recordAssistanceReceivedForApplicantProfile($applicantProfileId);
            if ($beneficiaryProfileId === null || $beneficiaryProfileId <= 0) {
                throw new \RuntimeException('Unable to record the assistance release.');
            }

            if (strtolower((string) ($application['status'] ?? '')) !== strtolower(APPLICATION_STATUS_COMPLETED)) {
                (new ApplicationStatusService())->transition(
                    $applicationId,
                    APPLICATION_STATUS_COMPLETED,
                    (int) $actor['id'],
                    'Assistance release recorded for approved beneficiary.',
                    false
                );
            }

            (new AuditLogService())->record(
                (int) $actor['id'],
                'application.assistance_received_recorded',
                'applications',
                $applicationId,
                ['beneficiary_profile_id' => $beneficiaryProfileId]
            );

            $pdo->commit();
        } catch (\Throwable $exception) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }

            log_database_query_failure('application.record_assistance_received', $exception, [
                'application_id' => $applicationId,
                'actor_user_id' => (int) ($actor['id'] ?? 0),
            ]);

            return ['ok' => false, 'errors' => ['general' => 'Unable to record assistance release right now.']];
        }

        return [
            'ok' => true,
            'message' => 'Assistance release date recorded.',
            'application' => $this->getApplicationDetail($applicationId, $actor),
        ];
    }

    public function saveAssessment(int $applicationId, array $payload, array $actor): array
    {
        $application = $this->findApplicationRow($applicationId, $actor);
        if ($application === null) {
            return ['ok' => false, 'errors' => ['applicationId' => 'Application not found or not accessible.']];
        }

        $role = strtolower((string) ($actor['role'] ?? ''));
        if (!str_contains($role, 'social') && !str_contains($role, 'admin') && !str_contains($role, 'project')) {
            return ['ok' => false, 'errors' => ['general' => 'You are not allowed to submit eligibility assessments.']];
        }

        $recommendation = strtolower(trim((string) ($payload['recommendation'] ?? '')));
        $allowedRecommendations = ['approved', 'needs_correction', 'rejected'];
        if (!in_array($recommendation, $allowedRecommendations, true)) {
            return ['ok' => false, 'errors' => ['recommendation' => 'Select a valid assessment recommendation.']];
        }

        $criteria = [
            'identityResidency' => trim((string) ($payload['identityResidency'] ?? '')),
            'documentValidity' => trim((string) ($payload['documentValidity'] ?? '')),
            'livelihoodConfirmation' => trim((string) ($payload['livelihoodConfirmation'] ?? '')),
            'programFit' => trim((string) ($payload['programFit'] ?? '')),
            'readinessCommitment' => trim((string) ($payload['readinessCommitment'] ?? '')),
        ];
        foreach ($criteria as $field => $value) {
            if (!in_array(strtolower($value), ['pass', 'needs clarification', 'fail'], true)) {
                return ['ok' => false, 'errors' => [$field => 'Assessment criteria must be marked as Pass, Needs Clarification, or Fail.']];
            }
        }

        $remarks = trim((string) ($payload['remarks'] ?? ''));
        if ($remarks === '') {
            return ['ok' => false, 'errors' => ['remarks' => 'Assessment remarks are required.']];
        }

        $this->ensureAssessmentTable();
        $staffProfileId = $this->findStaffProfileIdForUser((int) ($actor['id'] ?? 0));
        $directWorkerUserId = (int) ($payload['directWorkerUserId'] ?? ($actor['id'] ?? 0));
        $certifyingOfficerUserId = (int) ($payload['certifyingOfficerUserId'] ?? ($actor['id'] ?? 0));
        $directWorkerName = trim((string) ($payload['directWorkerName'] ?? $this->resolveUserName($directWorkerUserId)));
        $certifyingOfficerName = trim((string) ($payload['certifyingOfficerName'] ?? $this->resolveUserName($certifyingOfficerUserId)));
        $nextStatus = match ($recommendation) {
            'approved' => APPLICATION_STATUS_APPROVED_FOR_TRAINING,
            'needs_correction' => APPLICATION_STATUS_NEEDS_CORRECTION,
            'rejected' => APPLICATION_STATUS_REJECTED,
        };

        $pdo = db();
        $pdo->beginTransaction();
        try {
            $pdo->prepare(
                'INSERT INTO application_assessments (
                    application_id,
                    assessor_user_id,
                    assessor_staff_profile_id,
                    identity_residency_status,
                    document_validity_status,
                    livelihood_confirmation_status,
                    program_fit_status,
                    readiness_commitment_status,
                    recommendation,
                    remarks,
                    direct_worker_user_id,
                    direct_worker_name,
                    certifying_officer_user_id,
                    certifying_officer_name
                ) VALUES (
                    :application_id,
                    :assessor_user_id,
                    :assessor_staff_profile_id,
                    :identity_residency_status,
                    :document_validity_status,
                    :livelihood_confirmation_status,
                    :program_fit_status,
                    :readiness_commitment_status,
                    :recommendation,
                    :remarks,
                    :direct_worker_user_id,
                    :direct_worker_name,
                    :certifying_officer_user_id,
                    :certifying_officer_name
                )'
            )->execute([
                'application_id' => $applicationId,
                'assessor_user_id' => (int) $actor['id'],
                'assessor_staff_profile_id' => $staffProfileId,
                'identity_residency_status' => $criteria['identityResidency'],
                'document_validity_status' => $criteria['documentValidity'],
                'livelihood_confirmation_status' => $criteria['livelihoodConfirmation'],
                'program_fit_status' => $criteria['programFit'],
                'readiness_commitment_status' => $criteria['readinessCommitment'],
                'recommendation' => $recommendation,
                'remarks' => $remarks,
                'direct_worker_user_id' => $directWorkerUserId > 0 ? $directWorkerUserId : null,
                'direct_worker_name' => $directWorkerName !== '' ? $directWorkerName : null,
                'certifying_officer_user_id' => $certifyingOfficerUserId > 0 ? $certifyingOfficerUserId : null,
                'certifying_officer_name' => $certifyingOfficerName !== '' ? $certifyingOfficerName : null,
            ]);

            (new ApplicationStatusService())->transition($applicationId, $nextStatus, (int) $actor['id'], $remarks, true);
            (new AuditLogService())->record(
                (int) $actor['id'],
                'application.assessed',
                'application_assessments',
                (int) $pdo->lastInsertId(),
                ['application_id' => $applicationId, 'recommendation' => $recommendation]
            );

            $pdo->commit();
        } catch (\Throwable $exception) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }

            log_database_query_failure('application.save_assessment', $exception, [
                'application_id' => $applicationId,
                'assessor_user_id' => (int) ($actor['id'] ?? 0),
            ]);

            return ['ok' => false, 'errors' => ['general' => 'Unable to save the assessment right now.']];
        }

        return ['ok' => true, 'application' => $this->getApplicationDetail($applicationId, $actor)];
    }

    public function updateApplicantInputData(int $applicationId, array $payload, array $actor): array
    {
        $application = $this->findApplicationRow($applicationId, $actor);
        if ($application === null) {
            return ['ok' => false, 'errors' => ['applicationId' => 'Application not found or not accessible.']];
        }

        $role = strtolower((string) ($actor['role'] ?? ''));
        if (!str_contains($role, 'social') && !str_contains($role, 'admin')) {
            return ['ok' => false, 'errors' => ['general' => 'You are not allowed to correct applicant input data.']];
        }

        if (str_contains($role, 'social') && !str_contains($role, 'admin')) {
            $requirements = $this->fetchRequirementFiles($applicationId);
            if ($this->hasApplicantReviewStarted($application, $requirements)) {
                return [
                    'ok' => false,
                    'errors' => [
                        'general' => 'This application has already been checked by PDO/Admin and is locked for Social Worker input correction.',
                    ],
                ];
            }
        }

        $reason = trim((string) ($payload['correctionReason'] ?? ''));
        if (strlen($reason) < 10) {
            return ['ok' => false, 'errors' => ['correctionReason' => 'Correction reason must be at least 10 characters.']];
        }

        $fullName = trim((string) ($payload['applicantName'] ?? ''));
        $businessName = trim((string) ($payload['businessName'] ?? ''));
        $contactNumber = trim((string) ($payload['contactNumber'] ?? ''));
        $barangayName = trim((string) ($payload['barangay'] ?? ''));
        $address = trim((string) ($payload['address'] ?? ''));
        $birthdate = trim((string) ($payload['birthdate'] ?? ''));
        $ageRaw = trim((string) ($payload['age'] ?? ''));
        $gender = trim((string) ($payload['gender'] ?? ''));
        $householdSizeRaw = trim((string) ($payload['householdSize'] ?? ''));
        $educationalAttainment = trim((string) ($payload['educationalAttainment'] ?? ''));
        $sector = trim((string) ($payload['sector'] ?? ($application['sector'] ?? '')));
        $sectorOtherSpecify = trim((string) ($payload['sectorOtherSpecify'] ?? ($application['sector_other_specify'] ?? '')));
        $batchNo = trim((string) ($payload['batchNo'] ?? ($application['batch_no'] ?? '')));
        $livelihoodCategory = trim((string) ($payload['livelihoodCategory'] ?? ($application['livelihood_category'] ?? '')));
        $livelihood = trim((string) ($payload['livelihood'] ?? ($application['livelihood_type'] ?? '')));
        $is4ps = isset($payload['is4ps']) && in_array(strtolower((string) $payload['is4ps']), ['1', 'true', 'yes', 'on'], true);

        $errors = [];
        if ($fullName === '') {
            $errors['applicantName'] = 'Applicant name is required.';
        }
        if ($businessName === '') {
            $errors['businessName'] = 'Business name is required.';
        }
        if ($barangayName === '') {
            $errors['barangay'] = 'Barangay is required.';
        }
        if ($ageRaw !== '' && ((int) $ageRaw < 1 || (int) $ageRaw > 120)) {
            $errors['age'] = 'Age must be between 1 and 120.';
        }
        if ($householdSizeRaw !== '' && ((int) $householdSizeRaw < 1 || (int) $householdSizeRaw > 99)) {
            $errors['householdSize'] = 'Household size must be between 1 and 99.';
        }
        if ($birthdate !== '' && strtotime($birthdate) === false) {
            $errors['birthdate'] = 'Birthdate must be a valid date.';
        }
        if ($errors !== []) {
            return ['ok' => false, 'errors' => $errors];
        }

        $before = [
            'applicantName' => $application['applicant_name'] ?? '',
            'businessName' => $application['business_name'] ?? '',
            'contactNumber' => $application['contact_number'] ?? '',
            'barangay' => $application['barangay_name'] ?? '',
            'address' => $application['address_line'] ?? '',
            'birthdate' => $application['birthdate'] ?? '',
            'age' => $application['age'] !== null ? (int) $application['age'] : null,
            'gender' => $application['gender'] ?? '',
            'householdSize' => $application['household_size'] !== null ? (int) $application['household_size'] : null,
            'educationalAttainment' => $application['educational_attainment'] ?? '',
            'sector' => $application['sector'] ?? '',
            'sectorOtherSpecify' => $application['sector_other_specify'] ?? '',
            'batchNo' => $application['batch_no'] ?? '',
            'livelihoodCategory' => $this->normalizeLivelihoodCategory((string) (($application['livelihood_category'] ?? '') ?: ($application['livelihood_type'] ?? ''))) ?? '',
            'livelihood' => $application['livelihood_type'] ?? '',
            'is4ps' => ((int) ($application['is_4ps'] ?? 0)) === 1,
        ];

        $after = [
            'applicantName' => $fullName,
            'businessName' => $businessName,
            'contactNumber' => $contactNumber,
            'barangay' => $barangayName,
            'address' => $address,
            'birthdate' => $birthdate !== '' ? $birthdate : null,
            'age' => $ageRaw !== '' ? (int) $ageRaw : null,
            'gender' => $gender,
            'householdSize' => $householdSizeRaw !== '' ? (int) $householdSizeRaw : null,
            'educationalAttainment' => $educationalAttainment,
            'sector' => $sector,
            'sectorOtherSpecify' => strcasecmp($sector, 'Other') === 0 ? $sectorOtherSpecify : null,
            'batchNo' => $batchNo,
            'livelihoodCategory' => $livelihoodCategory,
            'livelihood' => $livelihood,
            'is4ps' => $is4ps,
        ];

        $changed = [];
        foreach ($after as $key => $value) {
            if (($before[$key] ?? null) !== $value) {
                $changed[$key] = ['from' => $before[$key] ?? null, 'to' => $value];
            }
        }

        if ($changed === []) {
            return ['ok' => true, 'message' => 'No applicant data changes were detected.', 'application' => $this->getApplicationDetail($applicationId, $actor)];
        }

        $barangayId = $this->findBarangayIdByName($barangayName);
        if ($barangayId === null) {
            return ['ok' => false, 'errors' => ['barangay' => 'Select an existing barangay.']];
        }
        $pdo = db();
        $pdo->beginTransaction();
        try {
            $this->updateUserIdentity((int) $application['applicant_user_id'], [
                'fullName' => $fullName,
                'email' => (string) $application['applicant_email'],
            ]);

            $supportsEducationalAttainment = in_array('educational_attainment', $this->applicantProfileColumns(), true);
            $supportsBatchNo = in_array('batch_no', $this->applicantProfileColumns(), true);
            $supportsLivelihoodCategory = in_array('livelihood_category', $this->applicantProfileColumns(), true);
            $supportsSectorOtherSpecify = in_array('sector_other_specify', $this->applicantProfileColumns(), true);
            $params = [
                'barangay_id' => $barangayId,
                'contact_number' => $contactNumber !== '' ? $contactNumber : null,
                'business_name' => $businessName,
                'address_line' => $address,
                'birthdate' => $after['birthdate'],
                'age' => $after['age'],
                'gender' => $gender,
                'is_4ps' => $is4ps ? 1 : 0,
                'household_size' => $after['householdSize'],
                'sector' => $sector,
                'sector_other_specify' => strcasecmp($sector, 'Other') === 0 ? ($sectorOtherSpecify !== '' ? $sectorOtherSpecify : null) : null,
                'batch_no' => $batchNo !== '' ? $batchNo : null,
                'livelihood_category' => $livelihoodCategory !== '' ? $livelihoodCategory : null,
                'livelihood_type' => $livelihood,
                'profile_id' => (int) $application['applicant_profile_id'],
            ];
            if ($supportsEducationalAttainment) {
                $params['educational_attainment'] = $educationalAttainment;
            }

            $setColumns = [
                'barangay_id = :barangay_id',
                'contact_number = :contact_number',
                'business_name = :business_name',
                'address_line = :address_line',
                'birthdate = :birthdate',
                'age = :age',
                'gender = :gender',
                'is_4ps = :is_4ps',
                'household_size = :household_size',
            ];
            if ($supportsEducationalAttainment) {
                $setColumns[] = 'educational_attainment = :educational_attainment';
            }
            if ($supportsBatchNo) {
                $setColumns[] = 'batch_no = :batch_no';
            }
            if ($supportsLivelihoodCategory) {
                $setColumns[] = 'livelihood_category = :livelihood_category';
            }
            if ($supportsSectorOtherSpecify) {
                $setColumns[] = 'sector_other_specify = :sector_other_specify';
            }
            $setColumns[] = 'sector = :sector';
            $setColumns[] = 'livelihood_type = :livelihood_type';
            $setColumns[] = 'updated_at = NOW()';
            $pdo->prepare(
                'UPDATE applicant_profiles
                 SET ' . implode(', ', $setColumns) . '
                 WHERE id = :profile_id'
            )->execute($params);

            (new AuditLogService())->record(
                (int) $actor['id'],
                'application.input_data_corrected',
                'applications',
                $applicationId,
                [
                    'application_id' => $applicationId,
                    'applicant_profile_id' => (int) $application['applicant_profile_id'],
                    'reason' => $reason,
                    'changes' => $changed,
                ]
            );

            $pdo->commit();
        } catch (\Throwable $exception) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            log_database_query_failure('application.update_applicant_input_data', $exception, [
                'application_id' => $applicationId,
                'actor_user_id' => (int) ($actor['id'] ?? 0),
            ]);

            return ['ok' => false, 'errors' => ['general' => 'Unable to update applicant data right now.']];
        }

        return [
            'ok' => true,
            'message' => 'Applicant input data was corrected.',
            'application' => $this->getApplicationDetail($applicationId, $actor),
        ];
    }

    public function updateLivelihoodCategory(int $applicationId, string $livelihoodCategory, array $actor): array
    {
        $application = $this->findApplicationRow($applicationId, $actor);
        if ($application === null) {
            return ['ok' => false, 'errors' => ['applicationId' => 'Application not found or not accessible.']];
        }

        $role = strtolower((string) ($actor['role'] ?? ''));
        if (!str_contains($role, 'project') && !str_contains($role, 'admin')) {
            return ['ok' => false, 'errors' => ['general' => 'You are not allowed to categorize this applicant.']];
        }

        if (!in_array('livelihood_category', $this->applicantProfileColumns(), true)) {
            return ['ok' => false, 'errors' => ['general' => 'Livelihood category is not available in this environment.']];
        }

        $validationError = $this->validateLivelihoodCategory($livelihoodCategory);
        if ($validationError !== null) {
            return ['ok' => false, 'errors' => ['livelihoodCategory' => $validationError]];
        }

        $normalizedCategory = $this->normalizeLivelihoodCategory($livelihoodCategory);
        $currentCategory = trim((string) ($application['livelihood_category'] ?? ''));
        if ($normalizedCategory === $currentCategory) {
            return [
                'ok' => true,
                'message' => 'No livelihood category changes were detected.',
                'application' => $this->getApplicationDetail($applicationId, $actor),
            ];
        }

        try {
            db()->prepare(
                'UPDATE applicant_profiles
                 SET livelihood_category = :livelihood_category, updated_at = NOW()
                 WHERE id = :profile_id'
            )->execute([
                'livelihood_category' => $normalizedCategory,
                'profile_id' => (int) $application['applicant_profile_id'],
            ]);

            (new AuditLogService())->record(
                (int) ($actor['id'] ?? 0),
                'application.livelihood_category_updated',
                'applications',
                $applicationId,
                [
                    'application_id' => $applicationId,
                    'applicant_profile_id' => (int) $application['applicant_profile_id'],
                    'from' => $currentCategory,
                    'to' => $normalizedCategory,
                ]
            );
        } catch (\Throwable $exception) {
            log_database_query_failure('application.update_livelihood_category', $exception, [
                'application_id' => $applicationId,
                'profile_id' => (int) ($application['applicant_profile_id'] ?? 0),
            ]);

            return ['ok' => false, 'errors' => ['general' => 'Unable to save the generalized business category right now.']];
        }

        return [
            'ok' => true,
            'message' => 'Generalized business category saved.',
            'application' => $this->getApplicationDetail($applicationId, $actor),
        ];
    }

    public function currentProjectOfficerRoster(array $actor): array
    {
        (new BeneficiaryProfileService())->synchronizeSystemInactivityStatuses();
        $data = $this->listApplications([], $actor);
        $coMakerRegistrations = (new CoMakerRegistrationService())->listForActor($actor);

        $roster = array_map(static function (array $application): array {
            return [
                'id' => $application['id'],
                'name' => $application['applicantName'],
                'barangay' => $application['barangay'],
                'status' => $application['status'],
                'businessName' => $application['businessName'],
            ];
        }, $data['applications']);

        return [
            'summary' => [
                'applications' => count($data['applications']),
                'pending' => (int) ($data['summary']['inProgress'] ?? 0),
            ],
            'beneficiarySummary' => $this->fetchProjectOfficerBeneficiarySummary($actor),
            'beneficiaryRoster' => $this->fetchProjectOfficerBeneficiaryRoster($actor),
            'coMakerRegistrations' => $coMakerRegistrations,
            'coMakerRegistrationSummary' => [
                'total' => count($coMakerRegistrations),
                'pendingReview' => count(array_filter($coMakerRegistrations, static fn (array $row): bool => strtolower((string) ($row['registrationStatus'] ?? '')) === CoMakerRegistrationService::STATUS_PENDING_REVIEW)),
                'approved' => count(array_filter($coMakerRegistrations, static fn (array $row): bool => in_array(strtolower((string) ($row['registrationStatus'] ?? '')), [CoMakerRegistrationService::STATUS_APPROVED, CoMakerRegistrationService::LEGACY_STATUS_ACTIVE], true))),
                'rejected' => count(array_filter($coMakerRegistrations, static fn (array $row): bool => strtolower((string) ($row['registrationStatus'] ?? '')) === CoMakerRegistrationService::STATUS_REJECTED)),
            ],
            'roster' => $roster,
            'applications' => $data['applications'],
            'scopeBarangays' => $data['scopeBarangays'],
        ];
    }

    private function notifyApplicantRequirementReviewed(int $applicationId, string $requirementLabel, string $status, string $remarks): void
    {
        $userId = $this->findApplicantUserIdForApplication($applicationId);
        if ($userId === null) {
            return;
        }

        $title = $status === 'verified'
            ? $requirementLabel . ' approved'
            : $requirementLabel . ' needs attention';
        $message = $status === 'verified'
            ? 'Your submitted requirement was reviewed and approved.'
            : 'Your submitted requirement was reviewed and needs correction before it can move forward.';

        if (trim($remarks) !== '') {
            $message .= ' Remarks: ' . trim($remarks);
        }

        (new NotificationService())->createInApp($userId, $title, $message, 'application_requirement_review');
    }

    private function notifyApplicantApplicationReviewed(int $applicationId, string $status, string $remarks, array $actor): void
    {
        $userId = $this->findApplicantUserIdForApplication($applicationId);
        if ($userId === null) {
            return;
        }

        $statusLabel = $this->normalizeStoredStatus($status);
        $actorName = trim((string) ($actor['name'] ?? 'SMART LEAP staff'));
        $message = sprintf(
            'Your application status is now %s. Reviewed by %s.',
            $statusLabel,
            $actorName !== '' ? $actorName : 'SMART LEAP staff'
        );

        if (trim($remarks) !== '') {
            $message .= ' Remarks: ' . trim($remarks);
        }

        (new NotificationService())->createInApp(
            $userId,
            'Application review update',
            $message,
            'application_review'
        );
    }

    private function notifyAssignedStaffRequirementReviewed(array $application, string $requirementLabel, string $status, string $remarks, int $actorUserId): void
    {
        $assignedStaffProfileId = (int) ($application['assigned_staff_profile_id'] ?? 0);
        $assignedUserId = (new NotificationService())->userIdForStaffProfileId($assignedStaffProfileId);
        if ($assignedUserId === null || $assignedUserId === $actorUserId) {
            return;
        }

        $statusLabel = $status === 'verified' ? 'verified' : 'marked for correction';
        $businessName = trim((string) ($application['businessName'] ?? ''));
        $applicantName = trim((string) ($application['applicant_name'] ?? ''));
        $barangayName = trim((string) ($application['barangay_name'] ?? ''));
        $subjectParts = array_filter([$applicantName, $businessName, $barangayName], static fn (string $value): bool => $value !== '');
        $subject = $subjectParts !== [] ? implode(' | ', $subjectParts) : 'an application';
        $message = sprintf('%s was %s for %s.', $requirementLabel, $statusLabel, $subject);
        if (trim($remarks) !== '') {
            $message .= ' Remarks: ' . trim($remarks);
        }

        (new NotificationService())->createInApp(
            $assignedUserId,
            'Application requirement reviewed',
            $message,
            'application_requirement_review'
        );
    }

    private function notifyAssignedStaffApplicationReviewed(array $application, string $status, string $remarks, int $actorUserId): void
    {
        $assignedStaffProfileId = (int) ($application['assigned_staff_profile_id'] ?? 0);
        $assignedUserId = (new NotificationService())->userIdForStaffProfileId($assignedStaffProfileId);
        if ($assignedUserId === null || $assignedUserId === $actorUserId) {
            return;
        }

        $statusLabel = $this->normalizeStoredStatus($status);
        $applicantName = trim((string) ($application['applicant_name'] ?? ''));
        $businessName = trim((string) ($application['businessName'] ?? ''));
        $subject = $businessName !== '' ? $businessName : ($applicantName !== '' ? $applicantName : 'the application');
        $message = sprintf('%s is now %s.', $subject, $statusLabel);
        if (trim($remarks) !== '') {
            $message .= ' Remarks: ' . trim($remarks);
        }

        (new NotificationService())->createInApp(
            $assignedUserId,
            'Application status updated',
            $message,
            'application_review'
        );
    }

    private function findApplicantUserIdForApplication(int $applicationId): ?int
    {
        if ($applicationId <= 0) {
            return null;
        }

        try {
            $statement = db()->prepare(
                'SELECT applicant_profiles.user_id
                 FROM applications
                 INNER JOIN applicant_profiles ON applicant_profiles.id = applications.applicant_profile_id
                 WHERE applications.id = :application_id
                 LIMIT 1'
            );
            $statement->execute(['application_id' => $applicationId]);
            $value = $statement->fetchColumn();
        } catch (\Throwable $exception) {
            log_database_query_failure('application.notification_applicant_user', $exception, ['application_id' => $applicationId]);
            return null;
        }

        $userId = (int) $value;
        return $userId > 0 ? $userId : null;
    }

    private function fetchProjectOfficerBeneficiarySummary(array $actor): array
    {
        $staffProfileId = $this->findStaffProfileIdForUser((int) ($actor['id'] ?? 0));
        if ($staffProfileId === null) {
            return [
                'total' => 0,
                'pending' => 0,
                'pendingVerification' => 0,
                'verified' => 0,
                'verifiedRepayments' => 0,
                'followUp' => 0,
            ];
        }

        $scopeBarangayIds = (new BarangayAssignmentService())->activeBarangayIdsForStaffProfileId($staffProfileId);
        if ($scopeBarangayIds === []) {
            return [
                'total' => 0,
                'pending' => 0,
                'pendingVerification' => 0,
                'verified' => 0,
                'verifiedRepayments' => 0,
                'followUp' => 0,
            ];
        }

        $statement = db()->prepare(
            'SELECT
                COUNT(DISTINCT CASE
                    WHEN beneficiary_profiles.replacement_for_beneficiary_profile_id IS NULL
                     AND (
                        beneficiary_profiles.approval_date IS NOT NULL
                        OR LOWER(COALESCE(beneficiary_profiles.beneficiary_status, "")) IN ("active", "inactive", "deceased")
                     )
                    THEN beneficiary_profiles.id
                    ELSE NULL
                END) AS total_beneficiaries,
                COUNT(DISTINCT CASE
                    WHEN beneficiary_profiles.id IS NOT NULL
                     AND beneficiary_profiles.replacement_for_beneficiary_profile_id IS NULL
                     AND beneficiary_profiles.approval_date IS NULL
                     AND LOWER(COALESCE(beneficiary_profiles.beneficiary_status, "")) NOT IN ("active", "inactive", "deceased")
                    THEN beneficiary_profiles.id
                    ELSE NULL
                END) AS pending_beneficiaries
             FROM beneficiary_profiles
             INNER JOIN applicant_profiles ON applicant_profiles.id = beneficiary_profiles.applicant_profile_id
             INNER JOIN staff_barangay_assignments AS scope_assignments
                 ON scope_assignments.barangay_id = applicant_profiles.barangay_id
                AND scope_assignments.staff_profile_id = :scope_staff_profile_id
                AND scope_assignments.ended_at IS NULL'
        );
        $statement->execute(['scope_staff_profile_id' => $staffProfileId]);
        $row = $statement->fetch(PDO::FETCH_ASSOC) ?: [];

        $repaymentSummary = (new RepaymentLedgerService())->listForProjectOfficer($actor);
        $repayments = is_array($repaymentSummary['payments'] ?? null) ? $repaymentSummary['payments'] : [];
        $pendingVerification = 0;
        $verifiedRepayments = 0;
        $followUp = 0;

        foreach ($repayments as $payment) {
            $stage = strtolower((string) ($payment['stage'] ?? ''));
            if (in_array($stage, ['pending', 'uploaded'], true)) {
                $pendingVerification++;
            } elseif ($stage === 'verified') {
                $verifiedRepayments++;
            } elseif (in_array($stage, ['needs_correction', 'rejected'], true)) {
                $followUp++;
            }
        }

        return [
            'total' => (int) ($row['total_beneficiaries'] ?? 0),
            'pending' => $pendingVerification,
            'pendingVerification' => $pendingVerification,
            'verified' => $verifiedRepayments,
            'verifiedRepayments' => $verifiedRepayments,
            'followUp' => $followUp,
            'pendingBeneficiaries' => (int) ($row['pending_beneficiaries'] ?? 0),
        ];
    }

    private function fetchProjectOfficerBeneficiaryRoster(array $actor): array
    {
        $staffProfileId = $this->findStaffProfileIdForUser((int) ($actor['id'] ?? 0));
        if ($staffProfileId === null) {
            return [];
        }

        $scopeBarangayIds = (new BarangayAssignmentService())->activeBarangayIdsForStaffProfileId($staffProfileId);
        if ($scopeBarangayIds === []) {
            return [];
        }

        $this->ensureUserProfilePhotosTable();
        (new CoMakerRegistrationService())->ensureSchema();

        $statement = db()->prepare(
            'SELECT beneficiary_profiles.id,
                    beneficiary_profiles.beneficiary_status,
                    beneficiary_profiles.replacement_for_beneficiary_profile_id,
                    beneficiary_profiles.approval_date,
                    beneficiary_profiles.approved_at,
                    beneficiary_profiles.updated_at,
                    latest_application.status AS latest_application_status,
                    beneficiary_users.full_name AS beneficiary_name,
                    beneficiary_users.email AS beneficiary_email,
                    user_profile_photos.image_data AS beneficiary_photo,
                    applicant_profiles.contact_number,
                    applicant_profiles.business_name,
                    applicant_profiles.address_line,
                    applicant_profiles.birthdate,
                    applicant_profiles.age,
                    applicant_profiles.is_4ps,
                    applicant_profiles.gender,
                    ' . $this->selectApplicantEducationalAttainmentSql() . ',
                    ' . $this->selectApplicantBatchNoSql() . ',
                    ' . $this->selectApplicantLivelihoodCategorySql() . ',
                    applicant_profiles.livelihood_type,
                    ' . $this->selectApplicantSectorOtherSpecifySql() . ',
                    applicant_profiles.sector,
                    barangays.name AS barangay_name,
                    assigned_users.full_name AS assigned_pdo_name,
                    replacement_users.full_name AS replacement_for_name,
                    replacement_profiles.beneficiary_status AS replacement_for_status,
                    successor_profiles.id AS repayment_successor_beneficiary_profile_id,
                    successor_users.full_name AS repayment_successor_name,
                    co_maker_registrations.id AS co_maker_registration_id,
                    co_maker_registrations.user_id AS co_maker_user_id,
                    co_maker_registrations.beneficiary_profile_id AS co_maker_beneficiary_profile_id,
                    co_maker_registrations.relationship_to_beneficiary AS co_maker_relationship,
                    co_maker_registrations.contact_number AS co_maker_contact_number,
                    co_maker_registrations.valid_id_file_path AS co_maker_valid_id_path,
                    co_maker_registrations.valid_id_original_name AS co_maker_valid_id_name,
                    co_maker_registrations.relationship_document_path AS co_maker_relationship_document_path,
                    co_maker_registrations.relationship_document_original_name AS co_maker_relationship_document_name,
                    co_maker_registrations.registration_status AS co_maker_registration_status,
                    co_maker_users.full_name AS co_maker_name,
                    co_maker_users.email AS co_maker_email
             FROM beneficiary_profiles
             INNER JOIN users AS beneficiary_users ON beneficiary_users.id = beneficiary_profiles.user_id
             LEFT JOIN user_profile_photos ON user_profile_photos.user_id = beneficiary_users.id
             LEFT JOIN applicant_profiles ON applicant_profiles.id = beneficiary_profiles.applicant_profile_id
             LEFT JOIN applications AS latest_application ON latest_application.id = (
                SELECT application_scope.id
                FROM applications AS application_scope
                WHERE application_scope.applicant_profile_id = beneficiary_profiles.applicant_profile_id
                ORDER BY application_scope.id DESC
                LIMIT 1
             )
             LEFT JOIN barangays ON barangays.id = applicant_profiles.barangay_id
             LEFT JOIN staff_profiles AS assigned_staff ON assigned_staff.id = beneficiary_profiles.assigned_staff_profile_id
             LEFT JOIN users AS assigned_users ON assigned_users.id = assigned_staff.user_id
             LEFT JOIN beneficiary_profiles AS replacement_profiles ON replacement_profiles.id = beneficiary_profiles.replacement_for_beneficiary_profile_id
             LEFT JOIN users AS replacement_users ON replacement_users.id = replacement_profiles.user_id
             LEFT JOIN beneficiary_profiles AS successor_profiles ON successor_profiles.replacement_for_beneficiary_profile_id = beneficiary_profiles.id
             LEFT JOIN users AS successor_users ON successor_users.id = successor_profiles.user_id
             LEFT JOIN co_maker_registrations
                ON co_maker_registrations.deceased_beneficiary_profile_id = beneficiary_profiles.id
               AND LOWER(COALESCE(co_maker_registrations.registration_status, "")) IN ("active", "approved")
             LEFT JOIN users AS co_maker_users ON co_maker_users.id = co_maker_registrations.user_id
             INNER JOIN staff_barangay_assignments AS scope_assignments
                 ON scope_assignments.barangay_id = applicant_profiles.barangay_id
                AND scope_assignments.staff_profile_id = :scope_staff_profile_id
                AND scope_assignments.ended_at IS NULL
             WHERE beneficiary_profiles.replacement_for_beneficiary_profile_id IS NULL
               AND (
                    beneficiary_profiles.approval_date IS NOT NULL
                    OR LOWER(COALESCE(beneficiary_profiles.beneficiary_status, "")) IN ("active", "inactive", "deceased")
               )
             ORDER BY beneficiary_profiles.updated_at DESC, beneficiary_profiles.id DESC'
        );
        $statement->execute(['scope_staff_profile_id' => $staffProfileId]);
        $rows = $statement->fetchAll(PDO::FETCH_ASSOC) ?: [];

        return array_map(function (array $row): array {
            return [
                'id' => (int) ($row['id'] ?? 0),
                'name' => (string) ($row['beneficiary_name'] ?? 'Unnamed beneficiary'),
                'email' => (string) ($row['beneficiary_email'] ?? ''),
                'photo' => (string) ($row['beneficiary_photo'] ?? ''),
                'contactNumber' => (string) ($row['contact_number'] ?? ''),
                'address' => (string) ($row['address_line'] ?? ''),
                'businessName' => (string) ($row['business_name'] ?: 'No business name'),
                'birthdate' => (string) ($row['birthdate'] ?? ''),
                'age' => $row['age'] !== null ? (int) $row['age'] : null,
                'ageGroup' => self::resolveAgeGroupFromRow($row),
                'gender' => (string) ($row['gender'] ?: 'Not Set'),
                'is4ps' => ((int) ($row['is_4ps'] ?? 0)) === 1 ? 'Yes' : 'No',
                'educationalAttainment' => (string) ($row['educational_attainment'] ?: ''),
                'barangay' => (string) ($row['barangay_name'] ?: 'Unassigned'),
                'assignedPdo' => (string) ($row['assigned_pdo_name'] ?: 'Unassigned'),
                'serviceType' => (string) (($this->normalizeLivelihoodCategory((string) (($row['livelihood_category'] ?: $row['livelihood_type']) ?: '')) ?: ($row['sector'] ?: ($row['livelihood_type'] ?: ''))) ?: ''),
                'livelihoodCategory' => (string) ($this->normalizeLivelihoodCategory((string) (($row['livelihood_category'] ?: $row['livelihood_type']) ?: '')) ?: ''),
                'businessType' => (string) ($row['livelihood_type'] ?: ''),
                'sector' => (string) ($row['sector'] ?: ''),
                'sectorOtherSpecify' => (string) ($row['sector_other_specify'] ?: ''),
                'batchNo' => (string) ($row['batch_no'] ?: ''),
                'programStatus' => (string) ($row['beneficiary_status'] ?? 'active'),
                'latestApplicationStatus' => strtolower(trim(str_replace('_', ' ', (string) ($row['latest_application_status'] ?? '')))),
                'replacementForBeneficiaryId' => $row['replacement_for_beneficiary_profile_id'] !== null ? (int) $row['replacement_for_beneficiary_profile_id'] : null,
                'replacementForName' => (string) ($row['replacement_for_name'] ?: ''),
                'replacementForStatus' => (string) ($row['replacement_for_status'] ?: ''),
                'repaymentSuccessorBeneficiaryProfileId' => $row['repayment_successor_beneficiary_profile_id'] !== null ? (int) $row['repayment_successor_beneficiary_profile_id'] : null,
                'repaymentSuccessorName' => (string) ($row['repayment_successor_name'] ?: ''),
                'coMakerRegistration' => $row['co_maker_registration_id'] !== null ? [
                    'id' => (int) $row['co_maker_registration_id'],
                    'userId' => (int) ($row['co_maker_user_id'] ?? 0),
                    'beneficiaryProfileId' => (int) ($row['co_maker_beneficiary_profile_id'] ?? 0),
                    'name' => (string) ($row['co_maker_name'] ?? ''),
                    'email' => (string) ($row['co_maker_email'] ?? ''),
                    'contactNumber' => (string) ($row['co_maker_contact_number'] ?? ''),
                    'relationshipToPrimaryBeneficiary' => (string) ($row['co_maker_relationship'] ?? ''),
                    'registrationStatus' => (string) ($row['co_maker_registration_status'] ?? 'inactive'),
                    'validId' => [
                        'path' => (string) ($row['co_maker_valid_id_path'] ?? ''),
                        'name' => (string) ($row['co_maker_valid_id_name'] ?? ''),
                        'url' => $this->publicUploadUrl((string) ($row['co_maker_valid_id_path'] ?? '')),
                    ],
                    'relationshipDocument' => [
                        'path' => (string) ($row['co_maker_relationship_document_path'] ?? ''),
                        'name' => (string) ($row['co_maker_relationship_document_name'] ?? ''),
                        'url' => $this->publicUploadUrl((string) ($row['co_maker_relationship_document_path'] ?? '')),
                    ],
                ] : null,
                'approvalDate' => (string) ($row['approval_date'] ?? ''),
                'approvedAt' => (string) ($row['approved_at'] ?? ''),
                'firstRepaymentDueDate' => (new RepaymentScheduleService())->firstDueDateForBeneficiaryContext(
                    (string) ($row['approved_at'] ?? ''),
                    (string) ($row['approval_date'] ?? '')
                ),
                'lastActivity' => (string) ($row['updated_at'] ?? ''),
            ];
        }, $rows);
    }

    private function validateProfileInput(array $input, bool $requireComplete): array
    {
        $required = [
            'birthdate',
            'gender',
            'contactNumber',
            'address',
            'barangay',
            'is4ps',
            'educationalAttainment',
            'sector',
            'livelihood',
            'businessName',
        ];
        $errors = [];

        foreach ($required as $field) {
            if ($requireComplete && trim((string) ($input[$field] ?? '')) === '') {
                $errors[$field] = 'This field is required.';
            }
        }

        if ($requireComplete && strcasecmp(trim((string) ($input['sector'] ?? '')), 'Other') === 0 && trim((string) ($input['sectorOtherSpecify'] ?? '')) === '') {
            $errors['sectorOtherSpecify'] = 'This field is required.';
        }

        if (!empty($input['birthdate'])) {
            $birthdate = strtotime((string) $input['birthdate']);
            if ($birthdate === false) {
                $errors['birthdate'] = 'Birthdate is invalid.';
            }
        }

        $contactNumber = preg_replace('/\D+/', '', (string) ($input['contactNumber'] ?? ''));
        if ($requireComplete && ($contactNumber === '' || strlen($contactNumber) < 10 || strlen($contactNumber) > 13)) {
            $errors['contactNumber'] = 'Enter a valid contact number.';
        }

        if ($requireComplete) {
            $attainmentError = $this->validateEducationalAttainment((string) ($input['educationalAttainment'] ?? ''));
            if ($attainmentError !== null) {
                $errors['educationalAttainment'] = $attainmentError;
            }
        }

        return $errors;
    }

    private function validateBeneficiaryProfileInput(array $input): array
    {
        $required = [
            'fullName',
            'email',
            'birthdate',
            'gender',
            'contactNumber',
            'address',
            'barangay',
            'is4ps',
            'educationalAttainment',
            'sector',
            'batchNo',
            'livelihood',
            'businessName',
        ];
        $errors = [];

        foreach ($required as $field) {
            if (trim((string) ($input[$field] ?? '')) === '') {
                $errors[$field] = 'This field is required.';
            }
        }

        $email = trim((string) ($input['email'] ?? ''));
        if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $errors['email'] = 'Enter a valid email address.';
        }

        if (!empty($input['birthdate'])) {
            $birthdate = strtotime((string) $input['birthdate']);
            if ($birthdate === false) {
                $errors['birthdate'] = 'Birthdate is invalid.';
            }
        }

        $contactNumber = preg_replace('/\D+/', '', (string) ($input['contactNumber'] ?? ''));
        if ($contactNumber === '' || strlen($contactNumber) < 10 || strlen($contactNumber) > 13) {
            $errors['contactNumber'] = 'Enter a valid contact number.';
        }

        $attainmentError = $this->validateEducationalAttainment((string) ($input['educationalAttainment'] ?? ''));
        if ($attainmentError !== null) {
            $errors['educationalAttainment'] = $attainmentError;
        }

        if (strcasecmp(trim((string) ($input['sector'] ?? '')), 'Other') === 0 && trim((string) ($input['sectorOtherSpecify'] ?? '')) === '') {
            $errors['sectorOtherSpecify'] = 'This field is required.';
        }

        return $errors;
    }

    private function normalizeEducationalAttainment(string $value): ?string
    {
        $value = trim($value);
        if ($value === '') {
            return null;
        }

        $allowed = [
            'Kindergarten',
            'Elementary',
            'JHS',
            'SHS Grad',
            'Tertiary',
        ];

        foreach ($allowed as $option) {
            if (strcasecmp($value, $option) === 0) {
                return $option;
            }
        }

        return $value;
    }

    private function validateEducationalAttainment(string $value): ?string
    {
        $normalized = $this->normalizeEducationalAttainment($value);
        if ($normalized === null) {
            return 'This field is required.';
        }

        $allowed = ['Kindergarten', 'Elementary', 'JHS', 'SHS Grad', 'Tertiary'];
        return in_array($normalized, $allowed, true)
            ? null
            : 'Select a valid educational attainment.';
    }

    private function validateRequirementSubmission(array $documents, array $existingRequirements): array
    {
        $errors = [];

        foreach (array_keys(self::REQUIREMENT_LABELS) as $key) {
            $hasNewUpload = isset($documents[$key]);
            $hasExistingUpload = !empty($existingRequirements[$key]['file']['path']);

            if (!$hasNewUpload && !$hasExistingUpload) {
                $errors[$key] = self::REQUIREMENT_LABELS[$key] . ' is required.';
            }
        }

        return $errors;
    }

    private function fetchUser(int $userId): array
    {
        $statement = db()->prepare(
            'SELECT users.id, users.full_name, users.email, roles.name AS role
             FROM users
             INNER JOIN roles ON roles.id = users.role_id
             WHERE users.id = :id
             LIMIT 1'
        );
        $statement->execute(['id' => $userId]);
        $user = $statement->fetch();
        if (!is_array($user)) {
            throw new \RuntimeException('User not found.');
        }

        $user['photo'] = $this->fetchUserProfilePhotoDataUrl($userId);

        return $user;
    }

    private function fetchApplicantProfile(int $userId): ?array
    {
        $statement = db()->prepare(
            'SELECT applicant_profiles.*,
                    barangays.name AS barangay_name,
                    scoped_users.full_name AS assigned_pdo_name,
                    scoped_users.email AS assigned_pdo_email
             FROM applicant_profiles
             LEFT JOIN barangays ON barangays.id = applicant_profiles.barangay_id
             LEFT JOIN staff_barangay_assignments AS scope_assignments
                    ON scope_assignments.barangay_id = applicant_profiles.barangay_id
                   AND scope_assignments.ended_at IS NULL
             LEFT JOIN staff_profiles AS scoped_staff
                    ON scoped_staff.id = scope_assignments.staff_profile_id
                   AND scoped_staff.status = "active"
             LEFT JOIN users AS scoped_users
                    ON scoped_users.id = scoped_staff.user_id
                   AND scoped_users.is_active = 1
                   AND scoped_users.is_disabled = 0
             WHERE applicant_profiles.user_id = :user_id
             ORDER BY scope_assignments.assigned_at ASC, scope_assignments.id ASC
             LIMIT 1'
        );
        $statement->execute(['user_id' => $userId]);
        $profile = $statement->fetch();
        if (!is_array($profile)) {
            return null;
        }

          return [
              'id' => (int) $profile['id'],
              'birthdate' => $profile['birthdate'],
              'age' => $profile['age'],
              'gender' => $profile['gender'],
            'contactNumber' => $profile['contact_number'],
            'address' => $profile['address_line'],
            'barangay' => $profile['barangay_name'],
            'is4ps' => ((int) $profile['is_4ps']) === 1 ? 'Yes' : 'No',
              'householdSize' => $profile['household_size'],
              'educationalAttainment' => $profile['educational_attainment'] ?? '',
              'sector' => $profile['sector'],
              'sectorOtherSpecify' => $profile['sector_other_specify'] ?? '',
              'livelihoodCategory' => $profile['livelihood_category'] ?? '',
              'livelihood' => $profile['livelihood_type'],
              'businessName' => $profile['business_name'],
              'batchNo' => $profile['batch_no'] ?? '',
              'status' => $profile['profile_status'],
              'assignedPdo' => [
                  'name' => $profile['assigned_pdo_name'] ?? null,
                  'email' => $profile['assigned_pdo_email'] ?? null,
              ],
          ];
      }

    private function fetchLatestApplication(int $profileId): ?array
    {
        $statement = db()->prepare(
            'SELECT applications.*,
                    COALESCE(assigned_users.full_name, scoped_users.full_name) AS assigned_pdo_name,
                    COALESCE(assigned_users.email, scoped_users.email) AS assigned_pdo_email
             FROM applications
             INNER JOIN applicant_profiles ON applicant_profiles.id = applications.applicant_profile_id
             LEFT JOIN staff_profiles AS assigned_staff ON assigned_staff.id = applications.assigned_staff_profile_id
             LEFT JOIN users AS assigned_users ON assigned_users.id = assigned_staff.user_id
             LEFT JOIN staff_barangay_assignments AS scope_assignments
                    ON scope_assignments.barangay_id = applicant_profiles.barangay_id
                   AND scope_assignments.ended_at IS NULL
             LEFT JOIN staff_profiles AS scoped_staff
                    ON scoped_staff.id = scope_assignments.staff_profile_id
                   AND scoped_staff.status = "active"
             LEFT JOIN users AS scoped_users
                    ON scoped_users.id = scoped_staff.user_id
                   AND scoped_users.is_active = 1
                   AND scoped_users.is_disabled = 0
             WHERE applications.applicant_profile_id = :profile_id
             ORDER BY applications.id DESC, scope_assignments.assigned_at ASC, scope_assignments.id ASC
             LIMIT 1'
        );
        $statement->execute(['profile_id' => $profileId]);
        $application = $statement->fetch();
        if (!is_array($application)) {
            return null;
        }

        return [
            'id' => (int) $application['id'],
            'status' => $application['status'],
            'submittedAt' => $application['submitted_at'],
            'reviewedAt' => $application['reviewed_at'],
            'updatedAt' => $application['updated_at'],
            'assignedPdo' => [
                'name' => $application['assigned_pdo_name'] ?? null,
                'email' => $application['assigned_pdo_email'] ?? null,
            ],
        ];
    }

    private function fetchLatestApplicationForBeneficiary(int $profileId): ?array
    {
        $statement = db()->prepare(
            'SELECT applications.*,
                    assigned_users.full_name AS assigned_pdo_name,
                    assigned_users.email AS assigned_pdo_email
             FROM applications
             LEFT JOIN staff_profiles AS assigned_staff ON assigned_staff.id = applications.assigned_staff_profile_id
             LEFT JOIN users AS assigned_users ON assigned_users.id = assigned_staff.user_id
             WHERE applications.applicant_profile_id = :profile_id
             ORDER BY applications.id DESC
             LIMIT 1'
        );
        $statement->execute(['profile_id' => $profileId]);
        $application = $statement->fetch();
        if (!is_array($application)) {
            return null;
        }

        return [
            'id' => (int) $application['id'],
            'status' => $application['status'],
            'submittedAt' => $application['submitted_at'],
            'reviewedAt' => $application['reviewed_at'],
            'updatedAt' => $application['updated_at'],
            'assignedPdo' => [
                'name' => $application['assigned_pdo_name'] ?? null,
                'email' => $application['assigned_pdo_email'] ?? null,
            ],
        ];
    }

    private function fetchBeneficiaryProfileState(int $userId): ?array
    {
        $statement = db()->prepare(
            'SELECT beneficiary_profiles.id,
                    beneficiary_profiles.beneficiary_status,
                    beneficiary_profiles.replacement_for_beneficiary_profile_id,
                    beneficiary_profiles.approval_date,
                    beneficiary_profiles.approved_at,
                    replacement_profiles.approval_date AS repayment_source_approval_date,
                    replacement_profiles.approved_at AS repayment_source_approved_at,
                    assigned_users.full_name AS assigned_pdo_name,
                    assigned_users.email AS assigned_pdo_email
             FROM beneficiary_profiles
             LEFT JOIN beneficiary_profiles AS replacement_profiles
                    ON replacement_profiles.id = beneficiary_profiles.replacement_for_beneficiary_profile_id
             LEFT JOIN staff_profiles AS assigned_staff ON assigned_staff.id = beneficiary_profiles.assigned_staff_profile_id
             LEFT JOIN users AS assigned_users ON assigned_users.id = assigned_staff.user_id
             WHERE beneficiary_profiles.user_id = :user_id
             LIMIT 1'
        );
        $statement->execute(['user_id' => $userId]);
        $row = $statement->fetch(PDO::FETCH_ASSOC);
        if (!is_array($row)) {
            return null;
        }

        return [
            'id' => (int) $row['id'],
            'status' => (string) ($row['beneficiary_status'] ?? ''),
            'approvalDate' => $row['approval_date'] ?? null,
            'approvedAt' => $row['approved_at'] ?? null,
            'repaymentSourceApprovalDate' => $row['repayment_source_approval_date'] ?? null,
            'repaymentSourceApprovedAt' => $row['repayment_source_approved_at'] ?? null,
            'replacementForBeneficiaryId' => isset($row['replacement_for_beneficiary_profile_id']) && $row['replacement_for_beneficiary_profile_id'] !== null
                ? (int) $row['replacement_for_beneficiary_profile_id']
                : null,
            'assignedPdo' => [
                'name' => $row['assigned_pdo_name'] ?? null,
                'email' => $row['assigned_pdo_email'] ?? null,
            ],
        ];
    }

    private function fetchBeneficiaryFeedback(int $beneficiaryProfileId): array
    {
        $this->ensureBeneficiaryFeedbackTable();

        $statement = db()->prepare(
            'SELECT beneficiary_feedback.id,
                    beneficiary_feedback.message,
                    beneficiary_feedback.created_at
             FROM beneficiary_feedback
             WHERE beneficiary_feedback.beneficiary_profile_id = :beneficiary_profile_id
             ORDER BY beneficiary_feedback.created_at ASC, beneficiary_feedback.id ASC'
        );
        $statement->execute(['beneficiary_profile_id' => $beneficiaryProfileId]);
        $rows = $statement->fetchAll(PDO::FETCH_ASSOC) ?: [];

        return array_map(
            static fn (array $row): array => [
                'id' => (int) $row['id'],
                'message' => (string) ($row['message'] ?? ''),
                'timestamp' => $row['created_at'] ?? null,
            ],
            $rows
        );
    }

    private function fetchUserProfilePhotoDataUrl(int $userId): ?string
    {
        $this->ensureUserProfilePhotosTable();

        $statement = db()->prepare(
            'SELECT image_data
             FROM user_profile_photos
             WHERE user_id = :user_id
             LIMIT 1'
        );
        $statement->execute(['user_id' => $userId]);
        $value = $statement->fetchColumn();

        return is_string($value) && trim($value) !== '' ? $value : null;
    }

    private function fetchRequirementFiles(int $applicationId): array
    {
        $reviewerRemarksSelect = $this->hasInitialRequirementReviewColumns()
            ? 'initial_requirement_files.reviewer_remarks, initial_requirement_files.reviewed_at, initial_requirement_files.reviewed_by_user_id,'
            : 'NULL AS reviewer_remarks, NULL AS reviewed_at, NULL AS reviewed_by_user_id,';
        $statement = db()->prepare(
            'SELECT initial_requirement_types.code, initial_requirement_types.label, initial_requirement_types.is_required,
                    initial_requirement_files.file_path, initial_requirement_files.original_name, initial_requirement_files.mime_type,
                    initial_requirement_files.file_size, initial_requirement_files.review_status, '
                    . $reviewerRemarksSelect . '
                    initial_requirement_files.updated_at
             FROM initial_requirement_files
             INNER JOIN initial_requirement_types ON initial_requirement_types.id = initial_requirement_files.requirement_type_id
             WHERE initial_requirement_files.application_id = :application_id
             ORDER BY initial_requirement_types.label ASC'
        );
        $statement->execute(['application_id' => $applicationId]);
        $rows = $statement->fetchAll();

        $mapped = [];
        foreach ($rows as $row) {
            $key = $this->codeToFrontendKey((string) $row['code']);
            $mapped[$key] = [
                'key' => $key,
                'label' => $row['label'],
                'typeLabel' => 'Upload Requirement',
                'isRequired' => ((int) ($row['is_required'] ?? 1)) === 1,
                'status' => $row['review_status'],
                'reviewerRemarks' => $row['reviewer_remarks'] ?? null,
                'reviewedAt' => $row['reviewed_at'] ?? null,
                'reviewedByUserId' => isset($row['reviewed_by_user_id']) && $row['reviewed_by_user_id'] !== null
                    ? (int) $row['reviewed_by_user_id']
                    : null,
                'canReplace' => $this->canApplicantReplaceRequirementRecord([
                    'status' => $row['review_status'],
                    'reviewedAt' => $row['reviewed_at'] ?? null,
                    'file' => ['path' => $row['file_path'] ?? null],
                ]),
                'file' => [
                    'name' => $row['original_name'],
                    'type' => $row['mime_type'],
                    'size' => (int) $row['file_size'],
                    'path' => $row['file_path'],
                    'url' => $this->publicUploadUrl((string) $row['file_path']),
                ],
                'updatedAt' => $row['updated_at'],
            ];
        }

        foreach (self::REQUIREMENT_LABELS as $frontendKey => $label) {
            if (!isset($mapped[$frontendKey])) {
                $mapped[$frontendKey] = [
                    'key' => $frontendKey,
                    'label' => $label,
                    'typeLabel' => 'Upload Requirement',
                    'isRequired' => true,
                    'status' => 'missing',
                    'reviewerRemarks' => null,
                    'reviewedAt' => null,
                    'reviewedByUserId' => null,
                    'canReplace' => true,
                    'file' => null,
                    'updatedAt' => null,
                ];
            }
        }

        return $mapped;
    }

    private function resolveBarangayId(string $barangayName): int
    {
        $pdo = db();
        $statement = $pdo->prepare('SELECT id FROM barangays WHERE name = :name LIMIT 1');
        $statement->execute(['name' => $barangayName]);
        $barangayId = $statement->fetchColumn();
        if ($barangayId !== false) {
            return (int) $barangayId;
        }

        $insert = $pdo->prepare('INSERT INTO barangays (name) VALUES (:name)');
        $insert->execute(['name' => $barangayName]);
        return (int) $pdo->lastInsertId();
    }

    private function findBarangayIdByName(string $barangayName): ?int
    {
        $statement = db()->prepare('SELECT id FROM barangays WHERE name = :name LIMIT 1');
        $statement->execute(['name' => $barangayName]);
        $barangayId = $statement->fetchColumn();

        return $barangayId !== false ? (int) $barangayId : null;
    }

      private function upsertApplicantProfile(int $userId, int $barangayId, array $input, bool $submit): int
      {
          $pdo = db();
          $existing = $this->fetchApplicantProfile($userId);
          $profileStatus = $submit ? 'submitted' : 'draft';
          $age = trim((string) ($input['age'] ?? ''));
          $age = $age !== '' ? (int) $age : null;
          $supportsEducationalAttainment = in_array('educational_attainment', $this->applicantProfileColumns(), true);
          $supportsBatchNo = in_array('batch_no', $this->applicantProfileColumns(), true);
          $supportsLivelihoodCategory = in_array('livelihood_category', $this->applicantProfileColumns(), true);
          $supportsSectorOtherSpecify = in_array('sector_other_specify', $this->applicantProfileColumns(), true);
          $hasBatchNoInput = array_key_exists('batchNo', $input);
          $batchNo = trim((string) ($input['batchNo'] ?? ''));
          $sector = trim((string) ($input['sector'] ?? ''));
          $sectorOtherSpecify = strcasecmp($sector, 'Other') === 0
              ? $this->normalizeOptionalString($input['sectorOtherSpecify'] ?? null)
              : null;
          $hasLivelihoodCategoryInput = array_key_exists('livelihoodCategory', $input);
          $livelihoodCategory = $hasLivelihoodCategoryInput
              ? $this->normalizeLivelihoodCategory((string) ($input['livelihoodCategory'] ?? ''))
              : null;
          $livelihood = $this->normalizeOptionalString($input['livelihood'] ?? null);

          if ($existing !== null) {
              $setColumns = [
                  'barangay_id = :barangay_id',
                  'contact_number = :contact_number',
                  'business_name = :business_name',
                  'address_line = :address_line',
                  'birthdate = :birthdate',
                  'age = :age',
                  'gender = :gender',
                  'is_4ps = :is_4ps',
              ];
              if ($supportsEducationalAttainment) {
                  $setColumns[] = 'educational_attainment = :educational_attainment';
              }
              if ($supportsBatchNo && $hasBatchNoInput) {
                  $setColumns[] = 'batch_no = :batch_no';
              }
              if ($supportsLivelihoodCategory && $hasLivelihoodCategoryInput) {
                  $setColumns[] = 'livelihood_category = :livelihood_category';
              }
              if ($supportsSectorOtherSpecify) {
                  $setColumns[] = 'sector_other_specify = :sector_other_specify';
              }
              $setColumns[] = 'sector = :sector';
              $setColumns[] = 'livelihood_type = :livelihood_type';
              $setColumns[] = 'profile_status = :profile_status';
              $setColumns[] = 'completion_submitted_at = :completion_submitted_at';
              $setColumns[] = 'updated_at = NOW()';
              $statement = $pdo->prepare(
                  'UPDATE applicant_profiles
                   SET ' . implode(', ', $setColumns) . '
                   WHERE user_id = :user_id'
              );
              $parameters = [
                  'barangay_id' => $barangayId,
                'contact_number' => $input['contactNumber'] ?: null,
                'business_name' => $input['businessName'],
                'address_line' => $input['address'],
                'birthdate' => $input['birthdate'] ?: null,
                  'age' => $age,
                  'gender' => $input['gender'] ?: null,
                  'is_4ps' => strtolower((string) $input['is4ps']) === 'yes' ? 1 : 0,
                  'sector' => $input['sector'] ?: null,
                  'livelihood_type' => $livelihood,
                  'profile_status' => $profileStatus,
                  'completion_submitted_at' => $submit ? date('Y-m-d H:i:s') : null,
                  'user_id' => $userId,
              ];
              if ($supportsEducationalAttainment) {
                  $parameters['educational_attainment'] = $this->normalizeEducationalAttainment((string) ($input['educationalAttainment'] ?? ''));
              }
              if ($supportsBatchNo && $hasBatchNoInput) {
                  $parameters['batch_no'] = $batchNo !== '' ? $batchNo : null;
              }
              if ($supportsLivelihoodCategory && $hasLivelihoodCategoryInput) {
                  $parameters['livelihood_category'] = $livelihoodCategory;
              }
              if ($supportsSectorOtherSpecify) {
                  $parameters['sector_other_specify'] = $sectorOtherSpecify;
              }
              $statement->execute($parameters);

              return (int) $existing['id'];
          }

          $insertColumns = 'user_id, barangay_id, contact_number, business_name, address_line, birthdate, age, gender, is_4ps';
          $insertValues = ':user_id, :barangay_id, :contact_number, :business_name, :address_line, :birthdate, :age, :gender, :is_4ps';
          $insertParameters = [
              'user_id' => $userId,
              'barangay_id' => $barangayId,
            'contact_number' => $input['contactNumber'] ?: null,
            'business_name' => $input['businessName'],
            'address_line' => $input['address'],
            'birthdate' => $input['birthdate'] ?: null,
            'age' => $age,
            'gender' => $input['gender'] ?: null,
            'is_4ps' => strtolower((string) $input['is4ps']) === 'yes' ? 1 : 0,
        ];

          if ($supportsEducationalAttainment) {
              $insertColumns .= ', educational_attainment';
              $insertValues .= ', :educational_attainment';
              $insertParameters['educational_attainment'] = $this->normalizeEducationalAttainment((string) ($input['educationalAttainment'] ?? ''));
          }

          if ($supportsBatchNo && $hasBatchNoInput) {
              $insertColumns .= ', batch_no';
              $insertValues .= ', :batch_no';
              $insertParameters['batch_no'] = $batchNo !== '' ? $batchNo : null;
          }

          if ($supportsLivelihoodCategory && $hasLivelihoodCategoryInput) {
              $insertColumns .= ', livelihood_category';
              $insertValues .= ', :livelihood_category';
              $insertParameters['livelihood_category'] = $livelihoodCategory;
          }

          if ($supportsSectorOtherSpecify) {
              $insertColumns .= ', sector_other_specify';
              $insertValues .= ', :sector_other_specify';
              $insertParameters['sector_other_specify'] = $sectorOtherSpecify;
          }

          $insertColumns .= ', sector, livelihood_type, profile_status, completion_submitted_at';
          $insertValues .= ', :sector, :livelihood_type, :profile_status, :completion_submitted_at';
          $insertParameters['sector'] = $input['sector'] ?: null;
          $insertParameters['livelihood_type'] = $livelihood;
          $insertParameters['profile_status'] = $profileStatus;
          $insertParameters['completion_submitted_at'] = $submit ? date('Y-m-d H:i:s') : null;

        $statement = $pdo->prepare(
            'INSERT INTO applicant_profiles
             (' . $insertColumns . ')
             VALUES (' . $insertValues . ')'
        );
        $statement->execute($insertParameters);

        return (int) $pdo->lastInsertId();
    }

      private function updateApplicantProfileRecord(int $userId, int $barangayId, array $input): void
      {
          $existing = $this->fetchApplicantProfile($userId);
          $age = trim((string) ($input['age'] ?? ''));
          $age = $age !== '' ? (int) $age : null;
          $supportsEducationalAttainment = in_array('educational_attainment', $this->applicantProfileColumns(), true);
          $supportsBatchNo = in_array('batch_no', $this->applicantProfileColumns(), true);
          $supportsLivelihoodCategory = in_array('livelihood_category', $this->applicantProfileColumns(), true);
          $supportsSectorOtherSpecify = in_array('sector_other_specify', $this->applicantProfileColumns(), true);
          $hasBatchNoInput = array_key_exists('batchNo', $input);
          $batchNo = trim((string) ($input['batchNo'] ?? ''));
          $sector = trim((string) ($input['sector'] ?? ''));
          $sectorOtherSpecify = strcasecmp($sector, 'Other') === 0
              ? $this->normalizeOptionalString($input['sectorOtherSpecify'] ?? null)
              : null;
          $hasLivelihoodCategoryInput = array_key_exists('livelihoodCategory', $input);
          $livelihoodCategory = $hasLivelihoodCategoryInput
              ? $this->normalizeLivelihoodCategory((string) ($input['livelihoodCategory'] ?? ''))
              : null;
          $livelihood = $this->normalizeOptionalString($input['livelihood'] ?? null);

          if ($existing !== null) {
              db()->prepare(
                  'UPDATE applicant_profiles
                   SET ' . implode(', ', array_filter([
                       'barangay_id = :barangay_id',
                       'contact_number = :contact_number',
                       'business_name = :business_name',
                       'address_line = :address_line',
                       'birthdate = :birthdate',
                       'age = :age',
                       'gender = :gender',
                       'is_4ps = :is_4ps',
                       $supportsEducationalAttainment ? 'educational_attainment = :educational_attainment' : null,
                       ($supportsBatchNo && $hasBatchNoInput) ? 'batch_no = :batch_no' : null,
                       ($supportsLivelihoodCategory && $hasLivelihoodCategoryInput) ? 'livelihood_category = :livelihood_category' : null,
                       $supportsSectorOtherSpecify ? 'sector_other_specify = :sector_other_specify' : null,
                       'sector = :sector',
                       'livelihood_type = :livelihood_type',
                       'updated_at = NOW()',
                   ])) . '
                   WHERE user_id = :user_id'
              )->execute(array_merge([
                  'barangay_id' => $barangayId,
                  'contact_number' => trim((string) ($input['contactNumber'] ?? '')) ?: null,
                'business_name' => trim((string) ($input['businessName'] ?? '')),
                'address_line' => trim((string) ($input['address'] ?? '')),
                'birthdate' => trim((string) ($input['birthdate'] ?? '')) ?: null,
                  'age' => $age,
                  'gender' => trim((string) ($input['gender'] ?? '')) ?: null,
                  'is_4ps' => strtolower(trim((string) ($input['is4ps'] ?? ''))) === 'yes' ? 1 : 0,
                  'sector' => $sector ?: null,
                  'livelihood_type' => $livelihood,
                  'user_id' => $userId,
              ], $supportsEducationalAttainment ? [
                  'educational_attainment' => $this->normalizeEducationalAttainment((string) ($input['educationalAttainment'] ?? '')),
              ] : [], ($supportsBatchNo && $hasBatchNoInput) ? [
                  'batch_no' => $batchNo !== '' ? $batchNo : null,
              ] : [], ($supportsLivelihoodCategory && $hasLivelihoodCategoryInput) ? [
                  'livelihood_category' => $livelihoodCategory,
              ] : [], $supportsSectorOtherSpecify ? [
                  'sector_other_specify' => $sectorOtherSpecify,
              ] : []));
              return;
          }

        $this->upsertApplicantProfile($userId, $barangayId, $input, false);
    }

    private function updateUserIdentity(int $userId, array $input): void
    {
        db()->prepare(
            'UPDATE users
             SET full_name = :full_name,
                 email = :email,
                 updated_at = NOW()
             WHERE id = :id'
        )->execute([
            'full_name' => $input['fullName'],
            'email' => $input['email'],
            'id' => $userId,
        ]);
    }

    private function emailExistsForOtherUser(string $email, int $userId): bool
    {
        $statement = db()->prepare('SELECT id FROM users WHERE email = :email AND id <> :id LIMIT 1');
        $statement->execute([
            'email' => $email,
            'id' => $userId,
        ]);

        return $statement->fetchColumn() !== false;
    }

    private function upsertApplication(int $profileId, int $barangayId, bool $submit, ?array $currentApplication = null, array $existingRequirements = []): int
    {
        $pdo = db();
        $current = $currentApplication ?? $this->fetchLatestApplication($profileId);
        $assignedStaffProfileId = $this->resolveAssignedProjectOfficerProfileId($barangayId);
        $statusData = $this->resolveApplicantSubmissionState($current, $existingRequirements, $submit);
        $status = $statusData['status'];
        $submittedAt = $statusData['submittedAt'];

        if ($current !== null) {
            $statement = $pdo->prepare(
                'UPDATE applications
                 SET status = :status, submitted_at = :submitted_at, assigned_staff_profile_id = :assigned_staff_profile_id, updated_at = NOW()
                 WHERE id = :id'
            );
            $statement->execute([
                'status' => $status,
                'submitted_at' => $submittedAt,
                'assigned_staff_profile_id' => $assignedStaffProfileId,
                'id' => $current['id'],
            ]);

            return (int) $current['id'];
        }

        $statement = $pdo->prepare(
            'INSERT INTO applications (applicant_profile_id, status, submitted_at, assigned_staff_profile_id)
             VALUES (:applicant_profile_id, :status, :submitted_at, :assigned_staff_profile_id)'
        );
        $statement->execute([
            'applicant_profile_id' => $profileId,
            'status' => $status,
            'submitted_at' => $submittedAt,
            'assigned_staff_profile_id' => $assignedStaffProfileId,
        ]);

        return (int) $pdo->lastInsertId();
    }

    private function resolveApplicantSubmissionState(?array $application, array $requirements, bool $submit): array
    {
        if ($application === null) {
            return [
                'status' => $submit ? APPLICATION_STATUS_SUBMITTED : APPLICATION_STATUS_DRAFT,
                'submittedAt' => $submit ? date('Y-m-d H:i:s') : null,
            ];
        }

        $currentStatus = (string) ($application['status'] ?? '');
        $normalized = $this->normalizeStatusLabel($currentStatus);
        $alreadySubmitted = !empty($application['submitted_at']) || $normalized === $this->normalizeStatusLabel(APPLICATION_STATUS_SUBMITTED);
        $checkedByStaff = $this->hasApplicantReviewStarted($application, $requirements);

        if ($submit) {
            return [
                'status' => APPLICATION_STATUS_SUBMITTED,
                'submittedAt' => $alreadySubmitted ? ($application['submitted_at'] ?: date('Y-m-d H:i:s')) : date('Y-m-d H:i:s'),
            ];
        }

        if (!$checkedByStaff && $alreadySubmitted) {
            return [
                'status' => APPLICATION_STATUS_SUBMITTED,
                'submittedAt' => $application['submitted_at'] ?: date('Y-m-d H:i:s'),
            ];
        }

        return [
            'status' => APPLICATION_STATUS_DRAFT,
            'submittedAt' => null,
        ];
    }

    private function ensureRequirementTypes(): void
    {
        $types = [
            'valid_id' => 'Valid ID',
            'health_certificate' => 'Health Certificate',
            'cedula' => 'Cedula',
            'barangay_endorsement_letter' => 'Barangay Clearance',
        ];

        $statement = db()->prepare(
            'INSERT INTO initial_requirement_types (code, label, is_required)
             VALUES (:code, :label, 1)
             ON DUPLICATE KEY UPDATE label = VALUES(label), is_required = VALUES(is_required)'
        );

        foreach ($types as $code => $label) {
            $statement->execute(['code' => $code, 'label' => $label]);
        }
    }

    private function replaceRequirementFile(int $applicationId, string $key, array $meta): void
    {
        $code = $this->frontendKeyToCode($key);
        $typeStatement = db()->prepare('SELECT id FROM initial_requirement_types WHERE code = :code LIMIT 1');
        $typeStatement->execute(['code' => $code]);
        $requirementTypeId = (int) $typeStatement->fetchColumn();

        $delete = db()->prepare(
            'DELETE FROM initial_requirement_files WHERE application_id = :application_id AND requirement_type_id = :requirement_type_id'
        );
        $delete->execute([
            'application_id' => $applicationId,
            'requirement_type_id' => $requirementTypeId,
        ]);

        $insert = db()->prepare(
            'INSERT INTO initial_requirement_files
             (application_id, requirement_type_id, file_path, original_name, mime_type, file_size, review_status)
             VALUES (:application_id, :requirement_type_id, :file_path, :original_name, :mime_type, :file_size, :review_status)'
        );
        $insert->execute([
            'application_id' => $applicationId,
            'requirement_type_id' => $requirementTypeId,
            'file_path' => $meta['file_path'],
            'original_name' => $meta['original_name'],
            'mime_type' => $meta['mime_type'],
            'file_size' => $meta['file_size'],
            'review_status' => 'pending',
        ]);
    }

    private function fetchFormRequirementsForApplication(int $applicationId, array $actor): array
    {
        $applicantProfileId = $this->findApplicantProfileIdForApplication($applicationId);
        if ($applicantProfileId <= 0) {
            return [];
        }

        $gate = $this->buildApplicationFormsGate($applicationId, $applicantProfileId, $this->fetchRequirementFiles($applicationId));
        if (!($gate['unlocked'] ?? false)) {
            return [];
        }

        $beneficiaryProfileId = $this->ensureApplicationFormTasks($applicantProfileId, (int) ($actor['id'] ?? 0));
        if ($beneficiaryProfileId === null) {
            return [];
        }

        $params = ['beneficiary_profile_id' => $beneficiaryProfileId];
        $scopeJoin = '';
        $role = strtolower((string) ($actor['role'] ?? ''));
        if (str_contains($role, 'project')) {
            $staffProfileId = $this->findStaffProfileIdForUser((int) ($actor['id'] ?? 0));
            if ($staffProfileId === null) {
                return [];
            }
            $scopeJoin = '
                INNER JOIN applicant_profiles ON applicant_profiles.id = beneficiary_profiles.applicant_profile_id
                INNER JOIN staff_barangay_assignments AS scope_assignments
                    ON scope_assignments.barangay_id = applicant_profiles.barangay_id
                   AND scope_assignments.staff_profile_id = :scope_staff_profile_id
                   AND scope_assignments.ended_at IS NULL';
            $params['scope_staff_profile_id'] = $staffProfileId;
        }

        $statement = db()->prepare(
            'SELECT
                post_approval_tasks.id,
                post_approval_tasks.status,
                post_approval_tasks.form_payload,
                post_approval_tasks.reviewer_remarks,
                post_approval_tasks.applicant_started_at,
                post_approval_tasks.applicant_submitted_at,
                post_approval_tasks.reviewed_at,
                post_approval_task_types.code,
                post_approval_task_types.label
             FROM post_approval_tasks
             INNER JOIN post_approval_task_types ON post_approval_task_types.id = post_approval_tasks.task_type_id
             INNER JOIN beneficiary_profiles ON beneficiary_profiles.id = post_approval_tasks.beneficiary_profile_id'
             . $scopeJoin .
            ' WHERE post_approval_tasks.beneficiary_profile_id = :beneficiary_profile_id
              AND post_approval_task_types.code IN ("availment_form", "validation_form", "mungkahing_proyekto", "business_plan", "buhat_sa_pagpanumpa")
             ORDER BY FIELD(post_approval_task_types.code, "availment_form", "validation_form", "mungkahing_proyekto", "business_plan", "buhat_sa_pagpanumpa"), post_approval_tasks.id ASC'
        );
        $statement->execute($params);
        $rows = $statement->fetchAll(PDO::FETCH_ASSOC) ?: [];

        return array_map(function (array $row): array {
            $status = (string) ($row['status'] ?? POST_APPROVAL_STATUS_UNLOCKED);
            $payload = $this->decodeFormRequirementPayload($row['form_payload'] ?? null);
            return [
                'id' => (int) $row['id'],
                'key' => (string) $row['code'],
                'label' => (string) $row['label'],
                'type' => 'form',
                'typeLabel' => 'Fill-up Form Requirement',
                'isRequired' => true,
                'gatesApproval' => true,
                'status' => $status,
                'reviewerRemarks' => $row['reviewer_remarks'] ?? null,
                'submittedAt' => $row['applicant_submitted_at'] ?? null,
                'reviewedAt' => $row['reviewed_at'] ?? null,
                'file' => $this->normalizePostApprovalUploadMetadata($payload['staffReview']['reviewAttachment'] ?? null),
                'canReview' => in_array($status, [POST_APPROVAL_STATUS_SUBMITTED, POST_APPROVAL_STATUS_NEEDS_CORRECTION, POST_APPROVAL_STATUS_REJECTED, POST_APPROVAL_STATUS_VERIFIED], true),
                'reviewUrl' => app_url('post-approval-review?task_id=' . (int) $row['id'] . '&embed=1'),
            ];
        }, $rows);
    }

    private function findScopedApplicationFormTask(int $beneficiaryProfileId, string $requirementKey, array $actor): ?array
    {
        $params = [
            'beneficiary_profile_id' => $beneficiaryProfileId,
            'code' => $requirementKey,
        ];
        $scopeJoin = '';
        $role = strtolower((string) ($actor['role'] ?? ''));
        if (str_contains($role, 'project')) {
            $staffProfileId = $this->findStaffProfileIdForUser((int) ($actor['id'] ?? 0));
            if ($staffProfileId === null) {
                return null;
            }
            $scopeJoin = '
                INNER JOIN applicant_profiles ON applicant_profiles.id = beneficiary_profiles.applicant_profile_id
                INNER JOIN staff_barangay_assignments AS scope_assignments
                    ON scope_assignments.barangay_id = applicant_profiles.barangay_id
                   AND scope_assignments.staff_profile_id = :scope_staff_profile_id
                   AND scope_assignments.ended_at IS NULL';
            $params['scope_staff_profile_id'] = $staffProfileId;
        }

        $statement = db()->prepare(
            'SELECT
                post_approval_tasks.id,
                post_approval_tasks.form_payload,
                post_approval_tasks.status
             FROM post_approval_tasks
             INNER JOIN post_approval_task_types ON post_approval_task_types.id = post_approval_tasks.task_type_id
             INNER JOIN beneficiary_profiles ON beneficiary_profiles.id = post_approval_tasks.beneficiary_profile_id'
             . $scopeJoin .
            ' WHERE post_approval_tasks.beneficiary_profile_id = :beneficiary_profile_id
              AND post_approval_task_types.code = :code
             LIMIT 1'
        );
        $statement->execute($params);
        $row = $statement->fetch(\PDO::FETCH_ASSOC);

        return is_array($row) ? $row : null;
    }

    private function decodeFormRequirementPayload(mixed $value): array
    {
        if (is_array($value)) {
            return $value;
        }

        if (!is_string($value) || trim($value) === '') {
            return [];
        }

        $decoded = json_decode($value, true);
        return is_array($decoded) ? $decoded : [];
    }

    private function normalizePostApprovalUploadMetadata(mixed $value): ?array
    {
        if (!is_array($value)) {
            return null;
        }

        $filePath = trim((string) ($value['file_path'] ?? ''));
        if ($filePath === '') {
            return null;
        }

        return [
            'path' => $filePath,
            'name' => trim((string) ($value['original_name'] ?? basename($filePath))),
            'type' => trim((string) ($value['mime_type'] ?? '')),
            'size' => (int) ($value['file_size'] ?? 0),
            'uploadedAt' => trim((string) ($value['uploaded_at'] ?? '')),
            'url' => app_url($filePath),
        ];
    }

    private function ensureApplicationFormTasks(int $applicantProfileId, int $actorUserId): ?int
    {
        $beneficiaryProfileId = (new BeneficiaryProfileService())->ensureWorkspaceProfileForApplicantProfile($applicantProfileId);
        if ($beneficiaryProfileId === null) {
            return null;
        }

        (new PostApprovalTaskProvisioningService())->ensureApplicationStageTasks(
            $beneficiaryProfileId,
            $actorUserId
        );

        return $beneficiaryProfileId;
    }

    private function fetchTrainingReadiness(int $applicantProfileId): array
    {
        $requiredSeminars = $this->requiredTrainingSeminarsForApplicantProfile($applicantProfileId);

        if ($applicantProfileId <= 0) {
            return [
                'status' => TRAINING_STATUS_NOT_SCHEDULED,
                'completed' => false,
                'requiredSeminars' => $requiredSeminars,
                'attendedSeminars' => 0,
                'completedSeminars' => 0,
                'displayStatus' => '0 out of ' . $requiredSeminars . ' attended',
                'note' => 'No training schedule found yet.',
            ];
        }

        $statement = db()->prepare(
            'SELECT training_invitees.invite_status, attendance_records.attendance_status
             FROM training_invitees
             LEFT JOIN attendance_records ON attendance_records.training_invitee_id = training_invitees.id
             WHERE training_invitees.applicant_profile_id = :applicant_profile_id
             ORDER BY training_invitees.updated_at DESC, training_invitees.id DESC'
        );
        $statement->execute(['applicant_profile_id' => $applicantProfileId]);
        $rows = $statement->fetchAll(PDO::FETCH_ASSOC) ?: [];
        if ($rows === []) {
            return [
                'status' => TRAINING_STATUS_NOT_SCHEDULED,
                'completed' => false,
                'requiredSeminars' => $requiredSeminars,
                'attendedSeminars' => 0,
                'completedSeminars' => 0,
                'displayStatus' => '0 out of ' . $requiredSeminars . ' attended',
                'note' => 'No training schedule found yet.',
            ];
        }

        $attendedSeminars = 0;
        $completedSeminars = 0;
        $latestStatus = TRAINING_STATUS_NOT_SCHEDULED;

        foreach ($rows as $index => $row) {
            $status = (string) ($row['attendance_status'] ?: $row['invite_status'] ?: TRAINING_STATUS_NOT_SCHEDULED);
            if ($index === 0) {
                $latestStatus = $status;
            }
            if (in_array($status, [TRAINING_STATUS_ATTENDED, TRAINING_STATUS_COMPLETED], true)) {
                $attendedSeminars++;
            }
            if ($status === TRAINING_STATUS_COMPLETED) {
                $completedSeminars++;
            }
        }

        $completed = $attendedSeminars >= $requiredSeminars;
        $displayStatus = $attendedSeminars . ' out of ' . $requiredSeminars . ' attended';
        $completionStatus = $completed
            ? 'Training requirement completed'
            : max(0, $requiredSeminars - $attendedSeminars) . ' more seminar(s) required';
        $note = $completed
            ? 'Training seminar requirement is complete.'
            : 'PDO must verify ' . max(0, $requiredSeminars - $attendedSeminars) . ' more seminar attendance record(s).';

        return [
            'status' => $latestStatus,
            'completed' => $completed,
            'requiredSeminars' => $requiredSeminars,
            'attendedSeminars' => $attendedSeminars,
            'completedSeminars' => $completedSeminars,
            'displayStatus' => $displayStatus,
            'completionStatus' => $completionStatus,
            'note' => $note,
        ];
    }

    private function requiredTrainingSeminarsForApplicantProfile(int $applicantProfileId): int
    {
        if ($applicantProfileId <= 0) {
            return self::DEFAULT_REQUIRED_TRAINING_SEMINARS;
        }

        try {
            $statement = db()->prepare(
                'SELECT required_training_seminars
                 FROM applicant_profiles
                 WHERE id = :applicant_profile_id
                 LIMIT 1'
            );
            $statement->execute(['applicant_profile_id' => $applicantProfileId]);
            $value = $statement->fetchColumn();
        } catch (\Throwable $exception) {
            log_database_query_failure('application.required_training_seminars', $exception, ['applicant_profile_id' => $applicantProfileId]);
            return self::DEFAULT_REQUIRED_TRAINING_SEMINARS;
        }

        $count = $value !== false ? (int) $value : self::DEFAULT_REQUIRED_TRAINING_SEMINARS;
        return $count > 0 ? $count : self::DEFAULT_REQUIRED_TRAINING_SEMINARS;
    }

    private function buildApprovalReadiness(
        array $requirements,
        array $formRequirements,
        array $trainingReadiness
    ): array
    {
        $missingUploads = [];
        $pendingUploads = [];
        $rejectedUploads = [];
        $approvedUploads = 0;
        foreach ($requirements as $requirement) {
            $status = strtolower((string) ($requirement['status'] ?? 'missing'));
            $label = (string) ($requirement['label'] ?? 'Requirement');
            $hasFile = !empty($requirement['file']['path']);
            if (!$hasFile) {
                $missingUploads[] = $label;
                continue;
            }
            if (in_array($status, ['rejected', 'flagged', 'needs correction', 'needs_correction'], true)) {
                $rejectedUploads[] = $label;
                continue;
            }
            if (!in_array($status, ['verified', 'approved'], true)) {
                $pendingUploads[] = $label;
                continue;
            }
            $approvedUploads++;
        }

        $missingForms = [];
        $pendingForms = [];
        $rejectedForms = [];
        $approvedForms = 0;
        $gatedFormTotal = 0;
        foreach ($formRequirements as $requirement) {
            if (!($requirement['gatesApproval'] ?? true)) {
                continue;
            }
            $gatedFormTotal++;
            $status = strtolower((string) ($requirement['status'] ?? POST_APPROVAL_STATUS_UNLOCKED));
            $label = (string) ($requirement['label'] ?? 'Form requirement');
            $hasSubmission = !empty($requirement['submittedAt'])
                || !empty($requirement['file']['path'])
                || in_array($status, ['submitted', 'verified', 'approved', 'needs correction', 'needs_correction', 'rejected'], true);
            if (in_array($status, ['rejected', 'needs correction', 'needs_correction', 'flagged'], true)) {
                $rejectedForms[] = $label;
                continue;
            }
            if (in_array($status, ['verified', 'approved'], true)) {
                $approvedForms++;
                continue;
            }
            if ($hasSubmission) {
                $pendingForms[] = $label;
                continue;
            }
            $missingForms[] = $label;
        }

        $blockers = [];
        foreach ($missingUploads as $label) {
            $blockers[] = 'Missing: ' . $label;
        }
        foreach ($pendingUploads as $label) {
            $blockers[] = 'Pending review: ' . $label;
        }
        foreach ($rejectedUploads as $label) {
            $blockers[] = 'Rejected: ' . $label;
        }
        foreach ($missingForms as $label) {
            $blockers[] = 'Missing: ' . $label;
        }
        foreach ($pendingForms as $label) {
            $blockers[] = 'Pending review: ' . $label;
        }
        foreach ($rejectedForms as $label) {
            $blockers[] = 'Rejected: ' . $label;
        }
        if (!($trainingReadiness['completed'] ?? false)) {
            $blockers[] = 'Training seminars incomplete: ' . ($trainingReadiness['displayStatus'] ?? '0 out of 3 attended');
        }

        $overallStatus = 'Under Review';
        if ($missingUploads !== [] || $missingForms !== []) {
            $overallStatus = 'Needs Documents';
        } elseif ($rejectedUploads !== [] || $rejectedForms !== []) {
            $overallStatus = 'Needs Correction';
        } elseif ($blockers === []) {
            $overallStatus = 'Approved';
        }

        return [
            'uploadSummary' => [
                'approved' => max(0, $approvedUploads),
                'total' => count($requirements),
            ],
            'formSummary' => [
                'approved' => $approvedForms,
                'total' => $gatedFormTotal,
            ],
            'trainingStatus' => $trainingReadiness,
            'blockers' => $blockers,
            'canApprove' => $blockers === [],
            'overallStatus' => $overallStatus,
        ];
    }

    private function buildTrainingApprovalReadiness(
        array $requirements,
        ?int $assignedStaffProfileId,
        string $currentStatus
    ): array {
        $requirementsByKey = [];
        foreach ($requirements as $key => $requirement) {
            if (is_string($key) && $key !== '') {
                $requirementsByKey[$key] = $requirement;
                continue;
            }
            if (is_array($requirement) && !empty($requirement['key'])) {
                $requirementsByKey[(string) $requirement['key']] = $requirement;
            }
        }

        $assignedPdoUserId = null;
        if ($assignedStaffProfileId !== null && $assignedStaffProfileId > 0) {
            $assignedPdoUserId = (new NotificationService())->userIdForStaffProfileId($assignedStaffProfileId);
            $assignedPdoUserId = $assignedPdoUserId !== null ? (int) $assignedPdoUserId : null;
        }

        $approvedUploads = 0;
        $reviewedByAssignedPdo = 0;
        $blockers = [];

        foreach (self::REQUIREMENT_LABELS as $frontendKey => $label) {
            $requirement = $requirementsByKey[$frontendKey] ?? null;
            $hasFile = !empty($requirement['file']['path']);
            $status = strtolower(trim((string) ($requirement['status'] ?? 'missing')));
            $reviewedByUserId = isset($requirement['reviewedByUserId']) && $requirement['reviewedByUserId'] !== null
                ? (int) $requirement['reviewedByUserId']
                : null;

            if (!$hasFile) {
                $blockers[] = 'Missing: ' . $label;
                continue;
            }

            if (!in_array($status, ['verified', 'approved'], true)) {
                $blockers[] = 'Pending PDO approval: ' . $label;
                continue;
            }

            $approvedUploads++;

            if ($assignedPdoUserId === null || $assignedPdoUserId <= 0) {
                $blockers[] = 'No assigned PDO review found for: ' . $label;
                continue;
            }

            if ($reviewedByUserId !== $assignedPdoUserId) {
                $blockers[] = 'Reviewed by another staff member: ' . $label;
                continue;
            }

            $reviewedByAssignedPdo++;
        }

        $normalizedStatus = strtolower(trim($this->normalizeStatusLabel($currentStatus)));
        $alreadyApprovedForTraining = in_array($normalizedStatus, array_map('strtolower', [
            APPLICATION_STATUS_APPROVED_FOR_TRAINING,
            APPLICATION_STATUS_TRAINING_ONGOING,
            APPLICATION_STATUS_COMPLETED,
        ]), true);

        if ($alreadyApprovedForTraining) {
            $blockers[] = 'Applicant is already marked as Approved for Training.';
        }

        $canApproveForTraining = $blockers === [];

        return [
            'uploadSummary' => [
                'approved' => $approvedUploads,
                'total' => count(self::REQUIREMENT_LABELS),
            ],
            'reviewedByAssignedPdoCount' => $reviewedByAssignedPdo,
            'assignedPdoUserId' => $assignedPdoUserId,
            'blockers' => $blockers,
            'alreadyApprovedForTraining' => $alreadyApprovedForTraining,
            'canApproveForTraining' => $canApproveForTraining,
            'overallStatus' => $canApproveForTraining ? 'Ready for Training Approval' : 'Training Approval Blocked',
        ];
    }

    private function fetchLatestAssessment(int $applicationId): ?array
    {
        $this->ensureAssessmentTable();

        try {
            $statement = db()->prepare(
                'SELECT
                    application_assessments.id,
                    application_assessments.identity_residency_status,
                    application_assessments.document_validity_status,
                    application_assessments.livelihood_confirmation_status,
                    application_assessments.program_fit_status,
                    application_assessments.readiness_commitment_status,
                    application_assessments.recommendation,
                    application_assessments.remarks,
                    application_assessments.direct_worker_name,
                    application_assessments.certifying_officer_name,
                    application_assessments.created_at,
                    users.full_name AS assessor_name
                 FROM application_assessments
                 INNER JOIN users ON users.id = application_assessments.assessor_user_id
                 WHERE application_assessments.application_id = :application_id
                 ORDER BY application_assessments.id DESC
                 LIMIT 1'
            );
            $statement->execute(['application_id' => $applicationId]);
            $row = $statement->fetch(PDO::FETCH_ASSOC);
        } catch (\Throwable $exception) {
            log_database_query_failure('application.fetch_assessment', $exception, ['application_id' => $applicationId]);
            return null;
        }

        if (!is_array($row)) {
            return null;
        }

        return [
            'id' => (int) $row['id'],
            'identityResidency' => $row['identity_residency_status'],
            'documentValidity' => $row['document_validity_status'],
            'livelihoodConfirmation' => $row['livelihood_confirmation_status'],
            'programFit' => $row['program_fit_status'],
            'readinessCommitment' => $row['readiness_commitment_status'],
            'recommendation' => $row['recommendation'],
            'remarks' => $row['remarks'],
            'assessorName' => $row['assessor_name'],
            'directWorkerName' => $row['direct_worker_name'],
            'certifyingOfficerName' => $row['certifying_officer_name'],
            'createdAt' => $row['created_at'],
        ];
    }

    private function ensureAssessmentTable(): void
    {
        static $ensured = false;
        if ($ensured) {
            return;
        }

        db()->exec(
            'CREATE TABLE IF NOT EXISTS application_assessments (
                id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                application_id BIGINT UNSIGNED NOT NULL,
                assessor_user_id BIGINT UNSIGNED NOT NULL,
                assessor_staff_profile_id BIGINT UNSIGNED NULL,
                identity_residency_status VARCHAR(40) NOT NULL,
                document_validity_status VARCHAR(40) NOT NULL,
                livelihood_confirmation_status VARCHAR(40) NOT NULL,
                program_fit_status VARCHAR(40) NOT NULL,
                readiness_commitment_status VARCHAR(40) NOT NULL,
                recommendation VARCHAR(40) NOT NULL,
                remarks TEXT NOT NULL,
                direct_worker_user_id BIGINT UNSIGNED NULL,
                direct_worker_name VARCHAR(160) NULL,
                certifying_officer_user_id BIGINT UNSIGNED NULL,
                certifying_officer_name VARCHAR(160) NULL,
                created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                CONSTRAINT fk_application_assessments_application FOREIGN KEY (application_id) REFERENCES applications(id),
                CONSTRAINT fk_application_assessments_assessor_user FOREIGN KEY (assessor_user_id) REFERENCES users(id),
                CONSTRAINT fk_application_assessments_assessor_staff FOREIGN KEY (assessor_staff_profile_id) REFERENCES staff_profiles(id),
                CONSTRAINT fk_application_assessments_direct_worker FOREIGN KEY (direct_worker_user_id) REFERENCES users(id),
                CONSTRAINT fk_application_assessments_certifying_officer FOREIGN KEY (certifying_officer_user_id) REFERENCES users(id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );

        $ensured = true;
    }

    private function ensureBeneficiaryFeedbackTable(): void
    {
        static $ensured = false;
        if ($ensured) {
            return;
        }

        db()->exec(
            'CREATE TABLE IF NOT EXISTS beneficiary_feedback (
                id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                beneficiary_profile_id BIGINT UNSIGNED NOT NULL,
                submitted_by_user_id BIGINT UNSIGNED NOT NULL,
                message TEXT NOT NULL,
                created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                CONSTRAINT fk_beneficiary_feedback_profile FOREIGN KEY (beneficiary_profile_id) REFERENCES beneficiary_profiles(id),
                CONSTRAINT fk_beneficiary_feedback_user FOREIGN KEY (submitted_by_user_id) REFERENCES users(id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );

        $ensured = true;
    }

    private function ensureUserProfilePhotosTable(): void
    {
        static $ensured = false;
        if ($ensured) {
            return;
        }

        db()->exec(
            'CREATE TABLE IF NOT EXISTS user_profile_photos (
                id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                user_id BIGINT UNSIGNED NOT NULL UNIQUE,
                mime_type VARCHAR(120) NOT NULL,
                image_data MEDIUMTEXT NOT NULL,
                created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                CONSTRAINT fk_user_profile_photos_user FOREIGN KEY (user_id) REFERENCES users(id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );

        $ensured = true;
    }

    private function validateProfilePhotoDataUrl(string $photo, bool $required): ?string
    {
        if ($photo === '') {
            return $required ? 'Profile photo is required.' : null;
        }

        if (!preg_match('#^data:(image/(?:jpeg|png));base64,([A-Za-z0-9+/=]+)$#', $photo, $matches)) {
            return 'Upload a JPG or PNG file only.';
        }

        $binary = base64_decode($matches[2], true);
        if ($binary === false) {
            return 'Profile photo data is invalid.';
        }

        if (strlen($binary) > 5 * 1024 * 1024) {
            return 'Profile photo must be 5 MB or less.';
        }

        return null;
    }

    private function upsertUserProfilePhotoDataUrl(int $userId, string $photo): void
    {
        if (!preg_match('#^data:(image/(?:jpeg|png));base64,([A-Za-z0-9+/=]+)$#', $photo, $matches)) {
            throw new \RuntimeException('Profile photo data is invalid.');
        }

        $this->ensureUserProfilePhotosTable();
        $statement = db()->prepare(
            'INSERT INTO user_profile_photos (user_id, mime_type, image_data)
             VALUES (:user_id, :mime_type, :image_data)
             ON DUPLICATE KEY UPDATE
                mime_type = VALUES(mime_type),
                image_data = VALUES(image_data),
                updated_at = CURRENT_TIMESTAMP'
        );
        $statement->execute([
            'user_id' => $userId,
            'mime_type' => $matches[1],
            'image_data' => $photo,
        ]);
    }

    private function initialRequirementFileColumns(): array
    {
        if ($this->initialRequirementFileColumns !== null) {
            return $this->initialRequirementFileColumns;
        }

        try {
            $rows = db()->query('SHOW COLUMNS FROM initial_requirement_files')->fetchAll(PDO::FETCH_ASSOC) ?: [];
        } catch (\Throwable $exception) {
            log_database_query_failure('application.initial_requirement_columns', $exception);
            $this->initialRequirementFileColumns = [];
            return $this->initialRequirementFileColumns;
        }

        $this->initialRequirementFileColumns = array_map(
            static fn (array $row): string => (string) ($row['Field'] ?? ''),
            $rows
        );

        return $this->initialRequirementFileColumns;
    }

    private function applicantProfileColumns(): array
    {
        if ($this->applicantProfileColumns !== null) {
            return $this->applicantProfileColumns;
        }

        try {
            $rows = db()->query('SHOW COLUMNS FROM applicant_profiles')->fetchAll(PDO::FETCH_ASSOC) ?: [];
        } catch (\Throwable $exception) {
            log_database_query_failure('application.applicant_profile_columns', $exception);
            $this->applicantProfileColumns = [];
            return $this->applicantProfileColumns;
        }

        $this->applicantProfileColumns = array_values(array_filter(array_map(
            static fn (array $row): string => (string) ($row['Field'] ?? ''),
            $rows
        )));

        return $this->applicantProfileColumns;
    }

    private function selectApplicantEducationalAttainmentSql(): string
    {
        return in_array('educational_attainment', $this->applicantProfileColumns(), true)
            ? 'applicant_profiles.educational_attainment AS educational_attainment'
            : 'NULL AS educational_attainment';
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

    private function selectApplicantSectorOtherSpecifySql(): string
    {
        return in_array('sector_other_specify', $this->applicantProfileColumns(), true)
            ? 'applicant_profiles.sector_other_specify AS sector_other_specify'
            : 'NULL AS sector_other_specify';
    }

    private static function resolveAgeGroupFromRow(array $row): string
    {
        $age = isset($row['age']) && $row['age'] !== null ? (int) $row['age'] : 0;
        if ($age <= 0) {
            $birthdate = trim((string) ($row['birthdate'] ?? ''));
            if ($birthdate !== '') {
                try {
                    $dob = new \DateTimeImmutable($birthdate);
                    $today = new \DateTimeImmutable('today');
                    $age = max(0, (int) $today->diff($dob)->y);
                } catch (\Throwable $exception) {
                    $age = 0;
                }
            }
        }

        if ($age <= 0) {
            return 'Not Set';
        }

        return match (true) {
            $age < 18 => 'Below 18',
            $age <= 24 => '18-24',
            $age <= 34 => '25-34',
            $age <= 44 => '35-44',
            $age <= 54 => '45-54',
            default => '55+',
        };
    }

    private function normalizeLivelihoodCategory(string $value): ?string
    {
        $value = trim($value);
        if ($value === '') {
            return null;
        }

        $allowed = [
            'Establishment',
            'Livestock',
            'Buy & Sell',
            'Agriculture',
            'Food and Beverages',
            'Services',
            'Other',
        ];

        foreach ($allowed as $option) {
            if (strcasecmp($value, $option) === 0) {
                return $option;
            }
        }

        $normalized = strtolower($value);
        if (str_contains($normalized, 'buy') || str_contains($normalized, 'sell')) {
            return 'Buy & Sell';
        }
        if (
            str_contains($normalized, 'food')
            || str_contains($normalized, 'beverage')
            || str_contains($normalized, 'balut')
            || str_contains($normalized, 'snack')
            || str_contains($normalized, 'eatery')
            || str_contains($normalized, 'carinderia')
        ) {
            return 'Food and Beverages';
        }
        if (
            str_contains($normalized, 'livestock')
            || str_contains($normalized, 'animal')
            || str_contains($normalized, 'poultry')
            || str_contains($normalized, 'hog')
        ) {
            return 'Livestock';
        }
        if (
            str_contains($normalized, 'service')
            || str_contains($normalized, 'repair')
            || str_contains($normalized, 'salon')
        ) {
            return 'Services';
        }
        if (
            str_contains($normalized, 'microenterprise')
            || str_contains($normalized, 'micro enterprise')
            || str_contains($normalized, 'micro-enterprise')
            || str_contains($normalized, 'paluwagan')
            || str_contains($normalized, 'establishment')
            || str_contains($normalized, 'store')
            || str_contains($normalized, 'shop')
        ) {
            return 'Establishment';
        }
        if (
            str_contains($normalized, 'home')
            || str_contains($normalized, 'production')
            || str_contains($normalized, 'homemade')
            || str_contains($normalized, 'processing')
        ) {
            return 'Establishment';
        }
        if (str_contains($normalized, 'agri') || str_contains($normalized, 'farm') || str_contains($normalized, 'crop')) {
            return 'Agriculture';
        }

        return $value;
    }

    private function validateLivelihoodCategory(string $value): ?string
    {
        $normalized = $this->normalizeLivelihoodCategory($value);
        if ($normalized === null) {
            return 'This field is required.';
        }

        $allowed = [
            'Establishment',
            'Livestock',
            'Buy & Sell',
            'Agriculture',
            'Food and Beverages',
            'Services',
            'Other',
        ];

        return in_array($normalized, $allowed, true)
            ? null
            : 'Select a valid livelihood category.';
    }

    private function normalizeOptionalString(?string $value): ?string
    {
        $value = trim((string) $value);
        return $value === '' ? null : $value;
    }

    private function hasInitialRequirementReviewColumns(): bool
    {
        $columns = $this->initialRequirementFileColumns();
        return in_array('reviewer_remarks', $columns, true)
            && in_array('reviewed_by_user_id', $columns, true)
            && in_array('reviewed_at', $columns, true);
    }

    private function frontendKeyToCode(string $key): string
    {
        return match ($key) {
            'validId' => 'valid_id',
            'healthCertificate' => 'health_certificate',
            'cedula' => 'cedula',
            'barangayEndorsementLetter' => 'barangay_endorsement_letter',
            default => throw new \RuntimeException('Unknown requirement key.'),
        };
    }

    private function codeToFrontendKey(string $code): string
    {
        return match ($code) {
            'valid_id' => 'validId',
            'health_certificate' => 'healthCertificate',
            'cedula' => 'cedula',
            'barangay_endorsement_letter' => 'barangayEndorsementLetter',
            default => $code,
        };
    }

    private function buildApplicationFormsGate(int $applicationId, int $applicantProfileId, array $requirements): array
    {
        $approved = 0;
        $missing = [];
        $pending = [];
        $rejected = [];
        $reviewedAt = null;

        foreach (self::REQUIREMENT_LABELS as $frontendKey => $label) {
            $requirement = $requirements[$frontendKey] ?? null;
            $status = strtolower(trim((string) ($requirement['status'] ?? 'missing')));
            $hasFile = !empty($requirement['file']['path']);

            if (!$hasFile) {
                $missing[] = $label;
                continue;
            }

            if (in_array($status, ['verified', 'approved'], true)) {
                $approved++;
                $candidateReviewedAt = (string) ($requirement['reviewedAt'] ?? $requirement['updatedAt'] ?? '');
                if ($candidateReviewedAt !== '' && ($reviewedAt === null || strtotime($candidateReviewedAt) > strtotime($reviewedAt))) {
                    $reviewedAt = $candidateReviewedAt;
                }
                continue;
            }

            if (in_array($status, ['rejected', 'needs correction', 'needs_correction', 'flagged'], true)) {
                $rejected[] = $label;
                continue;
            }

            $pending[] = $label;
        }

        return [
            'applicationId' => $applicationId,
            'applicantProfileId' => $applicantProfileId,
            'requiredTotal' => count(self::REQUIREMENT_LABELS),
            'approvedCount' => $approved,
            'missing' => $missing,
            'pending' => $pending,
            'rejected' => $rejected,
            'unlocked' => $approved === count(self::REQUIREMENT_LABELS) && $missing === [] && $pending === [] && $rejected === [],
            'reviewedAt' => $reviewedAt,
        ];
    }

    private function canApplicantEditApplication(array $application, array $requirements): bool
    {
        $status = $this->normalizeStatusLabel((string) ($application['status'] ?? ''));
        if (in_array($status, [
            $this->normalizeStatusLabel(APPLICATION_STATUS_DRAFT),
            $this->normalizeStatusLabel(APPLICATION_STATUS_REJECTED),
            $this->normalizeStatusLabel(APPLICATION_STATUS_FLAGGED),
            $this->normalizeStatusLabel(APPLICATION_STATUS_NEEDS_CORRECTION),
            $this->normalizeStatusLabel(APPLICATION_STATUS_NEEDS_DOCUMENTS),
        ], true)) {
            return true;
        }

        return !$this->hasApplicantReviewStarted($application, $requirements);
    }

    private function validateRequirementReplacementRules(array $documents, array $existingRequirements): array
    {
        $errors = [];
        foreach ($documents as $key => $_file) {
            $existing = $existingRequirements[$key] ?? null;
            if (!is_array($existing)) {
                continue;
            }

            if (!$this->canApplicantReplaceRequirementRecord($existing)) {
                $errors[$key] = sprintf(
                    '%s has already been checked and approved. It can no longer be replaced.',
                    $existing['label'] ?? self::REQUIREMENT_LABELS[$key] ?? 'This requirement'
                );
            }
        }

        return $errors;
    }

    private function canApplicantReplaceRequirementRecord(array $requirement): bool
    {
        $filePath = (string) (($requirement['file']['path'] ?? '') ?: '');
        if ($filePath === '') {
            return true;
        }

        $status = $this->normalizeStatusLabel((string) ($requirement['status'] ?? ''));
        if (in_array($status, ['verified', 'approved'], true)) {
            return false;
        }

        if (in_array($status, ['rejected', 'flagged', 'needscorrection', 'needsdocuments'], true)) {
            return true;
        }

        if (!empty($requirement['reviewedAt'] ?? null)) {
            return false;
        }

        return true;
    }

    private function hasApplicantReviewStarted(array $application, array $requirements): bool
    {
        if (!empty($application['reviewed_at'] ?? null) || !empty($application['reviewedAt'] ?? null)) {
            return true;
        }

        $status = $this->normalizeStatusLabel((string) ($application['status'] ?? ''));
        if (in_array($status, [
            $this->normalizeStatusLabel(APPLICATION_STATUS_CHECKED_BY_PDO),
            $this->normalizeStatusLabel(APPLICATION_STATUS_REQUIREMENTS_VERIFIED),
            $this->normalizeStatusLabel(APPLICATION_STATUS_FOR_ASSESSMENT),
            $this->normalizeStatusLabel(APPLICATION_STATUS_APPROVED),
            $this->normalizeStatusLabel(APPLICATION_STATUS_APPROVED_FOR_TRAINING),
            $this->normalizeStatusLabel(APPLICATION_STATUS_COMPLETED),
            $this->normalizeStatusLabel('Under Review'),
            $this->normalizeStatusLabel('Active'),
            $this->normalizeStatusLabel('Released'),
        ], true)) {
            return true;
        }

        foreach ($requirements as $requirement) {
            if (!is_array($requirement)) {
                continue;
            }

            if (!empty($requirement['reviewedAt'] ?? null)) {
                return true;
            }

            $requirementStatus = $this->normalizeStatusLabel((string) ($requirement['status'] ?? ''));
            if (in_array($requirementStatus, [
                'verified',
                'approved',
                'rejected',
                'flagged',
                'needscorrection',
                'needsdocuments',
            ], true)) {
                return true;
            }
        }

        return false;
    }

    private function normalizeStatusLabel(string $value): string
    {
        return strtolower(preg_replace('/[^a-z0-9]+/', '', $value));
    }

    private function resolveAssignedProjectOfficerProfileId(int $barangayId): ?int
    {
        $statement = db()->prepare(
            'SELECT staff_profiles.id
             FROM staff_barangay_assignments
             INNER JOIN staff_profiles ON staff_profiles.id = staff_barangay_assignments.staff_profile_id
             INNER JOIN users ON users.id = staff_profiles.user_id
             INNER JOIN roles ON roles.id = users.role_id
             WHERE staff_barangay_assignments.barangay_id = :barangay_id
               AND staff_barangay_assignments.ended_at IS NULL
               AND staff_profiles.status = :status
               AND users.is_active = 1
               AND users.is_disabled = 0
               AND roles.name = :role_name
             ORDER BY staff_barangay_assignments.assigned_at ASC, staff_barangay_assignments.id ASC
             LIMIT 1'
        );
        $statement->execute([
            'barangay_id' => $barangayId,
            'status' => 'active',
            'role_name' => ROLE_PROJECT_OFFICER,
        ]);
        $value = $statement->fetchColumn();
        return $value !== false ? (int) $value : null;
    }

    private function findApplicationRow(int $applicationId, array $actor): ?array
    {
        (new BeneficiaryProfileService())->ensureReplacementLinkSchema();

        $actorRole = strtolower((string) ($actor['role'] ?? ''));
        $isProjectOfficer = str_contains($actorRole, 'project');

        $params = ['application_id' => $applicationId];
        $joins = [
            'INNER JOIN applicant_profiles ON applicant_profiles.id = applications.applicant_profile_id',
            'INNER JOIN users AS applicant_users ON applicant_users.id = applicant_profiles.user_id',
              'LEFT JOIN barangays ON barangays.id = applicant_profiles.barangay_id',
              'LEFT JOIN staff_profiles AS assigned_staff ON assigned_staff.id = applications.assigned_staff_profile_id',
              'LEFT JOIN users AS assigned_users ON assigned_users.id = assigned_staff.user_id',
              'LEFT JOIN beneficiary_profiles ON beneficiary_profiles.applicant_profile_id = applicant_profiles.id',
          ];
        $conditions = ['applications.id = :application_id'];

        if ($isProjectOfficer) {
            $staffProfileId = $this->findStaffProfileIdForUser((int) ($actor['id'] ?? 0));
            if ($staffProfileId === null) {
                return null;
            }

            $joins[] = 'INNER JOIN staff_barangay_assignments AS scope_assignments
                        ON scope_assignments.barangay_id = applicant_profiles.barangay_id
                       AND scope_assignments.staff_profile_id = :scope_staff_profile_id
                       AND scope_assignments.ended_at IS NULL';
            $params['scope_staff_profile_id'] = $staffProfileId;
        }

        $sql = '
            SELECT
                applications.id,
                applications.status,
                applications.submitted_at,
                applications.reviewed_at,
                applications.assigned_staff_profile_id,
                applications.created_at AS application_created_at,
                applications.updated_at,
                applicant_profiles.id AS applicant_profile_id,
                applicant_profiles.created_at AS profile_created_at,
                applicant_users.id AS applicant_user_id,
                applicant_users.full_name AS applicant_name,
                applicant_users.email AS applicant_email,
                  applicant_profiles.business_name,
                  applicant_profiles.contact_number,
                  applicant_profiles.household_size,
                  ' . $this->selectApplicantEducationalAttainmentSql() . ',
                  applicant_profiles.sector,
                  ' . $this->selectApplicantSectorOtherSpecifySql() . ',
                  ' . $this->selectApplicantLivelihoodCategorySql() . ',
                  applicant_profiles.livelihood_type,
                  ' . $this->selectApplicantBatchNoSql() . ',
                  applicant_profiles.address_line,
                  applicant_profiles.birthdate,
                  applicant_profiles.age,
                  applicant_profiles.gender,
                  applicant_profiles.is_4ps,
                  barangays.id AS barangay_id,
                  barangays.name AS barangay_name,
                  beneficiary_profiles.id AS beneficiary_profile_id,
                  beneficiary_profiles.beneficiary_status AS beneficiary_status,
                  beneficiary_profiles.approval_date AS beneficiary_approval_date,
                  beneficiary_profiles.approved_at AS beneficiary_approved_at,
                  assigned_users.full_name AS assigned_pdo_name,
                  (
                    SELECT COUNT(*)
                    FROM initial_requirement_files AS files
                    WHERE files.application_id = applications.id
                ) AS uploaded_requirement_count,
                (
                    SELECT COUNT(*)
                    FROM initial_requirement_files AS files
                    WHERE files.application_id = applications.id
                      AND LOWER(files.review_status) = "verified"
                ) AS verified_requirement_count,
                (
                    SELECT COUNT(*)
                    FROM initial_requirement_types AS requirement_types
                    WHERE requirement_types.is_required = 1
                ) AS total_required_documents
            FROM applications
            ' . implode("\n", $joins) . '
            WHERE ' . implode(' AND ', $conditions) . '
            LIMIT 1
        ';

        $statement = db()->prepare($sql);
        foreach ($params as $key => $value) {
            $statement->bindValue(':' . $key, $value);
        }
        $statement->execute();
        $row = $statement->fetch(PDO::FETCH_ASSOC);

        return is_array($row) ? $row : null;
    }

    private function mapApplicationRow(array $row): array
    {
        $beneficiaryApprovedAt = trim((string) ($row['beneficiary_approved_at'] ?? ''));
        $beneficiaryApprovalDate = trim((string) ($row['beneficiary_approval_date'] ?? ''));
        $beneficiaryStatus = (string) ($row['beneficiary_status'] ?? '');
        $beneficiaryProfileId = isset($row['beneficiary_profile_id']) && $row['beneficiary_profile_id'] !== null
            ? (int) $row['beneficiary_profile_id']
            : null;
        $isApprovedBeneficiary = $beneficiaryProfileId !== null
            && ($beneficiaryApprovedAt !== '' || $beneficiaryApprovalDate !== '' || strtolower(trim($beneficiaryStatus)) === BeneficiaryProfileService::STATUS_ACTIVE);
        $firstRepaymentDueDate = $isApprovedBeneficiary
            ? (new RepaymentScheduleService())->firstDueDateForBeneficiaryContext($beneficiaryApprovedAt, $beneficiaryApprovalDate)
            : null;
        $submittedAt = trim((string) ($row['submitted_at'] ?? ''));
        $applicationCreatedAt = trim((string) ($row['application_created_at'] ?? ''));
        $profileCreatedAt = trim((string) ($row['profile_created_at'] ?? ''));
        $displaySubmittedAt = $submittedAt !== ''
            ? $submittedAt
            : ($applicationCreatedAt !== '' ? $applicationCreatedAt : ($profileCreatedAt !== '' ? $profileCreatedAt : null));
        $batchNo = trim((string) ($row['batch_no'] ?? ''));
        if ($batchNo === '') {
            $batchNo = 'Batch 1';
        } elseif (preg_match('/^\d+$/', $batchNo) === 1) {
            $batchNo = 'Batch ' . $batchNo;
        }

        return [
            'id' => (int) $row['id'],
            'status' => $this->normalizeStoredStatus((string) $row['status']),
            'submittedAt' => $displaySubmittedAt,
            'actualSubmittedAt' => $submittedAt !== '' ? $submittedAt : null,
            'applicationCreatedAt' => $applicationCreatedAt !== '' ? $applicationCreatedAt : null,
            'profileCreatedAt' => $profileCreatedAt !== '' ? $profileCreatedAt : null,
            'reviewedAt' => $row['reviewed_at'],
            'updatedAt' => $row['updated_at'],
            'applicantName' => $row['applicant_name'],
            'email' => $row['applicant_email'],
              'businessName' => $row['business_name'],
              'contactNumber' => $row['contact_number'],
              'householdSize' => $row['household_size'] !== null ? (int) $row['household_size'] : null,
              'educationalAttainment' => $row['educational_attainment'] ?? '',
              'sector' => $row['sector'],
              'sectorOtherSpecify' => $row['sector_other_specify'] ?? '',
              'livelihoodCategory' => $this->normalizeLivelihoodCategory((string) (($row['livelihood_category'] ?? '') ?: ($row['livelihood_type'] ?? ''))) ?? '',
              'livelihood' => $row['livelihood_type'],
              'batchNo' => $batchNo,
              'address' => $row['address_line'],
              'birthdate' => $row['birthdate'],
              'age' => $row['age'] !== null ? (int) $row['age'] : null,
            'gender' => $row['gender'],
            'is4ps' => ((int) ($row['is_4ps'] ?? 0)) === 1,
            'barangayId' => $row['barangay_id'] !== null ? (int) $row['barangay_id'] : null,
            'barangay' => $row['barangay_name'],
            'assignedPdoName' => $row['assigned_pdo_name'],
            'assignedStaffProfileId' => $row['assigned_staff_profile_id'] !== null ? (int) $row['assigned_staff_profile_id'] : null,
            'assistanceStatus' => [
                'beneficiaryProfileId' => $beneficiaryProfileId,
                'beneficiaryStatus' => $beneficiaryStatus,
                'isApprovedBeneficiary' => $isApprovedBeneficiary,
                'approvedAt' => $beneficiaryApprovedAt !== '' ? $beneficiaryApprovedAt : ($beneficiaryApprovalDate !== '' ? $beneficiaryApprovalDate : null),
                'approvalDate' => $beneficiaryApprovalDate !== '' ? $beneficiaryApprovalDate : null,
                'firstRepaymentDueDate' => $firstRepaymentDueDate,
            ],
            'uploadedRequirementCount' => (int) $row['uploaded_requirement_count'],
            'verifiedRequirementCount' => (int) $row['verified_requirement_count'],
            'requiredRequirementCount' => (int) $row['total_required_documents'],
        ];
    }

    private function buildApplicationSummary(array $applications): array
    {
        $summary = $this->emptyApplicationSummary();
        foreach ($applications as $application) {
            $status = $this->normalizeStoredStatus((string) ($application['status'] ?? ''));
            $summary['total']++;
            if (in_array($status, [
                APPLICATION_STATUS_DRAFT,
                APPLICATION_STATUS_SUBMITTED,
                APPLICATION_STATUS_UNDER_REVIEW,
                APPLICATION_STATUS_NEEDS_DOCUMENTS,
            ], true)) {
                $summary['inProgress']++;
            }
            if (in_array($status, [
                APPLICATION_STATUS_CHECKED_BY_PDO,
                APPLICATION_STATUS_REQUIREMENTS_VERIFIED,
                APPLICATION_STATUS_FOR_ASSESSMENT,
            ], true)) {
                $summary['readyForReview']++;
            }
            if (in_array($status, [
                APPLICATION_STATUS_APPROVED,
                APPLICATION_STATUS_APPROVED_FOR_TRAINING,
                APPLICATION_STATUS_TRAINING_ONGOING,
                APPLICATION_STATUS_COMPLETED,
            ], true)) {
                $summary['approved']++;
            }
            if (in_array($status, [
                APPLICATION_STATUS_NEEDS_CORRECTION,
                APPLICATION_STATUS_REJECTED,
                APPLICATION_STATUS_FLAGGED,
            ], true)) {
                $summary['needsCorrection']++;
            }
        }

        return $summary;
    }

    private function emptyApplicationSummary(): array
    {
        return [
            'total' => 0,
            'inProgress' => 0,
            'readyForReview' => 0,
            'approved' => 0,
            'needsCorrection' => 0,
        ];
    }

    private function availableBarangays(array $actor): array
    {
        $actorRole = strtolower((string) ($actor['role'] ?? ''));
        if (str_contains($actorRole, 'project')) {
            return $this->assignedBarangaysForUser((int) $actor['id']);
        }

        return (new BarangayCatalogService())->all();
    }

    private function availableAssignedPdos(): array
    {
        $statement = db()->prepare(
            'SELECT staff_profiles.id, users.full_name
             FROM staff_profiles
             INNER JOIN users ON users.id = staff_profiles.user_id
             INNER JOIN roles ON roles.id = users.role_id
             WHERE roles.name = :role_name
             ORDER BY users.full_name ASC'
        );
        $statement->execute(['role_name' => ROLE_PROJECT_OFFICER]);
        $rows = $statement->fetchAll(PDO::FETCH_ASSOC) ?: [];

        return array_map(static fn (array $row): array => ['id' => (int) $row['id'], 'name' => $row['full_name']], $rows);
    }

    private function assignedBarangaysForUser(int $userId): array
    {
        return (new BarangayAssignmentService())->assignedBarangaysForUser($userId);
    }

    private function findStaffProfileIdForUser(int $userId): ?int
    {
        $statement = db()->prepare('SELECT id FROM staff_profiles WHERE user_id = :user_id LIMIT 1');
        $statement->execute(['user_id' => $userId]);
        $value = $statement->fetchColumn();
        return $value !== false ? (int) $value : null;
    }

    private function notifyApplicationSubmission(int $userId, string $businessName, string $barangay, ?int $assignedStaffProfileId): void
    {
        $notificationService = new NotificationService();

        $recipientIds = $notificationService->activeUserIdsForRoles([ROLE_ADMIN]);
        if ($assignedStaffProfileId !== null) {
            $assignedUserId = $notificationService->userIdForStaffProfileId($assignedStaffProfileId);
            if ($assignedUserId !== null) {
                $recipientIds[] = $assignedUserId;
            }
        }

        $applicantLabel = $businessName !== '' ? $businessName : 'a beneficiary application';
        $barangayLabel = $barangay !== '' ? $barangay : 'the assigned barangay';

        if ($recipientIds !== []) {
            $notificationService->createInAppForUsers(
                $recipientIds,
                'Application submitted',
                sprintf('%s was submitted for verification in %s.', $applicantLabel, $barangayLabel),
                'application_submission'
            );
        }

        $notificationService->createInApp(
            $userId,
            'Application submitted',
            'Your application was submitted for verification.',
            'application_submission'
        );
    }

    private function findApplicantProfileIdForApplication(int $applicationId): int
    {
        $statement = db()->prepare('SELECT applicant_profile_id FROM applications WHERE id = :id LIMIT 1');
        $statement->execute(['id' => $applicationId]);
        $value = $statement->fetchColumn();
        return $value !== false ? (int) $value : 0;
    }

    private function fetchApplicationComments(int $applicationId): array
    {
        $statement = db()->prepare(
            'SELECT application_comments.id, application_comments.comment_text, application_comments.visibility, application_comments.created_at,
                    users.full_name AS actor_name
             FROM application_comments
             INNER JOIN users ON users.id = application_comments.user_id
             WHERE application_comments.application_id = :application_id
             ORDER BY application_comments.created_at DESC'
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

    private function fetchApplicationHistory(int $applicationId): array
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
                'fromStatus' => $row['from_status'] !== null ? $this->normalizeStoredStatus((string) $row['from_status']) : null,
                'toStatus' => $this->normalizeStoredStatus((string) $row['to_status']),
                'remarks' => $row['remarks'],
                'actorName' => $row['actor_name'],
                'createdAt' => $row['created_at'],
            ];
        }, $rows);
    }

    private function createApplicationComment(int $applicationId, int $userId, string $comment, string $visibility = 'internal'): void
    {
        db()->prepare(
            'INSERT INTO application_comments (application_id, user_id, comment_text, visibility)
             VALUES (:application_id, :user_id, :comment_text, :visibility)'
        )->execute([
            'application_id' => $applicationId,
            'user_id' => $userId,
            'comment_text' => $comment,
            'visibility' => $visibility,
        ]);
    }

    private function resolveNextStatus(string $decision, string $actorRole): ?string
    {
        return match ($decision) {
            'approve' => str_contains($actorRole, 'project') ? APPLICATION_STATUS_REQUIREMENTS_VERIFIED : APPLICATION_STATUS_APPROVED_FOR_TRAINING,
            'approve_for_training' => APPLICATION_STATUS_APPROVED_FOR_TRAINING,
            'reject' => APPLICATION_STATUS_REJECTED,
            'flag' => APPLICATION_STATUS_FLAGGED,
            'needs_correction' => APPLICATION_STATUS_NEEDS_CORRECTION,
            'start_review' => APPLICATION_STATUS_UNDER_REVIEW,
            'for_assessment' => APPLICATION_STATUS_FOR_ASSESSMENT,
            default => null,
        };
    }

    private function normalizeStoredStatus(string $status): string
    {
        return match (strtolower(trim($status))) {
            'draft' => APPLICATION_STATUS_DRAFT,
            'submitted' => APPLICATION_STATUS_SUBMITTED,
            'under review', 'under_review', 'underreview' => APPLICATION_STATUS_UNDER_REVIEW,
            'checked by pdo', 'checked_by_pdo', 'checkedbypdo' => APPLICATION_STATUS_CHECKED_BY_PDO,
            'requirements verified', 'requirements_verified', 'requirementsverified' => APPLICATION_STATUS_REQUIREMENTS_VERIFIED,
            'for assessment', 'for_assessment', 'forassessment' => APPLICATION_STATUS_FOR_ASSESSMENT,
            'approved' => APPLICATION_STATUS_APPROVED,
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

    private function deriveApplicantVisibleStatus(string $storedStatus, array $requirements): string
    {
        $normalizedStatus = $this->normalizeStoredStatus($storedStatus);
        if ($normalizedStatus === APPLICATION_STATUS_DRAFT) {
            return $normalizedStatus;
        }

        $missingRequired = false;
        $hasRejected = false;
        foreach ($requirements as $requirement) {
            if (!($requirement['isRequired'] ?? true)) {
                continue;
            }

            $status = strtolower(trim((string) ($requirement['status'] ?? 'missing')));
            $hasFile = !empty($requirement['file']['path']);

            if (!$hasFile || $status === 'missing') {
                $missingRequired = true;
                continue;
            }

            if (in_array($status, ['rejected', 'flagged', 'needs correction', 'needs_correction'], true)) {
                $hasRejected = true;
            }
        }

        if ($missingRequired) {
            return APPLICATION_STATUS_NEEDS_DOCUMENTS;
        }

        if ($hasRejected) {
            return APPLICATION_STATUS_NEEDS_CORRECTION;
        }

        if ($normalizedStatus === APPLICATION_STATUS_FLAGGED) {
            return APPLICATION_STATUS_NEEDS_DOCUMENTS;
        }

        return $normalizedStatus;
    }

    private function resolveUserName(int $userId): string
    {
        if ($userId < 1) {
            return '';
        }

        $statement = db()->prepare('SELECT full_name FROM users WHERE id = :id LIMIT 1');
        $statement->execute(['id' => $userId]);
        $name = $statement->fetchColumn();
        return is_string($name) ? trim($name) : '';
    }

    private function publicUploadUrl(string $path): string
    {
        $trimmed = ltrim(str_replace('\\', '/', $path), '/');
        return app_url($trimmed);
    }
}
