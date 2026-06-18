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
    return is_string($token) && is_string($stored) && hash_equals($stored, $token);
}