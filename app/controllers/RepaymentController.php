<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Services\RepaymentLedgerService;

class RepaymentController extends Controller
{
    private function repaymentService(): RepaymentLedgerService
    {
        return new RepaymentLedgerService();
    }

    private function authorizeViewer(): array
    {
        $user = auth_user() ?? [];
        $role = strtolower((string) ($user['role'] ?? ''));
        if (!str_contains($role, 'project') && !str_contains($role, 'admin') && !str_contains($role, 'social')) {
            response_json(['ok' => false, 'message' => 'Forbidden.'], 403);
        }

        return $user;
    }

    private function authorizeReviewer(): array
    {
        $user = auth_user() ?? [];
        $role = strtolower((string) ($user['role'] ?? ''));
        if (!str_contains($role, 'project') && !str_contains($role, 'admin')) {
            response_json(['ok' => false, 'message' => 'Forbidden.'], 403);
        }

        return $user;
    }

    private function authorizeDataEditor(): array
    {
        $user = auth_user() ?? [];
        $role = strtolower((string) ($user['role'] ?? ''));
        if (!str_contains($role, 'admin')) {
            response_json(['ok' => false, 'message' => 'Forbidden.'], 403);
        }

        return $user;
    }

    private function authorizeBeneficiary(): array
    {
        $user = auth_user() ?? [];
        $role = strtolower((string) ($user['role'] ?? ''));
        if (!str_contains($role, 'beneficiary')) {
            response_json(['ok' => false, 'message' => 'Forbidden.'], 403);
        }

        return $user;
    }

    public function index(): never
    {
        $data = $this->repaymentService()->listForReviewer($this->authorizeViewer());
        response_json(['ok' => true, 'data' => $data]);
    }

    public function submitBeneficiary(): never
    {
        $user = $this->authorizeBeneficiary();
        $payload = $this->decodeJsonRequest();
        $result = $this->repaymentService()->submitForBeneficiary((int) ($user['id'] ?? 0), $payload);
        if (!$result['ok']) {
            response_json($result, 422);
        }

        response_json($result);
    }

    public function updateData(): never
    {
        $actor = $this->authorizeDataEditor();
        $payload = $this->decodeJsonRequest();
        $result = $this->repaymentService()->updateRepaymentInputData(
            (int) ($payload['repaymentId'] ?? 0),
            $payload,
            $actor
        );
        if (!$result['ok']) {
            response_json($result, 422);
        }

        response_json($result);
    }

    public function review(): never
    {
        $actor = $this->authorizeReviewer();
        $payload = $this->decodeJsonRequest();
        $result = $this->repaymentService()->reviewRepayment(
            (int) ($payload['repaymentId'] ?? 0),
            (string) ($payload['status'] ?? ''),
            isset($payload['remarks']) ? (string) $payload['remarks'] : null,
            isset($payload['hardCopyOfficeStatus']) ? (string) $payload['hardCopyOfficeStatus'] : null,
            $actor
        );
        if (!$result['ok']) {
            response_json($result, 422);
        }

        response_json($result);
    }

    private function decodeJsonRequest(): array
    {
        $raw = file_get_contents('php://input');
        if (!is_string($raw) || trim($raw) === '') {
            return [];
        }

        $decoded = json_decode($raw, true);
        return is_array($decoded) ? $decoded : [];
    }
}
