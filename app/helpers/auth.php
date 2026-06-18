<?php
declare(strict_types=1);

function auth_user(): ?array
{
    $sessionUser = session_get('auth.user');
    if (!is_array($sessionUser) || !isset($sessionUser['id'])) {
        return null;
    }

    if (auth_session_expired($sessionUser)) {
        session_put('auth.expired_redirect', auth_session_redirect_path($sessionUser));
        logout_user();
        return null;
    }

    try {
        $statement = db()->prepare(
            'SELECT users.id, users.full_name, users.email, users.verification_status, users.is_active, users.is_disabled, roles.name AS role
             FROM users
             INNER JOIN roles ON roles.id = users.role_id
             WHERE users.id = :id
             LIMIT 1'
        );
        $statement->execute(['id' => (int) $sessionUser['id']]);
        $user = $statement->fetch();
    } catch (\Throwable) {
        return $sessionUser;
    }

    if (!is_array($user) || !(bool) $user['is_active'] || (bool) $user['is_disabled']) {
        logout_user();
        return null;
    }

    $freshUser = [
        'id' => (int) $user['id'],
        'name' => $user['full_name'],
        'email' => $user['email'],
        'role' => $user['role'],
        'verification_status' => $user['verification_status'],
        'session_started_at' => $sessionUser['session_started_at'] ?? date('c'),
        'last_activity_at' => auth_session_last_activity_timestamp($sessionUser),
        'session_expires_at' => auth_session_expiry_for_role(
            (string) $user['role'],
            $sessionUser['session_started_at'] ?? null,
            auth_session_last_activity_timestamp($sessionUser)
        ),
    ];
    session_put('auth.user', $freshUser);

    return $freshUser;
}

function is_authenticated(): bool
{
    return auth_user() !== null;
}

function login_user(array $user): void
{
    $startedAt = date('c');
    $lastActivityAt = $startedAt;
    session_put('auth.user', array_merge($user, [
        'session_started_at' => $startedAt,
        'last_activity_at' => $lastActivityAt,
        'session_expires_at' => auth_session_expiry_for_role((string) ($user['role'] ?? ''), $startedAt, $lastActivityAt),
    ]));
}

function logout_user(): void
{
    session_forget('auth.user');
}

function auth_session_expired(array $user): bool
{
    $startedAtTimestamp = strtotime((string) ($user['session_started_at'] ?? ''));
    if ($startedAtTimestamp === false) {
        return false;
    }

    $role = strtolower((string) ($user['role'] ?? ''));
    $now = time();

    if (auth_session_role_uses_idle_timeout($role)) {
        $lastActivityTimestamp = auth_session_last_activity_unix($user, $startedAtTimestamp);
        if (($now - $lastActivityTimestamp) >= auth_session_idle_lifetime_for_role($role)) {
            return true;
        }
    }

    if (($now - $startedAtTimestamp) >= auth_session_absolute_lifetime_for_role($role)) {
        return true;
    }

    return false;
}

function auth_session_expiry_for_role(string $role, ?string $startedAt = null, ?string $lastActivityAt = null): ?string
{
    $baseTimestamp = strtotime((string) ($startedAt ?: date('c')));
    if ($baseTimestamp === false) {
        return null;
    }

    $normalizedRole = strtolower(trim($role));
    $absoluteExpiry = $baseTimestamp + auth_session_absolute_lifetime_for_role($normalizedRole);
    $effectiveExpiry = $absoluteExpiry;

    if (auth_session_role_uses_idle_timeout($normalizedRole)) {
        $lastActivityTimestamp = auth_session_last_activity_unix(
            ['last_activity_at' => $lastActivityAt],
            $baseTimestamp
        );
        $idleExpiry = $lastActivityTimestamp + auth_session_idle_lifetime_for_role($normalizedRole);
        $effectiveExpiry = min($absoluteExpiry, $idleExpiry);
    }

    return date('c', $effectiveExpiry);
}

function auth_session_absolute_lifetime_for_role(string $role): int
{
    if (str_contains($role, 'applicant') || str_contains($role, 'beneficiary')) {
        return (int) config('session.portal_absolute_lifetime', 28800);
    }

    if (str_contains($role, 'admin')) {
        return (int) config('session.admin_absolute_lifetime', 14400);
    }

    return (int) config('session.staff_absolute_lifetime', 28800);
}

function auth_session_idle_lifetime_for_role(string $role): int
{
    if (str_contains($role, 'applicant') || str_contains($role, 'beneficiary')) {
        return (int) config('session.portal_idle_lifetime', 900);
    }

    if (str_contains($role, 'admin')) {
        return (int) config('session.admin_idle_lifetime', 600);
    }

    return (int) config('session.staff_idle_lifetime', 900);
}

function auth_session_role_uses_idle_timeout(string $role): bool
{
    return str_contains($role, 'applicant')
        || str_contains($role, 'beneficiary')
        || str_contains($role, 'project')
        || str_contains($role, 'social')
        || str_contains($role, 'admin');
}

function auth_session_last_activity_unix(array $user, int $fallbackTimestamp): int
{
    $lastActivityTimestamp = strtotime((string) ($user['last_activity_at'] ?? ''));
    return $lastActivityTimestamp !== false ? $lastActivityTimestamp : $fallbackTimestamp;
}

function auth_session_last_activity_timestamp(array $user): string
{
    $role = strtolower((string) ($user['role'] ?? ''));
    $startedAt = (string) ($user['session_started_at'] ?? date('c'));
    $fallbackTimestamp = strtotime($startedAt) ?: time();
    if (!auth_session_role_uses_idle_timeout($role)) {
        return $user['last_activity_at'] ?? date('c', $fallbackTimestamp);
    }

    return date('c');
}

function auth_session_redirect_path(array $user): string
{
    $role = strtolower((string) ($user['role'] ?? ''));
    if (str_contains($role, 'applicant') || str_contains($role, 'beneficiary')) {
        return 'portal';
    }

    return 'login';
}

function has_role(string ...$roles): bool
{
    $user = auth_user();
    if (!$user) {
        return false;
    }

    $role = $user['role'] ?? null;
    return is_string($role) && in_array($role, $roles, true);
}
