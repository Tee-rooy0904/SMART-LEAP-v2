<?php
declare(strict_types=1);

namespace App\Services;

use PDO;

class CoMakerRegistrationService
{
    public const STATUS_PENDING_REVIEW = 'pending_review';
    public const STATUS_APPROVED = 'approved';
    public const STATUS_REJECTED = 'rejected';
    public const STATUS_INACTIVE = 'inactive';
    public const LEGACY_STATUS_ACTIVE = 'active';

    private ?bool $structuredUserNameColumns = null;

    public function ensureSchema(): void
    {
        static $ensured = false;
        if ($ensured) {
            return;
        }

        db()->exec(
            'CREATE TABLE IF NOT EXISTS co_maker_registrations (
                id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                deceased_beneficiary_profile_id BIGINT UNSIGNED NOT NULL,
                user_id BIGINT UNSIGNED NOT NULL,
                beneficiary_profile_id BIGINT UNSIGNED NOT NULL,
                relationship_to_beneficiary VARCHAR(160) NOT NULL,
                contact_number VARCHAR(40) NULL,
                age INT UNSIGNED NULL,
                gender VARCHAR(40) NULL,
                valid_id_file_path VARCHAR(255) NULL,
                valid_id_original_name VARCHAR(255) NULL,
                valid_id_mime_type VARCHAR(120) NULL,
                valid_id_file_size INT UNSIGNED NULL,
                relationship_document_path VARCHAR(255) NULL,
                relationship_document_original_name VARCHAR(255) NULL,
                relationship_document_mime_type VARCHAR(120) NULL,
                relationship_document_file_size INT UNSIGNED NULL,
                registration_status VARCHAR(40) NOT NULL DEFAULT "active",
                created_by_user_id BIGINT UNSIGNED NULL,
                updated_by_user_id BIGINT UNSIGNED NULL,
                created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uniq_co_maker_primary (deceased_beneficiary_profile_id),
                UNIQUE KEY uniq_co_maker_user (user_id),
                UNIQUE KEY uniq_co_maker_beneficiary_profile (beneficiary_profile_id),
                KEY idx_co_maker_status (registration_status)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );

        db()->exec(
            'CREATE TABLE IF NOT EXISTS co_maker_registration_invitations (
                id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                beneficiary_profile_id BIGINT UNSIGNED NOT NULL,
                recipient_email VARCHAR(160) NOT NULL,
                token_hash CHAR(64) NOT NULL,
                sent_by_user_id BIGINT UNSIGNED NULL,
                used_at TIMESTAMP NULL DEFAULT NULL,
                expires_at DATETIME NOT NULL,
                created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uniq_co_maker_invitation_token (token_hash),
                KEY idx_co_maker_invitation_beneficiary (beneficiary_profile_id),
                KEY idx_co_maker_invitation_email (recipient_email)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );

        $ageColumn = db()->prepare(
            'SELECT COUNT(*) FROM information_schema.columns
             WHERE table_schema = DATABASE()
               AND table_name = :table_name
               AND column_name = :column_name'
        );
        $ageColumn->execute([
            'table_name' => 'co_maker_registrations',
            'column_name' => 'age',
        ]);
        if ((int) $ageColumn->fetchColumn() === 0) {
            db()->exec(
                'ALTER TABLE co_maker_registrations
                   ADD COLUMN age INT UNSIGNED NULL
                   AFTER contact_number'
            );
        }

        $genderColumn = db()->prepare(
            'SELECT COUNT(*) FROM information_schema.columns
             WHERE table_schema = DATABASE()
               AND table_name = :table_name
               AND column_name = :column_name'
        );
        $genderColumn->execute([
            'table_name' => 'co_maker_registrations',
            'column_name' => 'gender',
        ]);
        if ((int) $genderColumn->fetchColumn() === 0) {
            db()->exec(
                'ALTER TABLE co_maker_registrations
                   ADD COLUMN gender VARCHAR(40) NULL
                   AFTER age'
            );
        }

        $ensured = true;
    }

    public function registrationForUser(int $userId): ?array
    {
        $this->ensureSchema();
        if ($userId <= 0) {
            return null;
        }

        $statement = db()->prepare(
            'SELECT
                co_maker_registrations.id,
                co_maker_registrations.user_id,
                co_maker_registrations.beneficiary_profile_id,
                co_maker_registrations.deceased_beneficiary_profile_id,
                co_maker_registrations.relationship_to_beneficiary,
                co_maker_registrations.contact_number,
                co_maker_registrations.age,
                co_maker_registrations.gender,
                co_maker_registrations.valid_id_file_path,
                co_maker_registrations.valid_id_original_name,
                co_maker_registrations.valid_id_mime_type,
                co_maker_registrations.valid_id_file_size,
                co_maker_registrations.relationship_document_path,
                co_maker_registrations.relationship_document_original_name,
                co_maker_registrations.relationship_document_mime_type,
                co_maker_registrations.relationship_document_file_size,
                co_maker_registrations.registration_status,
                co_maker_users.full_name AS co_maker_name,
                co_maker_users.email AS co_maker_email,
                deceased_users.full_name AS primary_beneficiary_name,
                applicant_profiles.business_name AS primary_business_name,
                applicant_profiles.address_line AS primary_address,
                barangays.name AS primary_barangay,
                assigned_users.full_name AS assigned_pdo_name,
                assigned_users.email AS assigned_pdo_email
             FROM co_maker_registrations
             INNER JOIN users AS co_maker_users ON co_maker_users.id = co_maker_registrations.user_id
             INNER JOIN beneficiary_profiles AS deceased_profiles
                ON deceased_profiles.id = co_maker_registrations.deceased_beneficiary_profile_id
             INNER JOIN users AS deceased_users ON deceased_users.id = deceased_profiles.user_id
             LEFT JOIN applicant_profiles ON applicant_profiles.id = deceased_profiles.applicant_profile_id
             LEFT JOIN barangays ON barangays.id = applicant_profiles.barangay_id
             LEFT JOIN staff_profiles AS assigned_staff ON assigned_staff.id = deceased_profiles.assigned_staff_profile_id
             LEFT JOIN users AS assigned_users ON assigned_users.id = assigned_staff.user_id
             WHERE co_maker_registrations.user_id = :user_id
             LIMIT 1'
        );
        $statement->execute(['user_id' => $userId]);
        $row = $statement->fetch(PDO::FETCH_ASSOC);

        return is_array($row) ? $this->mapRegistrationRow($row) : null;
    }

    public function registrationForPrimaryBeneficiary(int $beneficiaryProfileId): ?array
    {
        $this->ensureSchema();
        if ($beneficiaryProfileId <= 0) {
            return null;
        }

        $statement = db()->prepare(
            'SELECT
                co_maker_registrations.id,
                co_maker_registrations.user_id,
                co_maker_registrations.beneficiary_profile_id,
                co_maker_registrations.deceased_beneficiary_profile_id,
                co_maker_registrations.relationship_to_beneficiary,
                co_maker_registrations.contact_number,
                co_maker_registrations.age,
                co_maker_registrations.gender,
                co_maker_registrations.valid_id_file_path,
                co_maker_registrations.valid_id_original_name,
                co_maker_registrations.valid_id_mime_type,
                co_maker_registrations.valid_id_file_size,
                co_maker_registrations.relationship_document_path,
                co_maker_registrations.relationship_document_original_name,
                co_maker_registrations.relationship_document_mime_type,
                co_maker_registrations.relationship_document_file_size,
                co_maker_registrations.registration_status,
                co_maker_users.full_name AS co_maker_name,
                co_maker_users.email AS co_maker_email
             FROM co_maker_registrations
             INNER JOIN users AS co_maker_users ON co_maker_users.id = co_maker_registrations.user_id
             WHERE co_maker_registrations.deceased_beneficiary_profile_id = :beneficiary_profile_id
             LIMIT 1'
        );
        $statement->execute(['beneficiary_profile_id' => $beneficiaryProfileId]);
        $row = $statement->fetch(PDO::FETCH_ASSOC);

        return is_array($row) ? $this->mapRegistrationRow($row) : null;
    }

