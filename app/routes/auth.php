<?php
declare(strict_types=1);

use App\Controllers\AuthController;

return [
    'POST /auth/login' => ['handler' => [AuthController::class, 'login']],
    'GET /verify-account' => ['handler' => [AuthController::class, 'showVerification'], 'middleware' => ['guest']],
    'POST /auth/verify-account' => ['handler' => [AuthController::class, 'verifyAccount'], 'middleware' => ['guest']],
    'POST /auth/resend-verification' => ['handler' => [AuthController::class, 'resendVerification'], 'middleware' => ['guest']],
    'POST /auth/forgot-password' => ['handler' => [AuthController::class, 'forgotPassword'], 'middleware' => ['guest']],
    'POST /auth/reset-password' => ['handler' => [AuthController::class, 'resetPassword'], 'middleware' => ['guest']],
    'POST /auth/logout' => ['handler' => [AuthController::class, 'logout'], 'middleware' => ['auth']],
];
