<?php
/**
 * SMART LEAP FILE GUIDE
 * Reviewer controller for post-approval submissions.
 * Serves the staff review workspace, task detail lookups, review decisions, and supporting file uploads for post-approval requirements.
 */

declare(strict_types=1);

namespace App\Controllers;

use App\Services\PostApprovalReviewService;

class PostApprovalReviewController extends Controller
{
    public function show(): never
    {
        $user = $this->reviewerUser();
        if ($user === null) {
            abort(403);
        }

        $taskId = (int) ($_GET['task_id'] ?? 0);
        $embedded = ($_GET['embed'] ?? '') === '1';

        if (!$embedded && $taskId > 0) {
            $this->view('dashboards/post-approval-form', [
                'authUser' => $user,
                'taskCode' => '',
                'reviewerMode' => true,
                'taskId' => $taskId,
            ]);
        }

        $this->view('dashboards/post-approval-review', [
            'authUser' => $user,
            'taskId' => $taskId,
            'embedded' => $embedded,
        ]);
    }

    public function index(): never
    {
        $user = $this->reviewerUser();
        if ($user === null) {
            response_json(['ok' => false, 'message' => 'Forbidden.'], 403);
        }

        $service = new PostApprovalReviewService();
        $state = $service->stateForReviewer((int) $user['id']);
        if (!($state['ok'] ?? false)) {
            response_json(['ok' => false, 'message' => $state['message'] ?? 'Forbidden.'], 403);
        }

        response_json($state);
    }

    public function task(): never
    {
        $user = $this->reviewerUser();
        if ($user === null) {
            response_json(['ok' => false, 'message' => 'Forbidden.'], 403);
        }

        $taskId = (int) ($_GET['task_id'] ?? 0);
        if ($taskId <= 0) {
            response_json(['ok' => false, 'message' => 'Task ID is required.'], 422);
        }

        $service = new PostApprovalReviewService();
        $task = $service->taskForReviewer((int) $user['id'], $taskId);
        if ($task === null) {
            response_json(['ok' => false, 'message' => 'Review task not found.'], 404);
        }

        response_json(['ok' => true, 'task' => $task]);
    }

    public function review(): never
    {
        $user = $this->reviewerUser();
        if ($user === null) {
            response_json(['ok' => false, 'message' => 'Forbidden.'], 403);
        }

        $payload = json_decode(file_get_contents('php://input') ?: '[]', true);
        if (!is_array($payload)) {
            response_json(['ok' => false, 'message' => 'Invalid request payload.'], 422);
        }

        $taskId = (int) ($payload['taskId'] ?? 0);
        $status = trim((string) ($payload['status'] ?? ''));
        $remarks = trim((string) ($payload['remarks'] ?? ''));
        $applicantVisibleRemark = trim((string) ($payload['applicantVisibleRemark'] ?? ''));
        $staffForm = is_array($payload['staffForm'] ?? null) ? $payload['staffForm'] : [];
        $formPayload = is_array($payload['formPayload'] ?? null) ? $payload['formPayload'] : [];

        $service = new PostApprovalReviewService();
        $result = $service->reviewTask((int) $user['id'], $taskId, $status, $remarks, $applicantVisibleRemark, $staffForm, $formPayload);
        if (!($result['ok'] ?? false)) {
            response_json([
                'ok' => false,
                'message' => $result['errors']['general'] ?? 'Unable to save this review.',
                'errors' => $result['errors'] ?? [],
            ], 422);
        }

        response_json(['ok' => true]);
    }

    public function upload(): never
    {
        $user = $this->reviewerUser();
        if ($user === null) {
            response_json(['ok' => false, 'message' => 'Forbidden.'], 403);
        }

        $taskId = (int) ($_POST['taskId'] ?? 0);
        $fieldKey = trim((string) ($_POST['fieldKey'] ?? ''));
        $file = $_FILES['file'] ?? null;
        if ($taskId <= 0 || $fieldKey === '' || !is_array($file)) {
            response_json(['ok' => false, 'message' => 'Upload details are required.'], 422);
        }

        $service = new PostApprovalReviewService();
        $result = $service->uploadTaskAsset((int) $user['id'], $taskId, $fieldKey, $file);
        if (!($result['ok'] ?? false)) {
            response_json([
                'ok' => false,
                'message' => $result['errors']['general'] ?? 'Unable to upload this file right now.',
                'errors' => $result['errors'] ?? [],
            ], 422);
        }

        response_json(['ok' => true, 'upload' => $result['upload'] ?? null]);
    }

    private function reviewerUser(): ?array
    {
        $user = auth_user();
        if ($user === null) {
            return null;
        }

        return has_role(ROLE_ADMIN, ROLE_PROJECT_OFFICER) ? $user : null;
    }
}
