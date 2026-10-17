<?php
declare(strict_types=1);
http_response_code(419);
$scriptName = str_replace('\\', '/', $_SERVER['SCRIPT_NAME'] ?? '');
$baseUrl = rtrim(dirname($scriptName), '/');
$baseUrl = $baseUrl === '/' ? '' : $baseUrl;
$faviconVersion = @filemtime(base_path('public/assets/img/logo-mark.png')) ?: time();
?><!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Page Expired (419)</title>
    <link rel="icon" type="image/png" href="<?= htmlspecialchars($baseUrl . '/assets/img/logo-mark.png?v=' . urlencode((string) $faviconVersion), ENT_QUOTES, 'UTF-8') ?>">
    <link rel="stylesheet" href="<?= htmlspecialchars($baseUrl . '/assets/css/public/portal.css', ENT_QUOTES, 'UTF-8') ?>">
</head>
<body class="portal-page">
    <div style="min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; text-align: center; font-family: system-ui, sans-serif;">
        <div style="max-width: 480px; background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
            <h1 style="font-size: 28px; margin-bottom: 12px; color: #1e293b;">Page Expired</h1>
            <p style="color: #64748b; margin-bottom: 24px; line-height: 1.6;">Your session or security token has expired. Please refresh the page or sign in again.</p>
            <a href="<?= htmlspecialchars($baseUrl . '/portal', ENT_QUOTES, 'UTF-8') ?>" style="display: inline-block; background: #0f3f95; color: white; padding: 10px 24px; border-radius: 6px; text-decoration: none; font-weight: 500;">Return to Home</a>
        </div>
    </div>
</body>
</html>

