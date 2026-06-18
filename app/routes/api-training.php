<?php


declare(strict_types=1);

use App\Controllers\TrainingController;

return [
    'GET /api/training' => ['handler' => [TrainingController::class, 'index'], 'middleware' => ['auth']],
    'GET /api/training/show' => ['handler' => [TrainingController::class, 'show'], 'middleware' => ['auth']],
    'POST /api/training' => ['handler' => [TrainingController::class, 'store'], 'middleware' => ['auth']],
    'POST /api/training/update' => ['handler' => [TrainingController::class, 'update'], 'middleware' => ['auth']],
    'POST /api/training/delete' => ['handler' => [TrainingController::class, 'delete'], 'middleware' => ['auth']],
    'POST /api/training/invitees' => ['handler' => [TrainingController::class, 'syncInvitees'], 'middleware' => ['auth']],
    'POST /api/training/notices' => ['handler' => [TrainingController::class, 'sendNotices'], 'middleware' => ['auth']],
    'POST /api/training/attendance' => ['handler' => [TrainingController::class, 'updateAttendance'], 'middleware' => ['auth']],
];
