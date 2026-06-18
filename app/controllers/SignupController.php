<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Services\BarangayCatalogService;
use App\Services\CoMakerRegistrationService;

class SignupController extends Controller
{
    public function show(): never
    {
        $mode = strtolower(trim((string) ($_GET['mode'] ?? 'applicant')));
        $mode = in_array($mode, ['co-maker', 'comaker'], true) ? 'co-maker' : 'applicant';
        $barangays = array_map(
            static fn (array $row): string => (string) ($row['name'] ?? ''),
            (new BarangayCatalogService())->all()
        );
        $coMakerContext = null;
        $signupError = null;

        if ($mode === 'co-maker') {
            $beneficiaryProfileId = (int) ($_GET['beneficiaryProfileId'] ?? $_GET['beneficiary'] ?? 0);
            $inviteToken = trim((string) ($_GET['invite'] ?? $_GET['inviteToken'] ?? ''));
            $coMakerContext = (new CoMakerRegistrationService())->publicRegistrationContext($beneficiaryProfileId, $inviteToken);
            if ($coMakerContext === null) {
                $signupError = 'The co-maker registration link is invalid, expired, or the beneficiary record is unavailable.';
            } elseif (!($coMakerContext['isDeceased'] ?? false)) {
                $signupError = 'Co-maker account creation is only allowed after the primary beneficiary is marked deceased.';
            } elseif ($coMakerContext['hasExistingRegistration'] ?? false && !($coMakerContext['canRegister'] ?? false)) {
                $existingStatus = strtolower(trim((string) ($coMakerContext['existingRegistrationStatus'] ?? '')));
                $signupError = $existingStatus === \App\Services\CoMakerRegistrationService::STATUS_PENDING_REVIEW
                    ? 'A co-maker registration for this beneficiary is already pending Admin review.'
                    : 'A co-maker account is already registered for this beneficiary. Please coordinate with the assigned PDO or Admin.';
            }
        }

        $this->view('public/signup', [
            'butuanBarangays' => array_values(array_filter($barangays, static fn (string $name): bool => $name !== '')),
            'signupMode' => $mode,
            'coMakerContext' => $coMakerContext,
            'signupError' => $signupError,
        ]);
    }

    public function register(): never
    {
        $service = new \App\Services\AuthService();
        $result = $service->registerPortalAccount($_POST, $_FILES);

        if (!$result['ok']) {
            response_json($result, 422);
        }

        if (empty($result['requiresVerification']) && isset($result['user']) && is_array($result['user'])) {
            login_user($result['user']);
        }

        response_json($result, 201);
    }
}