    public function listForActor(array $actor): array
    {
        $this->ensureSchema();

        if (!$this->canViewRegistrations($actor)) {
            return [];
        }

        $params = [];
        $joins = [];

        $statement = db()->prepare(
            'SELECT
                co_maker_registrations.id,
                co_maker_registrations.user_id,
                co_maker_registrations.beneficiary_profile_id,
                co_maker_registrations.deceased_beneficiary_profile_id,
                co_maker_registrations.relationship_to_beneficiary,
                co_maker_registrations.contact_number,
                co_maker_registrations.age,
                co_maker_registrations.gender,
                co_maker_registrations.valid_id_file_path,
                co_maker_registrations.valid_id_original_name,
                co_maker_registrations.valid_id_mime_type,
                co_maker_registrations.valid_id_file_size,
                co_maker_registrations.relationship_document_path,
                co_maker_registrations.relationship_document_original_name,
                co_maker_registrations.relationship_document_mime_type,
                co_maker_registrations.relationship_document_file_size,
                co_maker_registrations.registration_status,
                co_maker_registrations.created_at,
                co_maker_registrations.updated_at,
                co_maker_users.full_name AS co_maker_name,
                co_maker_users.email AS co_maker_email,
                co_maker_users.is_active AS co_maker_is_active,
                deceased_profiles.beneficiary_status AS primary_beneficiary_status,
                deceased_users.full_name AS primary_beneficiary_name,
                applicant_profiles.business_name AS primary_business_name,
                applicant_profiles.address_line AS primary_address,
                barangays.name AS primary_barangay,
                assigned_users.full_name AS assigned_pdo_name,
                assigned_users.email AS assigned_pdo_email
             FROM co_maker_registrations
             INNER JOIN users AS co_maker_users ON co_maker_users.id = co_maker_registrations.user_id
             INNER JOIN beneficiary_profiles AS deceased_profiles
                ON deceased_profiles.id = co_maker_registrations.deceased_beneficiary_profile_id
             INNER JOIN users AS deceased_users ON deceased_users.id = deceased_profiles.user_id
             LEFT JOIN applicant_profiles ON applicant_profiles.id = deceased_profiles.applicant_profile_id
             LEFT JOIN barangays ON barangays.id = applicant_profiles.barangay_id
             LEFT JOIN staff_profiles AS assigned_staff ON assigned_staff.id = deceased_profiles.assigned_staff_profile_id
             LEFT JOIN users AS assigned_users ON assigned_users.id = assigned_staff.user_id
             ' . implode("\n", $joins) . '
             ORDER BY FIELD(LOWER(COALESCE(co_maker_registrations.registration_status, "")), "pending_review", "approved", "active", "rejected", "inactive"),
                      co_maker_registrations.updated_at DESC,
                      co_maker_registrations.id DESC'
        );
        $statement->execute($params);

        return array_map(function (array $row): array {
            $mapped = $this->mapRegistrationRow($row);
            $mapped['createdAt'] = (string) ($row['created_at'] ?? '');
            $mapped['updatedAt'] = (string) ($row['updated_at'] ?? '');
            $mapped['primaryBeneficiaryStatus'] = (string) ($row['primary_beneficiary_status'] ?? '');
            $mapped['accountActive'] = ((int) ($row['co_maker_is_active'] ?? 0)) === 1;

            return $mapped;
        }, $statement->fetchAll(PDO::FETCH_ASSOC) ?: []);
    }

    public function reviewForActor(array $actor, int $registrationId, string $decision): array
    {
        $this->ensureSchema();

        if (!$this->isAdminActor($actor)) {
            return ['ok' => false, 'message' => 'Only Admin can review co-maker registrations.'];
        }

        $registration = $this->findRegistrationForActor($actor, $registrationId);
        if ($registration === null) {
            return ['ok' => false, 'message' => 'Co-maker registration not found in your scope.'];
        }

        $normalizedDecision = strtolower(trim($decision));
        if (!in_array($normalizedDecision, ['approve', 'reject'], true)) {
            return ['ok' => false, 'message' => 'Unsupported co-maker review decision.'];
        }

        $pdo = db();
        $pdo->beginTransaction();

        try {
            $nextStatus = $normalizedDecision === 'approve' ? self::STATUS_APPROVED : self::STATUS_REJECTED;

            if ($normalizedDecision === 'approve') {
                $primary = $this->findPublicPrimaryBeneficiary((int) ($registration['deceasedBeneficiaryProfileId'] ?? 0));
                if ($primary === null) {
                    throw new \RuntimeException('Primary beneficiary record is unavailable.');
                }
                if (strtolower(trim((string) ($primary['beneficiary_status'] ?? ''))) !== BeneficiaryProfileService::STATUS_DECEASED) {
                    throw new \RuntimeException('The primary beneficiary must remain tagged deceased before approving the co-maker registration.');
                }

                $this->refreshCoMakerBeneficiaryProfile(
                    $pdo,
                    (int) ($registration['beneficiaryProfileId'] ?? 0),
                    (int) ($registration['deceasedBeneficiaryProfileId'] ?? 0),
                    (int) ($primary['assigned_staff_profile_id'] ?? 0),
                    BeneficiaryProfileService::STATUS_ACTIVE
                );
                $this->clearOtherSuccessorLinks(
                    $pdo,
                    (int) ($registration['deceasedBeneficiaryProfileId'] ?? 0),
                    (int) ($registration['beneficiaryProfileId'] ?? 0)
                );
                $this->setUserActivation($pdo, (int) ($registration['userId'] ?? 0), true);
            } else {
                $this->refreshCoMakerBeneficiaryProfile(
                    $pdo,
                    (int) ($registration['beneficiaryProfileId'] ?? 0),
                    0,
                    0,
                    BeneficiaryProfileService::STATUS_INACTIVE
                );
                $this->setUserActivation($pdo, (int) ($registration['userId'] ?? 0), false);
            }

            $pdo->prepare(
                'UPDATE co_maker_registrations
                 SET registration_status = :registration_status,
                     updated_by_user_id = :updated_by_user_id,
                     updated_at = NOW()
                 WHERE id = :id'
            )->execute([
                'registration_status' => $nextStatus,
                'updated_by_user_id' => (int) ($actor['id'] ?? 0) ?: null,
                'id' => $registrationId,
            ]);

            $pdo->commit();
        } catch (\Throwable $exception) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }

            log_database_query_failure('co_maker_registrations.review_for_actor', $exception, [
                'registration_id' => $registrationId,
                'actor_user_id' => (int) ($actor['id'] ?? 0),
                'decision' => $normalizedDecision,
            ]);

            if ($exception instanceof \RuntimeException) {
                return ['ok' => false, 'message' => $exception->getMessage()];
            }

