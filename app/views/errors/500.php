<?php
declare(strict_types=1);
http_response_code(500);
$scriptName = str_replace('\\', '/', $_SERVER['SCRIPT_NAME'] ?? '');
$baseUrl = rtrim(dirname($scriptName), '/');
$baseUrl = $baseUrl === '/' ? '' : $baseUrl;
$faviconVersion = @filemtime(base_path('public/assets/img/logo-mark.png')) ?: time();
?><!DOCTYPE html>
<html lang='en'>
<head><meta charset='UTF-8'><title>Error 500</title><link rel='icon' type='image/png' href='<?= htmlspecialchars($baseUrl . '/assets/img/logo-mark.png?v=' . urlencode((string) $faviconVersion), ENT_QUOTES, 'UTF-8') ?>'><link rel='apple-touch-icon' href='<?= htmlspecialchars($baseUrl . '/assets/img/logo-mark.png?v=' . urlencode((string) $faviconVersion), ENT_QUOTES, 'UTF-8') ?>'></head>
<body><h1>Error 500</h1></body>
</html>
