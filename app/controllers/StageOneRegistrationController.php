<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Services\BarangayCatalogService;
use App\Services\RateLimiterService;
use App\Services\StageOneRegistrationService;

class StageOneRegistrationController extends Controller
{
    public function show(): never
    {
        $barangays = array_map(
            static fn (array $row): string => (string) ($row['name'] ?? ''),
            (new BarangayCatalogService())->all()
        );

        $this->view('public/stage-one-registration', [
            'butuanBarangays' => array_values(array_filter($barangays, static fn (string $name): bool => $name !== '')),
            'stageOneFlash' => session_pull('stage_one.form_feedback'),
            'stageOneOldInput' => session_pull('stage_one.form_old', []),
        ]);
    }

    public function submit(): never
    {
        $service = new StageOneRegistrationService();
        $result = $service->submit($_POST, $_FILES);
        $expectsJson = str_contains(strtolower((string) ($_SERVER['HTTP_ACCEPT'] ?? '')), 'application/json')
            || strtolower((string) ($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '')) === 'xmlhttprequest';

        if (!$expectsJson) {
            session_put('stage_one.form_feedback', $result);
            if (!$result['ok']) {
                session_put('stage_one.form_old', $_POST);
            } else {
                session_forget('stage_one.form_old');
            }

            redirect('portal/apply');
        }

        if (!$result['ok']) {
            response_json($result, 422);
        }

        response_json($result, 201);
    }

    public function requestEmailVerification(): never
    {
        $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? '127.0.0.1');
        $limiter = new RateLimiterService();
        $throttleKey = 'otp_request:' . $ip;

        if ($limiter->tooManyAttempts($throttleKey, 5, 600)) {
            $seconds = $limiter->availableIn($throttleKey, 600);
            $minutes = max(1, (int) ceil($seconds / 60));
            response_json([
                'ok' => false,
                'message' => "Too many verification code requests. Please wait {$minutes} minute(s) before requesting again.",
            ], 429);
        }

        $limiter->hit($throttleKey, 600);

        $result = (new StageOneRegistrationService())->requestEmailVerification($_POST);
        if (!$result['ok']) {
            response_json($result, 422);
        }

        response_json($result);
    }

    public function index(): never
    {
        $batch = isset($_GET['batch']) ? trim((string) $_GET['batch']) : null;
        response_json([
            'ok' => true,
            'data' => (new StageOneRegistrationService())->validationState($batch),
        ]);
    }

    public function showRecord(): never
    {
        $registrationId = (int) ($_GET['id'] ?? 0);
        $service = new StageOneRegistrationService();
        $record = $service->getRegistrationDetail($registrationId);
        if ($record === null) {
            response_json(['ok' => false, 'message' => 'Stage 1 registration not found.'], 404);
        }

        // Attach matched record details so the modal can render the duplicate warning
        $matchedRecord = null;
        if ($record['isPossibleDuplicate'] && $record['duplicateOf'] > 0) {
            $matchedRecord = $service->getRegistrationDetail((int) $record['duplicateOf']);
        }

        // Parse matched fields from the system note
        $matchedFields = [];
        if (is_string($record['duplicateNote']) && str_contains($record['duplicateNote'], 'System detected possible duplicate:')) {
            $note = str_replace('System detected possible duplicate:', '', $record['duplicateNote']);
            $note = rtrim(trim($note), '.');
            $matchedFields = array_values(array_filter(array_map('trim', explode(';', $note))));
        }

        response_json([
            'ok' => true,
            'registration' => $record,
            'matchedRecord' => $matchedRecord,
            'matchedFields' => $matchedFields,
        ]);
    }

    public function review(): never
    {
        $registrationId = (int) ($_POST['registrationId'] ?? 0);
        $action = (string) ($_POST['action'] ?? '');
        $result = (new StageOneRegistrationService())->reviewRegistration($registrationId, $action, auth_user() ?? []);
        if (!$result['ok']) {
            response_json($result, 422);
        }

        response_json($result);
    }

    public function submitStaffEntry(): never
    {
        $result = (new StageOneRegistrationService())->submitStaffEntry($_POST, $_FILES, auth_user() ?? []);
        if (!$result['ok']) {
            response_json($result, 422);
        }

        response_json($result, 201);
    }

    public function reviewDuplicate(): never
    {
        $registrationId = (int) ($_POST['registrationId'] ?? 0);
        $action = trim((string) ($_POST['action'] ?? ''));
        $result = (new StageOneRegistrationService())->reviewDuplicate($registrationId, $action, auth_user() ?? []);
        if (!$result['ok']) {
            response_json($result, 422);
        }

        response_json($result);
    }

    public function resendSelectionEmail(): never
    {
        $registrationId = (int) ($_POST['registrationId'] ?? 0);
        $result = (new StageOneRegistrationService())->resendSelectionEmail($registrationId, auth_user() ?? []);
        if (!$result['ok']) {
            response_json($result, 422);
        }

        response_json($result);
    }

    public function batchMetrics(): never
    {
        $metrics = (new \App\Services\BatchService())->getBatchMetrics();
        response_json(['ok' => true, 'data' => $metrics]);
    }

    public function switchBatch(): never
    {
        $actor = auth_user() ?? [];
        $actorId = (int) ($actor['id'] ?? 0);
        $ip = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
        $ua = $_SERVER['HTTP_USER_AGENT'] ?? 'Admin Dashboard';

        $targetBatch = trim((string) ($_POST['targetBatch'] ?? ''));
        $batchService = new \App\Services\BatchService();
        $result = $targetBatch !== ''
            ? $batchService->switchBatchTo($targetBatch, $actorId, $ip, $ua)
            : $batchService->advanceBatch($actorId, $ip, $ua);

        if (!$result['ok']) {
            response_json($result, 422);
        }

        response_json($result);
    }
}
