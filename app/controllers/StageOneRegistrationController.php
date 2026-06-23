<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Services\BarangayCatalogService;
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
        $result = (new StageOneRegistrationService())->requestEmailVerification($_POST);
        if (!$result['ok']) {
            response_json($result, 422);
        }

        response_json($result);
    }

    public function index(): never
    {
        response_json([
            'ok' => true,
            'data' => (new StageOneRegistrationService())->validationState(),
        ]);
    }

    public function showRecord(): never
    {
        $registrationId = (int) ($_GET['id'] ?? 0);
        $record = (new StageOneRegistrationService())->getRegistrationDetail($registrationId);
        if ($record === null) {
            response_json(['ok' => false, 'message' => 'Stage 1 registration not found.'], 404);
        }

        response_json([
            'ok' => true,
            'registration' => $record,
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

    public function resendSelectionEmail(): never
    {
        $registrationId = (int) ($_POST['registrationId'] ?? 0);
        $result = (new StageOneRegistrationService())->resendSelectionEmail($registrationId, auth_user() ?? []);
        if (!$result['ok']) {
            response_json($result, 422);
        }

        response_json($result);
    }
}
