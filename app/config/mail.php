<?php
declare(strict_types=1);

return [
    'driver' => $_ENV['MAIL_DRIVER'] ?? 'log',
    'host' => $_ENV['MAIL_HOST'] ?? 'localhost',
    'port' => (int) ($_ENV['MAIL_PORT'] ?? 1025),
    'username' => $_ENV['MAIL_USERNAME'] ?? '',
    'password' => $_ENV['MAIL_PASSWORD'] ?? '',
    'encryption' => $_ENV['MAIL_ENCRYPTION'] ?? null,
    'from_address' => $_ENV['MAIL_FROM_ADDRESS'] ?? 'noreply@smartleap.local',
    'from_name' => $_ENV['MAIL_FROM_NAME'] ?? 'SMART LEAP',
];