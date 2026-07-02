<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Services\BeneficiaryProfileService;
use App\Services\CoMakerRegistrationService;
use App\Services\DashboardMetricsService;

class AdminDashboardController extends Controller
{
    public function show(): never
    {
        $this->view('dashboards/admin', [
            'authUser' => auth_user(),
            'overview' => (new DashboardMetricsService())->adminOverview(),
        ]);
    }

    public function state(): never
    {
        if (auth_user() === null) {
            response_json(['ok' => false, 'message' => 'Unauthenticated.'], 401);
        }

        response_json([
            'ok' => true,
            'data' => (new DashboardMetricsService())->adminOverview(),
        ]);
    }

    public function updateBeneficiaryStatus(): never
    {
        if (auth_user() === null) {
            response_json(['ok' => false, 'message' => 'Unauthenticated.'], 401);
        }

        $beneficiaryProfileId = (int) ($_POST['beneficiaryProfileId'] ?? $_POST['beneficiary_profile_id'] ?? 0);
        $status = trim((string) ($_POST['status'] ?? ''));
        $repaymentSuccessorBeneficiaryProfileId = isset($_POST['repaymentSuccessorBeneficiaryProfileId']) || isset($_POST['repayment_successor_beneficiary_profile_id'])
            ? (int) ($_POST['repaymentSuccessorBeneficiaryProfileId'] ?? $_POST['repayment_successor_beneficiary_profile_id'] ?? 0)
            : null;

        $result = (new BeneficiaryProfileService())->updateAdminRecord(
            $beneficiaryProfileId,
            $status,
            $repaymentSuccessorBeneficiaryProfileId !== null && $repaymentSuccessorBeneficiaryProfileId > 0
                ? $repaymentSuccessorBeneficiaryProfileId
                : null
        );
        if (!$result['ok']) {
            response_json($result, 422);
        }

        response_json($result);
    }

    public function reviewCoMakerRegistration(): never
    {
        $user = auth_user();
        if ($user === null) {
            response_json(['ok' => false, 'message' => 'Unauthenticated.'], 401);
        }

        $registrationId = (int) ($_POST['registrationId'] ?? $_POST['coMakerRegistrationId'] ?? 0);
        $decision = trim((string) ($_POST['decision'] ?? ''));
        $result = (new CoMakerRegistrationService())->reviewForActor($user, $registrationId, $decision);
        if (!$result['ok']) {
            response_json($result, 422);
        }

        response_json($result);
    }

    public function sendCoMakerRegistrationEmail(): never
    {
        $user = auth_user();
        if ($user === null) {
            response_json(['ok' => false, 'message' => 'Unauthenticated.'], 401);
        }

        $beneficiaryProfileId = (int) ($_POST['beneficiaryProfileId'] ?? $_POST['beneficiary_profile_id'] ?? 0);
        $email = trim((string) ($_POST['email'] ?? $_POST['gmail'] ?? ''));
        $result = (new CoMakerRegistrationService())->sendRegistrationLinkForAdmin($user, $beneficiaryProfileId, $email);
        if (!$result['ok']) {
            response_json($result, 422);
        }

        response_json($result);
    }
}
