<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Services\ApplicationService;
use App\Services\AuthService;

class AuthController extends Controller
{
    public function showLogin(): never
    {
        $service = new AuthService();
        $currentUser = $service->currentUserFromSession();
        if ($currentUser !== null) {
            $this->redirectTo($service->redirectPathFor($currentUser));
        }

        $this->view('public/staff-login');
    }

    public function showPortalLogin(): never
    {
        $service = new AuthService();
        $currentUser = $service->currentUserFromSession();
        if ($currentUser !== null) {
            $this->redirectTo($service->redirectPathFor($currentUser));
        }

        $this->view('public/portal-login');
    }

    public function login(): never
    {
        $service = new AuthService();
        $email = trim((string) ($_POST['email'] ?? ''));
        $password = (string) ($_POST['password'] ?? '');
        $entryPoint = trim((string) ($_POST['entryPoint'] ?? 'staff'));

        $result = $service->attempt($email, $password, $entryPoint);
        if (!$result['ok']) {
            response_json($result, 422);
        }

        if (!empty($result['requiresVerification'])) {
            response_json($result);
        }

        ensure_session_started();
        session_regenerate_id(true);
        login_user($result['user']);

        response_json($result);
    }

    public function showVerification(): never
    {
        $this->view('public/verify-account', [
            'email' => strtolower(trim((string) ($_GET['email'] ?? ''))),
            'entryPoint' => strtolower(trim((string) ($_GET['entryPoint'] ?? 'portal'))),
        ]);
    }

    public function showForgotPassword(): never
    {
        $this->view('public/forgot-password', [
            'email' => strtolower(trim((string) ($_GET['email'] ?? ''))),
            'entryPoint' => strtolower(trim((string) ($_GET['entryPoint'] ?? 'portal'))),
        ]);
    }

    public function showResetPassword(): never
    {
        $this->view('public/reset-password', [
            'email' => strtolower(trim((string) ($_GET['email'] ?? ''))),
            'entryPoint' => strtolower(trim((string) ($_GET['entryPoint'] ?? 'portal'))),
        ]);
    }

    public function verifyAccount(): never
    {
        $service = new AuthService();
        $result = $service->verifyChallenge(
            (string) ($_POST['email'] ?? ''),
            (string) ($_POST['code'] ?? ''),
            (string) ($_POST['mode'] ?? 'activation'),
            (string) ($_POST['entryPoint'] ?? 'portal')
        );

        if (!$result['ok']) {
            response_json($result, 422);
        }

        ensure_session_started();
        session_regenerate_id(true);
        login_user($result['user']);

        response_json($result);
    }

    public function resendVerification(): never
    {
        $service = new AuthService();
        $result = $service->resendVerificationCode(
            (string) ($_POST['email'] ?? ''),
            (string) ($_POST['mode'] ?? 'activation')
        );
        if (!$result['ok']) {
            response_json($result, 422);
        }

        response_json($result);
    }

    public function forgotPassword(): never
    {
        $service = new AuthService();
        $result = $service->requestPasswordReset(
            (string) ($_POST['email'] ?? ''),
            (string) ($_POST['entryPoint'] ?? 'portal')
        );
        if (!$result['ok']) {
            response_json($result, 422);
        }

        response_json($result);
    }

    public function resetPassword(): never
    {
        $service = new AuthService();
        $result = $service->resetPassword(
            (string) ($_POST['email'] ?? ''),
            (string) ($_POST['code'] ?? ''),
            (string) ($_POST['newPassword'] ?? ''),
            (string) ($_POST['confirmPassword'] ?? ''),
            (string) ($_POST['entryPoint'] ?? 'portal')
        );
        if (!$result['ok']) {
            response_json($result, 422);
        }

        response_json($result);
    }

    public function changePassword(): never
    {
        $user = auth_user();
        if ($user === null) {
            response_json(['ok' => false, 'message' => 'Unauthenticated.'], 401);
        }

        $payload = $_POST;
        if ($payload === []) {
            $decoded = json_decode(file_get_contents('php://input') ?: '[]', true);
            if (is_array($decoded)) {
                $payload = $decoded;
            }
        }

        $service = new AuthService();
        $result = $service->changePassword(
            (int) ($user['id'] ?? 0),
            (string) ($payload['currentPassword'] ?? ''),
            (string) ($payload['newPassword'] ?? ''),
            (string) ($payload['confirmPassword'] ?? '')
        );

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

        $payload = $_POST;
        if ($payload === []) {
            $decoded = json_decode(file_get_contents('php://input') ?: '[]', true);
            if (is_array($decoded)) {
                $payload = $decoded;
            }
        }

        $service = new ApplicationService();
        $result = $service->saveUserProfilePhoto((int) ($user['id'] ?? 0), $payload);
        if (!$result['ok']) {
            response_json($result, 422);
        }

        response_json($result);
    }

    public function logout(): never
    {
        $service = new AuthService();
        $currentUser = $service->currentUserFromSession();
        $entryPoint = strtolower(trim((string) ($_POST['entryPoint'] ?? $_GET['entryPoint'] ?? '')));
        $redirect = $this->logoutRedirectPathFor($currentUser, $entryPoint);

        ensure_session_started();
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $params = session_get_cookie_params();
            setcookie(session_name(), '', time() - 42000, $params['path'], $params['domain'], $params['secure'], $params['httponly']);
        }
        session_destroy();

        $expectsJson = str_contains(strtolower((string) ($_SERVER['HTTP_ACCEPT'] ?? '')), 'application/json')
            || strtolower((string) ($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '')) === 'xmlhttprequest';

        if ($expectsJson) {
            response_json(['ok' => true, 'redirect' => $redirect]);
        }

        redirect($redirect);
    }

    private function logoutRedirectPathFor(?array $user, string $entryPoint = ''): string
    {
        $role = strtolower((string) ($user['role'] ?? ''));

        if ($entryPoint === 'portal' || str_contains($role, 'applicant') || str_contains($role, 'beneficiary')) {
            return 'portal/login';
        }

        return 'login';
    }
}
