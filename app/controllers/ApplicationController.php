<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Services\ApplicationService;

class ApplicationController extends Controller
{
    private function authorizeReviewer(): array
    {
        $user = auth_user() ?? [];
        $role = strtolower((string) ($user['role'] ?? ''));
        if (!str_contains($role, 'admin') && !str_contains($role, 'project') && !str_contains($role, 'social')) {
            response_json(['ok' => false, 'message' => 'Forbidden.'], 403);
        }

        return $user;
    }

    private function authorizeWorkflowReviewer(): array
    {
        $user = auth_user() ?? [];
        $role = strtolower((string) ($user['role'] ?? ''));
        if (!str_contains($role, 'admin') && !str_contains($role, 'project')) {
            response_json(['ok' => false, 'message' => 'Forbidden.'], 403);
        }

        return $user;
    }

    private function authorizeApplicantDataEditor(): array
    {
        $user = auth_user() ?? [];
        $role = strtolower((string) ($user['role'] ?? ''));
        if (!str_contains($role, 'admin')) {
            response_json(['ok' => false, 'message' => 'Forbidden.'], 403);
        }

        return $user;
    }

    private function authorizePdoCategoryEditor(): array
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
        try {
            $service = new ApplicationService();
            $user = $this->authorizeReviewer();
            response_json([
                'ok' => true,
                'data' => $service->listApplications($_GET, $user),
            ]);
        } catch (\Throwable $exception) {
            log_database_query_failure('application.index', $exception, ['query' => $_GET]);
            response_json(['ok' => false, 'message' => 'Unable to load applications right now.'], 500);
        }
    }

    public function dashboard(): never
    {
        try {
            $service = new ApplicationService();
            response_json([
                'ok' => true,
                'data' => $service->currentProjectOfficerRoster(auth_user() ?? []),
            ]);
        } catch (\Throwable $exception) {
            log_database_query_failure('application.dashboard', $exception);
            response_json(['ok' => false, 'message' => 'Unable to load applications right now.'], 500);
        }
    }

    public function show(): never
    {
        try {
            $applicationId = (int) ($_GET['id'] ?? 0);
            $service = new ApplicationService();
            $detail = $service->getApplicationDetail($applicationId, $this->authorizeReviewer());
            if ($detail === null) {
                response_json(['ok' => false, 'message' => 'Application not found.'], 404);
            }

            response_json([
                'ok' => true,
                'application' => $detail,
            ]);
        } catch (\Throwable $exception) {
            log_database_query_failure('application.show', $exception, ['id' => (int) ($_GET['id'] ?? 0)]);
            response_json(['ok' => false, 'message' => 'Unable to load the application right now.'], 500);
        }
    }

    public function review(): never
    {
        try {
            $applicationId = (int) ($_POST['applicationId'] ?? 0);
            $service = new ApplicationService();
            $result = $service->reviewApplication($applicationId, $_POST, $this->authorizeWorkflowReviewer());
            if (!$result['ok']) {
                response_json($result, 422);
            }

            response_json($result);
        } catch (\Throwable $exception) {
            log_database_query_failure('application.review', $exception, ['application_id' => (int) ($_POST['applicationId'] ?? 0)]);
            response_json(['ok' => false, 'message' => 'Unable to save the review right now.'], 500);
        }
    }

    public function recordAssistanceReceived(): never
    {
        try {
            $applicationId = (int) ($_POST['applicationId'] ?? 0);
            $service = new ApplicationService();
            $result = $service->recordAssistanceReceived($applicationId, $this->authorizeWorkflowReviewer());
            if (!$result['ok']) {
                response_json($result, 422);
            }

            response_json($result);
        } catch (\Throwable $exception) {
            log_database_query_failure('application.record_assistance_received', $exception, ['application_id' => (int) ($_POST['applicationId'] ?? 0)]);
            response_json(['ok' => false, 'message' => 'Unable to record assistance release right now.'], 500);
        }
    }

    public function reviewRequirement(): never
    {
        try {
            $applicationId = (int) ($_POST['applicationId'] ?? 0);
            $service = new ApplicationService();
            $result = $service->reviewRequirement($applicationId, $_POST, $this->authorizeWorkflowReviewer());
            if (!$result['ok']) {
                response_json($result, 422);
            }

            response_json($result);
        } catch (\Throwable $exception) {
            log_database_query_failure('application.review_requirement', $exception, ['application_id' => (int) ($_POST['applicationId'] ?? 0)]);
            response_json(['ok' => false, 'message' => 'Unable to save the requirement review right now.'], 500);
        }
    }

    public function uploadFormRequirement(): never
    {
        try {
            $applicationId = (int) ($_POST['applicationId'] ?? 0);
            $requirementKey = trim((string) ($_POST['requirementKey'] ?? ''));
            $file = $_FILES['file'] ?? null;
            if ($applicationId <= 0 || $requirementKey === '' || !is_array($file)) {
                response_json(['ok' => false, 'message' => 'Upload details are required.'], 422);
            }

            $service = new ApplicationService();
            $result = $service->uploadFormRequirement($applicationId, $requirementKey, $file, $this->authorizeWorkflowReviewer());
            if (!$result['ok']) {
                response_json($result, 422);
            }

            response_json($result);
        } catch (\Throwable $exception) {
            log_database_query_failure('application.upload_form_requirement', $exception, [
                'application_id' => (int) ($_POST['applicationId'] ?? 0),
                'requirement_key' => (string) ($_POST['requirementKey'] ?? ''),
            ]);
            response_json(['ok' => false, 'message' => 'Unable to upload the form file right now.'], 500);
        }
    }

    public function saveAssessment(): never
    {
        try {
            $applicationId = (int) ($_POST['applicationId'] ?? 0);
            $service = new ApplicationService();
            $result = $service->saveAssessment($applicationId, $_POST, $this->authorizeWorkflowReviewer());
            if (!$result['ok']) {
                response_json($result, 422);
            }

            response_json($result);
        } catch (\Throwable $exception) {
            log_database_query_failure('application.save_assessment', $exception, ['application_id' => (int) ($_POST['applicationId'] ?? 0)]);
            response_json(['ok' => false, 'message' => 'Unable to save the assessment right now.'], 500);
        }
    }

    public function updateApplicantData(): never
    {
        try {
            $applicationId = (int) ($_POST['applicationId'] ?? 0);
            $service = new ApplicationService();
            $result = $service->updateApplicantInputData($applicationId, $_POST, $this->authorizeApplicantDataEditor());
            if (!$result['ok']) {
                response_json($result, 422);
            }

            response_json($result);
        } catch (\Throwable $exception) {
            log_database_query_failure('application.update_applicant_data', $exception, ['application_id' => (int) ($_POST['applicationId'] ?? 0)]);
            response_json(['ok' => false, 'message' => 'Unable to update applicant data right now.'], 500);
        }
    }

    public function updateLivelihoodCategory(): never
    {
        try {
            $applicationId = (int) ($_POST['applicationId'] ?? 0);
            $service = new ApplicationService();
            $result = $service->updateLivelihoodCategory($applicationId, (string) ($_POST['livelihoodCategory'] ?? ''), $this->authorizePdoCategoryEditor());
            if (!$result['ok']) {
                response_json($result, 422);
            }

            response_json($result);
        } catch (\Throwable $exception) {
            log_database_query_failure('application.update_livelihood_category', $exception, ['application_id' => (int) ($_POST['applicationId'] ?? 0)]);
            response_json(['ok' => false, 'message' => 'Unable to update livelihood category right now.'], 500);
        }
    }

}
