<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Services\SupportService;

class StaffSupportController extends Controller
{
    public function index(): never
    {
        $user = $this->staff();
        response_json(['ok' => true, 'success' => true, 'data' => (new SupportService())->listStaffTickets($user, $_GET)]);
    }

    public function show(): never
    {
        $user = $this->staff();
        $detail = (new SupportService())->getTicketDetailForStaff($user, (int) ($_GET['id'] ?? 0));
        if ($detail === null) {
            response_json(['ok' => false, 'success' => false, 'message' => 'Support ticket not found.'], 404);
        }
        response_json(['ok' => true, 'success' => true, 'data' => $detail]);
    }

    public function message(): never
    {
        $user = $this->staff();
        $result = (new SupportService())->sendStaffReply(
            $user,
            (int) ($_POST['ticket_id'] ?? $_GET['id'] ?? 0),
            (string) ($_POST['message'] ?? ''),
            $_FILES['attachment'] ?? null,
            false
        );
        response_json($result, $result['ok'] ? 200 : 422);
    }

    public function internalNote(): never
    {
        $user = $this->staff();
        $result = (new SupportService())->sendStaffReply(
            $user,
            (int) ($_POST['ticket_id'] ?? $_GET['id'] ?? 0),
            (string) ($_POST['message'] ?? $_POST['note'] ?? ''),
            $_FILES['attachment'] ?? null,
            true
        );
        response_json($result, $result['ok'] ? 200 : 422);
    }

    public function status(): never
    {
        $user = $this->staff();
        $result = (new SupportService())->updateStatus(
            $user,
            (int) ($_POST['ticket_id'] ?? $_GET['id'] ?? 0),
            (string) ($_POST['status'] ?? '')
        );
        response_json($result, $result['ok'] ? 200 : 422);
    }

    public function refer(): never
    {
        $user = $this->staff();
        $assignedUserId = isset($_POST['assigned_user_id']) && $_POST['assigned_user_id'] !== ''
            ? (int) $_POST['assigned_user_id']
            : null;
        $result = (new SupportService())->referTicket(
            $user,
            (int) ($_POST['ticket_id'] ?? $_GET['id'] ?? 0),
            (string) ($_POST['assigned_role'] ?? ''),
            $assignedUserId,
            isset($_POST['note']) ? (string) $_POST['note'] : null
        );
        response_json($result, $result['ok'] ? 200 : 422);
    }

    public function assign(): never
    {
        $user = $this->staff();
        $assignedUserId = isset($_POST['assigned_user_id']) && $_POST['assigned_user_id'] !== ''
            ? (int) $_POST['assigned_user_id']
            : null;
        $result = (new SupportService())->assignTicket(
            $user,
            (int) ($_POST['ticket_id'] ?? $_GET['id'] ?? 0),
            (string) ($_POST['assigned_role'] ?? ''),
            $assignedUserId
        );
        response_json($result, $result['ok'] ? 200 : 422);
    }

    private function staff(): array
    {
        $user = auth_user();
        if (!$user) {
            response_json(['ok' => false, 'success' => false, 'message' => 'Unauthenticated.'], 401);
        }

        $role = strtolower((string) ($user['role'] ?? ''));
        if (!str_contains($role, 'admin') && !str_contains($role, 'project') && !str_contains($role, 'social')) {
            response_json(['ok' => false, 'success' => false, 'message' => 'Forbidden.'], 403);
        }

        return $user;
    }
}
