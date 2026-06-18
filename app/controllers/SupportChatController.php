<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Services\SupportChatService;

class SupportChatController extends Controller
{
    public function index(): never
    {
        $user = auth_user();
        if (!$user) {
            response_json(['ok' => false, 'message' => 'Unauthenticated.'], 401);
        }

        $recipient = (string) ($_GET['recipient'] ?? 'social_worker');
        $service = new SupportChatService();

        response_json([
            'ok' => true,
            'messages' => $service->listForParticipant($user, $recipient),
        ]);
    }

    public function send(): never
    {
        $user = auth_user();
        if (!$user) {
            response_json(['ok' => false, 'message' => 'Unauthenticated.'], 401);
        }

        $payload = json_decode(file_get_contents('php://input') ?: '[]', true);
        if (!is_array($payload)) {
            response_json(['ok' => false, 'message' => 'Invalid request payload.'], 422);
        }

        $recipient = (string) ($payload['recipient'] ?? 'social_worker');
        $body = (string) ($payload['message'] ?? '');
        $service = new SupportChatService();
        $result = $service->sendFromParticipant($user, $recipient, $body);

        response_json($result, $result['ok'] ? 200 : 422);
    }
}
