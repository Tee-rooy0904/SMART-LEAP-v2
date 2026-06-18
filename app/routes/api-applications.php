<?php
declare(strict_types=1);

use App\Controllers\ApplicationController;

return [
    'GET /api/applications' => ['handler' => [ApplicationController::class, 'index'], 'middleware' => ['auth']],
    'GET /api/applications/dashboard' => ['handler' => [ApplicationController::class, 'dashboard'], 'middleware' => ['auth', 'project_officer']],
    'GET /api/applications/show' => ['handler' => [ApplicationController::class, 'show'], 'middleware' => ['auth']],
    'POST /api/applications/review' => ['handler' => [ApplicationController::class, 'review'], 'middleware' => ['auth']],
    'POST /api/applications/assistance-received' => ['handler' => [ApplicationController::class, 'recordAssistanceReceived'], 'middleware' => ['auth']],
    'POST /api/applications/review-requirement' => ['handler' => [ApplicationController::class, 'reviewRequirement'], 'middleware' => ['auth']],
    'POST /api/applications/upload-form-requirement' => ['handler' => [ApplicationController::class, 'uploadFormRequirement'], 'middleware' => ['auth']],
    'POST /api/applications/assessment' => ['handler' => [ApplicationController::class, 'saveAssessment'], 'middleware' => ['auth']],
    'POST /api/applications/update-applicant-data' => ['handler' => [ApplicationController::class, 'updateApplicantData'], 'middleware' => ['auth']],
    'POST /api/applications/update-livelihood-category' => ['handler' => [ApplicationController::class, 'updateLivelihoodCategory'], 'middleware' => ['auth']],
];
