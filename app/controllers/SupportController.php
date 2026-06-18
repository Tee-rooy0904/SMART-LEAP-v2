<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Services\SupportService;

class SupportController extends Controller
{
    public function index(): never
    {
        $user = $this->requester();
        $service = new SupportService();
        response_json(['ok' => true, 'success' => true, 'data' => $service->listRequesterTickets($user, $_GET)]);
    }

    public function create(): never
    {
        $user = $this->requester();
        $service = new SupportService();
        $result = $service->createTicket($user, $_POST, $_FILES['attachment'] ?? null);
        response_json($result, $result['ok'] ? 201 : 422);
    }

    public function show(): never
    {
        $user = $this->requester();
        $ticketId = (int) ($_GET['id'] ?? 0);
        $detail = (new SupportService())->getTicketDetailForRequester($user, $ticketId);
        if ($detail === null) {
            response_json(['ok' => false, 'success' => false, 'message' => 'Support ticket not found.'], 404);
        }
        response_json(['ok' => true, 'success' => true, 'data' => $detail]);
    }

    public function message(): never
    {
        $user = $this->requester();
        $ticketId = (int) ($_POST['ticket_id'] ?? $_GET['id'] ?? 0);
        $result = (new SupportService())->sendRequesterReply(
            $user,
            $ticketId,
            (string) ($_POST['message'] ?? ''),
            $_FILES['attachment'] ?? null
        );
        response_json($result, $result['ok'] ? 200 : 422);
    }

    public function reopen(): never
    {
        $user = $this->requester();
        $ticketId = (int) ($_POST['ticket_id'] ?? $_GET['id'] ?? 0);
        $result = (new SupportService())->reopenRequesterTicket($user, $ticketId);
        response_json($result, $result['ok'] ? 200 : 422);
    }

    public function downloadAttachment(): never
    {
        $user = auth_user();
        if (!$user) {
            response_json(['ok' => false, 'success' => false, 'message' => 'Unauthenticated.'], 401);
        }

        $attachment = (new SupportService())->downloadAttachment($user, (int) ($_GET['id'] ?? 0));
        if ($attachment === null) {
            abort(404);
        }

        $absolutePath = public_path((string) $attachment['file_path']);
        if (!is_file($absolutePath)) {
            abort(404);
        }

        header('Content-Type: ' . (string) $attachment['mime_type']);
        header('Content-Length: ' . (string) filesize($absolutePath));
        header('Content-Disposition: attachment; filename="' . basename((string) $attachment['original_name']) . '"');
        readfile($absolutePath);
        exit;
    }

    private function requester(): array
    {
        $user = auth_user();
        if (!$user) {
            response_json(['ok' => false, 'success' => false, 'message' => 'Unauthenticated.'], 401);
        }

        $role = strtolower((string) ($user['role'] ?? ''));
        if (!str_contains($role, 'applicant') && !str_contains($role, 'beneficiary')) {
            response_json(['ok' => false, 'success' => false, 'message' => 'Forbidden.'], 403);
        }

        return $user;
    }
}
