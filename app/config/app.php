<?php
declare(strict_types=1);

return [
    'name' => $_ENV['APP_NAME'] ?? 'SMART LEAP',
    'env' => $_ENV['APP_ENV'] ?? 'local',
    'url' => rtrim($_ENV['APP_URL'] ?? 'http://localhost/SMART-LEAP/public', '/'),
    'timezone' => $_ENV['APP_TIMEZONE'] ?? 'Asia/Manila',
    'debug' => filter_var($_ENV['APP_DEBUG'] ?? true, FILTER_VALIDATE_BOOL),
];