<?php
declare(strict_types=1);

if (!defined('BASE_PATH')) {
    define('BASE_PATH', dirname(__DIR__));
}

$composerAutoload = BASE_PATH . '/vendor/autoload.php';
if (is_file($composerAutoload)) {
    require_once $composerAutoload;
}

spl_autoload_register(static function (string $class): void {
    $prefix = 'App\\';
    if (!str_starts_with($class, $prefix)) {
        return;
    }

    $relative = substr($class, strlen($prefix));
    $path = BASE_PATH . '/app/' . str_replace('\\', '/', $relative) . '.php';
    if (is_file($path)) {
        require_once $path;
    }
});

$envPath = BASE_PATH . '/.env';
if (is_file($envPath)) {
    $lines = file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [];
    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) {
            continue;
        }

        [$key, $value] = explode('=', $line, 2);
        $key = trim($key);
        $value = trim($value);
        if ($key === '') {
            continue;
        }

        $_ENV[$key] = $value;
        $_SERVER[$key] = $value;
        putenv($key . '=' . $value);
    }
}

$GLOBALS['config'] = [
    'app' => require BASE_PATH . '/app/config/app.php',
    'database' => require BASE_PATH . '/app/config/database.php',
    'mail' => require BASE_PATH . '/app/config/mail.php',
    'session' => require BASE_PATH . '/app/config/session.php',
    'upload' => require BASE_PATH . '/app/config/upload.php',
];

require_once BASE_PATH . '/app/config/constants.php';
require_once BASE_PATH . '/app/helpers/session.php';
require_once BASE_PATH . '/app/helpers/csrf.php';
require_once BASE_PATH . '/app/helpers/redirect.php';
require_once BASE_PATH . '/app/helpers/response.php';
require_once BASE_PATH . '/app/helpers/auth.php';

date_default_timezone_set(config('app.timezone', 'Asia/Manila'));
ensure_session_started();

function config(?string $key = null, mixed $default = null): mixed
{
    $config = $GLOBALS['config'] ?? [];
    if ($key === null) {
        return $config;
    }

    $segments = explode('.', $key);
    $value = $config;
    foreach ($segments as $segment) {
        if (!is_array($value) || !array_key_exists($segment, $value)) {
            return $default;
        }
        $value = $value[$segment];
    }

    return $value;
}

function base_path(string $path = ''): string
{
    return BASE_PATH . ($path !== '' ? '/' . ltrim($path, '/') : '');
}

function storage_path(string $path = ''): string
{
    return base_path('storage' . ($path !== '' ? '/' . ltrim($path, '/') : ''));
}

function public_path(string $path = ''): string
{
    return base_path('public' . ($path !== '' ? '/' . ltrim($path, '/') : ''));
}

function write_app_log(string $channel, string $message, array $context = []): void
{
    $logPath = storage_path('logs/app.log');
    $timestamp = date('Y-m-d H:i:s');
    $payload = [
        'channel' => $channel,
        'message' => $message,
        'context' => $context,
    ];

    $line = '[' . $timestamp . '] ' . json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . PHP_EOL;
    $directory = dirname($logPath);
    if (!is_dir($directory)) {
        mkdir($directory, 0775, true);
    }

    file_put_contents($logPath, $line, FILE_APPEND);
}

function classify_pdo_exception(\PDOException $exception): array
{
    $message = strtolower($exception->getMessage());
    $sqlState = $exception->getCode();

    if (str_contains($message, 'could not find driver')) {
        return [
            'type' => 'missing_pdo_mysql_driver',
            'safe_message' => 'Database driver is not available in this PHP runtime.',
        ];
    }

    if (str_contains($message, 'access denied')) {
        return [
            'type' => 'invalid_db_credentials',
            'safe_message' => 'Database authentication failed.',
        ];
    }

    if (str_contains($message, 'unknown database')) {
        return [
            'type' => 'database_not_found',
            'safe_message' => 'Configured database was not found.',
        ];
    }

    if (str_contains($message, 'connection refused') || str_contains($message, 'can\'t connect') || str_contains($message, 'server has gone away')) {
        return [
            'type' => 'database_connection_unavailable',
            'safe_message' => 'Database server is unavailable.',
        ];
    }

    return [
        'type' => str_starts_with((string) $sqlState, '42') ? 'database_query_failure' : 'database_connection_failure',
        'safe_message' => 'Database operation failed.',
    ];
}

function log_database_connection_failure(array $config, \PDOException $exception): void
{
    $classification = classify_pdo_exception($exception);
    write_app_log('database.connection', 'Database connection failed.', [
        'type' => $classification['type'],
        'host' => $config['host'] ?? null,
        'port' => $config['port'] ?? null,
        'database' => $config['database'] ?? null,
        'sqlstate' => $exception->getCode(),
        'error' => $exception->getMessage(),
    ]);
}

function log_database_query_failure(string $operation, \Throwable $exception, array $context = []): void
{
    $classification = $exception instanceof \PDOException
        ? classify_pdo_exception($exception)
        : ['type' => 'database_query_failure', 'safe_message' => 'Database query failed.'];

    write_app_log('database.query', 'Database query failed.', [
        'type' => $classification['type'],
        'operation' => $operation,
        'context' => $context,
        'error' => $exception->getMessage(),
    ]);
}

function db(): PDO
{
    $cached = $GLOBALS['smartleap_pdo'] ?? null;
    if ($cached instanceof PDO) {
        try {
            $cached->query('SELECT 1');
            return $cached;
        } catch (\PDOException $exception) {
            $GLOBALS['smartleap_pdo'] = null;
        }
    }

    $config = config('database');
    $dsn = sprintf('mysql:host=%s;port=%s;dbname=%s;charset=%s', $config['host'], $config['port'], $config['database'], $config['charset']);
    try {
        $pdo = new PDO($dsn, $config['username'], $config['password'], $config['options']);
        $GLOBALS['smartleap_pdo'] = $pdo;
        return $pdo;
    } catch (\PDOException $exception) {
        $classification = classify_pdo_exception($exception);
        log_database_connection_failure($config, $exception);
        throw new \RuntimeException($classification['safe_message']);
    }
}
