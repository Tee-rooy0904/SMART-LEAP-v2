<?php
declare(strict_types=1);

function app_url(string $path = ''): string
{
    $configured = rtrim((string) config('app.url'), '/');
    if ($configured !== '') {
        $base = $configured;
    } else {
        $scriptName = str_replace('\\', '/', $_SERVER['SCRIPT_NAME'] ?? '/public/index.php');
        $basePath = rtrim(str_replace('\\', '/', dirname($scriptName)), '/');
        $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
        $base = $scheme . '://' . $host . ($basePath === '/' ? '' : $basePath);
    }

    return $base . ($path !== '' ? '/' . ltrim($path, '/') : '');
}

function redirect(string $path, int $status = 302): never
{
    header('Location: ' . app_url($path), true, $status);
    exit;
}
