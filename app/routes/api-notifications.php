<?php
/**
 * SMART LEAP FILE GUIDE
 * Route definitions for a pi n ot if ic at io ns.
 * Maps HTTP endpoints to controllers and middleware for this area of the SMART LEAP system.
 */

declare(strict_types=1);

use App\Controllers\NotificationController;

return [
    'GET /api/notifications' => ['handler' => [NotificationController::class, 'index'], 'middleware' => ['auth']],
    'POST /api/notifications/read' => ['handler' => [NotificationController::class, 'markRead'], 'middleware' => ['auth']],
];
