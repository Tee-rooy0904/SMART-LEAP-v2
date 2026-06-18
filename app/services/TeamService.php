<?php

declare(strict_types=1);

namespace App\Services;

use PDO;
use PDOException;

class TeamService
{
    private const ROLE_MAP = [
        'admin' => ROLE_ADMIN,
        'pdo' => ROLE_PROJECT_OFFICER,
        'social_worker' => ROLE_SOCIAL_WORKER,
    ];

    private const MANAGED_ROLE_MAP = [
        'pdo' => ROLE_PROJECT_OFFICER,
        'social_worker' => ROLE_SOCIAL_WORKER,
    ];

    private const STATUS_MAP = [
        'active' => ['is_active' => 1, 'is_disabled' => 0, 'profile_status' => 'active'],
        'inactive' => ['is_active' => 0, 'is_disabled' => 0, 'profile_status' => 'inactive'],
        'disabled' => ['is_active' => 0, 'is_disabled' => 1, 'profile_status' => 'disabled'],
    ];
    private ?bool $structuredUserNameColumns = null;

    public function listStaff(array $filters = []): array
    {
        $this->ensureStaffProfileSignatureColumns();
        $params = [];
        $conditions = ['roles.name IN (:role_pdo, :role_social_worker)'];
        $params['role_pdo'] = ROLE_PROJECT_OFFICER;
        $params['role_social_worker'] = ROLE_SOCIAL_WORKER;

        $roleFilter = trim((string) ($filters['role'] ?? ''));
        if ($roleFilter !== '' && isset(self::MANAGED_ROLE_MAP[$roleFilter])) {
            $conditions[] = 'roles.name = :filter_role';
            $params['filter_role'] = self::MANAGED_ROLE_MAP[$roleFilter];
        }

        $statusFilter = trim((string) ($filters['status'] ?? ''));
        if ($statusFilter !== '' && isset(self::STATUS_MAP[$statusFilter])) {
            $conditions[] = 'staff_profiles.status = :filter_status';
            $params['filter_status'] = $statusFilter;
        }

        $search = trim((string) ($filters['search'] ?? ''));
        if ($search !== '') {
            $conditions[] = '(users.full_name LIKE :search OR users.email LIKE :search)';
            $params['search'] = '%' . $search . '%';
        }

        $sql = '
            SELECT
                users.id,
                users.full_name,
                users.first_name,
                users.middle_name,
                users.last_name,
                users.email,
                users.is_active,
                users.is_disabled,
                users.last_login_at,
                roles.name AS role_name,
                staff_profiles.id AS staff_profile_id,
                staff_profiles.contact_number,
                staff_profiles.position_title,
                staff_profiles.status AS staff_status,
                staff_profiles.training_group_number,
                staff_profiles.signature_file_path,
                staff_profiles.signature_original_name,
                staff_profiles.signature_mime_type,
                staff_profiles.signature_file_size,
                staff_profiles.signature_uploaded_at,
                user_profile_photos.image_data AS profile_photo
            FROM users
            INNER JOIN roles ON roles.id = users.role_id
            INNER JOIN staff_profiles ON staff_profiles.user_id = users.id
            LEFT JOIN user_profile_photos ON user_profile_photos.user_id = users.id
            WHERE ' . implode(' AND ', $conditions) . '
            ORDER BY users.full_name ASC
        ';

        $statement = db()->prepare($sql);
        foreach ($params as $key => $value) {
            $statement->bindValue(':' . $key, $value);
        }
        $statement->execute();
        $rows = $statement->fetchAll(PDO::FETCH_ASSOC) ?: [];

        $assignmentMap = $this->fetchAssignmentMap(array_map(static fn (array $row): int => (int) $row['staff_profile_id'], $rows));

        return array_map(fn (array $row): array => $this->mapStaffListRow($row, $assignmentMap), $rows);
    }

    public function getStaffProfileByUserId(int $userId): ?array
    {
        $this->ensureStaffProfileForUserId($userId);
        $row = $this->findStaffListRowByUserId($userId);
        if ($row === null) {
            return null;
        }

        $assignmentMap = $this->fetchAssignmentMap([(int) ($row['staff_profile_id'] ?? 0)]);
        return $this->mapStaffListRow($row, $assignmentMap);
    }