            return ['ok' => false, 'message' => 'Unable to review the co-maker registration right now.'];
        }

        return [
            'ok' => true,
            'message' => $normalizedDecision === 'approve'
                ? 'Co-maker registration approved. Portal access is now active.'
                : 'Co-maker registration rejected. Portal access remains disabled.',
            'registration' => $this->findRegistrationForActor($actor, $registrationId),
        ];
    }

    public function sendRegistrationLinkForAdmin(array $actor, int $beneficiaryProfileId, string $recipientEmail): array
    {
        $this->ensureSchema();

        if (!$this->isAdminActor($actor)) {
            return ['ok' => false, 'message' => 'Only Admin can send co-maker registration emails.'];
        }

        $email = strtolower(trim($recipientEmail));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return ['ok' => false, 'message' => 'Enter a valid co-maker Gmail address.'];
        }
        if (!preg_match('/@(gmail\.com|googlemail\.com)$/i', $email)) {
            return ['ok' => false, 'message' => 'Use the co-maker Gmail address for the registration email.'];
        }

        $primary = $this->findPublicPrimaryBeneficiary($beneficiaryProfileId);
        if ($primary === null) {
            return ['ok' => false, 'message' => 'Beneficiary record is unavailable.'];
        }
        if (strtolower(trim((string) ($primary['beneficiary_status'] ?? ''))) !== BeneficiaryProfileService::STATUS_DECEASED) {
            return ['ok' => false, 'message' => 'The beneficiary must be marked deceased before sending a co-maker registration email.'];
        }

        $existing = $this->registrationForPrimaryBeneficiary($beneficiaryProfileId);
        if ($existing !== null) {
            return ['ok' => false, 'message' => 'A co-maker registration already exists for this beneficiary.'];
        }

        $token = bin2hex(random_bytes(32));
        $this->storeInvitation($beneficiaryProfileId, $email, $token, (int) ($actor['id'] ?? 0));
        $link = app_url('signup?mode=co-maker&beneficiary=' . urlencode((string) $beneficiaryProfileId) . '&invite=' . urlencode($token));
        $primaryName = (string) ($primary['primary_beneficiary_name'] ?? 'the deceased beneficiary');
        $businessName = (string) ($primary['primary_business_name'] ?? '');
        $barangay = (string) ($primary['primary_barangay'] ?? '');
        $subject = 'SMART LEAP Co-maker Registration Link';
        $body = sprintf(
            '<p>Good day,</p>
             <p>The City Social Welfare and Development Department has invited you to register as the co-maker for <strong>%s</strong>%s%s.</p>
             <p>Please open the official SMART LEAP registration link below using your Gmail account and complete the required information and document uploads:</p>
             <p><a href="%s">%s</a></p>
             <p>Your co-maker access will only become active after Admin review and approval.</p>
             <p>Thank you.</p>',
            htmlspecialchars($primaryName, ENT_QUOTES),
            $businessName !== '' ? ' - ' . htmlspecialchars($businessName, ENT_QUOTES) : '',
            $barangay !== '' ? ' of ' . htmlspecialchars($barangay, ENT_QUOTES) : '',
            htmlspecialchars($link, ENT_QUOTES),
            htmlspecialchars($link, ENT_QUOTES)
        );

        $sent = (new MailService())->send($email, $subject, $body, (int) ($actor['id'] ?? 0) ?: null);
        if (!$sent) {
            return ['ok' => false, 'message' => 'Unable to send the co-maker registration email right now.'];
        }

        return [
            'ok' => true,
            'message' => 'Co-maker registration email sent to Gmail.',
            'email' => $email,
        ];
    }

    public function sendRegistrationLinkForProjectOfficer(array $actor, int $beneficiaryProfileId, string $recipientEmail): array
    {
        $this->ensureSchema();

        if (!$this->isProjectOfficerActor($actor)) {
            return ['ok' => false, 'message' => 'Only the assigned PDO can send co-maker registration emails.'];
        }

        if (!$this->primaryBeneficiaryWithinProjectOfficerScope($actor, $beneficiaryProfileId)) {
            return ['ok' => false, 'message' => 'Beneficiary record not found in your scope.'];
        }

        $email = strtolower(trim($recipientEmail));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return ['ok' => false, 'message' => 'Enter a valid co-maker Gmail address.'];
        }
        if (!preg_match('/@(gmail\.com|googlemail\.com)$/i', $email)) {
            return ['ok' => false, 'message' => 'Use the co-maker Gmail address for the registration email.'];
        }

        $primary = $this->findPublicPrimaryBeneficiary($beneficiaryProfileId);
        if ($primary === null) {
            return ['ok' => false, 'message' => 'Beneficiary record is unavailable.'];
        }
        if (strtolower(trim((string) ($primary['beneficiary_status'] ?? ''))) !== BeneficiaryProfileService::STATUS_DECEASED) {
            return ['ok' => false, 'message' => 'The beneficiary must already be marked deceased before sending a co-maker registration email.'];
        }

        $existing = $this->registrationForPrimaryBeneficiary($beneficiaryProfileId);
        if ($existing !== null) {
            return ['ok' => false, 'message' => 'A co-maker registration already exists for this beneficiary.'];
        }

        $token = bin2hex(random_bytes(32));
        $this->storeInvitation($beneficiaryProfileId, $email, $token, (int) ($actor['id'] ?? 0));
        $link = app_url('signup?mode=co-maker&beneficiary=' . urlencode((string) $beneficiaryProfileId) . '&invite=' . urlencode($token));
        $primaryName = (string) ($primary['primary_beneficiary_name'] ?? 'the deceased beneficiary');
        $businessName = (string) ($primary['primary_business_name'] ?? '');
        $barangay = (string) ($primary['primary_barangay'] ?? '');
        $subject = 'SMART LEAP Co-maker Registration Link';
        $body = sprintf(
            '<p>Good day,</p>
             <p>The City Social Welfare and Development Department has invited you to register as the co-maker for <strong>%s</strong>%s%s.</p>
             <p>Please open the official SMART LEAP registration link below using your Gmail account and complete the required information and document uploads:</p>
             <p><a href="%s">%s</a></p>
             <p>Your co-maker access will only become active after Admin review and approval.</p>
             <p>Thank you.</p>',
            htmlspecialchars($primaryName, ENT_QUOTES),
            $businessName !== '' ? ' - ' . htmlspecialchars($businessName, ENT_QUOTES) : '',
            $barangay !== '' ? ' of ' . htmlspecialchars($barangay, ENT_QUOTES) : '',
            htmlspecialchars($link, ENT_QUOTES),
            htmlspecialchars($link, ENT_QUOTES)
        );

        $sent = (new MailService())->send($email, $subject, $body, (int) ($actor['id'] ?? 0) ?: null);
        if (!$sent) {
            return ['ok' => false, 'message' => 'Unable to send the co-maker registration email right now.'];
        }

        return [
            'ok' => true,
            'message' => 'Co-maker registration email sent to Gmail.',
            'email' => $email,
        ];
    }

    public function publicRegistrationContext(int $beneficiaryProfileId, string $inviteToken = ''): ?array
    {
        $this->ensureSchema();
        if ($beneficiaryProfileId <= 0) {
            return null;
        }

        $primary = $this->findPublicPrimaryBeneficiary($beneficiaryProfileId);
        if ($primary === null) {
            return null;
        }

        $status = strtolower(trim((string) ($primary['beneficiary_status'] ?? '')));
        $existing = $this->registrationForPrimaryBeneficiary($beneficiaryProfileId);
        $invitation = $this->findValidInvitation($beneficiaryProfileId, $inviteToken);
        if ($existing === null && $invitation === null) {
            return null;
        }

        return [
            'beneficiaryProfileId' => (int) ($primary['id'] ?? 0),
            'primaryBeneficiaryName' => (string) ($primary['primary_beneficiary_name'] ?? ''),
            'primaryBusinessName' => (string) ($primary['primary_business_name'] ?? ''),
            'primaryAddress' => (string) ($primary['primary_address'] ?? ''),
            'primaryBarangay' => (string) ($primary['primary_barangay'] ?? ''),
            'assignedPdo' => [
                'name' => (string) ($primary['assigned_pdo_name'] ?? ''),
                'email' => (string) ($primary['assigned_pdo_email'] ?? ''),
            ],
            'isDeceased' => $status === BeneficiaryProfileService::STATUS_DECEASED,
            'canRegister' => $status === BeneficiaryProfileService::STATUS_DECEASED && $existing === null,
            'hasExistingRegistration' => $existing !== null,
            'existingRegistrationStatus' => (string) ($existing['registrationStatus'] ?? ''),
            'inviteToken' => $invitation !== null ? $inviteToken : '',
            'invitedEmail' => (string) ($invitation['recipient_email'] ?? ''),
        ];
    }

    public function registerPublic(array $input, array $files): array
    {
        $this->ensureSchema();

        $primaryBeneficiaryProfileId = (int) ($input['beneficiaryProfileId'] ?? $input['beneficiary_profile_id'] ?? $input['beneficiary'] ?? 0);
        $inviteToken = trim((string) ($input['inviteToken'] ?? $input['invite'] ?? ''));
        $primary = $this->findPublicPrimaryBeneficiary($primaryBeneficiaryProfileId);
        if ($primary === null) {
            return ['ok' => false, 'errors' => ['general' => 'The selected primary beneficiary record was not found.']];
        }

        $invitation = $this->findValidInvitation($primaryBeneficiaryProfileId, $inviteToken);
        if ($invitation === null) {
            return ['ok' => false, 'errors' => ['general' => 'The co-maker registration invitation is invalid, expired, or already used. Please ask the assigned PDO to send a new Gmail link.']];
        }

        if (strtolower(trim((string) ($primary['beneficiary_status'] ?? ''))) !== BeneficiaryProfileService::STATUS_DECEASED) {
            return ['ok' => false, 'errors' => ['general' => 'A co-maker account can only be registered after the primary beneficiary is marked as deceased.']];
        }

        $existing = $this->registrationForPrimaryBeneficiary($primaryBeneficiaryProfileId);
        if ($existing !== null) {
            return ['ok' => false, 'errors' => ['general' => 'A co-maker account is already registered for this beneficiary. Please contact the Admin for updates.']];
        }

        $firstName = trim((string) ($input['firstName'] ?? ''));
        $middleName = trim((string) ($input['middleName'] ?? ''));
        $lastName = trim((string) ($input['lastName'] ?? ''));
        $fullName = trim(implode(' ', array_filter([$firstName, $middleName, $lastName], static fn (string $value): bool => $value !== '')));
        $email = strtolower(trim((string) ($input['email'] ?? '')));
        $password = (string) ($input['password'] ?? '');
        $contactNumber = trim((string) ($input['contactNumber'] ?? ''));
        $age = (int) ($input['age'] ?? 0);
        $gender = trim((string) ($input['gender'] ?? ''));
        $relationship = trim((string) ($input['relationshipToPrimaryBeneficiary'] ?? ''));
        $validIdFile = $files['validId'] ?? null;
        $relationshipFile = $files['relationshipDocument'] ?? null;
        $errors = [];

        if (mb_strlen($firstName) < 2) {
            $errors['firstName'] = 'Enter your first name.';
        }
        if (mb_strlen($lastName) < 2) {
            $errors['lastName'] = 'Enter your last name.';
        }
        if (mb_strlen($fullName) < 3) {
            $errors['general'] = 'Enter your complete name.';
        }
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $errors['email'] = 'Enter a valid email address.';
        }
        if ($email !== strtolower((string) ($invitation['recipient_email'] ?? ''))) {
            $errors['email'] = 'Use the same Gmail address that received the co-maker invitation.';
        }
        if (strlen($password) < 8) {
            $errors['password'] = 'Password must be at least 8 characters.';
        } elseif (!preg_match('/[A-Z]/', $password) || !preg_match('/[a-z]/', $password) || !preg_match('/\d/', $password)) {
            $errors['password'] = 'Password must include uppercase, lowercase, and a number.';
        }
        if ($contactNumber === '') {
            $errors['contactNumber'] = 'Enter your contact number.';
        }
        if ($age <= 0 || $age > 120) {
            $errors['age'] = 'Enter a valid age.';
        }
        if ($gender === '') {
            $errors['gender'] = 'Select your gender.';
        }
        if ($relationship === '') {
            $errors['relationshipToPrimaryBeneficiary'] = 'Enter your relationship to the primary beneficiary.';
        }
        if (!$this->isUploadedFilePresent($validIdFile)) {
            $errors['validId'] = 'Upload your valid ID.';
        }
        if (!$this->isUploadedFilePresent($relationshipFile)) {
            $errors['relationshipDocument'] = 'Upload a document that proves your relationship to the primary beneficiary.';
        }
        if ($errors !== []) {
            return ['ok' => false, 'errors' => $errors];
        }

        if ($this->findUserByEmail($email) !== null) {
            return ['ok' => false, 'errors' => ['email' => 'This email is already registered.']];
        }

        $uploadService = new UploadService();
        $pdo = db();
        $pdo->beginTransaction();

        try {
            $roleId = $this->findRoleIdByName(ROLE_BENEFICIARY);
            if ($roleId === null) {
                throw new \RuntimeException('Beneficiary role is not configured.');
            }

            $userId = $this->createCoMakerUser($pdo, $roleId, $fullName, $firstName, $middleName, $lastName, $email, $password, false);
            $coMakerBeneficiaryProfileId = $this->createCoMakerBeneficiaryProfile(
                $pdo,
                $userId,
                $primaryBeneficiaryProfileId,
                (int) ($primary['assigned_staff_profile_id'] ?? 0),
                BeneficiaryProfileService::STATUS_INACTIVE
            );
            $validIdMeta = $uploadService->storeCoMakerAsset('validId', $validIdFile);
            $relationshipMeta = $uploadService->storeCoMakerAsset('relationshipDocument', $relationshipFile);

            $statement = $pdo->prepare(
                'INSERT INTO co_maker_registrations (
                    deceased_beneficiary_profile_id,
                    user_id,
                    beneficiary_profile_id,
                    relationship_to_beneficiary,
                    contact_number,
                    age,
                    gender,
                    valid_id_file_path,
                    valid_id_original_name,
                    valid_id_mime_type,
                    valid_id_file_size,
                    relationship_document_path,
                    relationship_document_original_name,
                    relationship_document_mime_type,
                    relationship_document_file_size,
                    registration_status,
                    created_by_user_id,
                    updated_by_user_id
                ) VALUES (
                    :deceased_beneficiary_profile_id,
                    :user_id,
                    :beneficiary_profile_id,
                    :relationship_to_beneficiary,
                    :contact_number,
                    :age,
                    :gender,
                    :valid_id_file_path,
                    :valid_id_original_name,
                    :valid_id_mime_type,
                    :valid_id_file_size,
                    :relationship_document_path,
                    :relationship_document_original_name,
                    :relationship_document_mime_type,
                    :relationship_document_file_size,
                    :registration_status,
                    NULL,
                    NULL
                )'
            );
            $statement->execute([
                'deceased_beneficiary_profile_id' => $primaryBeneficiaryProfileId,
                'user_id' => $userId,
                'beneficiary_profile_id' => $coMakerBeneficiaryProfileId,
                'relationship_to_beneficiary' => $relationship,
                'contact_number' => $contactNumber !== '' ? $contactNumber : null,
                'age' => $age > 0 ? $age : null,
                'gender' => $gender !== '' ? $gender : null,
                'valid_id_file_path' => $validIdMeta['file_path'] ?? null,
                'valid_id_original_name' => $validIdMeta['original_name'] ?? null,
                'valid_id_mime_type' => $validIdMeta['mime_type'] ?? null,
                'valid_id_file_size' => $validIdMeta['file_size'] ?? null,
                'relationship_document_path' => $relationshipMeta['file_path'] ?? null,
                'relationship_document_original_name' => $relationshipMeta['original_name'] ?? null,
                'relationship_document_mime_type' => $relationshipMeta['mime_type'] ?? null,
                'relationship_document_file_size' => $relationshipMeta['file_size'] ?? null,
                'registration_status' => self::STATUS_PENDING_REVIEW,
            ]);

            $this->markInvitationUsed($pdo, (int) ($invitation['id'] ?? 0));

            $pdo->commit();
        } catch (\Throwable $exception) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }

            log_database_query_failure('co_maker_registrations.register_public', $exception, [
                'beneficiary_profile_id' => $primaryBeneficiaryProfileId,
            ]);

            return ['ok' => false, 'errors' => ['general' => 'Unable to create the co-maker account right now.']];
        }

        return [
            'ok' => true,
            'message' => 'Your co-maker registration was submitted and is now waiting for Admin approval.',
            'redirect' => 'portal/login',
        ];
    }

    public function saveForActor(array $actor, int $beneficiaryProfileId, array $input, array $files): array
    {
        $this->ensureSchema();

        $primaryBeneficiaryProfileId = $beneficiaryProfileId;
        $primary = $this->findPrimaryBeneficiaryForActor($actor, $primaryBeneficiaryProfileId);
        if ($primary === null) {
            return ['ok' => false, 'message' => 'Beneficiary record not found in your scope.'];
        }

        if (strtolower(trim((string) ($primary['beneficiary_status'] ?? ''))) !== BeneficiaryProfileService::STATUS_DECEASED) {
            return ['ok' => false, 'message' => 'A co-maker account can only be created after the primary beneficiary is marked as deceased.'];
        }

        $existing = $this->registrationForPrimaryBeneficiary($primaryBeneficiaryProfileId);
        $firstName = trim((string) ($input['firstName'] ?? ''));
        $middleName = trim((string) ($input['middleName'] ?? ''));
        $lastName = trim((string) ($input['lastName'] ?? ''));
        $fullName = trim(implode(' ', array_filter([$firstName, $middleName, $lastName], static fn (string $value): bool => $value !== '')));
        $email = strtolower(trim((string) ($input['email'] ?? '')));
        $password = (string) ($input['password'] ?? '');
        $contactNumber = trim((string) ($input['contactNumber'] ?? ''));
        $age = (int) ($input['age'] ?? 0);
        $gender = trim((string) ($input['gender'] ?? ''));
        $relationship = trim((string) ($input['relationshipToPrimaryBeneficiary'] ?? ''));
        $errors = [];

        if (mb_strlen($firstName) < 2) {
            $errors['firstName'] = 'Enter the co-maker first name.';
        }
        if (mb_strlen($lastName) < 2) {
            $errors['lastName'] = 'Enter the co-maker last name.';
        }
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $errors['email'] = 'Enter a valid co-maker email address.';
        }
        if ($existing === null && strlen($password) < 8) {
            $errors['password'] = 'Temporary password must be at least 8 characters.';
        }
        if ($existing !== null && $password !== '' && strlen($password) < 8) {
            $errors['password'] = 'Temporary password must be at least 8 characters.';
        }
        if ($contactNumber === '') {
            $errors['contactNumber'] = 'Enter the co-maker contact number.';
        }
        if ($age <= 0 || $age > 120) {
            $errors['age'] = 'Enter a valid co-maker age.';
        }
        if ($gender === '') {
            $errors['gender'] = 'Select the co-maker gender.';
        }
        if ($relationship === '') {
            $errors['relationshipToPrimaryBeneficiary'] = 'Enter the co-maker relationship to the primary beneficiary.';
        }

        $validIdFile = $files['validId'] ?? null;
        $relationshipFile = $files['relationshipDocument'] ?? null;
        if ($existing === null && !$this->isUploadedFilePresent($validIdFile)) {
            $errors['validId'] = 'Upload the co-maker valid ID.';
        }
        if ($existing === null && !$this->isUploadedFilePresent($relationshipFile)) {
            $errors['relationshipDocument'] = 'Upload a document showing the relationship to the primary beneficiary.';
        }

        if ($errors !== []) {
            return ['ok' => false, 'errors' => $errors];
        }

        $duplicate = $this->findUserByEmail($email);
        if ($duplicate !== null && (int) ($duplicate['id'] ?? 0) !== (int) ($existing['userId'] ?? 0)) {
            return ['ok' => false, 'errors' => ['email' => 'This email is already used by another account.']];
        }

        $uploadService = new UploadService();
        $pdo = db();
        $pdo->beginTransaction();

        try {
            $roleId = $this->findRoleIdByName(ROLE_BENEFICIARY);
            if ($roleId === null) {
                throw new \RuntimeException('Beneficiary role is not configured.');
            }

            if ($existing === null) {
                $userId = $this->createCoMakerUser($pdo, $roleId, $fullName, $firstName, $middleName, $lastName, $email, $password);
                $coMakerBeneficiaryProfileId = $this->createCoMakerBeneficiaryProfile($pdo, $userId, $primaryBeneficiaryProfileId, (int) ($primary['assigned_staff_profile_id'] ?? 0));
                $existingValidId = null;
                $existingRelationshipDocument = null;
            } else {
                $userId = (int) ($existing['userId'] ?? 0);
                $coMakerBeneficiaryProfileId = (int) ($existing['beneficiaryProfileId'] ?? 0);
                $this->updateCoMakerUser($pdo, $userId, $fullName, $firstName, $middleName, $lastName, $email, $password);
                $this->refreshCoMakerBeneficiaryProfile($pdo, $coMakerBeneficiaryProfileId, $primaryBeneficiaryProfileId, (int) ($primary['assigned_staff_profile_id'] ?? 0));
                $existingValidId = $this->extractStoredFileMeta($existing, 'validId');
                $existingRelationshipDocument = $this->extractStoredFileMeta($existing, 'relationshipDocument');
            }

            $this->setUserActivation($pdo, $userId, true);

            $validIdMeta = $existingValidId;
            if ($this->isUploadedFilePresent($validIdFile)) {
                $validIdMeta = $uploadService->storeCoMakerAsset('validId', $validIdFile);
            }

            $relationshipMeta = $existingRelationshipDocument;
            if ($this->isUploadedFilePresent($relationshipFile)) {
                $relationshipMeta = $uploadService->storeCoMakerAsset('relationshipDocument', $relationshipFile);
            }

            $this->clearOtherSuccessorLinks($pdo, $primaryBeneficiaryProfileId, $coMakerBeneficiaryProfileId);

            if ($existing === null) {
                $statement = $pdo->prepare(
                    'INSERT INTO co_maker_registrations (
                        deceased_beneficiary_profile_id,
                        user_id,
                        beneficiary_profile_id,
                        relationship_to_beneficiary,
                        contact_number,
                        age,
                        gender,
                        valid_id_file_path,
                        valid_id_original_name,
                        valid_id_mime_type,
                        valid_id_file_size,
                        relationship_document_path,
                        relationship_document_original_name,
                        relationship_document_mime_type,
                        relationship_document_file_size,
                        registration_status,
                        created_by_user_id,
                        updated_by_user_id
                    ) VALUES (
                        :deceased_beneficiary_profile_id,
                        :user_id,
                        :beneficiary_profile_id,
                        :relationship_to_beneficiary,
                        :contact_number,
                        :age,
                        :gender,
                        :valid_id_file_path,
                        :valid_id_original_name,
                        :valid_id_mime_type,
                        :valid_id_file_size,
                        :relationship_document_path,
                        :relationship_document_original_name,
                        :relationship_document_mime_type,
                        :relationship_document_file_size,
                        :registration_status,
                        :created_by_user_id,
                        :updated_by_user_id
                    )'
                );
                $statement->execute([
                    'deceased_beneficiary_profile_id' => $primaryBeneficiaryProfileId,
                    'user_id' => $userId,
                    'beneficiary_profile_id' => $coMakerBeneficiaryProfileId,
                    'relationship_to_beneficiary' => $relationship,
                    'contact_number' => $contactNumber !== '' ? $contactNumber : null,
                    'age' => $age > 0 ? $age : null,
                    'gender' => $gender !== '' ? $gender : null,
                    'valid_id_file_path' => $validIdMeta['file_path'] ?? null,
                    'valid_id_original_name' => $validIdMeta['original_name'] ?? null,
                    'valid_id_mime_type' => $validIdMeta['mime_type'] ?? null,
                    'valid_id_file_size' => $validIdMeta['file_size'] ?? null,
                    'relationship_document_path' => $relationshipMeta['file_path'] ?? null,
                    'relationship_document_original_name' => $relationshipMeta['original_name'] ?? null,
                    'relationship_document_mime_type' => $relationshipMeta['mime_type'] ?? null,
                    'relationship_document_file_size' => $relationshipMeta['file_size'] ?? null,
                    'registration_status' => self::STATUS_APPROVED,
                    'created_by_user_id' => (int) ($actor['id'] ?? 0) ?: null,
                    'updated_by_user_id' => (int) ($actor['id'] ?? 0) ?: null,
                ]);
            } else {
                $statement = $pdo->prepare(
                    'UPDATE co_maker_registrations
                     SET relationship_to_beneficiary = :relationship_to_beneficiary,
                         contact_number = :contact_number,
                         age = :age,
                         gender = :gender,
                         valid_id_file_path = :valid_id_file_path,
                         valid_id_original_name = :valid_id_original_name,
                         valid_id_mime_type = :valid_id_mime_type,
                         valid_id_file_size = :valid_id_file_size,
                         relationship_document_path = :relationship_document_path,
                         relationship_document_original_name = :relationship_document_original_name,
                         relationship_document_mime_type = :relationship_document_mime_type,
                         relationship_document_file_size = :relationship_document_file_size,
                         registration_status = :registration_status,
                         updated_by_user_id = :updated_by_user_id,
                         updated_at = NOW()
                     WHERE deceased_beneficiary_profile_id = :deceased_beneficiary_profile_id'
                );
                $statement->execute([
                    'relationship_to_beneficiary' => $relationship,
                    'contact_number' => $contactNumber !== '' ? $contactNumber : null,
                    'age' => $age > 0 ? $age : null,
                    'gender' => $gender !== '' ? $gender : null,
                    'valid_id_file_path' => $validIdMeta['file_path'] ?? null,
                    'valid_id_original_name' => $validIdMeta['original_name'] ?? null,
                    'valid_id_mime_type' => $validIdMeta['mime_type'] ?? null,
                    'valid_id_file_size' => $validIdMeta['file_size'] ?? null,
                    'relationship_document_path' => $relationshipMeta['file_path'] ?? null,
                    'relationship_document_original_name' => $relationshipMeta['original_name'] ?? null,
                    'relationship_document_mime_type' => $relationshipMeta['mime_type'] ?? null,
                    'relationship_document_file_size' => $relationshipMeta['file_size'] ?? null,
                    'registration_status' => self::STATUS_APPROVED,
                    'updated_by_user_id' => (int) ($actor['id'] ?? 0) ?: null,
                    'deceased_beneficiary_profile_id' => $primaryBeneficiaryProfileId,
                ]);
            }

            $pdo->commit();
        } catch (\Throwable $exception) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }

            log_database_query_failure('co_maker_registrations.save_for_actor', $exception, [
                'beneficiary_profile_id' => $primaryBeneficiaryProfileId,
                'actor_user_id' => (int) ($actor['id'] ?? 0),
            ]);

            return ['ok' => false, 'message' => 'Unable to save the co-maker account right now.'];
        }

        return [
            'ok' => true,
            'message' => $existing === null
                ? 'Co-maker beneficiary account created.'
                : 'Co-maker beneficiary account updated.',
            'registration' => $this->registrationForPrimaryBeneficiary($primaryBeneficiaryProfileId),
        ];
    }

    public function updateProfileForUser(int $userId, array $input): array
    {
        $this->ensureSchema();

        $registration = $this->registrationForUser($userId);
        if ($registration === null || !$this->isActivePortalRegistrationStatus((string) ($registration['registrationStatus'] ?? ''))) {
            return ['ok' => false, 'errors' => ['general' => 'Co-maker profile record was not found.']];
        }

        $fullName = trim((string) ($input['fullName'] ?? ''));
        $email = strtolower(trim((string) ($input['email'] ?? '')));
        $contactNumber = trim((string) ($input['contactNumber'] ?? ''));
        $relationship = trim((string) ($input['relationshipToPrimaryBeneficiary'] ?? ''));
        $errors = [];

        if (mb_strlen($fullName) < 3) {
            $errors['fullName'] = 'Enter the co-maker full name.';
        }
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $errors['email'] = 'Enter a valid email address.';
        }
        if ($contactNumber === '') {
            $errors['contactNumber'] = 'Enter the co-maker contact number.';
        }
        if ($relationship === '') {
            $errors['relationshipToPrimaryBeneficiary'] = 'Enter the relationship to the primary beneficiary.';
        }
        if ($errors !== []) {
            return ['ok' => false, 'errors' => $errors];
        }

        $duplicate = $this->findUserByEmail($email);
        if ($duplicate !== null && (int) ($duplicate['id'] ?? 0) !== $userId) {
            return ['ok' => false, 'errors' => ['email' => 'That email is already used by another account.']];
        }

        $nameParts = $this->splitNameParts($fullName);
        $pdo = db();
        $pdo->beginTransaction();

        try {
            $fields = [
                'full_name = :full_name',
                'email = :email',
                'updated_at = NOW()',
            ];
            $params = [
                'full_name' => $fullName,
                'email' => $email,
                'id' => $userId,
            ];
            if ($this->hasStructuredUserNameColumns()) {
                $fields[] = 'first_name = :first_name';
                $fields[] = 'middle_name = :middle_name';
                $fields[] = 'last_name = :last_name';
                $params['first_name'] = $nameParts['first_name'] ?: null;
                $params['middle_name'] = $nameParts['middle_name'] ?: null;
                $params['last_name'] = $nameParts['last_name'] ?: null;
            }
            $statement = $pdo->prepare('UPDATE users SET ' . implode(', ', $fields) . ' WHERE id = :id');
            $statement->execute($params);

            $pdo->prepare(
                'UPDATE co_maker_registrations
                 SET contact_number = :contact_number,
                     relationship_to_beneficiary = :relationship_to_beneficiary,
                     updated_by_user_id = :updated_by_user_id,
                     updated_at = NOW()
                 WHERE user_id = :user_id'
            )->execute([
                'contact_number' => $contactNumber !== '' ? $contactNumber : null,
                'relationship_to_beneficiary' => $relationship,
                'updated_by_user_id' => $userId,
                'user_id' => $userId,
            ]);

            $pdo->commit();
        } catch (\Throwable $exception) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }

            log_database_query_failure('co_maker_registrations.update_profile_for_user', $exception, ['user_id' => $userId]);
            return ['ok' => false, 'errors' => ['general' => 'Unable to save co-maker profile right now.']];
        }

        return ['ok' => true];
    }

    public function syncPrimaryBeneficiaryStatus(PDO $pdo, int $beneficiaryProfileId, string $status): void
    {
        $this->ensureSchema();
        if ($beneficiaryProfileId <= 0) {
            return;
        }

        if ($status === BeneficiaryProfileService::STATUS_DECEASED) {
            $pdo->prepare(
                'UPDATE co_maker_registrations
                 SET registration_status = CASE
                        WHEN LOWER(COALESCE(registration_status, "")) = "pending_review" THEN registration_status
                        WHEN LOWER(COALESCE(registration_status, "")) = "rejected" THEN registration_status
                        ELSE :registration_status
                     END,
                     updated_at = NOW()
                 WHERE deceased_beneficiary_profile_id = :beneficiary_profile_id'
            )->execute([
                'registration_status' => self::STATUS_APPROVED,
                'beneficiary_profile_id' => $beneficiaryProfileId,
            ]);
            return;
        }

        $pdo->prepare(
            'UPDATE co_maker_registrations
             SET registration_status = :registration_status,
                 updated_at = NOW()
             WHERE deceased_beneficiary_profile_id = :beneficiary_profile_id'
        )->execute([
            'registration_status' => self::STATUS_INACTIVE,
            'beneficiary_profile_id' => $beneficiaryProfileId,
        ]);

        $pdo->prepare(
            'UPDATE beneficiary_profiles
             SET replacement_for_beneficiary_profile_id = NULL,
                 beneficiary_status = :beneficiary_status,
                 updated_at = NOW()
             WHERE replacement_for_beneficiary_profile_id = :beneficiary_profile_id'
        )->execute([
            'beneficiary_status' => BeneficiaryProfileService::STATUS_INACTIVE,
            'beneficiary_profile_id' => $beneficiaryProfileId,
        ]);

        $pdo->prepare(
            'UPDATE users
             INNER JOIN co_maker_registrations ON co_maker_registrations.user_id = users.id
             SET users.is_active = 0,
                 users.is_disabled = 0,
                 users.updated_at = NOW()
             WHERE co_maker_registrations.deceased_beneficiary_profile_id = :beneficiary_profile_id'
        )->execute(['beneficiary_profile_id' => $beneficiaryProfileId]);
    }

    private function createCoMakerUser(PDO $pdo, int $roleId, string $fullName, string $firstName, string $middleName, string $lastName, string $email, string $password, bool $activateAccount = true): int
    {
        $passwordHash = (new PasswordService())->hash($password);
        if ($this->hasStructuredUserNameColumns()) {
            $statement = $pdo->prepare(
                'INSERT INTO users (role_id, full_name, first_name, middle_name, last_name, email, password_hash, verification_status, is_active, is_disabled)
                 VALUES (:role_id, :full_name, :first_name, :middle_name, :last_name, :email, :password_hash, "verified", :is_active, 0)'
            );
            $statement->execute([
                'role_id' => $roleId,
                'full_name' => $fullName,
                'first_name' => $firstName !== '' ? $firstName : null,
                'middle_name' => $middleName !== '' ? $middleName : null,
                'last_name' => $lastName !== '' ? $lastName : null,
                'email' => $email,
                'password_hash' => $passwordHash,
                'is_active' => $activateAccount ? 1 : 0,
            ]);
        } else {
            $statement = $pdo->prepare(
                'INSERT INTO users (role_id, full_name, email, password_hash, verification_status, is_active, is_disabled)
                 VALUES (:role_id, :full_name, :email, :password_hash, "verified", :is_active, 0)'
            );
            $statement->execute([
                'role_id' => $roleId,
                'full_name' => $fullName,
                'email' => $email,
                'password_hash' => $passwordHash,
                'is_active' => $activateAccount ? 1 : 0,
            ]);
        }

        return (int) $pdo->lastInsertId();
    }

    private function updateCoMakerUser(PDO $pdo, int $userId, string $fullName, string $firstName, string $middleName, string $lastName, string $email, string $password): void
    {
        $fields = [
            'full_name = :full_name',
            'email = :email',
            'updated_at = NOW()',
        ];
        $params = [
            'full_name' => $fullName,
            'email' => $email,
            'id' => $userId,
        ];

        if ($this->hasStructuredUserNameColumns()) {
            $fields[] = 'first_name = :first_name';
            $fields[] = 'middle_name = :middle_name';
            $fields[] = 'last_name = :last_name';
            $params['first_name'] = $firstName !== '' ? $firstName : null;
            $params['middle_name'] = $middleName !== '' ? $middleName : null;
            $params['last_name'] = $lastName !== '' ? $lastName : null;
        }

        if ($password !== '') {
            $fields[] = 'password_hash = :password_hash';
            $params['password_hash'] = (new PasswordService())->hash($password);
        }

        $statement = $pdo->prepare('UPDATE users SET ' . implode(', ', $fields) . ' WHERE id = :id');
        $statement->execute($params);
    }

    private function createCoMakerBeneficiaryProfile(PDO $pdo, int $userId, int $deceasedBeneficiaryProfileId, int $assignedStaffProfileId, string $beneficiaryStatus = BeneficiaryProfileService::STATUS_ACTIVE): int
    {
        $statement = $pdo->prepare(
            'INSERT INTO beneficiary_profiles (
                user_id,
                applicant_profile_id,
                assigned_staff_profile_id,
                replacement_for_beneficiary_profile_id,
                beneficiary_status,
                approval_date
            ) VALUES (
                :user_id,
                NULL,
                :assigned_staff_profile_id,
                :replacement_for_beneficiary_profile_id,
                :beneficiary_status,
                NULL
            )'
        );
        $statement->execute([
            'user_id' => $userId,
            'assigned_staff_profile_id' => $assignedStaffProfileId > 0 ? $assignedStaffProfileId : null,
            'replacement_for_beneficiary_profile_id' => $deceasedBeneficiaryProfileId,
            'beneficiary_status' => $beneficiaryStatus,
        ]);

        return (int) $pdo->lastInsertId();
    }

    private function refreshCoMakerBeneficiaryProfile(PDO $pdo, int $coMakerBeneficiaryProfileId, int $deceasedBeneficiaryProfileId, int $assignedStaffProfileId, string $beneficiaryStatus = BeneficiaryProfileService::STATUS_ACTIVE): void
    {
        $statement = $pdo->prepare(
            'UPDATE beneficiary_profiles
             SET assigned_staff_profile_id = :assigned_staff_profile_id,
                 replacement_for_beneficiary_profile_id = :replacement_for_beneficiary_profile_id,
                 beneficiary_status = :beneficiary_status,
                 updated_at = NOW()
             WHERE id = :id'
        );
        $statement->execute([
            'assigned_staff_profile_id' => $assignedStaffProfileId > 0 ? $assignedStaffProfileId : null,
            'replacement_for_beneficiary_profile_id' => $deceasedBeneficiaryProfileId > 0 ? $deceasedBeneficiaryProfileId : null,
            'beneficiary_status' => $beneficiaryStatus,
            'id' => $coMakerBeneficiaryProfileId,
        ]);
    }

    private function clearOtherSuccessorLinks(PDO $pdo, int $deceasedBeneficiaryProfileId, int $coMakerBeneficiaryProfileId): void
    {
        $pdo->prepare(
            'UPDATE beneficiary_profiles
             SET replacement_for_beneficiary_profile_id = NULL,
                 updated_at = NOW()
             WHERE replacement_for_beneficiary_profile_id = :deceased_beneficiary_profile_id
               AND id <> :co_maker_beneficiary_profile_id'
        )->execute([
            'deceased_beneficiary_profile_id' => $deceasedBeneficiaryProfileId,
            'co_maker_beneficiary_profile_id' => $coMakerBeneficiaryProfileId,
        ]);
    }

    private function findPrimaryBeneficiaryForActor(array $actor, int $beneficiaryProfileId): ?array
    {
        if ($beneficiaryProfileId <= 0) {
            return null;
        }

        $params = ['beneficiary_profile_id' => $beneficiaryProfileId];
        $joins = [];
        if (str_contains(strtolower((string) ($actor['role'] ?? '')), 'project')) {
            $joins[] = 'INNER JOIN applicant_profiles AS scope_profiles ON scope_profiles.id = beneficiary_profiles.applicant_profile_id
                        INNER JOIN staff_profiles AS actor_staff ON actor_staff.user_id = :actor_user_id
                        INNER JOIN staff_barangay_assignments
                            ON staff_barangay_assignments.staff_profile_id = actor_staff.id
                           AND staff_barangay_assignments.barangay_id = scope_profiles.barangay_id
                           AND staff_barangay_assignments.ended_at IS NULL';
            $params['actor_user_id'] = (int) ($actor['id'] ?? 0);
        }

        $statement = db()->prepare(
            'SELECT beneficiary_profiles.id,
                    beneficiary_profiles.user_id,
                    beneficiary_profiles.applicant_profile_id,
                    beneficiary_profiles.assigned_staff_profile_id,
                    beneficiary_profiles.beneficiary_status
             FROM beneficiary_profiles
             ' . implode("\n", $joins) . '
             WHERE beneficiary_profiles.id = :beneficiary_profile_id
             LIMIT 1'
        );
        $statement->execute($params);
        $row = $statement->fetch(PDO::FETCH_ASSOC);

        return is_array($row) ? $row : null;
    }

    private function findPublicPrimaryBeneficiary(int $beneficiaryProfileId): ?array
    {
        if ($beneficiaryProfileId <= 0) {
            return null;
        }

        $statement = db()->prepare(
            'SELECT beneficiary_profiles.id,
                    beneficiary_profiles.user_id,
                    beneficiary_profiles.applicant_profile_id,
                    beneficiary_profiles.assigned_staff_profile_id,
                    beneficiary_profiles.beneficiary_status,
                    beneficiary_users.full_name AS primary_beneficiary_name,
                    applicant_profiles.business_name AS primary_business_name,
                    applicant_profiles.address_line AS primary_address,
                    barangays.name AS primary_barangay,
                    assigned_users.full_name AS assigned_pdo_name,
                    assigned_users.email AS assigned_pdo_email
             FROM beneficiary_profiles
             INNER JOIN users AS beneficiary_users ON beneficiary_users.id = beneficiary_profiles.user_id
             LEFT JOIN applicant_profiles ON applicant_profiles.id = beneficiary_profiles.applicant_profile_id
             LEFT JOIN barangays ON barangays.id = applicant_profiles.barangay_id
             LEFT JOIN staff_profiles AS assigned_staff ON assigned_staff.id = beneficiary_profiles.assigned_staff_profile_id
             LEFT JOIN users AS assigned_users ON assigned_users.id = assigned_staff.user_id
             WHERE beneficiary_profiles.id = :beneficiary_profile_id
               AND beneficiary_profiles.replacement_for_beneficiary_profile_id IS NULL
             LIMIT 1'
        );
        $statement->execute(['beneficiary_profile_id' => $beneficiaryProfileId]);
        $row = $statement->fetch(PDO::FETCH_ASSOC);

        return is_array($row) ? $row : null;
    }

    private function isAdminActor(array $actor): bool
    {
        return (string) ($actor['role'] ?? '') === ROLE_ADMIN;
    }

    private function isProjectOfficerActor(array $actor): bool
    {
        return (string) ($actor['role'] ?? '') === ROLE_PROJECT_OFFICER;
    }

    private function canViewRegistrations(array $actor): bool
    {
        $role = (string) ($actor['role'] ?? '');
        return $role === ROLE_ADMIN || $role === ROLE_SOCIAL_WORKER;
    }

    private function primaryBeneficiaryWithinProjectOfficerScope(array $actor, int $beneficiaryProfileId): bool
    {
        if ($beneficiaryProfileId <= 0 || !$this->isProjectOfficerActor($actor)) {
            return false;
        }

        $statement = db()->prepare(
            'SELECT beneficiary_profiles.id
             FROM beneficiary_profiles
             INNER JOIN applicant_profiles ON applicant_profiles.id = beneficiary_profiles.applicant_profile_id
             INNER JOIN staff_profiles AS actor_staff ON actor_staff.user_id = :actor_user_id
             INNER JOIN staff_barangay_assignments
                ON staff_barangay_assignments.staff_profile_id = actor_staff.id
               AND staff_barangay_assignments.barangay_id = applicant_profiles.barangay_id
               AND staff_barangay_assignments.ended_at IS NULL
             WHERE beneficiary_profiles.id = :beneficiary_profile_id
             LIMIT 1'
        );
        $statement->execute([
            'actor_user_id' => (int) ($actor['id'] ?? 0),
            'beneficiary_profile_id' => $beneficiaryProfileId,
        ]);

        return $statement->fetchColumn() !== false;
    }

    private function storeInvitation(int $beneficiaryProfileId, string $email, string $token, int $adminUserId): void
    {
        db()->prepare(
            'UPDATE co_maker_registration_invitations
             SET used_at = NOW(),
                 updated_at = NOW()
             WHERE beneficiary_profile_id = :beneficiary_profile_id
               AND used_at IS NULL'
        )->execute(['beneficiary_profile_id' => $beneficiaryProfileId]);

        db()->prepare(
            'INSERT INTO co_maker_registration_invitations
                (beneficiary_profile_id, recipient_email, token_hash, sent_by_user_id, expires_at)
             VALUES (:beneficiary_profile_id, :recipient_email, :token_hash, :sent_by_user_id, DATE_ADD(NOW(), INTERVAL 14 DAY))'
        )->execute([
            'beneficiary_profile_id' => $beneficiaryProfileId,
            'recipient_email' => $email,
            'token_hash' => hash('sha256', $token),
            'sent_by_user_id' => $adminUserId > 0 ? $adminUserId : null,
        ]);
    }

    private function findValidInvitation(int $beneficiaryProfileId, string $token): ?array
    {
        $token = trim($token);
        if ($beneficiaryProfileId <= 0 || $token === '') {
            return null;
        }

        $statement = db()->prepare(
            'SELECT id, beneficiary_profile_id, recipient_email, expires_at
             FROM co_maker_registration_invitations
             WHERE beneficiary_profile_id = :beneficiary_profile_id
               AND token_hash = :token_hash
               AND used_at IS NULL
               AND expires_at > NOW()
             LIMIT 1'
        );
        $statement->execute([
            'beneficiary_profile_id' => $beneficiaryProfileId,
            'token_hash' => hash('sha256', $token),
        ]);
        $row = $statement->fetch(PDO::FETCH_ASSOC);

        return is_array($row) ? $row : null;
    }

    private function markInvitationUsed(PDO $pdo, int $invitationId): void
    {
        if ($invitationId <= 0) {
            return;
        }

        $pdo->prepare(
            'UPDATE co_maker_registration_invitations
             SET used_at = NOW(),
                 updated_at = NOW()
             WHERE id = :id'
        )->execute(['id' => $invitationId]);
    }

    private function mapRegistrationRow(array $row): array
    {
        return [
            'id' => (int) ($row['id'] ?? 0),
            'userId' => (int) ($row['user_id'] ?? 0),
            'beneficiaryProfileId' => (int) ($row['beneficiary_profile_id'] ?? 0),
            'deceasedBeneficiaryProfileId' => (int) ($row['deceased_beneficiary_profile_id'] ?? 0),
            'name' => (string) ($row['co_maker_name'] ?? ''),
            'email' => (string) ($row['co_maker_email'] ?? ''),
            'contactNumber' => (string) ($row['contact_number'] ?? ''),
            'age' => (int) ($row['age'] ?? 0),
            'gender' => (string) ($row['gender'] ?? ''),
            'relationshipToPrimaryBeneficiary' => (string) ($row['relationship_to_beneficiary'] ?? ''),
            'validId' => [
                'path' => (string) ($row['valid_id_file_path'] ?? ''),
                'name' => (string) ($row['valid_id_original_name'] ?? ''),
                'mimeType' => (string) ($row['valid_id_mime_type'] ?? ''),
                'size' => (int) ($row['valid_id_file_size'] ?? 0),
                'url' => $this->publicFileUrl((string) ($row['valid_id_file_path'] ?? '')),
            ],
            'relationshipDocument' => [
                'path' => (string) ($row['relationship_document_path'] ?? ''),
                'name' => (string) ($row['relationship_document_original_name'] ?? ''),
                'mimeType' => (string) ($row['relationship_document_mime_type'] ?? ''),
                'size' => (int) ($row['relationship_document_file_size'] ?? 0),
                'url' => $this->publicFileUrl((string) ($row['relationship_document_path'] ?? '')),
            ],
            'registrationStatus' => $this->normalizeRegistrationStatus((string) ($row['registration_status'] ?? self::STATUS_INACTIVE)),
            'primaryBeneficiaryName' => (string) ($row['primary_beneficiary_name'] ?? ''),
            'primaryBusinessName' => (string) ($row['primary_business_name'] ?? ''),
            'primaryAddress' => (string) ($row['primary_address'] ?? ''),
            'primaryBarangay' => (string) ($row['primary_barangay'] ?? ''),
            'assignedPdo' => [
                'name' => (string) ($row['assigned_pdo_name'] ?? ''),
                'email' => (string) ($row['assigned_pdo_email'] ?? ''),
            ],
        ];
    }

    private function extractStoredFileMeta(array $existing, string $prefix): ?array
    {
        $source = $existing[$prefix] ?? null;
        if (!is_array($source)) {
            return null;
        }

        $path = trim((string) ($source['path'] ?? ''));
        if ($path === '') {
            return null;
        }

        return [
            'file_path' => $path,
            'original_name' => trim((string) ($source['name'] ?? basename($path))),
            'mime_type' => trim((string) ($source['mimeType'] ?? '')),
            'file_size' => (int) ($source['size'] ?? 0),
        ];
    }

    private function publicFileUrl(string $path): string
    {
        $trimmed = ltrim(str_replace('\\', '/', $path), '/');
        return $trimmed !== '' ? app_url($trimmed) : '';
    }

    private function isUploadedFilePresent(mixed $file): bool
    {
        return is_array($file)
            && ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE
            && trim((string) ($file['name'] ?? '')) !== '';
    }

    private function findUserByEmail(string $email): ?array
    {
        $statement = db()->prepare('SELECT id, email FROM users WHERE email = :email LIMIT 1');
        $statement->execute(['email' => $email]);
        $row = $statement->fetch(PDO::FETCH_ASSOC);

        return is_array($row) ? $row : null;
    }

    private function findRoleIdByName(string $name): ?int
    {
        $statement = db()->prepare('SELECT id FROM roles WHERE name = :name LIMIT 1');
        $statement->execute(['name' => $name]);
        $value = $statement->fetchColumn();

        return $value !== false ? (int) $value : null;
    }

    private function findRegistrationForActor(array $actor, int $registrationId): ?array
    {
        if ($registrationId <= 0) {
            return null;
        }

        $params = ['registration_id' => $registrationId];
        $joins = [];
        $role = strtolower((string) ($actor['role'] ?? ''));
        if (str_contains($role, 'project')) {
            $joins[] = 'INNER JOIN staff_profiles AS actor_staff ON actor_staff.user_id = :actor_user_id
                        INNER JOIN staff_barangay_assignments
                            ON staff_barangay_assignments.staff_profile_id = actor_staff.id
                           AND staff_barangay_assignments.barangay_id = applicant_profiles.barangay_id
                           AND staff_barangay_assignments.ended_at IS NULL';
            $params['actor_user_id'] = (int) ($actor['id'] ?? 0);
        }

        $statement = db()->prepare(
            'SELECT
                co_maker_registrations.id,
                co_maker_registrations.user_id,
                co_maker_registrations.beneficiary_profile_id,
                co_maker_registrations.deceased_beneficiary_profile_id,
                co_maker_registrations.relationship_to_beneficiary,
                co_maker_registrations.contact_number,
                co_maker_registrations.age,
                co_maker_registrations.gender,
                co_maker_registrations.valid_id_file_path,
                co_maker_registrations.valid_id_original_name,
                co_maker_registrations.valid_id_mime_type,
                co_maker_registrations.valid_id_file_size,
                co_maker_registrations.relationship_document_path,
                co_maker_registrations.relationship_document_original_name,
                co_maker_registrations.relationship_document_mime_type,
                co_maker_registrations.relationship_document_file_size,
                co_maker_registrations.registration_status,
                co_maker_registrations.created_at,
                co_maker_registrations.updated_at,
                co_maker_users.full_name AS co_maker_name,
                co_maker_users.email AS co_maker_email,
                co_maker_users.is_active AS co_maker_is_active,
                deceased_profiles.beneficiary_status AS primary_beneficiary_status,
                deceased_users.full_name AS primary_beneficiary_name,
                applicant_profiles.business_name AS primary_business_name,
                applicant_profiles.address_line AS primary_address,
                barangays.name AS primary_barangay,
                assigned_users.full_name AS assigned_pdo_name,
                assigned_users.email AS assigned_pdo_email
             FROM co_maker_registrations
             INNER JOIN users AS co_maker_users ON co_maker_users.id = co_maker_registrations.user_id
             INNER JOIN beneficiary_profiles AS deceased_profiles
                ON deceased_profiles.id = co_maker_registrations.deceased_beneficiary_profile_id
             INNER JOIN users AS deceased_users ON deceased_users.id = deceased_profiles.user_id
             LEFT JOIN applicant_profiles ON applicant_profiles.id = deceased_profiles.applicant_profile_id
             LEFT JOIN barangays ON barangays.id = applicant_profiles.barangay_id
             LEFT JOIN staff_profiles AS assigned_staff ON assigned_staff.id = deceased_profiles.assigned_staff_profile_id
             LEFT JOIN users AS assigned_users ON assigned_users.id = assigned_staff.user_id
             ' . implode("\n", $joins) . '
             WHERE co_maker_registrations.id = :registration_id
             LIMIT 1'
        );
        $statement->execute($params);
        $row = $statement->fetch(PDO::FETCH_ASSOC);
        if (!is_array($row)) {
            return null;
        }

        $mapped = $this->mapRegistrationRow($row);
        $mapped['createdAt'] = (string) ($row['created_at'] ?? '');
        $mapped['updatedAt'] = (string) ($row['updated_at'] ?? '');
        $mapped['primaryBeneficiaryStatus'] = (string) ($row['primary_beneficiary_status'] ?? '');
        $mapped['accountActive'] = ((int) ($row['co_maker_is_active'] ?? 0)) === 1;

        return $mapped;
    }

    private function setUserActivation(PDO $pdo, int $userId, bool $active): void
    {
        if ($userId <= 0) {
            return;
        }

        $pdo->prepare(
            'UPDATE users
             SET is_active = :is_active,
                 is_disabled = 0,
                 updated_at = NOW()
             WHERE id = :user_id'
        )->execute([
            'is_active' => $active ? 1 : 0,
            'user_id' => $userId,
        ]);
    }

    private function normalizeRegistrationStatus(string $status): string
    {
        $normalized = strtolower(trim($status));

        return match ($normalized) {
            self::LEGACY_STATUS_ACTIVE => self::STATUS_APPROVED,
            self::STATUS_PENDING_REVIEW => self::STATUS_PENDING_REVIEW,
            self::STATUS_APPROVED => self::STATUS_APPROVED,
            self::STATUS_REJECTED => self::STATUS_REJECTED,
            self::STATUS_INACTIVE => self::STATUS_INACTIVE,
            default => self::STATUS_INACTIVE,
        };
    }

    private function isActivePortalRegistrationStatus(string $status): bool
    {
        return $this->normalizeRegistrationStatus($status) === self::STATUS_APPROVED;
    }

    private function allowsNewPublicSubmission(string $status): bool
    {
        return in_array($this->normalizeRegistrationStatus($status), [self::STATUS_REJECTED, self::STATUS_INACTIVE], true);
    }

    private function splitNameParts(string $fullName): array
    {
        $parts = preg_split('/\s+/', trim($fullName)) ?: [];
        $firstName = (string) array_shift($parts);
        $lastName = $parts ? (string) array_pop($parts) : '';
        $middleName = trim(implode(' ', $parts));

        return [
            'first_name' => $firstName,
            'middle_name' => $middleName,
            'last_name' => $lastName,
        ];
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
}
