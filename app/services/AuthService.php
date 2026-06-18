<?php
declare(strict_types=1);

namespace App\Services;

use PDO;
use PDOException;

class AuthService
{
    private const VERIFICATION_EXPIRY_MINUTES = 10;
    private const PASSWORD_RESET_EXPIRY_MINUTES = 20;
    private const VERIFICATION_MAX_ATTEMPTS = 5;
    private const CHALLENGE_TYPE_ACCOUNT_ACTIVATION = 'account_activation';
    private const CHALLENGE_TYPE_PASSWORD_RESET = 'password_reset';
    private ?bool $structuredUserNameColumns = null;

    public function attempt(string $email, string $password, string $entryPoint = 'staff'): array
    {
        if ($email === '' || $password === '') {
            return [
                'ok' => false,
                'message' => 'Email and password are required.',
            ];
        }

        try {
            $user = $this->findUserForLoginEmail(strtolower($email));
        } catch (PDOException) {
            return [
                'ok' => false,
                'message' => 'Unable to reach the authentication database.',
            ];
        }

        if (!is_array($user)) {
            return [
                'ok' => false,
                'message' => 'Invalid credentials.',
            ];
        }

        if (!(bool) $user['is_active']) {
            $coMakerRegistration = (new CoMakerRegistrationService())->registrationForUser((int) ($user['id'] ?? 0));
            if ($coMakerRegistration !== null && strtolower((string) ($coMakerRegistration['registrationStatus'] ?? '')) === CoMakerRegistrationService::STATUS_PENDING_REVIEW) {
                return [
                    'ok' => false,
                    'message' => 'Your co-maker registration is still pending Admin approval.',
                ];
            }

            return [
                'ok' => false,
                'message' => 'This account is inactive.',
            ];
        }

        if ((bool) $user['is_disabled']) {
            return [
                'ok' => false,
                'message' => 'This account is disabled. Contact the administrator.',
            ];
        }

        $passwordService = new PasswordService();
        if (!$passwordService->verify($password, (string) $user['password_hash'])) {
            return [
                'ok' => false,
                'message' => 'Invalid credentials.',
            ];
        }

        $authUser = [
            'id' => (int) $user['id'],
            'name' => $user['full_name'],
            'email' => $user['email'],
            'role' => $user['role'],
            'verification_status' => $user['verification_status'],
        ];

        $roleAccess = $this->checkEntryPointAccess((string) $user['role'], $entryPoint);
        if ($roleAccess !== null) {
            return [
                'ok' => false,
                'message' => $roleAccess,
            ];
        }

        if ($this->requiresAccountActivation($authUser)) {
            $challenge = $this->issueVerificationChallenge(
                (int) $user['id'],
                (string) $user['email'],
                (string) $user['full_name'],
                self::CHALLENGE_TYPE_ACCOUNT_ACTIVATION
            );

            if (!$challenge['ok']) {
                return [
                    'ok' => false,
                    'message' => $challenge['message'] ?? 'Unable to start account verification right now.',
                ];
            }

            return [
                'ok' => false,
                'requiresVerification' => true,
                'message' => 'Account verification is required before you can continue.',
                'redirect' => 'verify-account?email=' . urlencode((string) $user['email']) . '&mode=activation&entryPoint=' . urlencode($entryPoint),
            ];
        }

        $this->recordLogin((int) $user['id']);

        return [
            'ok' => true,
            'user' => $authUser,
            'redirect' => $this->redirectPathFor($authUser),
        ];
    }

    private function findUserForLoginEmail(string $email): array|null
    {
        $statement = db()->prepare(
            'SELECT users.id, users.full_name, users.email, users.password_hash, users.is_active, users.is_disabled, users.verification_status, roles.name AS role
             FROM users
             INNER JOIN roles ON roles.id = users.role_id
             WHERE users.email = :email
             LIMIT 1'
        );
        $statement->execute(['email' => $email]);
        $user = $statement->fetch(PDO::FETCH_ASSOC);
        if (is_array($user)) {
            return $user;
        }

        $aliasMap = [
            'sw@smartleap.local' => ROLE_SOCIAL_WORKER,
            'pdo@smartleap.local' => ROLE_PROJECT_OFFICER,
            'po@smartleap.local' => ROLE_PROJECT_OFFICER,
        ];
        $roleName = $aliasMap[$email] ?? null;
        if ($roleName === null) {
            return null;
        }

        $aliasStatement = db()->prepare(
            'SELECT users.id, users.full_name, users.email, users.password_hash, users.is_active, users.is_disabled, users.verification_status, roles.name AS role
             FROM users
             INNER JOIN roles ON roles.id = users.role_id
             WHERE roles.name = :role_name
               AND users.is_disabled = 0
             ORDER BY users.id ASC
             LIMIT 1'
        );
        $aliasStatement->execute(['role_name' => $roleName]);
        $aliasUser = $aliasStatement->fetch(PDO::FETCH_ASSOC);

        return is_array($aliasUser) ? $aliasUser : null;
    }