    public function updateOwnProfile(int $userId, array $payload): array
    {
        $this->ensureStaffProfileForUserId($userId);
        $existing = $this->findStaffByUserId($userId);
        if ($existing === null) {
            return ['ok' => false, 'errors' => ['general' => 'Staff profile not found.']];
        }

        $firstName = trim((string) ($payload['firstName'] ?? ''));
        $middleName = trim((string) ($payload['middleName'] ?? ''));
        $lastName = trim((string) ($payload['lastName'] ?? ''));
        $email = strtolower(trim((string) ($payload['email'] ?? '')));
        $existingEmail = strtolower(trim((string) ($payload['existingEmail'] ?? '')));
        $contactNumber = trim((string) ($payload['contactNumber'] ?? ''));
        $positionTitle = trim((string) ($payload['positionTitle'] ?? ''));
        $roleName = strtolower(str_replace([' ', '-'], '_', trim((string) ($existing['role_name'] ?? ''))));
        if ($roleName === 'social_worker') {
            $positionTitle = 'Social Worker';
        } elseif ($roleName === 'project_officer') {
            $positionTitle = 'Project Officer';
        } elseif ($roleName === 'administrator') {
            $positionTitle = 'Administrator';
        }
        $fullName = trim(implode(' ', array_filter([$firstName, $middleName, $lastName], static fn ($value) => $value !== '')));
        $errors = [];

        if (mb_strlen($firstName) < 2) {
            $errors['firstName'] = 'Enter your first name.';
        }

        if (mb_strlen($lastName) < 2) {
            $errors['lastName'] = 'Enter your last name.';
        }

        $loginEmail = $existingEmail !== '' ? $existingEmail : ($email !== '' ? $email : strtolower(trim((string) ($existing['email'] ?? ''))));
        if (!filter_var($loginEmail, FILTER_VALIDATE_EMAIL)) {
            $errors['email'] = 'A valid login email is required.';
        }

        if ($errors !== []) {
            return ['ok' => false, 'errors' => $errors];
        }

        $pdo = db();
        $pdo->beginTransaction();

        try {
            $params = [
                'id' => $userId,
                'full_name' => $fullName,
            ];
            $fields = [
                'full_name = :full_name',
                'updated_at = NOW()',
            ];

            if ($this->hasStructuredUserNameColumns()) {
                $fields[] = 'first_name = :first_name';
                $fields[] = 'middle_name = :middle_name';
                $fields[] = 'last_name = :last_name';
                $params['first_name'] = $firstName;
                $params['middle_name'] = $middleName !== '' ? $middleName : null;
                $params['last_name'] = $lastName;
            }

            $statement = $pdo->prepare('UPDATE users SET ' . implode(', ', $fields) . ' WHERE id = :id');
            $statement->execute($params);

            $profileStatement = $pdo->prepare(
                'UPDATE staff_profiles
                 SET contact_number = :contact_number, position_title = :position_title, updated_at = NOW()
                 WHERE user_id = :user_id'
            );
            $profileStatement->execute([
                'contact_number' => $contactNumber !== '' ? $contactNumber : null,
                'position_title' => $positionTitle !== '' ? $positionTitle : ($existing['position_title'] ?? null),
                'user_id' => $userId,
            ]);

            $pdo->commit();
        } catch (PDOException $exception) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }

            log_database_query_failure('team.update_own_profile', $exception, ['user_id' => $userId]);
            return ['ok' => false, 'errors' => ['general' => 'Unable to update your profile right now.']];
        }

        return [
            'ok' => true,
            'message' => 'Profile updated successfully.',
            'staff' => $this->getStaffProfileByUserId($userId),
        ];
    }

    public function createStaff(array $payload, int $actorUserId): array
    {
        $this->ensureStaffProfileSignatureColumns();
        $input = $this->validateStaffPayload($payload, true);
        if ($input['errors'] !== []) {
            return ['ok' => false, 'errors' => $input['errors']];
        }

        $roleName = self::MANAGED_ROLE_MAP[$input['data']['role']];
        $roleId = $this->findRoleIdByName($roleName);
        if ($roleId === null) {
            return ['ok' => false, 'errors' => ['role' => 'Selected role is not configured.']];
        }

        if ($this->findUserByEmail($input['data']['email']) !== null) {
            return ['ok' => false, 'errors' => ['email' => 'Email already exists.']];
        }

        $statusFlags = self::STATUS_MAP[$input['data']['status']];
        $passwordHash = (new PasswordService())->hash($input['data']['password']);
        $nameParts = $this->splitNameParts($input['data']['name']);

        $pdo = db();
        $pdo->beginTransaction();

        try {
            if ($this->hasStructuredUserNameColumns()) {
                $statement = $pdo->prepare(
                    'INSERT INTO users (role_id, full_name, first_name, middle_name, last_name, email, password_hash, verification_status, is_active, is_disabled)
                     VALUES (:role_id, :full_name, :first_name, :middle_name, :last_name, :email, :password_hash, :verification_status, :is_active, :is_disabled)'
                );
                $statement->execute([
                    'role_id' => $roleId,
                    'full_name' => $input['data']['name'],
                    'first_name' => $nameParts['first_name'] ?: null,
                    'middle_name' => $nameParts['middle_name'] ?: null,
                    'last_name' => $nameParts['last_name'] ?: null,
                    'email' => $input['data']['email'],
                    'password_hash' => $passwordHash,
                    'verification_status' => 'verified',
                    'is_active' => $statusFlags['is_active'],
                    'is_disabled' => $statusFlags['is_disabled'],
                ]);
            } else {
                $statement = $pdo->prepare(
                    'INSERT INTO users (role_id, full_name, email, password_hash, verification_status, is_active, is_disabled)
                     VALUES (:role_id, :full_name, :email, :password_hash, :verification_status, :is_active, :is_disabled)'
                );
                $statement->execute([
                    'role_id' => $roleId,
                    'full_name' => $input['data']['name'],
                    'email' => $input['data']['email'],
                    'password_hash' => $passwordHash,
                    'verification_status' => 'verified',
                    'is_active' => $statusFlags['is_active'],
                    'is_disabled' => $statusFlags['is_disabled'],
                ]);
            }

            $userId = (int) $pdo->lastInsertId();
            $staffStatement = $pdo->prepare(
                'INSERT INTO staff_profiles (user_id, contact_number, position_title, status, training_group_number)
                 VALUES (:user_id, :contact_number, :position_title, :status, :training_group_number)'
            );
            $staffStatement->execute([
                'user_id' => $userId,
                'contact_number' => $input['data']['contactNumber'] ?: null,
                'position_title' => $input['data']['positionTitle'] ?: $roleName,
                'status' => $input['data']['status'],
                'training_group_number' => $input['data']['trainingGroupNumber'],
            ]);

            $staffProfileId = (int) $pdo->lastInsertId();
            $pdo->commit();
        } catch (PDOException $exception) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }

            log_database_query_failure('team.create_staff', $exception, ['email' => $input['data']['email']]);

            return ['ok' => false, 'errors' => ['general' => 'Unable to create staff account right now.']];
        }

        (new AuditLogService())->record(
            $actorUserId,
            'staff.created',
            'users',
            $userId,
            [
                'role' => $input['data']['role'],
                'status' => $input['data']['status'],
                'staff_profile_id' => $staffProfileId,
            ]
        );

        return ['ok' => true];
    }

    public function updateStaff(array $payload, int $actorUserId): array
    {
        $this->ensureStaffProfileSignatureColumns();
        $staffId = (int) ($payload['staffId'] ?? 0);
        if ($staffId < 1) {
            return ['ok' => false, 'errors' => ['staffId' => 'Invalid staff account.']];
        }

        $existing = $this->findStaffByUserId($staffId);
        if ($existing === null) {
            return ['ok' => false, 'errors' => ['staffId' => 'Staff account not found.']];
        }
        if (!$this->isManagedRoleName((string) ($existing['role_name'] ?? ''))) {
            return ['ok' => false, 'errors' => ['staffId' => 'Administrators are not managed from Team Management.']];
        }

        $input = $this->validateStaffPayload($payload, false);
        if ($input['errors'] !== []) {
            return ['ok' => false, 'errors' => $input['errors']];
        }

        $roleName = self::MANAGED_ROLE_MAP[$input['data']['role']];
        $roleId = $this->findRoleIdByName($roleName);
        if ($roleId === null) {
            return ['ok' => false, 'errors' => ['role' => 'Selected role is not configured.']];
        }

        $duplicate = $this->findUserByEmail($input['data']['email']);
        if ($duplicate !== null && (int) $duplicate['id'] !== $staffId) {
            return ['ok' => false, 'errors' => ['email' => 'Email already exists.']];
        }

        $statusFlags = self::STATUS_MAP[$input['data']['status']];
        $previousBarangayIds = $this->currentAssignmentBarangayIds((int) $existing['staff_profile_id']);
        $nameParts = $this->splitNameParts($input['data']['name']);
        $pdo = db();
        $pdo->beginTransaction();

        try {
            $fields = [
                'role_id = :role_id',
                'full_name = :full_name',
                'email = :email',
                'is_active = :is_active',
                'is_disabled = :is_disabled',
                'updated_at = NOW()',
            ];
            $params = [
                'role_id' => $roleId,
                'full_name' => $input['data']['name'],
                'email' => $input['data']['email'],
                'is_active' => $statusFlags['is_active'],
                'is_disabled' => $statusFlags['is_disabled'],
                'id' => $staffId,
            ];

            if ($this->hasStructuredUserNameColumns()) {
                $fields[] = 'first_name = :first_name';
                $fields[] = 'middle_name = :middle_name';
                $fields[] = 'last_name = :last_name';
                $params['first_name'] = $nameParts['first_name'] ?: null;
                $params['middle_name'] = $nameParts['middle_name'] ?: null;
                $params['last_name'] = $nameParts['last_name'] ?: null;
            }

            if ($input['data']['password'] !== '') {
                $fields[] = 'password_hash = :password_hash';
                $params['password_hash'] = (new PasswordService())->hash($input['data']['password']);
            }

            $statement = $pdo->prepare('UPDATE users SET ' . implode(', ', $fields) . ' WHERE id = :id');
            $statement->execute($params);

            $staffStatement = $pdo->prepare(
                'UPDATE staff_profiles
                 SET contact_number = :contact_number, position_title = :position_title, status = :status, training_group_number = :training_group_number, updated_at = NOW()
                 WHERE user_id = :user_id'
            );
            $staffStatement->execute([
                'contact_number' => $input['data']['contactNumber'] ?: null,
                'position_title' => $input['data']['positionTitle'] ?: $roleName,
                'status' => $input['data']['status'],
                'training_group_number' => $input['data']['trainingGroupNumber'],
                'user_id' => $staffId,
            ]);

            if ($input['data']['role'] !== 'pdo') {
                $pdo->prepare(
                    'UPDATE staff_barangay_assignments
                     SET ended_at = NOW(), updated_at = NOW()
                     WHERE staff_profile_id = :staff_profile_id AND ended_at IS NULL'
                )->execute([
                    'staff_profile_id' => (int) $existing['staff_profile_id'],
                ]);
            }

            $pdo->commit();
        } catch (PDOException $exception) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }

            log_database_query_failure('team.update_staff', $exception, ['staff_id' => $staffId]);

            return ['ok' => false, 'errors' => ['general' => 'Unable to update staff account right now.']];
        }

        if ($input['data']['role'] !== 'pdo' && $previousBarangayIds !== []) {
            (new BarangayAssignmentService())->refreshAssignedStaffForBarangays($previousBarangayIds);
        }

        (new AuditLogService())->record(
            $actorUserId,
            'staff.updated',
            'users',
            $staffId,
            [
                'role' => $input['data']['role'],
                'status' => $input['data']['status'],
            ]
        );

        return ['ok' => true];
    }

    public function updateStaffStatus(int $staffId, string $status, int $actorUserId): array
    {
        if ($staffId < 1 || !isset(self::STATUS_MAP[$status])) {
            return ['ok' => false, 'errors' => ['status' => 'Invalid staff status update.']];
        }

        $existing = $this->findStaffByUserId($staffId);
        if ($existing === null) {
            return ['ok' => false, 'errors' => ['staffId' => 'Staff account not found.']];
        }
        if (!$this->isManagedRoleName((string) ($existing['role_name'] ?? ''))) {
            return ['ok' => false, 'errors' => ['staffId' => 'Administrators are not managed from Team Management.']];
        }

        $flags = self::STATUS_MAP[$status];
        $affectedBarangayIds = $this->currentAssignmentBarangayIds((int) $existing['staff_profile_id']);
        $pdo = db();
        $pdo->beginTransaction();

        try {
            $pdo->prepare(
                'UPDATE users SET is_active = :is_active, is_disabled = :is_disabled, updated_at = NOW() WHERE id = :id'
            )->execute([
                'is_active' => $flags['is_active'],
                'is_disabled' => $flags['is_disabled'],
                'id' => $staffId,
            ]);

            $pdo->prepare(
                'UPDATE staff_profiles SET status = :status, updated_at = NOW() WHERE user_id = :user_id'
            )->execute([
                'status' => $status,
                'user_id' => $staffId,
            ]);

            $pdo->commit();
        } catch (PDOException $exception) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            log_database_query_failure('team.update_status', $exception, ['staff_id' => $staffId, 'status' => $status]);
            return ['ok' => false, 'errors' => ['general' => 'Unable to update status right now.']];
        }

        if ($affectedBarangayIds !== []) {
            (new BarangayAssignmentService())->refreshAssignedStaffForBarangays($affectedBarangayIds);
        }

        (new AuditLogService())->record(
            $actorUserId,
            'staff.status_updated',
            'users',
            $staffId,
            ['status' => $status]
        );

        return ['ok' => true];
    }

    public function teamMetadata(): array
    {
        $this->ensureStaffProfileSignatureColumns();
        $catalog = new BarangayCatalogService();
        $barangays = $catalog->all();

        return [
            'roles' => [
                ['value' => 'pdo', 'label' => ROLE_PROJECT_OFFICER],
                ['value' => 'social_worker', 'label' => ROLE_SOCIAL_WORKER],
            ],
            'statuses' => [
                ['value' => 'active', 'label' => 'Active'],
                ['value' => 'inactive', 'label' => 'Inactive'],
                ['value' => 'disabled', 'label' => 'Disabled'],
            ],
            'trainingGroups' => [
                ['value' => 1, 'label' => 'Group 1'],
                ['value' => 2, 'label' => 'Group 2'],
                ['value' => 3, 'label' => 'Group 3'],
            ],
            'districts' => $catalog->districtOptions(),
            'barangays' => $barangays,
        ];
    }

    public function signatureStateForActor(array $actor, int $staffId = 0): array
    {
        $this->ensureStaffProfileSignatureColumns();
        $target = $this->resolveSignatureTarget($actor, $staffId);
        if ($target === null) {
            return ['ok' => false, 'message' => 'Staff signature settings are not available for this account.'];
        }

        return [
            'ok' => true,
            'staff' => $this->mapSignatureState($target),
        ];
    }

    public function uploadSignatureForActor(array $actor, int $staffId, ?array $file): array
    {
        $this->ensureStaffProfileSignatureColumns();
        $target = $this->resolveSignatureTarget($actor, $staffId);
        if ($target === null) {
            return ['ok' => false, 'errors' => ['general' => 'Staff signature settings are not available for this account.']];
        }

        if (!is_array($file)) {
            return ['ok' => false, 'errors' => ['signature' => 'Choose a signature image to upload.']];
        }

        try {
            $metadata = (new UploadService())->storePostApprovalAsset('staff-signature', $file);
        } catch (\Throwable $exception) {
            return ['ok' => false, 'errors' => ['signature' => $exception->getMessage() ?: 'Unable to upload this signature right now.']];
        }

        try {
            db()->prepare(
                'UPDATE staff_profiles
                 SET signature_file_path = :file_path,
                     signature_original_name = :original_name,
                     signature_mime_type = :mime_type,
                     signature_file_size = :file_size,
                     signature_uploaded_at = :uploaded_at,
                     updated_at = NOW()
                 WHERE id = :staff_profile_id'
            )->execute([
                'file_path' => $metadata['file_path'],
                'original_name' => $metadata['original_name'],
                'mime_type' => $metadata['mime_type'],
                'file_size' => (int) ($metadata['file_size'] ?? 0),
                'uploaded_at' => $metadata['uploaded_at'] ?? date('Y-m-d H:i:s'),
                'staff_profile_id' => (int) $target['staff_profile_id'],
            ]);
        } catch (PDOException $exception) {
            log_database_query_failure('team.upload_signature', $exception, ['staff_profile_id' => (int) $target['staff_profile_id']]);
            return ['ok' => false, 'errors' => ['general' => 'Unable to save the signature right now.']];
        }

        $updated = $this->findStaffSignatureTargetByProfileId((int) $target['staff_profile_id']) ?? $target;

        (new AuditLogService())->record(
            (int) ($actor['id'] ?? 0),
            'staff.signature_updated',
            'staff_profiles',
            (int) $target['staff_profile_id'],
            [
                'target_user_id' => (int) $updated['id'],
                'target_role' => (string) $updated['role_name'],
                'self_service' => (int) ($actor['id'] ?? 0) === (int) $updated['id'],
            ]
        );

        return [
            'ok' => true,
            'message' => 'Saved signature updated.',
            'staff' => $this->mapSignatureState($updated),
            'teamStaff' => $this->listStaff(),
        ];
    }

    private function ensureBarangaysSeeded(): void
    {
        (new BarangayCatalogService())->ensureSeeded();
    }

    private function validateStaffPayload(array $payload, bool $isCreate): array
    {
        $data = [
            'name' => trim((string) ($payload['name'] ?? '')),
            'email' => strtolower(trim((string) ($payload['email'] ?? ''))),
            'role' => trim((string) ($payload['role'] ?? '')),
            'status' => trim((string) ($payload['status'] ?? 'active')),
            'contactNumber' => trim((string) ($payload['contactNumber'] ?? '')),
            'positionTitle' => trim((string) ($payload['positionTitle'] ?? '')),
            'password' => (string) ($payload['password'] ?? ''),
            'trainingGroupNumber' => (int) ($payload['trainingGroupNumber'] ?? 0),
        ];

        $errors = [];
        if (mb_strlen($data['name']) < 3) {
            $errors['name'] = 'Enter the full staff name.';
        }
        if (!filter_var($data['email'], FILTER_VALIDATE_EMAIL)) {
            $errors['email'] = 'Enter a valid email address.';
        }
        if (!isset(self::MANAGED_ROLE_MAP[$data['role']])) {
            $errors['role'] = 'Select a valid staff role.';
        }
        if (!isset(self::STATUS_MAP[$data['status']])) {
            $errors['status'] = 'Select a valid staff status.';
        }
        if ($isCreate && strlen($data['password']) < 8) {
            $errors['password'] = 'Password must be at least 8 characters.';
        }
        if (!$isCreate && $data['password'] !== '' && strlen($data['password']) < 8) {
            $errors['password'] = 'Password must be at least 8 characters.';
        }
        if ($data['role'] === 'pdo') {
            if ($data['trainingGroupNumber'] < 1 || $data['trainingGroupNumber'] > TRAINING_BATCH_GROUP_COUNT) {
                $errors['trainingGroupNumber'] = 'Assign this PDO to Group 1, Group 2, or Group 3.';
            }
        } else {
            $data['trainingGroupNumber'] = null;
        }

        return ['data' => $data, 'errors' => $errors];
    }

    private function roleNameToSlug(string $roleName): string
    {
        return array_search($roleName, self::ROLE_MAP, true) ?: 'admin';
    }

    private function isManagedRoleName(string $roleName): bool
    {
        return in_array($roleName, self::MANAGED_ROLE_MAP, true);
    }

    private function fetchAssignmentMap(array $staffProfileIds): array
    {
        $staffProfileIds = array_values(array_filter(array_unique($staffProfileIds)));
        if ($staffProfileIds === []) {
            return [];
        }
        $map = [];
        $assignmentService = new BarangayAssignmentService();
        foreach ($staffProfileIds as $staffProfileId) {
            $map[(int) $staffProfileId] = $assignmentService->activeAssignmentsForStaffProfileId((int) $staffProfileId);
        }

        return $map;
    }

    private function findRoleIdByName(string $roleName): ?int
    {
        $statement = db()->prepare('SELECT id FROM roles WHERE name = :name LIMIT 1');
        $statement->execute(['name' => $roleName]);
        $value = $statement->fetchColumn();
        return $value !== false ? (int) $value : null;
    }

    private function findUserByEmail(string $email): ?array
    {
        $statement = db()->prepare('SELECT id, email FROM users WHERE email = :email LIMIT 1');
        $statement->execute(['email' => $email]);
        $row = $statement->fetch(PDO::FETCH_ASSOC);
        return is_array($row) ? $row : null;
    }

    private function findStaffByUserId(int $userId): ?array
    {
        $this->ensureStaffProfileSignatureColumns();
        $statement = db()->prepare(
            'SELECT users.id, users.full_name, users.email, roles.name AS role_name, staff_profiles.id AS staff_profile_id, staff_profiles.position_title, staff_profiles.contact_number, staff_profiles.status AS staff_status, staff_profiles.training_group_number
             FROM users
             INNER JOIN roles ON roles.id = users.role_id
             INNER JOIN staff_profiles ON staff_profiles.user_id = users.id
             WHERE users.id = :user_id
             LIMIT 1'
        );
        $statement->execute(['user_id' => $userId]);
        $row = $statement->fetch(PDO::FETCH_ASSOC);
        return is_array($row) ? $row : null;
    }

    private function findStaffListRowByUserId(int $userId): ?array
    {
        $this->ensureStaffProfileSignatureColumns();
        $statement = db()->prepare(
            'SELECT
                users.id,
                users.full_name,
                users.first_name,
                users.middle_name,
                users.last_name,
                users.email,
                users.is_active,
                users.is_disabled,
                users.last_login_at,
                roles.name AS role_name,
                staff_profiles.id AS staff_profile_id,
                staff_profiles.contact_number,
                staff_profiles.position_title,
                staff_profiles.status AS staff_status,
                staff_profiles.training_group_number,
                staff_profiles.signature_file_path,
                staff_profiles.signature_original_name,
                staff_profiles.signature_mime_type,
                staff_profiles.signature_file_size,
                staff_profiles.signature_uploaded_at,
                user_profile_photos.image_data AS profile_photo
             FROM users
             INNER JOIN roles ON roles.id = users.role_id
             INNER JOIN staff_profiles ON staff_profiles.user_id = users.id
             LEFT JOIN user_profile_photos ON user_profile_photos.user_id = users.id
             WHERE users.id = :user_id
             LIMIT 1'
        );
        $statement->execute(['user_id' => $userId]);
        $row = $statement->fetch(PDO::FETCH_ASSOC);

        return is_array($row) ? $row : null;
    }

    private function mapStaffListRow(array $row, array $assignmentMap): array
    {
        $staffProfileId = (int) $row['staff_profile_id'];
        $roleSlug = $this->roleNameToSlug((string) $row['role_name']);
        $status = (string) $row['staff_status'];
        $identity = $this->normalizePlaceholderIdentity([
            'full_name' => (string) ($row['full_name'] ?? ''),
            'first_name' => (string) ($row['first_name'] ?? ''),
            'middle_name' => (string) ($row['middle_name'] ?? ''),
            'last_name' => (string) ($row['last_name'] ?? ''),
            'email' => (string) ($row['email'] ?? ''),
            'contact_number' => (string) ($row['contact_number'] ?? ''),
            'position_title' => (string) ($row['position_title'] ?? ''),
        ], $roleSlug);
        $nameParts = $this->splitNameParts((string) ($identity['full_name'] ?? ''));
        $assignedBarangays = $assignmentMap[$staffProfileId] ?? [];
        $assignedDistricts = [];
        foreach ($assignedBarangays as $barangay) {
            $districtName = trim((string) ($barangay['district'] ?? ''));
            if ($districtName === '') {
                continue;
            }
            $districtKey = strtolower($districtName);
            if (!isset($assignedDistricts[$districtKey])) {
                $assignedDistricts[$districtKey] = [
                    'code' => strtolower(str_replace([' ', '-'], '_', $districtName)),
                    'district' => $districtName,
                ];
            }
        }

        return [
            'id' => (int) $row['id'],
            'staffProfileId' => $staffProfileId,
            'name' => $identity['full_name'],
            'firstName' => (string) (($identity['first_name'] ?? '') ?: ($nameParts['first_name'] ?? '')),
            'middleName' => (string) (($identity['middle_name'] ?? '') ?: ($nameParts['middle_name'] ?? '')),
            'lastName' => (string) (($identity['last_name'] ?? '') ?: ($nameParts['last_name'] ?? '')),
            'email' => $identity['email'],
            'role' => $roleSlug,
            'roleLabel' => $row['role_name'],
            'status' => $status,
            'contactNumber' => $identity['contact_number'],
            'positionTitle' => $identity['position_title'],
            'trainingGroupNumber' => $row['training_group_number'] !== null ? (int) $row['training_group_number'] : null,
            'photo' => $row['profile_photo'] ?? null,
            'signatureUpload' => $this->signatureMetadataFromRow($row),
            'hasSavedSignature' => trim((string) ($row['signature_file_path'] ?? '')) !== '',
            'assignedBarangays' => $assignedBarangays,
            'assignedDistricts' => array_values($assignedDistricts),
            'lastLoginAt' => $row['last_login_at'],
        ];
    }

    private function ensureStaffProfileForUserId(int $userId): void
    {
        $this->ensureStaffProfileSignatureColumns();
        if ($userId <= 0) {
            return;
        }

        $statement = db()->prepare(
            'SELECT
                users.id,
                roles.name AS role_name,
                staff_profiles.id AS staff_profile_id
             FROM users
             INNER JOIN roles ON roles.id = users.role_id
             LEFT JOIN staff_profiles ON staff_profiles.user_id = users.id
             WHERE users.id = :user_id
             LIMIT 1'
        );
        $statement->execute(['user_id' => $userId]);
        $row = $statement->fetch(PDO::FETCH_ASSOC);
        if (!is_array($row)) {
            return;
        }

        if ((int) ($row['staff_profile_id'] ?? 0) > 0) {
            return;
        }

        $roleName = (string) ($row['role_name'] ?? '');
        if (!in_array($roleName, self::ROLE_MAP, true)) {
            return;
        }

        try {
            db()->prepare(
                'INSERT INTO staff_profiles (user_id, contact_number, position_title, status, training_group_number)
                 VALUES (:user_id, NULL, :position_title, :status, :training_group_number)'
            )->execute([
                'user_id' => $userId,
                'position_title' => $roleName,
                'status' => 'active',
                'training_group_number' => $roleName === ROLE_PROJECT_OFFICER ? 1 : null,
            ]);
        } catch (PDOException $exception) {
            log_database_query_failure('team.ensure_staff_profile', $exception, ['user_id' => $userId]);
        }
    }

    private function currentAssignmentBarangayIds(int $staffProfileId): array
    {
        $statement = db()->prepare(
            'SELECT barangay_id FROM staff_barangay_assignments WHERE staff_profile_id = :staff_profile_id AND ended_at IS NULL'
        );
        $statement->execute(['staff_profile_id' => $staffProfileId]);
        return array_map('intval', $statement->fetchAll(PDO::FETCH_COLUMN) ?: []);
    }

    private function ensureStaffProfileSignatureColumns(): void
    {
        static $ensured = false;
        if ($ensured) {
            return;
        }

        $columns = [
            'training_group_number' => 'ALTER TABLE staff_profiles ADD COLUMN training_group_number TINYINT UNSIGNED NULL AFTER status',
            'signature_file_path' => 'ALTER TABLE staff_profiles ADD COLUMN signature_file_path VARCHAR(255) NULL AFTER status',
            'signature_original_name' => 'ALTER TABLE staff_profiles ADD COLUMN signature_original_name VARCHAR(255) NULL AFTER signature_file_path',
            'signature_mime_type' => 'ALTER TABLE staff_profiles ADD COLUMN signature_mime_type VARCHAR(120) NULL AFTER signature_original_name',
            'signature_file_size' => 'ALTER TABLE staff_profiles ADD COLUMN signature_file_size INT UNSIGNED NULL AFTER signature_mime_type',
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

    private function signatureMetadataFromRow(array $row): ?array
    {
        $filePath = trim((string) ($row['signature_file_path'] ?? ''));
        if ($filePath === '') {
            return null;
        }

        return [
            'file_path' => $filePath,
            'original_name' => trim((string) ($row['signature_original_name'] ?? basename($filePath))),
            'mime_type' => trim((string) ($row['signature_mime_type'] ?? '')),
            'file_size' => (int) ($row['signature_file_size'] ?? 0),
            'uploaded_at' => trim((string) ($row['signature_uploaded_at'] ?? '')),
        ];
    }

    private function resolveSignatureTarget(array $actor, int $staffId = 0): ?array
    {
        $actorId = (int) ($actor['id'] ?? 0);
        if ($actorId <= 0) {
            return null;
        }

        $actorRole = strtolower(trim((string) ($actor['role'] ?? '')));
        $isAdmin = str_contains($actorRole, 'admin');
        $isProjectOfficer = str_contains($actorRole, 'project');
        if (!$isAdmin && !$isProjectOfficer) {
            return null;
        }

        $targetUserId = $isAdmin && $staffId > 0 ? $staffId : $actorId;
        if (!$isAdmin && $targetUserId !== $actorId) {
            return null;
        }

        return $this->findStaffSignatureTargetByUserId($targetUserId);
    }

    private function findStaffSignatureTargetByUserId(int $userId): ?array
    {
        $statement = db()->prepare(
            'SELECT
                users.id,
                users.full_name,
                users.email,
                roles.name AS role_name,
                staff_profiles.id AS staff_profile_id,
                staff_profiles.position_title,
                staff_profiles.signature_file_path,
                staff_profiles.signature_original_name,
                staff_profiles.signature_mime_type,
                staff_profiles.signature_file_size,
                staff_profiles.signature_uploaded_at
             FROM users
             INNER JOIN roles ON roles.id = users.role_id
             INNER JOIN staff_profiles ON staff_profiles.user_id = users.id
             WHERE users.id = :user_id
             LIMIT 1'
        );
        $statement->execute(['user_id' => $userId]);
        $row = $statement->fetch(PDO::FETCH_ASSOC);

        return is_array($row) ? $row : null;
    }

    private function findStaffSignatureTargetByProfileId(int $staffProfileId): ?array
    {
        $statement = db()->prepare(
            'SELECT
                users.id,
                users.full_name,
                users.email,
                roles.name AS role_name,
                staff_profiles.id AS staff_profile_id,
                staff_profiles.position_title,
                staff_profiles.signature_file_path,
                staff_profiles.signature_original_name,
                staff_profiles.signature_mime_type,
                staff_profiles.signature_file_size,
                staff_profiles.signature_uploaded_at
             FROM staff_profiles
             INNER JOIN users ON users.id = staff_profiles.user_id
             INNER JOIN roles ON roles.id = users.role_id
             WHERE staff_profiles.id = :staff_profile_id
             LIMIT 1'
        );
        $statement->execute(['staff_profile_id' => $staffProfileId]);
        $row = $statement->fetch(PDO::FETCH_ASSOC);

        return is_array($row) ? $row : null;
    }

    private function mapSignatureState(array $row): array
    {
        $signature = $this->signatureMetadataFromRow($row);
        $hasSavedSignature = $signature !== null;

        return [
            'id' => (int) $row['id'],
            'staffProfileId' => (int) $row['staff_profile_id'],
            'name' => $row['full_name'],
            'email' => $row['email'],
            'role' => $this->roleNameToSlug((string) $row['role_name']),
            'roleLabel' => (string) $row['role_name'],
            'positionTitle' => $row['position_title'],
            'signatureUpload' => $signature,
            'hasSavedSignature' => $hasSavedSignature,
            'warning' => $hasSavedSignature ? '' : 'No saved PDO signature yet. Upload one now so Direct Worker, Validator, Certifying Officer, and CSWDO signoff blocks can auto-populate across post-approval forms.',
        ];
    }

    private function splitNameParts(string $fullName): array
    {
        $normalized = preg_replace('/\s+/', ' ', trim($fullName)) ?? '';
        if ($normalized === '') {
            return ['first_name' => '', 'middle_name' => '', 'last_name' => ''];
        }

        $parts = preg_split('/\s+/', $normalized) ?: [];
        $first = (string) array_shift($parts);
        $last = $parts ? (string) array_pop($parts) : '';
        $middle = trim(implode(' ', $parts));

        return [
            'first_name' => $first,
            'middle_name' => $middle,
            'last_name' => $last,
        ];
    }

    private function normalizePlaceholderIdentity(array $row, string $roleSlug): array
    {
        $fullName = trim((string) ($row['full_name'] ?? ''));
        $email = trim((string) ($row['email'] ?? ''));
        $contactNumber = trim((string) ($row['contact_number'] ?? ''));
        $positionTitle = trim((string) ($row['position_title'] ?? ''));

        if ($roleSlug === 'social_worker' && preg_match('/^default\s+social\s+worker$/i', $fullName)) {
            return [
                'full_name' => 'Hannah Iris Reformado',
                'first_name' => 'Hannah',
                'middle_name' => 'Iris',
                'last_name' => 'Reformado',
                'email' => $email !== '' ? $email : 'sw@smartleap.local',
                'contact_number' => $contactNumber !== '' ? $contactNumber : '09170000002',
                'position_title' => 'Social Worker',
            ];
        }

        if ($roleSlug === 'pdo' && preg_match('/^default\s+(project\s+officer|pdo)$/i', $fullName)) {
            return [
                'full_name' => 'Simon Riley Amantillo',
                'first_name' => 'Simon',
                'middle_name' => 'Riley',
                'last_name' => 'Amantillo',
                'email' => $email !== '' ? $email : 'pdo@smartleap.local',
                'contact_number' => $contactNumber !== '' ? $contactNumber : '09170000003',
                'position_title' => 'Project Officer',
            ];
        }

        if ($roleSlug === 'social_worker') {
            $positionTitle = 'Social Worker';
        } elseif ($roleSlug === 'pdo') {
            $positionTitle = 'Project Officer';
        } elseif ($roleSlug === 'admin' || $roleSlug === 'administrator') {
            $positionTitle = 'Administrator';
        }

        return [
            'full_name' => $fullName,
            'first_name' => trim((string) ($row['first_name'] ?? '')),
            'middle_name' => trim((string) ($row['middle_name'] ?? '')),
            'last_name' => trim((string) ($row['last_name'] ?? '')),
            'email' => $email,
            'contact_number' => $contactNumber,
            'position_title' => $positionTitle,
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
