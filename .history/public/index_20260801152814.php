<?php

declare(strict_types=1);

require dirname(__DIR__) . '/app/bootstrap.php';

$scriptName = str_replace('\\', '/', $_SERVER['SCRIPT_NAME'] ?? '/public/index.php');
$baseUrl = rtrim(str_replace('\\', '/', dirname($scriptName)), '/');
$baseUrl = $baseUrl === '/' ? '' : $baseUrl;

$requestPath = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?? '/';
$requestPath = str_replace('\\', '/', $requestPath);
$basePrefix = $baseUrl === '' ? '' : preg_quote($baseUrl, '#');
$routePath = preg_replace('#^' . $basePrefix . '/?#', '', $requestPath);
$routePath = '/' . trim((string) $routePath, '/');
$routePath = $routePath === '/index.php' ? '/' : $routePath;

if (isset($_GET['route']) && is_string($_GET['route']) && $_GET['route'] !== '') {
    $routePath = '/' . trim($_GET['route'], '/');
}

$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
$routes = array_merge(
    require base_path('app/routes/web.php'),
    require base_path('app/routes/auth.php'),
    require base_path('app/routes/api-team.php'),
    require base_path('app/routes/api-applications.php'),
    require base_path('app/routes/api-validation.php'),
    require base_path('app/routes/api-training.php'),
    require base_path('app/routes/api-repayments.php'),
    require base_path('app/routes/api-reports.php'),
    require base_path('app/routes/api-notifications.php'),
    require base_path('app/routes/api-post-approval.php'),
    require base_path('app/routes/api-support-chat.php')
);
$routeKey = $method . ' ' . $routePath;
$route = $routes[$routeKey] ?? null;

if (!is_array($route) || !isset($route['handler']) || !is_array($route['handler'])) {
    abort(404);
}

$expectsJson = str_contains(strtolower((string) ($_SERVER['HTTP_ACCEPT'] ?? '')), 'application/json');

$middlewareAliases = [
    'auth' => require base_path('app/middleware/auth.php'),
    'guest' => require base_path('app/middleware/guest.php'),
    'admin' => require base_path('app/middleware/admin_only.php'),
    'admin_or_social_worker' => require base_path('app/middleware/admin_or_social_worker.php'),
    'applicant' => require base_path('app/middleware/applicant_only.php'),
    'beneficiary' => require base_path('app/middleware/beneficiary_only.php'),
    'project_officer' => require base_path('app/middleware/pdo_only.php'),
    'social_worker' => require base_path('app/middleware/social_worker_only.php'),
];

foreach (($route['middleware'] ?? []) as $middlewareName) {
    $middleware = $middlewareAliases[$middlewareName] ?? null;
    if (!is_callable($middleware)) {
        abort(500);
    }

    if ($middleware()) {
        continue;
    }

    if ($middlewareName === 'guest') {
        $user = auth_user();
        $redirect = $user ? (new \App\Services\AuthService())->redirectPathFor($user) : 'login';
        if ($expectsJson) {
            response_json(['ok' => false, 'message' => 'Already authenticated.', 'redirect' => $redirect], 409);
        }
        redirect($redirect);
    }

    if ($middlewareName === 'auth') {
        $redirect = session_pull('auth.expired_redirect', 'login');
        if ($expectsJson) {
            response_json(['ok' => false, 'message' => 'Session expired.', 'redirect' => $redirect], 401);
        }
        redirect($redirect);
    }

    if ($expectsJson) {
        response_json(['ok' => false, 'message' => 'Forbidden.'], 403);
    }
    abort(403);
}

[$controllerClass, $action] = $route['handler'];
$controller = new $controllerClass();
$controller->{$action}();
