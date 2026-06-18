<?php
/**
 * SMART LEAP FILE GUIDE
 * Controller for N ot if ic at io nC on tr ol le r routes.
 * Accepts HTTP requests for this feature area and delegates business logic to the appropriate service layer.
 */

declare(strict_types=1);

namespace App\Controllers;

use App\Services\NotificationService;

class NotificationController extends Controller
{
    public function index(): never
    {
        $user = auth_user();
        if (!$user) {
            response_json(['ok' => false, 'message' => 'Unauthenticated.', 'redirect' => 'login'], 401);
        }

        $service = new NotificationService();
        response_json([
            'ok' => true,
            'notifications' => $service->listForUser((int) $user['id']),
        ]);
    }

    public function markRead(): never
    {
        $user = auth_user();
        if (!$user) {
            response_json(['ok' => false, 'message' => 'Unauthenticated.', 'redirect' => 'login'], 401);
        }

        $payload = json_decode(file_get_contents('php://input') ?: '[]', true);
        if (!is_array($payload)) {
            response_json(['ok' => false, 'message' => 'Invalid request payload.'], 422);
        }

        $ids = is_array($payload['ids'] ?? null) ? $payload['ids'] : [];
        $service = new NotificationService();
        $service->markReadForUser((int) $user['id'], $ids);

        response_json([
            'ok' => true,
            'notifications' => $service->listForUser((int) $user['id']),
        ]);
    }
}
