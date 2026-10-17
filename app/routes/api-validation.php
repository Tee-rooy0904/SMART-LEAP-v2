<?php
declare(strict_types=1);

use App\Controllers\StageOneRegistrationController;

return [
    'GET /api/validation' => ['handler' => [StageOneRegistrationController::class, 'index'], 'middleware' => ['auth', 'admin']],
    'GET /api/validation/show' => ['handler' => [StageOneRegistrationController::class, 'showRecord'], 'middleware' => ['auth', 'admin']],
    'POST /api/validation/review' => ['handler' => [StageOneRegistrationController::class, 'review'], 'middleware' => ['auth', 'admin']],
    'POST /api/validation/review-duplicate' => ['handler' => [StageOneRegistrationController::class, 'reviewDuplicate'], 'middleware' => ['auth', 'admin']],
    'POST /api/validation/staff-entry' => ['handler' => [StageOneRegistrationController::class, 'submitStaffEntry'], 'middleware' => ['auth']],
    'GET /api/validation/batch-metrics' => ['handler' => [StageOneRegistrationController::class, 'batchMetrics'], 'middleware' => ['auth', 'admin']],
    'POST /api/validation/switch-batch' => ['handler' => [StageOneRegistrationController::class, 'switchBatch'], 'middleware' => ['auth', 'admin']],
];
