<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Services\ApplicationService;
use App\Services\NotificationService;
use App\Services\RepaymentLedgerService;

class BeneficiaryDashboardController extends Controller
{
    public function show(): never
    {
        $this->view('dashboards/beneficiary', [
            'authUser' => auth_user(),
        ]);
    }

    public function state(): never
    {
        $user = auth_user();
        if ($user === null) {
            response_json(['ok' => false, 'message' => 'Unauthenticated.'], 401);
        }

        $service = new ApplicationService();
        $repayments = (new RepaymentLedgerService())->listForBeneficiary((int) $user['id']);
        response_json([
            'ok' => true,
            'data' => array_merge($service->getBeneficiaryProfileState((int) $user['id']), [
                'repayments' => $repayments,
                'notifications' => (new NotificationService())->listForUser((int) $user['id']),
            ]),
        ]);
    }

    public function saveProfile(): never
    {
        $user = auth_user();
        if ($user === null) {
            response_json(['ok' => false, 'message' => 'Unauthenticated.'], 401);
        }

        $service = new ApplicationService();
        $result = $service->saveBeneficiaryProfile((int) $user['id'], $_POST);
        if (!$result['ok']) {
            response_json($result, 422);
        }

        response_json($result);
    }

    public function submitFeedback(): never
    {
        $user = auth_user();
        if ($user === null) {
            response_json(['ok' => false, 'message' => 'Unauthenticated.'], 401);
        }

        $payload = json_decode(file_get_contents('php://input') ?: '[]', true);
        if (!is_array($payload)) {
            response_json(['ok' => false, 'message' => 'Invalid request payload.'], 422);
        }

        $service = new ApplicationService();
        $result = $service->saveBeneficiaryFeedback((int) $user['id'], $payload);
        if (!$result['ok']) {
            response_json($result, 422);
        }

        response_json($result);
    }

    public function saveProfilePhoto(): never
    {
        $user = auth_user();
        if ($user === null) {
            response_json(['ok' => false, 'message' => 'Unauthenticated.'], 401);
        }

        $payload = json_decode(file_get_contents('php://input') ?: '[]', true);
        if (!is_array($payload)) {
            response_json(['ok' => false, 'message' => 'Invalid request payload.'], 422);
        }

        $service = new ApplicationService();
        $result = $service->saveUserProfilePhoto((int) $user['id'], $payload);
        if (!$result['ok']) {
            response_json($result, 422);
        }

        response_json($result);
    }
}