    public function registerApplicant(array $input): array
    {
        $email = strtolower(trim((string) ($input['email'] ?? '')));
        $password = (string) ($input['password'] ?? '');
        $errors = [];
        $stageOneRegistration = $this->findSelectedStageOneRegistrationByEmail($email);

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $errors['email'] = 'Enter a valid email address.';
        }

        if (strlen($password) < 8) {
            $errors['password'] = 'Password must be at least 8 characters.';
        } elseif (!preg_match('/[A-Z]/', $password) || !preg_match('/[a-z]/', $password) || !preg_match('/\d/', $password)) {
            $errors['password'] = 'Password must include uppercase, lowercase, and a number.';
        }

        if ($errors !== []) {
            return ['ok' => false, 'errors' => $errors];
        }

        if ($stageOneRegistration === null) {
            return [
                'ok' => false,
                'errors' => ['email' => 'Only Stage 1 registrants selected for the current batch can activate a portal account.'],
            ];
        }

        $stageOneRegistration = $this->overlayApplicantProfileActivationData($stageOneRegistration);

        $existingUser = $this->findUserByEmail($email);
        if ($existingUser !== null) {
            if (strtolower((string) ($existingUser['verification_status'] ?? 'pending')) !== 'verified') {
                $challenge = $this->issueVerificationChallenge(
                    (int) $existingUser['id'],
                    (string) $existingUser['email'],
                    (string) $existingUser['full_name'],
                    self::CHALLENGE_TYPE_ACCOUNT_ACTIVATION
                );

                if (!$challenge['ok']) {
                    return [
                        'ok' => false,
                        'errors' => ['general' => $challenge['message'] ?? 'Unable to restart account activation right now.'],
                    ];
                }

                return [
                    'ok' => true,
                    'requiresVerification' => true,
                    'message' => 'A verification code was sent to your email so you can finish activating your portal account.',
                    'redirect' => 'verify-account?email=' . urlencode($email) . '&mode=activation&entryPoint=portal',
                ];
            }

            return [
                'ok' => true,
                'message' => 'A SMART LEAP portal account already exists for this approved email. Redirecting you so you can recover access.',
                'redirect' => 'forgot-password?email=' . urlencode($email) . '&entryPoint=portal',
            ];
        }

        $roleId = $this->findRoleIdByName(ROLE_APPLICANT);
        if ($roleId === null) {
            return [
                'ok' => false,
                'errors' => ['general' => 'Applicant role is not configured in the database.'],
            ];
        }

        $applicationService = new ApplicationService();
        $stageOneApplicantInput = $this->stageOneRegistrationToApplicantInput($stageOneRegistration);
        $validationErrors = $applicationService->validateInitialApplicantProfileInput($stageOneApplicantInput);
        if ($validationErrors !== []) {
            return [
                'ok' => false,
                'errors' => ['general' => $validationErrors['general'] ?? reset($validationErrors) ?: 'The selected Stage 1 application is incomplete.'],
            ];
        }

        $passwordService = new PasswordService();
        $passwordHash = $passwordService->hash($password);
        $nameParts = $this->normalizeNameParts(
            (string) ($stageOneRegistration['first_name'] ?? ''),
            (string) ($stageOneRegistration['middle_name'] ?? ''),
            (string) ($stageOneRegistration['last_name'] ?? '')
        );
        $fullName = trim((string) ($stageOneRegistration['full_name'] ?? ''));
        $pdo = db();
        $userId = 0;

