<?php
declare(strict_types=1);

function csrf_token(): string
{
    $token = session_get('_csrf_token');
    if (is_string($token) && $token !== '') {
        return $token;
    }

    $token = bin2hex(random_bytes(32));
    session_put('_csrf_token', $token);
    return $token;
}

function csrf_field(): string
{
    return '<input type="hidden" name="_token" value="' . htmlspecialchars(csrf_token(), ENT_QUOTES, 'UTF-8') . '">';
}

function verify_csrf_token(?string $token): bool
{
    $stored = session_get('_csrf_token');
    return is_string($token) && is_string($stored) && $token !== '' && hash_equals($stored, $token);
}

function verify_request_origin(): bool
{
    $fetchSite = strtolower(trim((string) ($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '')));
    if ($fetchSite === 'cross-site') {
        return false;
    }

    $currentHost = parse_url('//' . ($_SERVER['HTTP_HOST'] ?? ''), PHP_URL_HOST);
    if (!is_string($currentHost) || $currentHost === '') {
        return true;
    }

    $origin = (string) ($_SERVER['HTTP_ORIGIN'] ?? '');
    if ($origin !== '') {
        $originHost = parse_url($origin, PHP_URL_HOST);
        return is_string($originHost) && strcasecmp($originHost, $currentHost) === 0;
    }

    $referer = (string) ($_SERVER['HTTP_REFERER'] ?? '');
    if ($referer !== '') {
        $refererHost = parse_url($referer, PHP_URL_HOST);
        return is_string($refererHost) && strcasecmp($refererHost, $currentHost) === 0;
    }

    return true;
}

function verify_csrf_request(): bool
{
    if (!verify_request_origin()) {
        return false;
    }

    $submitted = $_POST['_token']
        ?? $_SERVER['HTTP_X_CSRF_TOKEN']
        ?? $_SERVER['HTTP_X_XSRF_TOKEN']
        ?? null;

    if (is_string($submitted) && $submitted !== '') {
        return verify_csrf_token($submitted);
    }

    if (array_key_exists('_token', $_POST)) {
        return verify_csrf_token((string) $_POST['_token']);
    }

    return true;
}

function ensure_csrf_cookie(): void
{
    $token = csrf_token();
    if (!headers_sent() && empty($_COOKIE['XSRF-TOKEN'])) {
        $secure = (bool) config('session.secure', false);
        setcookie('XSRF-TOKEN', $token, [
            'expires' => 0,
            'path' => '/',
            'domain' => (string) config('session.domain', ''),
            'secure' => $secure,
            'httponly' => false,
            'samesite' => (string) config('session.samesite', 'Lax'),
        ]);
    }
}