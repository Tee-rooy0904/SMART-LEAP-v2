<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Services\ApplicantDashboardService;
use App\Services\ApplicationService;
use App\Services\CertificateService;

class ApplicantDashboardController extends Controller
{
    public function show(): never
    {
        $this->view('dashboards/applicant', [
            'authUser' => auth_user(),
        ]);
    }

    public function showPostApproval(): never
    {
        $this->redirectTo($this->postApprovalDashboardPath());
    }

    public function showPostApprovalForm(): never
    {
        $this->renderApplicationFormView('dashboards/post-approval-form');
    }

    public function showApplicationFormFile(): never
    {
        $this->renderApplicationFormView('dashboards/application-form-file');
    }

    private function renderApplicationFormView(string $view): never
    {
        $allowedCodes = [
            POST_APPROVAL_TASK_AVAILMENT_FORM,
            POST_APPROVAL_TASK_VALIDATION_FORM,
            POST_APPROVAL_TASK_MUNGKAHING_PROYEKTO,
            POST_APPROVAL_TASK_BUSINESS_PLAN,
            POST_APPROVAL_TASK_BUHAT_SA_PAGPANUMPA,
        ];
        $taskCode = trim((string) ($_GET['code'] ?? ''));
        if (!in_array($taskCode, $allowedCodes, true)) {
            $taskCode = '';
        }

        $this->view($view, [
            'authUser' => auth_user(),
            'taskCode' => $taskCode,
        ]);
    }

    public function state(): never
    {
        $user = auth_user();
        if ($user === null) {
            response_json(['ok' => false, 'message' => 'Unauthenticated.', 'redirect' => 'portal'], 401);
        }

        $service = new ApplicantDashboardService();
        response_json([
            'ok' => true,
            'state' => $service->stateForUser((int) $user['id']),
        ]);
    }

    public function redirectProfileCompletion(): never
    {
        $user = auth_user();
        if ($user === null) {
            $this->redirectTo('portal');
        }

        $role = strtolower((string) ($user['role'] ?? ''));
        if (str_contains($role, 'beneficiary')) {
            $this->redirectTo('beneficiary-dashboard');
        }

        $this->redirectTo('applicant-dashboard#profile-page');
    }

    public function profileState(): never
    {
        $user = auth_user();
        if ($user === null) {
            response_json(['ok' => false, 'message' => 'Unauthenticated.'], 401);
        }

        $service = new ApplicationService();
        response_json([
            'ok' => true,
            'data' => $service->getApplicantEntryState((int) $user['id']),
        ]);
    }

    public function saveProfileDraft(): never
    {
        $this->persistProfile(false);
    }

    public function submitProfile(): never
    {
        $this->persistProfile(true);
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

    public function downloadCertificate(): never
    {
        $user = auth_user();
        if ($user === null) {
            $this->redirectTo('portal');
        }

        $dashboard = (new ApplicantDashboardService())->stateForUser((int) $user['id']);
        $certificateState = $dashboard['certificate'] ?? [];
        if (!($certificateState['eligible'] ?? false)) {
            http_response_code(403);
            header('Content-Type: text/plain; charset=UTF-8');
            echo 'Certificate is not available yet.';
            exit;
        }

        $certificate = (new CertificateService())->generatePdf($certificateState);
        header('Content-Type: application/pdf');
        header('Content-Disposition: attachment; filename="' . addslashes((string) ($certificate['fileName'] ?? 'smart-leap-certificate.pdf')) . '"');
        header('Content-Length: ' . strlen((string) $certificate['contents']));
        echo $certificate['contents'];
        exit;
    }

    private function postApprovalDashboardPath(): string
    {
        $role = strtolower((string) (auth_user()['role'] ?? ''));
        if ($role === 'beneficiary') {
            return 'beneficiary-dashboard#repayments';
        }

        return 'applicant-dashboard#application-page';
    }

    private function persistProfile(bool $submit): never
    {
        $user = auth_user();
        if ($user === null) {
            response_json(['ok' => false, 'message' => 'Unauthenticated.'], 401);
        }

        $service = new ApplicationService();
        $result = $service->saveApplicantProfile(
            (int) $user['id'],
            $_POST,
            $_FILES['documents'] ?? [],
            $submit
        );

        if (!$result['ok']) {
            response_json($result, 422);
        }

        response_json($result);
    }
}
