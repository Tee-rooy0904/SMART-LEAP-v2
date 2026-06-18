<?php
/**
 * SMART LEAP FILE GUIDE
 * Applicant and beneficiary post-approval form controller.
 * Handles save, submit, show, and upload actions for availment and related compliance form payloads inside the post-approval workspace.
 */

declare(strict_types=1);

namespace App\Controllers;

use App\Services\PostApprovalComplianceService;

class PostApprovalComplianceController extends Controller
{
    public function index(): never
    {
        $user = auth_user();
        if ($user === null) {
            response_json(['ok' => false, 'message' => 'Unauthenticated.', 'redirect' => 'portal'], 401);
        }

        $service = new PostApprovalComplianceService();
        $state = $service->stateForApplicant((int) $user['id']);
        response_json([
            'ok' => true,
            'state' => $state,
            'postApproval' => $state,
        ]);
    }

    public function show(): never
    {
        $user = auth_user();
        if ($user === null) {
            response_json(['ok' => false, 'message' => 'Unauthenticated.', 'redirect' => 'portal'], 401);
        }

        $code = trim((string) ($_GET['code'] ?? ''));
        if ($code === '') {
            response_json(['ok' => false, 'message' => 'Task code is required.'], 422);
        }

        $service = new PostApprovalComplianceService();
        $task = $service->taskForApplicant((int) $user['id'], $code);
        if ($task === null) {
            response_json(['ok' => false, 'message' => 'Post-approval task not found.'], 404);
        }

        response_json(['ok' => true, 'task' => $task]);
    }

    public function save(): never
    {
        $user = auth_user();
        if ($user === null) {
            response_json(['ok' => false, 'message' => 'Unauthenticated.', 'redirect' => 'portal'], 401);
        }

        $payload = json_decode(file_get_contents('php://input') ?: '[]', true);
        if (!is_array($payload)) {
            response_json(['ok' => false, 'message' => 'Invalid request payload.'], 422);
        }

        $code = trim((string) ($payload['code'] ?? ''));
        $form = is_array($payload['form'] ?? null) ? $payload['form'] : [];

        $service = new PostApprovalComplianceService();
        $result = $service->saveApplicantTask((int) $user['id'], $code, $form);
        if (!($result['ok'] ?? false)) {
            response_json([
                'ok' => false,
                'message' => $result['errors']['general'] ?? 'Unable to save this post-approval form.',
                'errors' => $result['errors'] ?? [],
            ], 422);
        }

        response_json(['ok' => true]);
    }

    public function submit(): never
    {
        $user = auth_user();
        if ($user === null) {
            response_json(['ok' => false, 'message' => 'Unauthenticated.', 'redirect' => 'portal'], 401);
        }

        $payload = json_decode(file_get_contents('php://input') ?: '[]', true);
        if (!is_array($payload)) {
            response_json(['ok' => false, 'message' => 'Invalid request payload.'], 422);
        }

        $code = trim((string) ($payload['code'] ?? ''));
        $form = is_array($payload['form'] ?? null) ? $payload['form'] : [];

        $service = new PostApprovalComplianceService();
        $result = $service->submitApplicantTask((int) $user['id'], $code, $form);
        if (!($result['ok'] ?? false)) {
            response_json([
                'ok' => false,
                'message' => $result['errors']['general'] ?? 'Unable to submit this post-approval form.',
                'errors' => $result['errors'] ?? [],
            ], 422);
        }

        response_json(['ok' => true]);
    }

    public function upload(): never
    {
        $user = auth_user();
        if ($user === null) {
            response_json(['ok' => false, 'message' => 'Unauthenticated.', 'redirect' => 'portal'], 401);
        }

        $code = trim((string) ($_POST['code'] ?? ''));
        $fieldKey = trim((string) ($_POST['fieldKey'] ?? ''));
        $file = $_FILES['file'] ?? null;
        if ($code === '' || $fieldKey === '' || !is_array($file)) {
            response_json(['ok' => false, 'message' => 'Upload details are required.'], 422);
        }

        $service = new PostApprovalComplianceService();
        $result = $service->saveApplicantUpload((int) $user['id'], $code, $fieldKey, $file);
        if (!($result['ok'] ?? false)) {
            response_json([
                'ok' => false,
                'message' => $result['errors']['general'] ?? 'Unable to upload this file right now.',
                'errors' => $result['errors'] ?? [],
            ], 422);
        }

        response_json(['ok' => true, 'upload' => $result['upload'] ?? null]);
    }

    public function clearUpload(): never
    {
        $user = auth_user();
        if ($user === null) {
            response_json(['ok' => false, 'message' => 'Unauthenticated.', 'redirect' => 'portal'], 401);
        }

        $payload = json_decode(file_get_contents('php://input') ?: '[]', true);
        if (!is_array($payload)) {
            response_json(['ok' => false, 'message' => 'Invalid request payload.'], 422);
        }

        $code = trim((string) ($payload['code'] ?? ''));
        $fieldKey = trim((string) ($payload['fieldKey'] ?? ''));
        if ($code === '' || $fieldKey === '') {
            response_json(['ok' => false, 'message' => 'Upload field details are required.'], 422);
        }

        $service = new PostApprovalComplianceService();
        $result = $service->clearApplicantUpload((int) $user['id'], $code, $fieldKey);
        if (!($result['ok'] ?? false)) {
            response_json([
                'ok' => false,
                'message' => $result['errors']['general'] ?? 'Unable to remove this saved signature right now.',
                'errors' => $result['errors'] ?? [],
            ], 422);
        }

        response_json(['ok' => true]);
    }
}