        try {
            $applicationService->prepareInitialApplicantProfileStorage();
            $pdo->beginTransaction();
            if ($this->hasStructuredUserNameColumns()) {
                $statement = $pdo->prepare(
                    'INSERT INTO users (role_id, full_name, first_name, middle_name, last_name, email, password_hash, verification_status, is_active, is_disabled)
                     VALUES (:role_id, :full_name, :first_name, :middle_name, :last_name, :email, :password_hash, :verification_status, 1, 0)'
                );
                $statement->execute([
                    'role_id' => $roleId,
                    'full_name' => $fullName,
                    'first_name' => $nameParts['first_name'] ?: null,
                    'middle_name' => $nameParts['middle_name'] ?: null,
                    'last_name' => $nameParts['last_name'] ?: null,
                    'email' => $email,
                    'password_hash' => $passwordHash,
                    'verification_status' => 'pending',
                ]);
            } else {
                $statement = $pdo->prepare(
                    'INSERT INTO users (role_id, full_name, email, password_hash, verification_status, is_active, is_disabled)
                     VALUES (:role_id, :full_name, :email, :password_hash, :verification_status, 1, 0)'
                );
                $statement->execute([
                    'role_id' => $roleId,
                    'full_name' => $fullName,
                    'email' => $email,
                    'password_hash' => $passwordHash,
                    'verification_status' => 'pending',
                ]);
            }
            $userId = (int) $pdo->lastInsertId();
            $applicationService->createInitialApplicantProfile($userId, $stageOneApplicantInput);
            $pdo->commit();
        } catch (\Throwable $exception) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            log_database_query_failure('auth.register_applicant', $exception, ['email' => $email, 'user_id' => $userId]);
            return [
                'ok' => false,
                'errors' => ['general' => 'We could not finish creating your account. Please try again, or sign in if this email was already saved.'],
            ];
        }

        $challenge = $this->issueVerificationChallenge(
            $userId,
            $email,
            $fullName !== '' ? $fullName : 'Applicant',
            self::CHALLENGE_TYPE_ACCOUNT_ACTIVATION
        );

        if (!$challenge['ok']) {
            return [
                'ok' => false,
                'errors' => ['general' => $challenge['message'] ?? 'Unable to send your verification code right now.'],
            ];
        }

        return [
            'ok' => true,
            'requiresVerification' => true,
            'message' => 'Your account is almost ready. Check your email for the verification code to finish activation.',
            'redirect' => 'verify-account?email=' . urlencode($email) . '&mode=activation&entryPoint=portal',
        ];
    }

    public function registerPortalAccount(array $input, array $files = []): array
    {
        $mode = strtolower(trim((string) ($input['registrationMode'] ?? 'applicant')));
        if (in_array($mode, ['co-maker', 'comaker'], true)) {
            return $this->registerPublicCoMaker($input, $files);
        }

        return $this->registerApplicant($input);
    }

    public function redirectPathFor(array $user): string
    {
        $role = strtolower((string) ($user['role'] ?? ''));
        $userId = (int) ($user['id'] ?? 0);

        if (str_contains($role, 'admin')) {
            return 'admin';
        }
        if (str_contains($role, 'project')) {
            return 'project-officer';
        }
        if (str_contains($role, 'social')) {
            return 'social-worker';
        }
        if (str_contains($role, 'beneficiary')) {
            return 'beneficiary-dashboard';
        }
        if (str_contains($role, 'applicant')) {
            if ($this->needsProfileCompletion($userId)) {
                return 'applicant-dashboard#profile-page';
            }
            return 'applicant-dashboard';
        }

        return 'portal';
    }

    public function currentUserFromSession(): ?array
    {
        return auth_user();
    }

    private function registerPublicCoMaker(array $input, array $files): array
    {
        $result = (new CoMakerRegistrationService())->registerPublic($input, $files);
        if (!$result['ok']) {
            return $result;
        }

        $userId = (int) ($result['user_id'] ?? 0);
        if ($userId <= 0) {
            return ['ok' => false, 'errors' => ['general' => 'Co-maker account creation did not return a valid account.']];
        }

        $result['user'] = $this->sessionPayloadForUser($userId);
        unset($result['user_id']);

        return $result;
    }

    public function changePassword(int $userId, string $currentPassword, string $newPassword, string $confirmPassword): array
    {
        $currentPassword = trim($currentPassword);

        if ($userId < 1) {
            return ['ok' => false, 'message' => 'Invalid account.'];
        }

        if ($currentPassword === '') {
            return ['ok' => false, 'message' => 'Enter your current password.'];
        }

        if (strlen($newPassword) < 8) {
            return ['ok' => false, 'message' => 'New password must be at least 8 characters.'];
        }

        if (!preg_match('/[A-Z]/', $newPassword) || !preg_match('/[a-z]/', $newPassword) || !preg_match('/\d/', $newPassword)) {
            return ['ok' => false, 'message' => 'New password must include uppercase, lowercase, and a number.'];
        }

        if ($newPassword !== $confirmPassword) {
            return ['ok' => false, 'message' => 'New password and confirmation do not match.'];
        }

        $statement = db()->prepare('SELECT id, password_hash FROM users WHERE id = :id LIMIT 1');
        $statement->execute(['id' => $userId]);
        $user = $statement->fetch(PDO::FETCH_ASSOC) ?: null;
        if ($user === null) {
            return ['ok' => false, 'message' => 'Account not found.'];
        }

        $passwords = new PasswordService();
        $currentHash = (string) ($user['password_hash'] ?? '');
        if (!$passwords->verify($currentPassword, $currentHash)) {
            return ['ok' => false, 'message' => 'Current password is incorrect.'];
        }

        if ($passwords->verify($newPassword, $currentHash)) {
            return ['ok' => false, 'message' => 'Choose a new password that is different from the current password.'];
        }

        $update = db()->prepare('UPDATE users SET password_hash = :password_hash, updated_at = NOW() WHERE id = :id');
        $update->execute([
            'password_hash' => $passwords->hash($newPassword),
            'id' => $userId,
        ]);

        return ['ok' => true, 'message' => 'Password updated successfully.'];
    }

    public function requestPasswordReset(string $email, string $entryPoint = 'portal'): array
    {
        $email = strtolower(trim($email));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return ['ok' => false, 'message' => 'Enter your registered email address.'];
        }

        $user = $this->findUserByEmail($email);
        if ($user === null) {
            return [
                'ok' => true,
                'message' => 'If that email has a SMART LEAP account, a password reset code has been sent.',
                'redirect' => 'reset-password?email=' . urlencode($email) . '&entryPoint=' . urlencode($entryPoint),
            ];
        }

        $roleAccess = $this->checkEntryPointAccess((string) ($user['role'] ?? ''), $entryPoint);
        if ($roleAccess !== null) {
            return ['ok' => false, 'message' => $roleAccess];
        }

        $challenge = $this->issueVerificationChallenge(
            (int) $user['id'],
            (string) $user['email'],
            (string) $user['full_name'],
            self::CHALLENGE_TYPE_PASSWORD_RESET,
            self::PASSWORD_RESET_EXPIRY_MINUTES
        );

        if (!$challenge['ok']) {
            return ['ok' => false, 'message' => $challenge['message'] ?? 'Unable to send a password reset code right now.'];
        }

        return [
            'ok' => true,
            'message' => 'Password reset code sent. Check your email.',
            'redirect' => 'reset-password?email=' . urlencode((string) $user['email']) . '&entryPoint=' . urlencode($entryPoint),
        ];
    }

    public function resetPassword(string $email, string $code, string $newPassword, string $confirmPassword, string $entryPoint = 'portal'): array
    {
        $email = strtolower(trim($email));
        $code = trim($code);
        if (!filter_var($email, FILTER_VALIDATE_EMAIL) || $code === '') {
            return ['ok' => false, 'message' => 'Enter your registered email and reset code.'];
        }

        if (strlen($newPassword) < 8) {
            return ['ok' => false, 'message' => 'New password must be at least 8 characters.'];
        }
        if (!preg_match('/[A-Z]/', $newPassword) || !preg_match('/[a-z]/', $newPassword) || !preg_match('/\d/', $newPassword)) {
            return ['ok' => false, 'message' => 'New password must include uppercase, lowercase, and a number.'];
        }
        if ($newPassword !== $confirmPassword) {
            return ['ok' => false, 'message' => 'New password and confirmation do not match.'];
        }

        $user = $this->findUserByEmail($email);
        if ($user === null) {
            return ['ok' => false, 'message' => 'No SMART LEAP account was found for that email address.'];
        }

        $roleAccess = $this->checkEntryPointAccess((string) ($user['role'] ?? ''), $entryPoint);
        if ($roleAccess !== null) {
            return ['ok' => false, 'message' => $roleAccess];
        }

        $this->ensureVerificationChallengeTable();
        $statement = db()->prepare(
            'SELECT id, code_hash, expires_at, attempts, consumed_at
             FROM account_verification_codes
             WHERE user_id = :user_id
               AND challenge_type = :challenge_type
             ORDER BY id DESC
             LIMIT 1'
        );
        $statement->execute([
            'user_id' => (int) $user['id'],
            'challenge_type' => self::CHALLENGE_TYPE_PASSWORD_RESET,
        ]);
        $challenge = $statement->fetch(PDO::FETCH_ASSOC);
        if (!is_array($challenge)) {
            return ['ok' => false, 'message' => 'No active password reset code was found. Request a new code.'];
        }
        if ($challenge['consumed_at'] !== null) {
            return ['ok' => false, 'message' => 'That reset code has already been used. Request a new code.'];
        }
        if (strtotime((string) $challenge['expires_at']) < time()) {
            return ['ok' => false, 'message' => 'That reset code has expired. Request a new code.'];
        }
        if ((int) $challenge['attempts'] >= self::VERIFICATION_MAX_ATTEMPTS) {
            return ['ok' => false, 'message' => 'Too many failed reset attempts. Request a new code.'];
        }
        if (!password_verify($code, (string) $challenge['code_hash'])) {
            db()->prepare(
                'UPDATE account_verification_codes
                 SET attempts = attempts + 1, updated_at = NOW()
                 WHERE id = :id'
            )->execute(['id' => (int) $challenge['id']]);

            return ['ok' => false, 'message' => 'The reset code is incorrect.'];
        }

        $pdo = db();
        $pdo->beginTransaction();
        try {
            $passwords = new PasswordService();
            $pdo->prepare(
                'UPDATE users
                 SET password_hash = :password_hash, updated_at = NOW()
                 WHERE id = :id'
            )->execute([
                'password_hash' => $passwords->hash($newPassword),
                'id' => (int) $user['id'],
            ]);
            $pdo->prepare(
                'UPDATE account_verification_codes
                 SET consumed_at = NOW(), updated_at = NOW()
                 WHERE id = :id'
            )->execute(['id' => (int) $challenge['id']]);
            $pdo->commit();
        } catch (\Throwable) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            return ['ok' => false, 'message' => 'Unable to reset the password right now.'];
        }

        return [
            'ok' => true,
            'message' => 'Password reset successful. Sign in with your new password.',
            'redirect' => $entryPoint === 'portal' ? 'portal/login' : 'login',
        ];
    }

    private function checkEntryPointAccess(string $role, string $entryPoint): ?string
    {
        $entryPoint = strtolower(trim($entryPoint));
        $role = strtolower(trim($role));

        if ($entryPoint === 'portal') {
            if (str_contains($role, 'applicant') || str_contains($role, 'beneficiary')) {
                return null;
            }

            return 'This sign-in page is for applicants and beneficiaries only.';
        }

        if ($entryPoint === 'staff') {
            if (str_contains($role, 'admin') || str_contains($role, 'project') || str_contains($role, 'social')) {
                return null;
            }

            return 'This login page is for administrators, project officers, and social workers only.';
        }

        return null;
    }

    public function verifyChallenge(string $email, string $code, string $mode = 'activation', string $entryPoint = 'portal'): array
    {
        $email = strtolower(trim($email));
        $code = trim($code);
        $mode = $this->normalizeChallengeMode($mode);
        if (!filter_var($email, FILTER_VALIDATE_EMAIL) || $code === '') {
            return ['ok' => false, 'message' => 'Enter your registered email and six-digit verification code.'];
        }

        $user = $this->findUserByEmail($email);
        if ($user === null) {
            return ['ok' => false, 'message' => 'No SMART LEAP account was found for that email address.'];
        }

        if ($mode === self::CHALLENGE_TYPE_ACCOUNT_ACTIVATION && strtolower((string) ($user['verification_status'] ?? '')) === 'verified') {
            $freshUser = $this->sessionPayloadForUser((int) $user['id']);
            return [
                'ok' => true,
                'message' => 'Your account is already verified.',
                'user' => $freshUser,
                'redirect' => $this->redirectPathFor($freshUser),
            ];
        }

        $this->ensureVerificationChallengeTable();
        $statement = db()->prepare(
            'SELECT id, code_hash, expires_at, attempts, consumed_at
             FROM account_verification_codes
             WHERE user_id = :user_id
               AND challenge_type = :challenge_type
             ORDER BY id DESC
             LIMIT 1'
        );
        $statement->execute([
            'user_id' => (int) $user['id'],
            'challenge_type' => $mode,
        ]);
        $challenge = $statement->fetch(PDO::FETCH_ASSOC);
        if (!is_array($challenge)) {
            return ['ok' => false, 'message' => 'No active verification challenge was found. Request a new code.'];
        }

        if ($challenge['consumed_at'] !== null) {
            return ['ok' => false, 'message' => 'That verification code has already been used. Request a new code.'];
        }

        if (strtotime((string) $challenge['expires_at']) < time()) {
            return ['ok' => false, 'message' => 'That verification code has expired. Request a new code.'];
        }

        if ((int) $challenge['attempts'] >= self::VERIFICATION_MAX_ATTEMPTS) {
            return ['ok' => false, 'message' => 'Too many failed verification attempts. Request a new code.'];
        }

        if (!password_verify($code, (string) $challenge['code_hash'])) {
            db()->prepare(
                'UPDATE account_verification_codes
                 SET attempts = attempts + 1, updated_at = NOW()
                 WHERE id = :id'
            )->execute(['id' => (int) $challenge['id']]);

            return ['ok' => false, 'message' => 'The verification code is incorrect.'];
        }

        $pdo = db();
        $pdo->beginTransaction();

        try {
            $pdo->prepare(
                'UPDATE account_verification_codes
                 SET consumed_at = NOW(), updated_at = NOW()
                 WHERE id = :id'
            )->execute(['id' => (int) $challenge['id']]);

            if ($mode === self::CHALLENGE_TYPE_ACCOUNT_ACTIVATION) {
                $pdo->prepare(
                    'UPDATE users
                     SET verification_status = "verified", updated_at = NOW()
                     WHERE id = :id'
                )->execute(['id' => (int) $user['id']]);
            }

            $pdo->commit();
        } catch (\Throwable $exception) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }

            return ['ok' => false, 'message' => 'Unable to complete account verification right now.'];
        }

        $freshUser = $this->sessionPayloadForUser((int) $user['id']);
        $this->recordLogin((int) $user['id']);

        return [
            'ok' => true,
            'message' => 'Your account has been verified.',
            'user' => $freshUser,
            'redirect' => $this->redirectPathFor($freshUser),
        ];
    }

    public function resendVerificationCode(string $email, string $mode = 'activation'): array
    {
        $email = strtolower(trim($email));
        $mode = $this->normalizeChallengeMode($mode);
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return ['ok' => false, 'message' => 'Enter a valid email address.'];
        }

        $user = $this->findUserByEmail($email);
        if ($user === null) {
            return ['ok' => false, 'message' => 'No SMART LEAP account was found for that email address.'];
        }

        if ($mode === self::CHALLENGE_TYPE_ACCOUNT_ACTIVATION && strtolower((string) ($user['verification_status'] ?? '')) === 'verified') {
            return ['ok' => true, 'message' => 'This account is already verified. You can sign in now.'];
        }

        return $this->issueVerificationChallenge((int) $user['id'], (string) $user['email'], (string) $user['full_name'], $mode);
    }

    private function requiresAccountActivation(array $user): bool
    {
        $status = strtolower((string) ($user['verification_status'] ?? 'pending'));
        return $status !== 'verified';
    }

    private function issueVerificationChallenge(int $userId, string $email, string $name, string $challengeType, ?int $expiryMinutes = null): array
    {
        $this->ensureVerificationChallengeTable();

        $code = (string) random_int(100000, 999999);
        $codeHash = password_hash($code, PASSWORD_DEFAULT);
        $expiresIn = $expiryMinutes ?? self::VERIFICATION_EXPIRY_MINUTES;
        $expiresAt = date('Y-m-d H:i:s', time() + ($expiresIn * 60));

        try {
            db()->prepare(
                'INSERT INTO account_verification_codes (user_id, challenge_type, code_hash, expires_at, attempts)
                 VALUES (:user_id, :challenge_type, :code_hash, :expires_at, 0)'
            )->execute([
                'user_id' => $userId,
                'challenge_type' => $challengeType,
                'code_hash' => $codeHash,
                'expires_at' => $expiresAt,
            ]);
        } catch (\Throwable $exception) {
            return [
                'ok' => false,
                'message' => 'Unable to create a verification challenge right now.',
            ];
        }

        $subject = match ($challengeType) {
            self::CHALLENGE_TYPE_PASSWORD_RESET => 'SMART LEAP password reset code',
            default => 'SMART LEAP verification code',
        };
        $actionLabel = match ($challengeType) {
            self::CHALLENGE_TYPE_PASSWORD_RESET => 'password reset',
            default => 'verification',
        };
        $body = sprintf(
            '<p>Good day %s,</p><p>Your SMART LEAP %s code is <strong style="font-size:1.2rem; letter-spacing:0.18em;">%s</strong>.</p><p>This code expires in %d minutes.</p><p>If you did not request this action, you can ignore this message.</p>',
            htmlspecialchars($name !== '' ? $name : 'Applicant', ENT_QUOTES),
            htmlspecialchars($actionLabel, ENT_QUOTES),
            htmlspecialchars($code, ENT_QUOTES),
            $expiresIn
        );
        (new MailService())->send($email, $subject, $body, $userId);

        return [
            'ok' => true,
            'message' => match ($challengeType) {
                self::CHALLENGE_TYPE_PASSWORD_RESET => 'A fresh password reset code was sent to your registered email.',
                default => 'A fresh verification code was sent to your registered email.',
            },
        ];
    }

    private function ensureVerificationChallengeTable(): void
    {
        static $ensured = false;
        if ($ensured) {
            return;
        }

        db()->exec(
            'CREATE TABLE IF NOT EXISTS account_verification_codes (
                id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                user_id BIGINT UNSIGNED NOT NULL,
                challenge_type VARCHAR(40) NOT NULL DEFAULT "account_activation",
                code_hash VARCHAR(255) NOT NULL,
                attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
                expires_at DATETIME NOT NULL,
                consumed_at DATETIME NULL,
                created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                CONSTRAINT fk_account_verification_codes_user FOREIGN KEY (user_id) REFERENCES users(id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );

        $ensured = true;
    }

    private function normalizeChallengeMode(string $mode): string
    {
        return self::CHALLENGE_TYPE_ACCOUNT_ACTIVATION;
    }

    private function recordLogin(int $userId): void
    {
        $statement = db()->prepare('UPDATE users SET last_login_at = NOW() WHERE id = :id');
        $statement->execute(['id' => $userId]);
    }

    private function findUserByEmail(string $email): ?array
    {
        $statement = db()->prepare(
            'SELECT users.id, users.full_name, users.email, users.verification_status, roles.name AS role
             FROM users
             INNER JOIN roles ON roles.id = users.role_id
             WHERE users.email = :email
             LIMIT 1'
        );
        $statement->execute(['email' => $email]);
        $user = $statement->fetch();
        return is_array($user) ? $user : null;
    }

    private function findSelectedStageOneRegistrationByEmail(string $email): ?array
    {
        if ($email === '') {
            return null;
        }

        $statement = db()->prepare(
            'SELECT id, first_name, middle_name, last_name, full_name, email, contact_number, complete_address,
                    birthdate, age, gender, barangay, is_4ps, educational_attainment, sector, sector_other_specify,
                    livelihood_type, business_name, profile_photo_path, profile_photo_mime_type,
                    business_photo_path, business_photo_mime_type, validation_status
             FROM stage_one_registrations
             WHERE LOWER(email) = LOWER(:email)
               AND LOWER(validation_status) IN ("selected", "approved")
             ORDER BY id DESC
             LIMIT 1'
        );
        $statement->execute(['email' => $email]);
        $row = $statement->fetch(PDO::FETCH_ASSOC);

        return is_array($row) ? $row : null;
    }

    private function stageOneRegistrationToApplicantInput(array $registration): array
    {
        return [
            'birthdate' => (string) ($registration['birthdate'] ?? ''),
            'age' => (string) ($registration['age'] ?? ''),
            'gender' => (string) ($registration['gender'] ?? ''),
            'contactNumber' => (string) ($registration['contact_number'] ?? ''),
            'address' => (string) ($registration['complete_address'] ?? ''),
            'barangay' => (string) ($registration['barangay'] ?? ''),
            'is4ps' => ((int) ($registration['is_4ps'] ?? 0)) === 1 ? 'Yes' : 'No',
            'educationalAttainment' => (string) ($registration['educational_attainment'] ?? ''),
            'sector' => (string) ($registration['sector'] ?? ''),
            'sectorOtherSpecify' => (string) ($registration['sector_other_specify'] ?? ''),
            'livelihood' => (string) ($registration['livelihood_type'] ?? ''),
            'businessName' => (string) ($registration['business_name'] ?? ''),
            'photoDataUrl' => $this->stageOneProfilePhotoToDataUrl($registration),
        ];
    }

    private function overlayApplicantProfileActivationData(array $registration): array
    {
        $email = strtolower(trim((string) ($registration['email'] ?? '')));
        if ($email === '') {
            return $registration;
        }

        $needsOverlay = trim((string) ($registration['educational_attainment'] ?? '')) === ''
            || trim((string) ($registration['sector'] ?? '')) === ''
            || trim((string) ($registration['livelihood_type'] ?? '')) === ''
            || trim((string) ($registration['business_name'] ?? '')) === ''
            || trim((string) ($registration['barangay'] ?? '')) === '';

        if (!$needsOverlay) {
            return $registration;
        }

        $statement = db()->prepare(
            'SELECT
                applicant_profiles.contact_number,
                applicant_profiles.address_line,
                applicant_profiles.birthdate,
                applicant_profiles.age,
                applicant_profiles.gender,
                applicant_profiles.is_4ps,
                applicant_profiles.educational_attainment,
                applicant_profiles.sector,
                applicant_profiles.sector_other_specify,
                applicant_profiles.livelihood_type,
                applicant_profiles.business_name,
                barangays.name AS barangay_name
             FROM users
             INNER JOIN applicant_profiles ON applicant_profiles.user_id = users.id
             LEFT JOIN barangays ON barangays.id = applicant_profiles.barangay_id
             WHERE LOWER(users.email) = LOWER(:email)
             LIMIT 1'
        );
        $statement->execute(['email' => $email]);
        $profile = $statement->fetch(PDO::FETCH_ASSOC);
        if (!is_array($profile)) {
            return $registration;
        }

        $registration['contact_number'] = trim((string) ($registration['contact_number'] ?? '')) !== ''
            ? (string) $registration['contact_number']
            : (string) ($profile['contact_number'] ?? '');
        $registration['complete_address'] = trim((string) ($registration['complete_address'] ?? '')) !== ''
            ? (string) $registration['complete_address']
            : (string) ($profile['address_line'] ?? '');
        $registration['birthdate'] = trim((string) ($registration['birthdate'] ?? '')) !== ''
            ? (string) $registration['birthdate']
            : (string) ($profile['birthdate'] ?? '');
        $registration['age'] = !empty($registration['age'])
            ? $registration['age']
            : ($profile['age'] ?? null);
        $registration['gender'] = trim((string) ($registration['gender'] ?? '')) !== ''
            ? (string) $registration['gender']
            : (string) ($profile['gender'] ?? '');
        $registration['barangay'] = trim((string) ($registration['barangay'] ?? '')) !== ''
            ? (string) $registration['barangay']
            : (string) ($profile['barangay_name'] ?? '');
        $registration['is_4ps'] = $registration['is_4ps'] !== null
            ? $registration['is_4ps']
            : ($profile['is_4ps'] ?? null);
        $registration['educational_attainment'] = trim((string) ($registration['educational_attainment'] ?? '')) !== ''
            ? (string) $registration['educational_attainment']
            : (string) ($profile['educational_attainment'] ?? '');
        $registration['sector'] = trim((string) ($registration['sector'] ?? '')) !== ''
            ? (string) $registration['sector']
            : (string) ($profile['sector'] ?? '');
        $registration['sector_other_specify'] = trim((string) ($registration['sector_other_specify'] ?? '')) !== ''
            ? (string) $registration['sector_other_specify']
            : (string) ($profile['sector_other_specify'] ?? '');
        $registration['livelihood_type'] = trim((string) ($registration['livelihood_type'] ?? '')) !== ''
            ? (string) $registration['livelihood_type']
            : (string) ($profile['livelihood_type'] ?? '');
        $registration['business_name'] = trim((string) ($registration['business_name'] ?? '')) !== ''
            ? (string) $registration['business_name']
            : (string) ($profile['business_name'] ?? '');

        return $registration;
    }

    private function stageOneProfilePhotoToDataUrl(array $registration): string
    {
        $relativePath = trim((string) ($registration['profile_photo_path'] ?? ''));
        $mimeType = trim((string) ($registration['profile_photo_mime_type'] ?? ''));
        if ($relativePath === '') {
            $relativePath = trim((string) ($registration['business_photo_path'] ?? ''));
            $mimeType = trim((string) ($registration['business_photo_mime_type'] ?? ''));
        }
        if ($relativePath === '') {
            return $this->legacyProfilePhotoDataUrlByEmail((string) ($registration['email'] ?? ''));
        }

        $absolutePath = public_path(str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $relativePath));
        if (!is_file($absolutePath) || !is_readable($absolutePath)) {
            return '';
        }

        $binary = @file_get_contents($absolutePath);
        if ($binary === false || $binary === '') {
            return '';
        }

        if ($mimeType === '') {
            $detected = @mime_content_type($absolutePath);
            $mimeType = is_string($detected) ? $detected : 'image/jpeg';
        }

        return 'data:' . $mimeType . ';base64,' . base64_encode($binary);
    }

    private function legacyProfilePhotoDataUrlByEmail(string $email): string
    {
        $email = strtolower(trim($email));
        if ($email === '') {
            return '';
        }

        $statement = db()->prepare(
            'SELECT user_profile_photos.image_data
             FROM users
             INNER JOIN user_profile_photos ON user_profile_photos.user_id = users.id
             WHERE LOWER(users.email) = LOWER(:email)
             LIMIT 1'
        );
        $statement->execute(['email' => $email]);
        $imageData = $statement->fetchColumn();

        return is_string($imageData) ? trim($imageData) : '';
    }

    private function sessionPayloadForUser(int $userId): array
    {
        $statement = db()->prepare(
            'SELECT users.id, users.full_name, users.email, users.verification_status, roles.name AS role
             FROM users
             INNER JOIN roles ON roles.id = users.role_id
             WHERE users.id = :id
             LIMIT 1'
        );
        $statement->execute(['id' => $userId]);
        $user = $statement->fetch(PDO::FETCH_ASSOC);
        if (!is_array($user)) {
            throw new \RuntimeException('User session payload could not be resolved.');
        }

        return [
            'id' => (int) $user['id'],
            'name' => $user['full_name'],
            'email' => $user['email'],
            'role' => $user['role'],
            'verification_status' => $user['verification_status'],
        ];
    }

    private function findRoleIdByName(string $name): ?int
    {
        $statement = db()->prepare('SELECT id FROM roles WHERE name = :name LIMIT 1');
        $statement->execute(['name' => $name]);
        $roleId = $statement->fetchColumn();
        return $roleId !== false ? (int) $roleId : null;
    }

    private function needsProfileCompletion(int $userId): bool
    {
        if ($userId <= 0) {
            return false;
        }

        $statement = db()->prepare(
            'SELECT applicant_profiles.id
             FROM applicant_profiles
             WHERE applicant_profiles.user_id = :user_id
             LIMIT 1'
        );
        $statement->execute(['user_id' => $userId]);

        return $statement->fetchColumn() === false;
    }

    private function normalizeNameParts(string $firstName, string $middleName, string $lastName): array
    {
        return [
            'first_name' => trim($firstName),
            'middle_name' => trim($middleName),
            'last_name' => trim($lastName),
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
