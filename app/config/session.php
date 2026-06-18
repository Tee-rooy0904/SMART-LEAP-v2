<?php
declare(strict_types=1);

return [
    'name' => $_ENV['SESSION_NAME'] ?? 'smartleap_session',
    'lifetime' => (int) ($_ENV['SESSION_LIFETIME'] ?? 86400),
    'portal_idle_lifetime' => (int) ($_ENV['SESSION_PORTAL_IDLE_LIFETIME'] ?? 900),
    'portal_absolute_lifetime' => (int) ($_ENV['SESSION_PORTAL_ABSOLUTE_LIFETIME'] ?? 28800),
    'staff_idle_lifetime' => (int) ($_ENV['SESSION_STAFF_IDLE_LIFETIME'] ?? 900),
    'staff_absolute_lifetime' => (int) ($_ENV['SESSION_STAFF_ABSOLUTE_LIFETIME'] ?? 28800),
    'admin_idle_lifetime' => (int) ($_ENV['SESSION_ADMIN_IDLE_LIFETIME'] ?? 600),
    'admin_absolute_lifetime' => (int) ($_ENV['SESSION_ADMIN_ABSOLUTE_LIFETIME'] ?? 14400),
    'path' => '/',
    'domain' => $_ENV['SESSION_DOMAIN'] ?? '',
    'secure' => filter_var($_ENV['SESSION_SECURE'] ?? false, FILTER_VALIDATE_BOOL),
    'httponly' => true,
    'samesite' => $_ENV['SESSION_SAMESITE'] ?? 'Lax',
];
