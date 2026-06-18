<?php
/**
 * SMART LEAP FILE GUIDE
 * Training operations controller for admin and PDO staff.
 * Handles training session CRUD, invitee syncing, notice sending, attendance updates, and training session deletion.
 */

declare(strict_types=1);

namespace App\Controllers;

use App\Services\TrainingService;

class TrainingController extends Controller
{
    private function authorizeTrainingActor(): array
    {
        $user = auth_user() ?? [];
        $role = strtolower((string) ($user['role'] ?? ''));
        if (!str_contains($role, 'admin') && !str_contains($role, 'project')) {
            response_json(['ok' => false, 'message' => 'Forbidden.'], 403);
        }

        return $user;
    }

    public function index(): never
    {
        $service = new TrainingService();
        $schemaError = $service->schemaError();
        if ($schemaError !== null) {
            response_json(['ok' => false, 'message' => $schemaError], 500);
        }
        response_json([
            'ok' => true,
            'data' => $service->listPrograms($_GET, $this->authorizeTrainingActor()),
        ]);
    }

    public function show(): never
    {
        $programId = (int) ($_GET['id'] ?? 0);
        $service = new TrainingService();
        $schemaError = $service->schemaError();
        if ($schemaError !== null) {
            response_json(['ok' => false, 'message' => $schemaError], 500);
        }
        $program = $service->getProgramDetail($programId, $this->authorizeTrainingActor());
        if ($program === null) {
            response_json(['ok' => false, 'message' => 'Training program not found.'], 404);
        }

        response_json([
            'ok' => true,
            'program' => $program,
        ]);
    }

    public function store(): never
    {
        $service = new TrainingService();
        $schemaError = $service->schemaError();
        if ($schemaError !== null) {
            response_json(['ok' => false, 'message' => $schemaError], 500);
        }
        $result = $service->saveProgram($_POST, $this->authorizeTrainingActor());
        if (!$result['ok']) {
            response_json($result, 422);
        }

        response_json($result);
    }

    public function update(): never
    {
        $programId = (int) ($_POST['programId'] ?? 0);
        $service = new TrainingService();
        $schemaError = $service->schemaError();
        if ($schemaError !== null) {
            response_json(['ok' => false, 'message' => $schemaError], 500);
        }
        $result = $service->saveProgram($_POST, $this->authorizeTrainingActor(), $programId);
        if (!$result['ok']) {
            response_json($result, 422);
        }

        response_json($result);
    }

    public function syncInvitees(): never
    {
        $programId = (int) ($_POST['programId'] ?? 0);
        $applicantIds = $_POST['applicantProfileIds'] ?? [];
        $pdoGroupAssignmentsJson = trim((string) ($_POST['pdoGroupAssignmentsJson'] ?? ''));
        if (!is_array($applicantIds)) {
            $applicantIds = [];
        }
        $pdoGroupAssignments = [];
        if ($pdoGroupAssignmentsJson !== '') {
            $decoded = json_decode($pdoGroupAssignmentsJson, true);
            if (is_array($decoded)) {
                $pdoGroupAssignments = $decoded;
            }
        }

        $service = new TrainingService();
        $schemaError = $service->schemaError();
        if ($schemaError !== null) {
            response_json(['ok' => false, 'message' => $schemaError], 500);
        }
        $result = $service->syncInvitees($programId, $applicantIds, $this->authorizeTrainingActor(), $pdoGroupAssignments);
        if (!$result['ok']) {
            response_json($result, 422);
        }

        response_json($result);
    }

    public function sendNotices(): never
    {
        $programId = (int) ($_POST['programId'] ?? 0);
        $inviteeIds = $_POST['inviteeIds'] ?? [];
        if (!is_array($inviteeIds)) {
            $inviteeIds = [];
        }
        $options = [
            'groupNumber' => (int) ($_POST['groupNumber'] ?? 0),
            'batchYear' => (int) ($_POST['batchYear'] ?? 0),
        ];

        $service = new TrainingService();
        $schemaError = $service->schemaError();
        if ($schemaError !== null) {
            response_json(['ok' => false, 'message' => $schemaError], 500);
        }
        $result = $service->sendNotices($programId, $inviteeIds, $this->authorizeTrainingActor(), $options);
        if (!$result['ok']) {
            response_json($result, 422);
        }

        response_json($result);
    }

    public function updateAttendance(): never
    {
        $trainingInviteeId = (int) ($_POST['trainingInviteeId'] ?? 0);
        $status = trim((string) ($_POST['status'] ?? ''));
        $remarks = trim((string) ($_POST['remarks'] ?? ''));
        $proofAttachment = isset($_FILES['proofAttachment']) && is_array($_FILES['proofAttachment'])
            ? $_FILES['proofAttachment']
            : null;

        $service = new TrainingService();
        $schemaError = $service->schemaError();
        if ($schemaError !== null) {
            response_json(['ok' => false, 'message' => $schemaError], 500);
        }
        $result = $service->updateAttendance(
            $trainingInviteeId,
            $status,
            $remarks !== '' ? $remarks : null,
            $this->authorizeTrainingActor(),
            $proofAttachment
        );
        if (!$result['ok']) {
            response_json($result, 422);
        }

        response_json($result);
    }

    public function delete(): never
    {
        $programId = (int) ($_POST['programId'] ?? 0);

        $service = new TrainingService();
        $schemaError = $service->schemaError();
        if ($schemaError !== null) {
            response_json(['ok' => false, 'message' => $schemaError], 500);
        }
        $result = $service->removeProgram($programId, $this->authorizeTrainingActor());
        if (!$result['ok']) {
            response_json($result, 422);
        }

        response_json($result);
    }
}
