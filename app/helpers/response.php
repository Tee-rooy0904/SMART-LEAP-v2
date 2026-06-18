<?php
declare(strict_types=1);

function response_view(string $view, array $data = [], int $status = 200): never
{
    http_response_code($status);
    extract($data, EXTR_SKIP);
    $scriptName = str_replace('\\', '/', $_SERVER['SCRIPT_NAME'] ?? '/public/index.php');
    $baseUrl = rtrim(str_replace('\\', '/', dirname($scriptName)), '/');
    $baseUrl = $baseUrl === '/' ? '' : $baseUrl;
    require base_path('app/views/' . $view . '.php');
    exit;
}

function response_json(array $payload, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function abort(int $status = 404): never
{
    response_view('errors/' . $status, [], $status);
}
