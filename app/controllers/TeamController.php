<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Services\TeamService;

class TeamController extends Controller
{
    public function index(): never
    {
        $service = new TeamService();
        response_json([
            'ok' => true,
            'staff' => $service->listStaff($_GET),
            'meta' => $service->teamMetadata(),
        ]);
    }

    public function store(): never
    {
        $service = new TeamService();
        $result = $service->createStaff($_POST, (int) (auth_user()['id'] ?? 0));
        if (!$result['ok']) {
            response_json($result, 422);
        }

        response_json([
            'ok' => true,
            'staff' => $service->listStaff(),
        ], 201);
    }

    public function update(): never
    {
        $service = new TeamService();
        $result = $service->updateStaff($_POST, (int) (auth_user()['id'] ?? 0));
        if (!$result['ok']) {
            response_json($result, 422);
        }

        response_json([
            'ok' => true,
            'staff' => $service->listStaff(),
        ]);
    }

    public function updateStatus(): never
    {
        $service = new TeamService();
        $result = $service->updateStaffStatus(
            (int) ($_POST['staffId'] ?? 0),
            trim((string) ($_POST['status'] ?? '')),
            (int) (auth_user()['id'] ?? 0)
        );
        if (!$result['ok']) {
            response_json($result, 422);
        }

        response_json([
            'ok' => true,
            'staff' => $service->listStaff(),
        ]);
    }

    public function selfProfile(): never
    {
        $user = auth_user();
        if ($user === null) {
            response_json(['ok' => false, 'message' => 'Unauthenticated.'], 401);
        }

        $service = new TeamService();
        $staff = $service->getStaffProfileByUserId((int) ($user['id'] ?? 0));
        if ($staff === null) {
            response_json(['ok' => false, 'message' => 'Staff profile not found.'], 404);
        }

        response_json([
            'ok' => true,
            'staff' => $staff,
        ]);
    }

    public function updateSelf(): never
    {
        $user = auth_user();
        if ($user === null) {
            response_json(['ok' => false, 'message' => 'Unauthenticated.'], 401);
        }

        $service = new TeamService();
        $result = $service->updateOwnProfile((int) ($user['id'] ?? 0), $_POST);
        if (!$result['ok']) {
            response_json($result, 422);
        }

        response_json($result);
    }

    public function signature(): never
    {
        $service = new TeamService();
        $result = $service->signatureStateForActor(auth_user() ?? [], (int) ($_GET['staffId'] ?? 0));
        if (!($result['ok'] ?? false)) {
            response_json($result, 403);
        }

        response_json($result);
    }

    public function uploadSignature(): never
    {
        $service = new TeamService();
        $result = $service->uploadSignatureForActor(
            auth_user() ?? [],
            (int) ($_POST['staffId'] ?? 0),
            $_FILES['signature'] ?? null
        );
        if (!($result['ok'] ?? false)) {
            response_json($result, 422);
        }

        response_json($result);
    }
}
