<?php
declare(strict_types=1);

use App\Controllers\ReportController;

return [
    'GET /api/reports' => ['handler' => [ReportController::class, 'data'], 'middleware' => ['auth', 'admin_or_social_worker']],
];
