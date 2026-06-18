<?php
declare(strict_types=1);

use App\Controllers\SupportChatController;
use App\Controllers\SupportController;
use App\Controllers\StaffSupportController;

return [
    'GET /api/support-chat/messages' => ['handler' => [SupportChatController::class, 'index'], 'middleware' => ['auth']],
    'POST /api/support-chat/messages' => ['handler' => [SupportChatController::class, 'send'], 'middleware' => ['auth']],
    'GET /api/support/tickets' => ['handler' => [SupportController::class, 'index'], 'middleware' => ['auth']],
    'POST /api/support/tickets' => ['handler' => [SupportController::class, 'create'], 'middleware' => ['auth']],
    'GET /api/support/ticket' => ['handler' => [SupportController::class, 'show'], 'middleware' => ['auth']],
    'POST /api/support/ticket/messages' => ['handler' => [SupportController::class, 'message'], 'middleware' => ['auth']],
    'POST /api/support/ticket/reopen' => ['handler' => [SupportController::class, 'reopen'], 'middleware' => ['auth']],
    'GET /support/attachments/download' => ['handler' => [SupportController::class, 'downloadAttachment'], 'middleware' => ['auth']],
    'GET /support/tickets' => ['handler' => [SupportController::class, 'index'], 'middleware' => ['auth']],
    'POST /support/tickets' => ['handler' => [SupportController::class, 'create'], 'middleware' => ['auth']],
    'GET /support/ticket' => ['handler' => [SupportController::class, 'show'], 'middleware' => ['auth']],
    'POST /support/ticket/messages' => ['handler' => [SupportController::class, 'message'], 'middleware' => ['auth']],
    'POST /support/ticket/reopen' => ['handler' => [SupportController::class, 'reopen'], 'middleware' => ['auth']],
    'GET /staff/support/tickets' => ['handler' => [StaffSupportController::class, 'index'], 'middleware' => ['auth']],
    'GET /staff/support/ticket' => ['handler' => [StaffSupportController::class, 'show'], 'middleware' => ['auth']],
    'POST /staff/support/ticket/messages' => ['handler' => [StaffSupportController::class, 'message'], 'middleware' => ['auth']],
    'POST /staff/support/ticket/internal-notes' => ['handler' => [StaffSupportController::class, 'internalNote'], 'middleware' => ['auth']],
    'POST /staff/support/ticket/status' => ['handler' => [StaffSupportController::class, 'status'], 'middleware' => ['auth']],
    'POST /staff/support/ticket/refer' => ['handler' => [StaffSupportController::class, 'refer'], 'middleware' => ['auth']],
    'POST /staff/support/ticket/assign' => ['handler' => [StaffSupportController::class, 'assign'], 'middleware' => ['auth']],
];
