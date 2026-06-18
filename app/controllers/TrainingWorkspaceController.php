<?php
/**
 * SMART LEAP FILE GUIDE
 * Training workspace page router.
 * Maps admin, PDO, and applicant training URLs to the correct static training HTML workspace and injects authenticated bootstrap data.
 */

declare(strict_types=1);

namespace App\Controllers;

class TrainingWorkspaceController extends Controller
{
    private const ADMIN_PAGES = [
        '/admin/training' => 'admin-training-overview.html',
        '/admin/training/session' => 'admin-training-session-form.html',
        '/admin/training/eligible-applicants' => 'admin-eligible-applicant-roster.html',
        '/admin/training/assignment' => 'admin-participant-assignment.html',
        '/admin/training/forms' => 'admin-seminar-forms-control.html',
        '/admin/training/notices' => 'admin-training-notice-panel.html',
        '/admin/training/attendance' => 'admin-attendance-completion.html',
    ];

    private const PDO_PAGES = [
        '/pdo/training' => 'pdo-training-overview.html',
        '/pdo/training/session' => 'pdo-session-detail.html',
        '/pdo/training/operations' => 'pdo-notice-attendance-workspace.html',
    ];

    private const APPLICANT_PAGES = [
        '/applicant/training' => 'applicant-training-status.html',
        '/applicant/training/forms' => 'applicant-seminar-forms.html',
        '/applicant/training/notices' => 'applicant-training-notices.html',
    ];

    public function showAdmin(): never
    {
        $this->renderPage(self::ADMIN_PAGES);
    }

    public function showPdo(): never
    {
        $this->renderPage(self::PDO_PAGES);
    }

    public function showApplicant(): never
    {
        $this->renderPage(self::APPLICANT_PAGES);
    }

    private function renderPage(array $map): never
    {
        $path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?? '/';
        $scriptName = str_replace('\\', '/', $_SERVER['SCRIPT_NAME'] ?? '/public/index.php');
        $baseUrl = rtrim(str_replace('\\', '/', dirname($scriptName)), '/');
        $baseUrl = $baseUrl === '/' ? '' : $baseUrl;
        if ($baseUrl !== '' && str_starts_with($path, $baseUrl)) {
            $path = substr($path, strlen($baseUrl));
        }
        $path = '/' . trim((string) $path, '/');
        $htmlFile = $map[$path] ?? null;
        if ($htmlFile === null) {
            abort(404);
        }

        $this->view('dashboards/training-static-page', [
            'authUser' => auth_user(),
            'htmlFile' => $htmlFile,
        ]);
    }
}
