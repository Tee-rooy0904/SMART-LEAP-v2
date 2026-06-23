<?php
declare(strict_types=1);

namespace App\Services;

use PDO;
use Throwable;

class StageOneRegistrationService
{
    public const STATUS_PENDING = 'pending';
    public const STATUS_SELECTED = 'selected';
    public const STATUS_SAVED = 'saved_next_batch';
    public const STATUS_ARCHIVED = 'archived';
    private const EMAIL_VERIFICATION_EXPIRY_MINUTES = 10;
    private const EMAIL_VERIFICATION_MAX_ATTEMPTS = 5;
    private ?array $applicantProfileColumns = null;
    private array $legacyProfilePhotoCache = [];

    public function submit(array $input, array $files): array
    {
        $this->ensureSchema();

        $clean = $this->cleanSubmissionInput($input);

        $errors = $this->validateSubmission($clean, $files);
        if ($errors !== []) {
            return [
                'ok' => false,
                'message' => 'Please complete the required Stage 1 registration fields.',
                'errors' => $errors,
            ];
        }

        $verificationCode = trim((string) ($input['emailVerificationCode'] ?? ''));
        $verification = $this->verifyEmailVerificationCode($clean['email'], $verificationCode);
        if (!$verification['ok']) {
            return [
                'ok' => false,
                'message' => (string) ($verification['message'] ?? 'Verify your email before submitting your registration.'),
                'errors' => ['emailVerificationCode' => (string) ($verification['message'] ?? 'Enter the verification code sent to your email.')],
            ];
        }

        return $this->persistSubmission($clean, $files, 'public_online', null);
    }

    public function requestEmailVerification(array $input): array
    {
        $this->ensureSchema();

        $clean = $this->cleanSubmissionInput($input);
        $errors = $this->validateEmailVerificationRequest($clean);
        if ($errors !== []) {
            return [
                'ok' => false,
                'message' => 'Please enter a valid email before verification.',
                'errors' => $errors,
            ];
        }

        if ($this->emailExistsInPortalUsers($clean['email'])) {
            return [
                'ok' => false,
                'message' => 'This email already has a SMART LEAP portal account.',
                'errors' => ['email' => 'This email already has a SMART LEAP portal account.'],
            ];
        }

        if ($this->emailExistsInStageOne($clean['email'])) {
            return [
                'ok' => false,
                'message' => 'This email already has a Stage 1 registration on file.',
                'errors' => ['email' => 'This email already has a Stage 1 registration on file.'],
            ];
        }

        return $this->issueEmailVerificationCode($clean['email'], $clean['fullName']);
    }

    public function submitStaffEntry(array $input, array $files, array $actor): array
    {
        $this->ensureSchema();

        $role = (string) ($actor['role'] ?? '');
        if (!in_array($role, [ROLE_ADMIN, ROLE_PROJECT_OFFICER], true)) {
            return ['ok' => false, 'message' => 'Only Admin and PDO accounts can encode hardcopy Stage 1 forms.'];
        }

        $clean = $this->cleanSubmissionInput($input);
        $errors = $this->validateSubmission($clean, $files, true);
        if ($errors !== []) {
            return [
                'ok' => false,
                'message' => 'Please complete the required hardcopy applicant fields.',
                'errors' => $errors,
            ];
        }

        return $this->persistSubmission($clean, $files, 'staff_hardcopy', (int) ($actor['id'] ?? 0));
    }

    private function persistSubmission(array $clean, array $files, string $channel, ?int $encodedByUserId): array
    {
        if ($this->emailExistsInPortalUsers($clean['email'])) {
            return [
                'ok' => false,
                'message' => 'This email already has a SMART LEAP portal account.',
                'errors' => ['email' => 'This email already has a SMART LEAP portal account.'],
            ];
        }

        if ($this->emailExistsInStageOne($clean['email'])) {
            return [
                'ok' => false,
                'message' => 'This email already has a Stage 1 registration on file.',
                'errors' => ['email' => 'This email already has a Stage 1 registration on file.'],
            ];
        }

        $uploadService = new UploadService();
        $pdo = db();
        $pdo->beginTransaction();

        try {
            $profilePhoto = $uploadService->storeStageOneAsset('profilePhoto', $files['profilePhoto'] ?? null);
            $businessPhoto = $uploadService->storeStageOneAsset('businessPhoto', $files['businessPhoto'] ?? null);
            $validIdPhoto = $uploadService->storeStageOneAsset('validIdPhoto', $files['validIdPhoto'] ?? null);
            $hardcopyForm = $channel === 'staff_hardcopy'
                ? $uploadService->storeStageOneAsset('hardcopyForm', $files['hardcopyForm'] ?? null)
                : ['file_path' => '', 'original_name' => '', 'mime_type' => null, 'file_size' => null];
            $referenceCode = $this->generateReferenceCode($pdo);
            $initialStatus = $this->selectedCount() >= $this->currentBatchCapacity()
                ? self::STATUS_SAVED
                : self::STATUS_PENDING;

            $statement = $pdo->prepare(
                'INSERT INTO stage_one_registrations
                 (reference_code, first_name, middle_name, last_name, full_name, email, contact_number, complete_address,
                  birthdate, age, gender, barangay, is_4ps, educational_attainment, sector, sector_other_specify, livelihood_type, business_name,
                  profile_photo_path, profile_photo_original_name, profile_photo_mime_type, profile_photo_file_size,
                  business_photo_path, business_photo_original_name, business_photo_mime_type, business_photo_file_size,
                  valid_id_path, valid_id_original_name, valid_id_mime_type, valid_id_file_size,
                  hardcopy_form_path, hardcopy_form_original_name, hardcopy_form_mime_type, hardcopy_form_file_size,
                  submission_channel, encoded_by_user_id, encoded_at, validation_status, created_at, updated_at)
                 VALUES
                 (:reference_code, :first_name, :middle_name, :last_name, :full_name, :email, :contact_number, :complete_address,
                  :birthdate, :age, :gender, :barangay, :is_4ps, :educational_attainment, :sector, :sector_other_specify, :livelihood_type, :business_name,
                  :profile_photo_path, :profile_photo_original_name, :profile_photo_mime_type, :profile_photo_file_size,
                  :business_photo_path, :business_photo_original_name, :business_photo_mime_type, :business_photo_file_size,
                  :valid_id_path, :valid_id_original_name, :valid_id_mime_type, :valid_id_file_size,
                  :hardcopy_form_path, :hardcopy_form_original_name, :hardcopy_form_mime_type, :hardcopy_form_file_size,
                  :submission_channel, :encoded_by_user_id, :encoded_at, :validation_status, NOW(), NOW())'
            );
            $statement->execute([
                'reference_code' => $referenceCode,
                'first_name' => $clean['firstName'],
                'middle_name' => $clean['middleName'] !== '' ? $clean['middleName'] : null,
                'last_name' => $clean['lastName'],
                'full_name' => $clean['fullName'],
                'email' => $clean['email'],
                'contact_number' => $clean['contactNumber'],
                'complete_address' => $clean['completeAddress'],
                'birthdate' => $clean['birthdate'] !== '' ? $clean['birthdate'] : null,
                'age' => $clean['age'] !== '' ? (int) $clean['age'] : null,
                'gender' => $clean['gender'] !== '' ? $clean['gender'] : null,
                'barangay' => $clean['barangay'] !== '' ? $clean['barangay'] : null,
                'is_4ps' => $clean['is4ps'] !== '' ? (strcasecmp($clean['is4ps'], 'yes') === 0 ? 1 : 0) : null,
                'educational_attainment' => $clean['educationalAttainment'] !== '' ? $clean['educationalAttainment'] : null,
                'sector' => $clean['sector'] !== '' ? $clean['sector'] : null,
                'sector_other_specify' => $clean['sectorOtherSpecify'] !== '' ? $clean['sectorOtherSpecify'] : null,
                'livelihood_type' => $clean['livelihood'] !== '' ? $clean['livelihood'] : null,
                'business_name' => $clean['businessName'] !== '' ? $clean['businessName'] : null,
                'profile_photo_path' => $profilePhoto['file_path'],
                'profile_photo_original_name' => $profilePhoto['original_name'],
                'profile_photo_mime_type' => $profilePhoto['mime_type'],
                'profile_photo_file_size' => $profilePhoto['file_size'],
                'business_photo_path' => $businessPhoto['file_path'],
                'business_photo_original_name' => $businessPhoto['original_name'],
                'business_photo_mime_type' => $businessPhoto['mime_type'],
                'business_photo_file_size' => $businessPhoto['file_size'],
                'valid_id_path' => $validIdPhoto['file_path'],
                'valid_id_original_name' => $validIdPhoto['original_name'],
                'valid_id_mime_type' => $validIdPhoto['mime_type'],
                'valid_id_file_size' => $validIdPhoto['file_size'],
                'hardcopy_form_path' => $hardcopyForm['file_path'],
                'hardcopy_form_original_name' => $hardcopyForm['original_name'],
                'hardcopy_form_mime_type' => $hardcopyForm['mime_type'],
                'hardcopy_form_file_size' => $hardcopyForm['file_size'],
                'submission_channel' => $channel,
                'encoded_by_user_id' => $encodedByUserId !== null && $encodedByUserId > 0 ? $encodedByUserId : null,
                'encoded_at' => $channel === 'staff_hardcopy' ? date('Y-m-d H:i:s') : null,
                'validation_status' => $initialStatus,
            ]);

            $registrationId = (int) $pdo->lastInsertId();
            $pdo->commit();
        } catch (Throwable $exception) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            log_database_query_failure('stage_one_registration.submit', $exception, ['email' => $clean['email'], 'channel' => $channel]);
            return [
                'ok' => false,
                'message' => 'Unable to submit the Stage 1 registration right now.',
            ];
        }

        return [
            'ok' => true,
            'message' => $channel === 'staff_hardcopy'
                ? ($initialStatus === self::STATUS_SAVED
                    ? 'Hardcopy applicant encoded and saved for the next SMART LEAP batch.'
                    : 'Hardcopy applicant encoded and added to the validation queue.')
                : ($initialStatus === self::STATUS_SAVED
                ? 'Email verified. Registration submitted and saved for the next SMART LEAP batch.'
                : 'Email verified. Registration submitted for Admin validation. Watch your email for the approval notice if you are selected.'),
            'referenceCode' => $referenceCode,
            'registration' => $this->getRegistrationDetail($registrationId),
        ];
    }

    public function validationState(): array
    {
        $this->ensureSchema();
        $this->syncLegacySelectedApplicants();
        $this->hydrateLegacySelectedRegistrations();
        $this->syncOverflowRegistrationsToSaved();

        $rows = db()->query(
            'SELECT
                stage_one_registrations.*,
                reviewers.full_name AS reviewed_by_name
             FROM stage_one_registrations
             INNER JOIN (
                SELECT LOWER(email) COLLATE utf8mb4_unicode_ci AS email_key, MAX(id) AS latest_id
                FROM stage_one_registrations
                WHERE validation_status <> "archived"
                GROUP BY LOWER(email) COLLATE utf8mb4_unicode_ci
             ) latest_registration ON latest_registration.latest_id = stage_one_registrations.id
             LEFT JOIN users AS reviewers ON reviewers.id = stage_one_registrations.validated_by_user_id
             WHERE stage_one_registrations.validation_status <> "archived"
             ORDER BY stage_one_registrations.created_at DESC, stage_one_registrations.id DESC'
        )->fetchAll(PDO::FETCH_ASSOC) ?: [];

        $items = array_map(fn (array $row): array => $this->formatRegistrationRow($row), $rows);
        $pending = array_values(array_filter($items, fn (array $row): bool => $row['statusKey'] === self::STATUS_PENDING));
        $selected = array_values(array_filter($items, fn (array $row): bool => $row['statusKey'] === self::STATUS_SELECTED));
        $saved = array_values(array_filter($items, fn (array $row): bool => $row['statusKey'] === self::STATUS_SAVED));

        return [
            'summary' => [
                'batchCapacity' => $this->currentBatchCapacity(),
                'pending' => count($pending),
                'selected' => count($selected),
                'saved' => count($saved),
                'selectionEmailFailures' => count(array_filter($selected, static fn (array $row): bool => (bool) ($row['selectionEmailNeedsResend'] ?? false))),
                'remaining' => max(0, $this->currentBatchCapacity() - count($selected)),
            ],
            'pending' => $pending,
            'selected' => $selected,
            'saved' => $saved,
        ];
    }

    public function getRegistrationDetail(int $registrationId): ?array
    {
        $this->ensureSchema();
        $this->syncLegacySelectedApplicants();
        $this->hydrateLegacySelectedRegistrations();
        if ($registrationId < 1) {
            return null;
        }

        $statement = db()->prepare(
            'SELECT
                stage_one_registrations.*,
                reviewers.full_name AS reviewed_by_name
             FROM stage_one_registrations
             LEFT JOIN users AS reviewers ON reviewers.id = stage_one_registrations.validated_by_user_id
             WHERE stage_one_registrations.id = :id
             LIMIT 1'
        );
        $statement->execute(['id' => $registrationId]);
        $row = $statement->fetch(PDO::FETCH_ASSOC);

        return is_array($row) ? $this->formatRegistrationRow($row) : null;
    }

    public function reviewRegistration(int $registrationId, string $action, array $actor): array
    {
        $this->ensureSchema();
        $registration = $this->getRegistrationDetail($registrationId);
        if ($registration === null) {
            return ['ok' => false, 'message' => 'Stage 1 registration not found.'];
        }

        $targetStatus = match (strtolower(trim($action))) {
            'approve', 'approved', 'select' => self::STATUS_SELECTED,
            'hold', 'save', 'saved', 'defer' => self::STATUS_SAVED,
            default => '',
        };
        if ($targetStatus === '') {
            return ['ok' => false, 'message' => 'Unsupported validation action.'];
        }

        $autoSavedForNextBatch = false;
        if (
            $targetStatus === self::STATUS_SELECTED
            && $registration['statusKey'] !== self::STATUS_SELECTED
            && $this->selectedCount() >= $this->currentBatchCapacity()
        ) {
            $targetStatus = self::STATUS_SAVED;
            $autoSavedForNextBatch = true;
        }

        $statement = db()->prepare(
            'UPDATE stage_one_registrations
             SET validation_status = :validation_status,
                 validated_by_user_id = :validated_by_user_id,
                 validated_at = NOW(),
                 updated_at = NOW()
             WHERE id = :id'
        );
        $statement->execute([
            'validation_status' => $targetStatus,
            'validated_by_user_id' => (int) ($actor['id'] ?? 0) > 0 ? (int) $actor['id'] : null,
            'id' => $registrationId,
        ]);

        if ($targetStatus === self::STATUS_SELECTED) {
            $this->syncOverflowRegistrationsToSaved();
        }

        $updatedRegistration = $this->getRegistrationDetail($registrationId);
        $emailSent = true;
        if ($targetStatus === self::STATUS_SELECTED && is_array($updatedRegistration)) {
            $emailSent = $this->sendSelectionEmail($updatedRegistration);
            $this->persistSelectionEmailStatus($registrationId, (string) ($updatedRegistration['email'] ?? ''), $emailSent);
            $updatedRegistration = $this->getRegistrationDetail($registrationId);
        }

        return [
            'ok' => true,
            'message' => $autoSavedForNextBatch
                ? sprintf('The current SMART LEAP batch is full at %d selected registrants, so this applicant was automatically saved for the next batch.', $this->currentBatchCapacity())
                : ($targetStatus === self::STATUS_SELECTED
                ? ($emailSent
                    ? 'Stage 1 applicant selected for the current batch. Email notice sent.'
                    : 'Stage 1 applicant selected for the current batch, but the approval email could not be sent. Please review the mail logs before telling the applicant to proceed.')
                : 'Stage 1 applicant saved for the next SMART LEAP batch.'),
            'registration' => $updatedRegistration,
            'state' => $this->validationState(),
            'emailSent' => $emailSent,
            'requiresEmailResend' => $targetStatus === self::STATUS_SELECTED && !$emailSent,
        ];
    }

    public function resendSelectionEmail(int $registrationId, array $actor = []): array
    {
        $this->ensureSchema();

        $registration = $this->getRegistrationDetail($registrationId);
        if ($registration === null) {
            return ['ok' => false, 'message' => 'Stage 1 registration not found.'];
        }

        if (($registration['statusKey'] ?? '') !== self::STATUS_SELECTED) {
            return ['ok' => false, 'message' => 'Only selected registrants can receive the approval email.'];
        }

        $emailSent = $this->sendSelectionEmail($registration);
        $this->persistSelectionEmailStatus($registrationId, (string) ($registration['email'] ?? ''), $emailSent);
        $updatedRegistration = $this->getRegistrationDetail($registrationId);

        return [
            'ok' => $emailSent,
            'message' => $emailSent
                ? 'Approval email sent successfully.'
                : 'Unable to send the approval email right now. Please review the mail configuration or try again.',
            'registration' => $updatedRegistration,
            'state' => $this->validationState(),
            'emailSent' => $emailSent,
            'requiresEmailResend' => !$emailSent,
            'actorId' => (int) ($actor['id'] ?? 0),
        ];
    }

    public function validationSummary(): array
    {
        try {
            return $this->validationState()['summary'];
        } catch (Throwable $exception) {
            log_database_query_failure('stage_one_registration.summary', $exception);
            return [
                'batchCapacity' => $this->currentBatchCapacity(),
                'pending' => 0,
                'selected' => 0,
                'saved' => 0,
                'selectionEmailFailures' => 0,
                'remaining' => $this->currentBatchCapacity(),
            ];
        }
    }

    private function cleanSubmissionInput(array $input): array
    {
        $clean = [
            'firstName' => trim((string) ($input['firstName'] ?? '')),
            'middleName' => trim((string) ($input['middleName'] ?? '')),
            'lastName' => trim((string) ($input['lastName'] ?? '')),
            'email' => strtolower(trim((string) ($input['email'] ?? ''))),
            'contactNumber' => trim((string) ($input['contactNumber'] ?? '')),
            'completeAddress' => trim((string) ($input['address'] ?? $input['completeAddress'] ?? '')),
            'birthdate' => trim((string) ($input['birthdate'] ?? '')),
            'age' => trim((string) ($input['age'] ?? '')),
            'gender' => trim((string) ($input['gender'] ?? '')),
            'barangay' => trim((string) ($input['barangay'] ?? '')),
            'is4ps' => trim((string) ($input['is4ps'] ?? '')),
            'educationalAttainment' => trim((string) ($input['educationalAttainment'] ?? '')),
            'sector' => trim((string) ($input['sector'] ?? '')),
            'sectorOtherSpecify' => trim((string) ($input['sectorOtherSpecify'] ?? '')),
            'livelihood' => trim((string) ($input['livelihood'] ?? '')),
            'businessName' => trim((string) ($input['businessName'] ?? '')),
        ];

        if ($clean['age'] === '') {
            $derivedAge = $this->calculateAgeFromBirthdate($clean['birthdate']);
            if ($derivedAge !== null) {
                $clean['age'] = (string) $derivedAge;
            }
        }

        $clean['fullName'] = trim(implode(' ', array_filter([
            $clean['firstName'],
            $clean['middleName'],
            $clean['lastName'],
        ], static fn (string $value): bool => $value !== '')));

        return $clean;
    }

    private function validateSubmission(array $clean, array $files, bool $requiresHardcopyForm = false): array
    {
        $errors = [];

        if (mb_strlen($clean['firstName']) < 2) {
            $errors['firstName'] = 'Enter your first name.';
        }
        if (mb_strlen($clean['lastName']) < 2) {
            $errors['lastName'] = 'Enter your last name.';
        }
        if (mb_strlen($clean['fullName']) < 3) {
            $errors['general'] = 'Enter your complete name.';
        }
        if (!filter_var($clean['email'], FILTER_VALIDATE_EMAIL)) {
            $errors['email'] = 'Enter a valid email address.';
        }

        $digits = preg_replace('/\D+/', '', $clean['contactNumber']);
        if ($digits === null || strlen($digits) < 10) {
            $errors['contactNumber'] = 'Enter a valid contact number.';
        }

        if (mb_strlen($clean['completeAddress']) < 12) {
            $errors['completeAddress'] = 'Enter your complete address.';
        }

        if ($clean['birthdate'] === '' || strtotime($clean['birthdate']) === false) {
            $errors['birthdate'] = 'Enter a valid birthdate.';
        }

        $age = $clean['age'] !== '' ? (int) $clean['age'] : 0;
        if ($age < 1 || $age > 120) {
            $errors['age'] = 'Age must be between 1 and 120.';
        }

        if ($clean['gender'] === '') {
            $errors['gender'] = 'Select your gender.';
        }

        if ($clean['barangay'] === '') {
            $errors['barangay'] = 'Select your barangay.';
        }

        if ($clean['is4ps'] === '') {
            $errors['is4ps'] = 'Select your 4Ps membership.';
        }

        if ($clean['educationalAttainment'] === '') {
            $errors['educationalAttainment'] = 'Select your educational attainment.';
        }

        if ($clean['sector'] === '') {
            $errors['sector'] = 'Select your sector.';
        }

        if (strcasecmp($clean['sector'], 'Other') === 0 && $clean['sectorOtherSpecify'] === '') {
            $errors['sectorOtherSpecify'] = 'Please specify your sector.';
        }

        if ($clean['livelihood'] === '') {
            $errors['livelihood'] = 'Enter your specific business type.';
        }

        if ($clean['businessName'] === '') {
            $errors['businessName'] = 'Enter your microbusiness name.';
        }

        if (!is_array($files['profilePhoto'] ?? null) || (int) (($files['profilePhoto']['error'] ?? UPLOAD_ERR_NO_FILE)) === UPLOAD_ERR_NO_FILE) {
            $errors['profilePhoto'] = 'Upload a profile photo.';
        }

        if (!is_array($files['businessPhoto'] ?? null) || (int) (($files['businessPhoto']['error'] ?? UPLOAD_ERR_NO_FILE)) === UPLOAD_ERR_NO_FILE) {
            $errors['businessPhoto'] = 'Upload a photo of your existing business.';
        }

        if (!is_array($files['validIdPhoto'] ?? null) || (int) (($files['validIdPhoto']['error'] ?? UPLOAD_ERR_NO_FILE)) === UPLOAD_ERR_NO_FILE) {
            $errors['validIdPhoto'] = 'Upload a photo or copy of your valid ID.';
        }

        if ($requiresHardcopyForm
            && (!is_array($files['hardcopyForm'] ?? null) || (int) (($files['hardcopyForm']['error'] ?? UPLOAD_ERR_NO_FILE)) === UPLOAD_ERR_NO_FILE)
        ) {
            $errors['hardcopyForm'] = 'Upload the scanned hardcopy form.';
        }

        return $errors;
    }

    private function validateEmailVerificationRequest(array $clean): array
    {
        $errors = [];

        if (mb_strlen($clean['firstName']) < 2) {
            $errors['firstName'] = 'Enter your first name before email verification.';
        }

        if (mb_strlen($clean['lastName']) < 2) {
            $errors['lastName'] = 'Enter your last name before email verification.';
        }

        if (!filter_var($clean['email'], FILTER_VALIDATE_EMAIL)) {
            $errors['email'] = 'Enter a valid email address.';
        }

        return $errors;
    }

    private function calculateAgeFromBirthdate(string $birthdate): ?int
    {
        if ($birthdate === '') {
            return null;
        }

        try {
            $birth = new \DateTimeImmutable($birthdate);
            $today = new \DateTimeImmutable('today');
        } catch (\Throwable) {
            return null;
        }

        if ($birth > $today) {
            return null;
        }

        return $birth->diff($today)->y;
    }

    private function formatRegistrationRow(array $row): array
    {
        $statusKey = $this->normalizeStatusKey((string) ($row['validation_status'] ?? self::STATUS_PENDING));

        return [
            'id' => (int) ($row['id'] ?? 0),
            'referenceCode' => (string) ($row['reference_code'] ?? ''),
            'firstName' => (string) ($row['first_name'] ?? ''),
            'middleName' => (string) ($row['middle_name'] ?? ''),
            'lastName' => (string) ($row['last_name'] ?? ''),
            'fullName' => (string) ($row['full_name'] ?? ''),
            'email' => (string) ($row['email'] ?? ''),
            'contactNumber' => (string) ($row['contact_number'] ?? ''),
            'completeAddress' => (string) ($row['complete_address'] ?? ''),
            'birthdate' => (string) ($row['birthdate'] ?? ''),
            'age' => $row['age'] !== null ? (int) $row['age'] : null,
            'gender' => (string) ($row['gender'] ?? ''),
            'barangay' => (string) ($row['barangay'] ?? ''),
            'is4ps' => ((int) ($row['is_4ps'] ?? 0)) === 1 ? 'Yes' : 'No',
            'educationalAttainment' => (string) ($row['educational_attainment'] ?? ''),
            'sector' => (string) ($row['sector'] ?? ''),
            'sectorOtherSpecify' => (string) ($row['sector_other_specify'] ?? ''),
            'livelihood' => (string) ($row['livelihood_type'] ?? ''),
            'businessName' => (string) ($row['business_name'] ?? ''),
            'statusKey' => $statusKey,
            'statusLabel' => match ($statusKey) {
                self::STATUS_SELECTED => 'Selected for Current Batch',
                self::STATUS_SAVED => 'Saved for Next Batch',
                default => 'Pending Validation',
            },
            'selectionEmailSentAt' => (string) ($row['selection_email_sent_at'] ?? ''),
            'selectionEmailFailedAt' => (string) ($row['selection_email_failed_at'] ?? ''),
            'selectionEmailError' => (string) ($row['selection_email_error'] ?? ''),
            'selectionEmailReady' => $statusKey === self::STATUS_SELECTED && (string) ($row['selection_email_sent_at'] ?? '') !== '',
            'selectionEmailNeedsResend' => $statusKey === self::STATUS_SELECTED && (string) ($row['selection_email_sent_at'] ?? '') === '',
            'submissionChannel' => (string) ($row['submission_channel'] ?? 'public_online'),
            'submissionChannelLabel' => ((string) ($row['submission_channel'] ?? 'public_online')) === 'staff_hardcopy' ? 'Staff-encoded hardcopy' : 'Online applicant form',
            'encodedAt' => (string) ($row['encoded_at'] ?? ''),
            'encodedByUserId' => $row['encoded_by_user_id'] !== null ? (int) $row['encoded_by_user_id'] : null,
            'submittedAt' => (string) ($row['created_at'] ?? ''),
            'validatedAt' => (string) ($row['validated_at'] ?? ''),
            'reviewedByName' => (string) ($row['reviewed_by_name'] ?? ''),
            'profilePhoto' => $this->formatUploadMeta(
                (string) ($row['profile_photo_path'] ?? ''),
                (string) ($row['profile_photo_original_name'] ?? ''),
                (string) ($row['profile_photo_mime_type'] ?? ''),
                (int) ($row['profile_photo_file_size'] ?? 0),
                (string) ($row['email'] ?? '')
            ),
            'businessPhoto' => $this->formatUploadMeta(
                (string) ($row['business_photo_path'] ?? ''),
                (string) ($row['business_photo_original_name'] ?? ''),
                (string) ($row['business_photo_mime_type'] ?? ''),
                (int) ($row['business_photo_file_size'] ?? 0)
            ),
            'validIdPhoto' => $this->formatUploadMeta(
                (string) ($row['valid_id_path'] ?? ''),
                (string) ($row['valid_id_original_name'] ?? ''),
                (string) ($row['valid_id_mime_type'] ?? ''),
                (int) ($row['valid_id_file_size'] ?? 0)
            ),
            'hardcopyForm' => $this->formatUploadMeta(
                (string) ($row['hardcopy_form_path'] ?? ''),
                (string) ($row['hardcopy_form_original_name'] ?? ''),
                (string) ($row['hardcopy_form_mime_type'] ?? ''),
                (int) ($row['hardcopy_form_file_size'] ?? 0)
            ),
        ];
    }

    private function formatUploadMeta(string $path, string $name, string $mimeType, int $fileSize, string $email = ''): array
    {
        $mimeType = strtolower(trim($mimeType));
        $url = $path !== '' ? app_url($path) : '';
        $resolvedName = $name;
        $resolvedMimeType = $mimeType;
        $resolvedPath = $path;
        $resolvedSize = $fileSize;

        if ($resolvedPath === '' && $email !== '') {
            $legacyPhoto = $this->legacyProfilePhotoMetaByEmail($email);
            if ($legacyPhoto !== null) {
                $url = $legacyPhoto['url'];
                $resolvedName = $legacyPhoto['name'];
                $resolvedMimeType = $legacyPhoto['mimeType'];
                $resolvedSize = $legacyPhoto['fileSize'];
            }
        }

        return [
            'path' => $resolvedPath,
            'name' => $resolvedName,
            'mimeType' => $resolvedMimeType,
            'fileSize' => $resolvedSize,
            'url' => $url,
            'isImage' => str_starts_with($resolvedMimeType, 'image/'),
        ];
    }

    private function legacyProfilePhotoMetaByEmail(string $email): ?array
    {
        $cacheKey = strtolower(trim($email));
        if ($cacheKey === '') {
            return null;
        }

        if (array_key_exists($cacheKey, $this->legacyProfilePhotoCache)) {
            return $this->legacyProfilePhotoCache[$cacheKey];
        }

        $statement = db()->prepare(
            'SELECT user_profile_photos.image_data
             FROM users
             INNER JOIN user_profile_photos ON user_profile_photos.user_id = users.id
             WHERE LOWER(users.email) = LOWER(:email)
             LIMIT 1'
        );
        $statement->execute(['email' => $cacheKey]);
        $imageData = $statement->fetchColumn();

        if (!is_string($imageData) || trim($imageData) === '') {
            $this->legacyProfilePhotoCache[$cacheKey] = null;
            return null;
        }

        $mimeType = 'image/jpeg';
        if (preg_match('/^data:([^;]+);base64,/', $imageData, $matches)) {
            $mimeType = strtolower(trim((string) ($matches[1] ?? 'image/jpeg')));
        }

        $meta = [
            'url' => $imageData,
            'name' => 'Legacy profile photo',
            'mimeType' => $mimeType,
            'fileSize' => 0,
        ];
        $this->legacyProfilePhotoCache[$cacheKey] = $meta;

        return $meta;
    }

    private function normalizeStatusKey(string $status): string
    {
        return match (strtolower(trim($status))) {
            self::STATUS_SELECTED, 'approved', 'selected' => self::STATUS_SELECTED,
            self::STATUS_SAVED, 'saved', 'held', 'deferred' => self::STATUS_SAVED,
            self::STATUS_ARCHIVED, 'archived' => self::STATUS_ARCHIVED,
            default => self::STATUS_PENDING,
        };
    }

    private function selectedCount(): int
    {
        $statement = db()->prepare('SELECT COUNT(*) FROM stage_one_registrations WHERE validation_status = :validation_status');
        $statement->execute(['validation_status' => self::STATUS_SELECTED]);
        return (int) ($statement->fetchColumn() ?: 0);
    }

    private function syncOverflowRegistrationsToSaved(): void
    {
        if ($this->selectedCount() < $this->currentBatchCapacity()) {
            return;
        }

        db()->prepare(
            'UPDATE stage_one_registrations
             SET validation_status = :saved_status,
                 updated_at = NOW()
             WHERE validation_status = :pending_status'
        )->execute([
            'saved_status' => self::STATUS_SAVED,
            'pending_status' => self::STATUS_PENDING,
        ]);
    }

    private function currentBatchCapacity(): int
    {
        return (new BeneficiaryProfileService())->activeBatchCapacity();
    }

    private function syncLegacySelectedApplicants(): void
    {
        static $synced = false;
        if ($synced) {
            return;
        }

        $pdo = db();
        $supportsEducationalAttainment = in_array('educational_attainment', $this->applicantProfileColumns(), true);
        $supportsSectorOtherSpecify = in_array('sector_other_specify', $this->applicantProfileColumns(), true);

        try {
            $rows = $pdo->query(
                'SELECT
                    applicant_profiles.id AS applicant_profile_id,
                    users.full_name,
                    users.email,
                    applicant_profiles.contact_number,
                    applicant_profiles.address_line,
                    applicant_profiles.birthdate,
                    applicant_profiles.age,
                    applicant_profiles.gender,
                    applicant_profiles.is_4ps,
                    applicant_profiles.sector,
                    ' . ($supportsEducationalAttainment ? 'applicant_profiles.educational_attainment AS profile_educational_attainment,' : 'NULL AS profile_educational_attainment,') . '
                    ' . ($supportsSectorOtherSpecify ? 'applicant_profiles.sector_other_specify AS profile_sector_other_specify,' : 'NULL AS profile_sector_other_specify,') . '
                    applicant_profiles.livelihood_type,
                    applicant_profiles.business_name,
                    barangays.name AS profile_barangay_name,
                    latest_valid_id.file_path AS valid_id_path,
                    latest_valid_id.original_name AS valid_id_original_name,
                    latest_valid_id.mime_type AS valid_id_mime_type,
                    latest_valid_id.file_size AS valid_id_file_size,
                    latest_applications.created_at AS application_created_at,
                    applicant_profiles.updated_at AS profile_updated_at
                 FROM applicant_profiles
                 INNER JOIN users ON users.id = applicant_profiles.user_id
                 INNER JOIN (
                    SELECT applications.*
                    FROM applications
                    INNER JOIN (
                        SELECT applicant_profile_id, MAX(id) AS latest_id
                        FROM applications
                        GROUP BY applicant_profile_id
                    ) latest_application ON latest_application.latest_id = applications.id
                 ) AS latest_applications ON latest_applications.applicant_profile_id = applicant_profiles.id
                 LEFT JOIN barangays ON barangays.id = applicant_profiles.barangay_id
                 LEFT JOIN (
                    SELECT files.application_id, files.file_path, files.original_name, files.mime_type, files.file_size
                    FROM initial_requirement_files AS files
                    INNER JOIN initial_requirement_types AS types ON types.id = files.requirement_type_id
                    INNER JOIN (
                        SELECT files.application_id, MAX(files.id) AS latest_id
                        FROM initial_requirement_files AS files
                        INNER JOIN initial_requirement_types AS types ON types.id = files.requirement_type_id
                        WHERE types.code = "valid_id"
                        GROUP BY files.application_id
                    ) latest_valid_id ON latest_valid_id.latest_id = files.id
                 ) AS latest_valid_id ON latest_valid_id.application_id = latest_applications.id
                 LEFT JOIN stage_one_registrations AS stage_one
                    ON LOWER(stage_one.email) COLLATE utf8mb4_unicode_ci
                     = LOWER(users.email) COLLATE utf8mb4_unicode_ci
                 LEFT JOIN beneficiary_profiles
                    ON beneficiary_profiles.applicant_profile_id = applicant_profiles.id
                   AND beneficiary_profiles.replacement_for_beneficiary_profile_id IS NULL
                 WHERE stage_one.id IS NULL
                   AND (
                        beneficiary_profiles.id IS NULL
                        OR (
                            COALESCE(beneficiary_profiles.approved_at, beneficiary_profiles.approval_date) IS NULL
                            AND LOWER(COALESCE(beneficiary_profiles.beneficiary_status, "")) NOT IN ("active", "inactive", "deceased")
                        )
                   )
                 ORDER BY latest_applications.created_at ASC, applicant_profiles.id ASC'
            )->fetchAll(PDO::FETCH_ASSOC) ?: [];
        } catch (Throwable $exception) {
            log_database_query_failure('stage_one_registration.sync_legacy_selected.fetch', $exception);
            return;
        }

        if ($rows === []) {
            $synced = true;
            return;
        }

        $pdo->beginTransaction();

        try {
            $statement = $pdo->prepare(
                'INSERT INTO stage_one_registrations
                 (reference_code, first_name, middle_name, last_name, full_name, email, contact_number, complete_address,
                  birthdate, age, gender, barangay, is_4ps, educational_attainment, sector, sector_other_specify, livelihood_type, business_name,
                  profile_photo_path, profile_photo_original_name, profile_photo_mime_type, profile_photo_file_size,
                  business_photo_path, business_photo_original_name, business_photo_mime_type, business_photo_file_size,
                  valid_id_path, valid_id_original_name, valid_id_mime_type, valid_id_file_size,
                  validation_status, validated_by_user_id, validated_at, selection_email_sent_at, created_at, updated_at)
                 VALUES
                 (:reference_code, :first_name, :middle_name, :last_name, :full_name, :email, :contact_number, :complete_address,
                  :birthdate, :age, :gender, :barangay, :is_4ps, :educational_attainment, :sector, :sector_other_specify, :livelihood_type, :business_name,
                  :profile_photo_path, :profile_photo_original_name, :profile_photo_mime_type, :profile_photo_file_size,
                  :business_photo_path, :business_photo_original_name, :business_photo_mime_type, :business_photo_file_size,
                  :valid_id_path, :valid_id_original_name, :valid_id_mime_type, :valid_id_file_size,
                  :validation_status, NULL, :validated_at, :selection_email_sent_at, :created_at, :updated_at)'
            );

            foreach ($rows as $row) {
                $nameParts = $this->splitNameParts((string) ($row['full_name'] ?? ''));
                $createdAt = (string) ($row['application_created_at'] ?? '') !== ''
                    ? (string) $row['application_created_at']
                    : date('Y-m-d H:i:s');
                $updatedAt = (string) ($row['profile_updated_at'] ?? '') !== ''
                    ? (string) $row['profile_updated_at']
                    : $createdAt;

                $statement->execute([
                    'reference_code' => $this->generateReferenceCode($pdo),
                    'first_name' => $nameParts['firstName'],
                    'middle_name' => $nameParts['middleName'] !== '' ? $nameParts['middleName'] : null,
                    'last_name' => $nameParts['lastName'],
                    'full_name' => (string) ($row['full_name'] ?? ''),
                    'email' => strtolower(trim((string) ($row['email'] ?? ''))),
                    'contact_number' => (string) ($row['contact_number'] ?? ''),
                    'complete_address' => (string) ($row['address_line'] ?? ''),
                    'birthdate' => (string) ($row['birthdate'] ?? ''),
                    'age' => isset($row['age']) ? (int) $row['age'] : null,
                    'gender' => (string) ($row['gender'] ?? ''),
                    'barangay' => (string) ($row['profile_barangay_name'] ?? '') !== ''
                        ? (string) $row['profile_barangay_name']
                        : $this->barangayNameFromAddress((string) ($row['address_line'] ?? '')),
                    'is_4ps' => isset($row['is_4ps']) ? (int) $row['is_4ps'] : null,
                    'educational_attainment' => (string) ($row['profile_educational_attainment'] ?? '') !== ''
                        ? (string) $row['profile_educational_attainment']
                        : null,
                    'sector' => (string) ($row['sector'] ?? ''),
                    'sector_other_specify' => (string) ($row['profile_sector_other_specify'] ?? '') !== ''
                        ? (string) $row['profile_sector_other_specify']
                        : null,
                    'livelihood_type' => (string) ($row['livelihood_type'] ?? ''),
                    'business_name' => (string) ($row['business_name'] ?? ''),
                    'profile_photo_path' => '',
                    'profile_photo_original_name' => '',
                    'profile_photo_mime_type' => null,
                    'profile_photo_file_size' => null,
                    'business_photo_path' => '',
                    'business_photo_original_name' => '',
                    'business_photo_mime_type' => null,
                    'business_photo_file_size' => null,
                    'valid_id_path' => (string) ($row['valid_id_path'] ?? ''),
                    'valid_id_original_name' => (string) ($row['valid_id_original_name'] ?? ''),
                    'valid_id_mime_type' => (string) ($row['valid_id_mime_type'] ?? '') !== ''
                        ? (string) $row['valid_id_mime_type']
                        : null,
                    'valid_id_file_size' => isset($row['valid_id_file_size']) ? (int) $row['valid_id_file_size'] : null,
                    'validation_status' => self::STATUS_SELECTED,
                    'validated_at' => $createdAt,
                    'selection_email_sent_at' => $createdAt,
                    'created_at' => $createdAt,
                    'updated_at' => $updatedAt,
                ]);
            }

            $pdo->commit();
            $synced = true;
        } catch (Throwable $exception) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            log_database_query_failure('stage_one_registration.sync_legacy_selected.insert', $exception);
        }
    }

    private function hydrateLegacySelectedRegistrations(): void
    {
        static $hydrated = false;
        if ($hydrated) {
            return;
        }

        $pdo = db();
        $supportsEducationalAttainment = in_array('educational_attainment', $this->applicantProfileColumns(), true);
        $supportsSectorOtherSpecify = in_array('sector_other_specify', $this->applicantProfileColumns(), true);

        try {
            $rows = $pdo->query(
                'SELECT
                    stage_one.id,
                    stage_one.email,
                    stage_one.contact_number,
                    stage_one.complete_address,
                    stage_one.birthdate,
                    stage_one.age,
                    stage_one.gender,
                    stage_one.barangay,
                    stage_one.is_4ps,
                    stage_one.educational_attainment,
                    stage_one.sector,
                    stage_one.sector_other_specify,
                    stage_one.livelihood_type,
                    stage_one.business_name,
                    stage_one.valid_id_path,
                    stage_one.valid_id_original_name,
                    stage_one.valid_id_mime_type,
                    stage_one.valid_id_file_size,
                    applicant_profiles.contact_number AS profile_contact_number,
                    applicant_profiles.address_line AS profile_address_line,
                    applicant_profiles.birthdate AS profile_birthdate,
                    applicant_profiles.age AS profile_age,
                    applicant_profiles.gender AS profile_gender,
                    applicant_profiles.is_4ps AS profile_is_4ps,
                    applicant_profiles.sector AS profile_sector,
                    barangays.name AS profile_barangay_name,
                    ' . ($supportsEducationalAttainment ? 'applicant_profiles.educational_attainment AS profile_educational_attainment,' : 'NULL AS profile_educational_attainment,') . '
                    ' . ($supportsSectorOtherSpecify ? 'applicant_profiles.sector_other_specify AS profile_sector_other_specify,' : 'NULL AS profile_sector_other_specify,') . '
                    applicant_profiles.livelihood_type AS profile_livelihood_type,
                    applicant_profiles.business_name AS profile_business_name,
                    latest_valid_id.file_path AS latest_valid_id_path,
                    latest_valid_id.original_name AS latest_valid_id_original_name,
                    latest_valid_id.mime_type AS latest_valid_id_mime_type,
                    latest_valid_id.file_size AS latest_valid_id_file_size
                 FROM stage_one_registrations AS stage_one
                 INNER JOIN users
                    ON LOWER(users.email) COLLATE utf8mb4_unicode_ci
                     = LOWER(stage_one.email) COLLATE utf8mb4_unicode_ci
                 INNER JOIN applicant_profiles ON applicant_profiles.user_id = users.id
                 LEFT JOIN barangays ON barangays.id = applicant_profiles.barangay_id
                 LEFT JOIN (
                    SELECT files.application_id, files.file_path, files.original_name, files.mime_type, files.file_size
                    FROM initial_requirement_files AS files
                    INNER JOIN initial_requirement_types AS types ON types.id = files.requirement_type_id
                    INNER JOIN (
                        SELECT files.application_id, MAX(files.id) AS latest_id
                        FROM initial_requirement_files AS files
                        INNER JOIN initial_requirement_types AS types ON types.id = files.requirement_type_id
                        WHERE types.code = "valid_id"
                        GROUP BY files.application_id
                    ) latest_valid_id ON latest_valid_id.latest_id = files.id
                 ) AS latest_valid_id ON latest_valid_id.application_id = (
                    SELECT applications.id
                    FROM applications
                    WHERE applications.applicant_profile_id = applicant_profiles.id
                    ORDER BY applications.id DESC
                    LIMIT 1
                 )
                 WHERE stage_one.validation_status = "selected"'
            )->fetchAll(PDO::FETCH_ASSOC) ?: [];
        } catch (Throwable $exception) {
            log_database_query_failure('stage_one_registration.hydrate_legacy_selected.fetch', $exception);
            return;
        }

        if ($rows === []) {
            $hydrated = true;
            return;
        }

        $statement = $pdo->prepare(
            'UPDATE stage_one_registrations
             SET contact_number = :contact_number,
                 complete_address = :complete_address,
                 birthdate = :birthdate,
                 age = :age,
                 gender = :gender,
                 barangay = :barangay,
                 is_4ps = :is_4ps,
                 educational_attainment = :educational_attainment,
                 sector = :sector,
                 sector_other_specify = :sector_other_specify,
                 livelihood_type = :livelihood_type,
                 business_name = :business_name,
                 valid_id_path = :valid_id_path,
                 valid_id_original_name = :valid_id_original_name,
                 valid_id_mime_type = :valid_id_mime_type,
                 valid_id_file_size = :valid_id_file_size,
                 updated_at = NOW()
             WHERE id = :id'
        );

        try {
            foreach ($rows as $row) {
                $completeAddress = trim((string) ($row['complete_address'] ?? '')) !== ''
                    ? (string) $row['complete_address']
                    : (string) ($row['profile_address_line'] ?? '');
                $barangay = trim((string) ($row['barangay'] ?? '')) !== ''
                    ? (string) $row['barangay']
                    : ((string) ($row['profile_barangay_name'] ?? '') !== ''
                        ? (string) $row['profile_barangay_name']
                        : $this->barangayNameFromAddress((string) ($row['profile_address_line'] ?? '')));

                $statement->execute([
                    'id' => (int) ($row['id'] ?? 0),
                    'contact_number' => trim((string) ($row['contact_number'] ?? '')) !== ''
                        ? (string) $row['contact_number']
                        : (string) ($row['profile_contact_number'] ?? ''),
                    'complete_address' => $completeAddress,
                    'birthdate' => trim((string) ($row['birthdate'] ?? '')) !== ''
                        ? (string) $row['birthdate']
                        : ((string) ($row['profile_birthdate'] ?? '') !== '' ? (string) $row['profile_birthdate'] : null),
                    'age' => !empty($row['age'])
                        ? (int) $row['age']
                        : (!empty($row['profile_age']) ? (int) $row['profile_age'] : null),
                    'gender' => trim((string) ($row['gender'] ?? '')) !== ''
                        ? (string) $row['gender']
                        : (string) ($row['profile_gender'] ?? ''),
                    'barangay' => $barangay !== '' ? $barangay : null,
                    'is_4ps' => $row['is_4ps'] !== null
                        ? (int) $row['is_4ps']
                        : ($row['profile_is_4ps'] !== null ? (int) $row['profile_is_4ps'] : null),
                    'educational_attainment' => trim((string) ($row['educational_attainment'] ?? '')) !== ''
                        ? (string) $row['educational_attainment']
                        : ((string) ($row['profile_educational_attainment'] ?? '') !== '' ? (string) $row['profile_educational_attainment'] : null),
                    'sector' => trim((string) ($row['sector'] ?? '')) !== ''
                        ? (string) $row['sector']
                        : (string) ($row['profile_sector'] ?? ''),
                    'sector_other_specify' => trim((string) ($row['sector_other_specify'] ?? '')) !== ''
                        ? (string) $row['sector_other_specify']
                        : ((string) ($row['profile_sector_other_specify'] ?? '') !== '' ? (string) $row['profile_sector_other_specify'] : null),
                    'livelihood_type' => trim((string) ($row['livelihood_type'] ?? '')) !== ''
                        ? (string) $row['livelihood_type']
                        : (string) ($row['profile_livelihood_type'] ?? ''),
                    'business_name' => trim((string) ($row['business_name'] ?? '')) !== ''
                        ? (string) $row['business_name']
                        : (string) ($row['profile_business_name'] ?? ''),
                    'valid_id_path' => trim((string) ($row['valid_id_path'] ?? '')) !== ''
                        ? (string) $row['valid_id_path']
                        : (string) ($row['latest_valid_id_path'] ?? ''),
                    'valid_id_original_name' => trim((string) ($row['valid_id_original_name'] ?? '')) !== ''
                        ? (string) $row['valid_id_original_name']
                        : (string) ($row['latest_valid_id_original_name'] ?? ''),
                    'valid_id_mime_type' => trim((string) ($row['valid_id_mime_type'] ?? '')) !== ''
                        ? (string) $row['valid_id_mime_type']
                        : ((string) ($row['latest_valid_id_mime_type'] ?? '') !== '' ? (string) $row['latest_valid_id_mime_type'] : null),
                    'valid_id_file_size' => !empty($row['valid_id_file_size'])
                        ? (int) $row['valid_id_file_size']
                        : (!empty($row['latest_valid_id_file_size']) ? (int) $row['latest_valid_id_file_size'] : null),
                ]);
            }

            $hydrated = true;
        } catch (Throwable $exception) {
            log_database_query_failure('stage_one_registration.hydrate_legacy_selected.update', $exception);
        }
    }

    private function splitNameParts(string $fullName): array
    {
        $parts = array_values(array_filter(preg_split('/\s+/', trim($fullName)) ?: [], static fn (string $value): bool => $value !== ''));
        $firstName = $parts[0] ?? 'Legacy';
        $lastName = count($parts) > 1 ? (string) array_pop($parts) : 'Applicant';
        $middleName = count($parts) > 1 ? trim(implode(' ', array_slice($parts, 1))) : '';

        return [
            'firstName' => $firstName,
            'middleName' => $middleName,
            'lastName' => $lastName,
        ];
    }

    private function issueEmailVerificationCode(string $email, string $fullName): array
    {
        $email = strtolower(trim($email));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return ['ok' => false, 'message' => 'Enter a valid email address.'];
        }

        $code = (string) random_int(100000, 999999);
        $expiresAt = date('Y-m-d H:i:s', time() + (self::EMAIL_VERIFICATION_EXPIRY_MINUTES * 60));

        try {
            db()->prepare(
                'INSERT INTO stage_one_email_verification_codes (email, full_name, code_hash, expires_at, attempts)
                 VALUES (:email, :full_name, :code_hash, :expires_at, 0)'
            )->execute([
                'email' => $email,
                'full_name' => $fullName !== '' ? $fullName : 'Applicant',
                'code_hash' => password_hash($code, PASSWORD_DEFAULT),
                'expires_at' => $expiresAt,
            ]);
        } catch (Throwable $exception) {
            log_database_query_failure('stage_one_registration.email_verification.create', $exception, ['email' => $email]);
            return ['ok' => false, 'message' => 'Unable to create an email verification code right now.'];
        }

        $body = sprintf(
            '<p>Good day %s,</p><p>Your SMART LEAP registration verification code is <strong style="font-size:1.2rem; letter-spacing:0.18em;">%s</strong>.</p><p>This code expires in %d minutes. Enter it in the registration modal to submit your application for Admin validation.</p><p>If you did not request this code, you can ignore this message.</p>',
            htmlspecialchars($fullName !== '' ? $fullName : 'Applicant', ENT_QUOTES),
            htmlspecialchars($code, ENT_QUOTES),
            self::EMAIL_VERIFICATION_EXPIRY_MINUTES
        );

        $sent = (new MailService())->send($email, 'SMART LEAP Registration Verification Code', $body, null);
        if (!$sent) {
            return [
                'ok' => false,
                'message' => 'We could not send a code to that email. Please check the email spelling or try another address.',
                'errors' => ['email' => 'The verification email could not be delivered.'],
            ];
        }

        return [
            'ok' => true,
            'message' => 'Verification code sent. Check your email inbox or spam folder.',
            'expiresInMinutes' => self::EMAIL_VERIFICATION_EXPIRY_MINUTES,
        ];
    }

    private function verifyEmailVerificationCode(string $email, string $code): array
    {
        $email = strtolower(trim($email));
        $code = trim($code);
        if (!filter_var($email, FILTER_VALIDATE_EMAIL) || $code === '') {
            return ['ok' => false, 'message' => 'Enter the six-digit code sent to your email.'];
        }

        $statement = db()->prepare(
            'SELECT id, code_hash, expires_at, attempts, consumed_at
             FROM stage_one_email_verification_codes
             WHERE email = :email
             ORDER BY id DESC
             LIMIT 1'
        );
        $statement->execute(['email' => $email]);
        $challenge = $statement->fetch(PDO::FETCH_ASSOC);

        if (!is_array($challenge)) {
            return ['ok' => false, 'message' => 'No active email verification code was found. Send a new code first.'];
        }

        if ($challenge['consumed_at'] !== null) {
            return ['ok' => false, 'message' => 'That verification code has already been used. Send a new code.'];
        }

        if (strtotime((string) $challenge['expires_at']) < time()) {
            return ['ok' => false, 'message' => 'That verification code has expired. Send a new code.'];
        }

        if ((int) $challenge['attempts'] >= self::EMAIL_VERIFICATION_MAX_ATTEMPTS) {
            return ['ok' => false, 'message' => 'Too many failed attempts. Send a new verification code.'];
        }

        if (!password_verify($code, (string) $challenge['code_hash'])) {
            db()->prepare(
                'UPDATE stage_one_email_verification_codes
                 SET attempts = attempts + 1, updated_at = NOW()
                 WHERE id = :id'
            )->execute(['id' => (int) $challenge['id']]);

            return ['ok' => false, 'message' => 'The verification code is incorrect.'];
        }

        db()->prepare(
            'UPDATE stage_one_email_verification_codes
             SET consumed_at = NOW(), updated_at = NOW()
             WHERE id = :id'
        )->execute(['id' => (int) $challenge['id']]);

        return ['ok' => true];
    }

    private function sendSelectionEmail(array $registration): bool
    {
        $recipient = trim((string) ($registration['email'] ?? ''));
        if ($recipient === '' || !filter_var($recipient, FILTER_VALIDATE_EMAIL)) {
            return false;
        }

        $name = htmlspecialchars((string) ($registration['fullName'] ?? 'Applicant'), ENT_QUOTES);
        $activationUrl = htmlspecialchars(app_url('signup?email=' . urlencode($recipient)), ENT_QUOTES);
        $portalLoginUrl = htmlspecialchars(app_url('portal-login'), ENT_QUOTES);
        $subject = 'SMART LEAP Registration Approved';
        $body = sprintf(
            '<p>Hello %s,</p>'
            . '<p>Your SMART LEAP registration has been selected for the current batch.</p>'
            . '<p>Your email was already verified during registration, so you only need to set your portal password using this link:</p>'
            . '<p><a href="%s">%s</a></p>'
            . '<p>After setting your password, you will be redirected to your applicant portal.</p>'
            . '<p>Applicant Portal Login: <a href="%s">%s</a></p>',
            $name,
            $activationUrl,
            $activationUrl,
            $portalLoginUrl,
            $portalLoginUrl
        );

        return (new MailService())->send($recipient, $subject, $body, null);
    }

    private function persistSelectionEmailStatus(int $registrationId, string $recipientEmail, bool $emailSent): void
    {
        if ($registrationId <= 0) {
            return;
        }

        $errorMessage = null;
        if (!$emailSent) {
            $statement = db()->prepare(
                'SELECT error_message
                 FROM email_logs
                WHERE recipient_email = :recipient_email
                   AND subject = :subject
                 ORDER BY id DESC
                 LIMIT 1'
            );
            $statement->execute([
                'recipient_email' => $recipientEmail,
                'subject' => 'SMART LEAP Registration Approved',
            ]);
            $errorMessage = $statement->fetchColumn();
            $errorMessage = is_string($errorMessage) ? trim($errorMessage) : null;
        }

        db()->prepare(
            'UPDATE stage_one_registrations
             SET selection_email_sent_at = :selection_email_sent_at,
                 selection_email_failed_at = :selection_email_failed_at,
                 selection_email_error = :selection_email_error,
                 updated_at = NOW()
             WHERE id = :id'
        )->execute([
            'selection_email_sent_at' => $emailSent ? date('Y-m-d H:i:s') : null,
            'selection_email_failed_at' => $emailSent ? null : date('Y-m-d H:i:s'),
            'selection_email_error' => $emailSent ? null : ($errorMessage !== '' ? $errorMessage : 'Email delivery failed.'),
            'id' => $registrationId,
        ]);
    }

    private function applicantProfileColumns(): array
    {
        if ($this->applicantProfileColumns !== null) {
            return $this->applicantProfileColumns;
        }

        try {
            $rows = db()->query('SHOW COLUMNS FROM applicant_profiles')->fetchAll(PDO::FETCH_ASSOC) ?: [];
        } catch (Throwable $exception) {
            log_database_query_failure('stage_one_registration.applicant_profile_columns', $exception);
            $this->applicantProfileColumns = [];
            return $this->applicantProfileColumns;
        }

        $this->applicantProfileColumns = array_values(array_filter(array_map(
            static fn (array $row): string => (string) ($row['Field'] ?? ''),
            $rows
        )));

        return $this->applicantProfileColumns;
    }

    private function emailExistsInPortalUsers(string $email): bool
    {
        $statement = db()->prepare('SELECT COUNT(*) FROM users WHERE email = :email');
        $statement->execute(['email' => $email]);
        return (int) ($statement->fetchColumn() ?: 0) > 0;
    }

    private function emailExistsInStageOne(string $email): bool
    {
        $statement = db()->prepare('SELECT COUNT(*) FROM stage_one_registrations WHERE email = :email');
        $statement->execute(['email' => $email]);
        return (int) ($statement->fetchColumn() ?: 0) > 0;
    }

    private function generateReferenceCode(PDO $pdo): string
    {
        $year = date('Y');
        $statement = $pdo->prepare(
            'SELECT reference_code
             FROM stage_one_registrations
             WHERE reference_code LIKE :reference
             ORDER BY id DESC
             LIMIT 1'
        );
        $statement->execute(['reference' => 'SL1-' . $year . '-%']);
        $lastCode = (string) ($statement->fetchColumn() ?: '');
        $sequence = 1;

        if (preg_match('/^SL1-\d{4}-(\d{4})$/', $lastCode, $matches)) {
            $sequence = ((int) $matches[1]) + 1;
        }

        return sprintf('SL1-%s-%04d', $year, $sequence);
    }

    private function ensureSchema(): void
    {
        static $ready = false;
        if ($ready) {
            return;
        }

        db()->exec(
            'CREATE TABLE IF NOT EXISTS stage_one_registrations (
                id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                reference_code VARCHAR(40) NOT NULL UNIQUE,
                first_name VARCHAR(80) NOT NULL,
                middle_name VARCHAR(80) NULL,
                last_name VARCHAR(80) NOT NULL,
                full_name VARCHAR(180) NOT NULL,
                email VARCHAR(160) NOT NULL,
                contact_number VARCHAR(40) NOT NULL,
                complete_address TEXT NOT NULL,
                birthdate DATE NULL,
                age TINYINT UNSIGNED NULL,
                gender VARCHAR(40) NULL,
                barangay VARCHAR(120) NULL,
                is_4ps TINYINT(1) NULL,
                educational_attainment VARCHAR(80) NULL,
                sector VARCHAR(120) NULL,
                sector_other_specify VARCHAR(180) NULL,
                livelihood_type VARCHAR(160) NULL,
                business_name VARCHAR(180) NULL,
                profile_photo_path VARCHAR(255) NOT NULL DEFAULT "",
                profile_photo_original_name VARCHAR(255) NOT NULL DEFAULT "",
                profile_photo_mime_type VARCHAR(120) NULL,
                profile_photo_file_size BIGINT UNSIGNED NULL,
                business_photo_path VARCHAR(255) NOT NULL,
                business_photo_original_name VARCHAR(255) NOT NULL,
                business_photo_mime_type VARCHAR(120) NULL,
                business_photo_file_size BIGINT UNSIGNED NULL,
                valid_id_path VARCHAR(255) NOT NULL,
                valid_id_original_name VARCHAR(255) NOT NULL,
                valid_id_mime_type VARCHAR(120) NULL,
                valid_id_file_size BIGINT UNSIGNED NULL,
                hardcopy_form_path VARCHAR(255) NOT NULL DEFAULT "",
                hardcopy_form_original_name VARCHAR(255) NOT NULL DEFAULT "",
                hardcopy_form_mime_type VARCHAR(120) NULL,
                hardcopy_form_file_size BIGINT UNSIGNED NULL,
                submission_channel VARCHAR(40) NOT NULL DEFAULT "public_online",
                encoded_by_user_id BIGINT UNSIGNED NULL,
                encoded_at DATETIME NULL,
                validation_status VARCHAR(40) NOT NULL DEFAULT "pending",
                validated_by_user_id BIGINT UNSIGNED NULL,
                validated_at DATETIME NULL,
                selection_email_sent_at DATETIME NULL,
                selection_email_failed_at DATETIME NULL,
                selection_email_error TEXT NULL,
                created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                CONSTRAINT fk_stage_one_registrations_reviewer FOREIGN KEY (validated_by_user_id) REFERENCES users(id),
                INDEX idx_stage_one_registrations_status (validation_status),
                INDEX idx_stage_one_registrations_email (email),
                INDEX idx_stage_one_registrations_created_at (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );

        db()->exec(
            'CREATE TABLE IF NOT EXISTS stage_one_email_verification_codes (
                id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                email VARCHAR(160) NOT NULL,
                full_name VARCHAR(180) NOT NULL DEFAULT "",
                code_hash VARCHAR(255) NOT NULL,
                attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
                expires_at DATETIME NOT NULL,
                consumed_at DATETIME NULL,
                created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_stage_one_email_verification_email (email),
                INDEX idx_stage_one_email_verification_created_at (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );

        $this->ensureColumn('stage_one_registrations', 'birthdate', 'DATE NULL AFTER complete_address');
        $this->ensureColumn('stage_one_registrations', 'age', 'TINYINT UNSIGNED NULL AFTER birthdate');
        $this->ensureColumn('stage_one_registrations', 'gender', 'VARCHAR(40) NULL AFTER age');
        $this->ensureColumn('stage_one_registrations', 'barangay', 'VARCHAR(120) NULL AFTER gender');
        $this->ensureColumn('stage_one_registrations', 'is_4ps', 'TINYINT(1) NULL AFTER barangay');
        $this->ensureColumn('stage_one_registrations', 'educational_attainment', 'VARCHAR(80) NULL AFTER is_4ps');
        $this->ensureColumn('stage_one_registrations', 'sector', 'VARCHAR(120) NULL AFTER educational_attainment');
        $this->ensureColumn('stage_one_registrations', 'sector_other_specify', 'VARCHAR(180) NULL AFTER sector');
        $this->ensureColumn('stage_one_registrations', 'livelihood_type', 'VARCHAR(160) NULL AFTER sector_other_specify');
        $this->ensureColumn('stage_one_registrations', 'business_name', 'VARCHAR(180) NULL AFTER livelihood_type');
        $this->ensureColumn('stage_one_registrations', 'profile_photo_path', 'VARCHAR(255) NOT NULL DEFAULT "" AFTER business_name');
        $this->ensureColumn('stage_one_registrations', 'profile_photo_original_name', 'VARCHAR(255) NOT NULL DEFAULT "" AFTER profile_photo_path');
        $this->ensureColumn('stage_one_registrations', 'profile_photo_mime_type', 'VARCHAR(120) NULL AFTER profile_photo_original_name');
        $this->ensureColumn('stage_one_registrations', 'profile_photo_file_size', 'BIGINT UNSIGNED NULL AFTER profile_photo_mime_type');
        $this->ensureColumn('stage_one_registrations', 'hardcopy_form_path', 'VARCHAR(255) NOT NULL DEFAULT "" AFTER valid_id_file_size');
        $this->ensureColumn('stage_one_registrations', 'hardcopy_form_original_name', 'VARCHAR(255) NOT NULL DEFAULT "" AFTER hardcopy_form_path');
        $this->ensureColumn('stage_one_registrations', 'hardcopy_form_mime_type', 'VARCHAR(120) NULL AFTER hardcopy_form_original_name');
        $this->ensureColumn('stage_one_registrations', 'hardcopy_form_file_size', 'BIGINT UNSIGNED NULL AFTER hardcopy_form_mime_type');
        $this->ensureColumn('stage_one_registrations', 'submission_channel', 'VARCHAR(40) NOT NULL DEFAULT "public_online" AFTER hardcopy_form_file_size');
        $this->ensureColumn('stage_one_registrations', 'encoded_by_user_id', 'BIGINT UNSIGNED NULL AFTER submission_channel');
        $this->ensureNullableDateColumn('stage_one_registrations', 'encoded_at', 'encoded_by_user_id');
        $this->ensureNullableDateColumn('stage_one_registrations', 'selection_email_sent_at', 'validated_at');
        $this->ensureNullableDateColumn('stage_one_registrations', 'selection_email_failed_at', 'selection_email_sent_at');
        $this->ensureNullableTextColumn('stage_one_registrations', 'selection_email_error', 'selection_email_failed_at');

        $ready = true;
    }

    private function barangayNameFromAddress(string $address): string
    {
        $normalized = strtolower($address);
        foreach ((new BarangayCatalogService())->all() as $row) {
            $name = trim((string) ($row['name'] ?? ''));
            if ($name !== '' && str_contains($normalized, strtolower($name))) {
                return $name;
            }
        }

        return '';
    }

    private function ensureColumn(string $table, string $column, string $definition): void
    {
        $statement = db()->prepare(
            'SELECT COUNT(*) FROM information_schema.columns
             WHERE table_schema = DATABASE()
               AND table_name = :table_name
               AND column_name = :column_name'
        );
        $statement->execute([
            'table_name' => $table,
            'column_name' => $column,
        ]);

        if ((int) $statement->fetchColumn() > 0) {
            return;
        }

        db()->exec(sprintf('ALTER TABLE %s ADD COLUMN %s %s', $table, $column, $definition));
    }

    private function ensureNullableDateColumn(string $table, string $column, string $afterColumn): void
    {
        $this->ensureColumn($table, $column, sprintf('DATETIME NULL AFTER %s', $afterColumn));
    }

    private function ensureNullableTextColumn(string $table, string $column, string $afterColumn): void
    {
        $this->ensureColumn($table, $column, sprintf('TEXT NULL AFTER %s', $afterColumn));
    }
}
